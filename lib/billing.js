const crypto = require('crypto');
const { getOptionalEnv, serverConfig } = require('./config');
const { HttpError } = require('./veritrust-api');
const { fetchWithPolicy } = require('./security');
const { requireRecentAuthentication } = require('./session');
const {
  eq,
  requireServiceRole,
  supabaseFetch,
} = require('./supabase-server');
const { billingSnapshot } = require('./entitlements');

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const PROVIDER = 'stripe';

function requireBillingEnabled() {
  if (!serverConfig.billingEnabled) {
    throw new HttpError(503, 'Billing is not available.', { code: 'BILLING_DISABLED', meta: { retry_after: 3600 } });
  }
}

function siteUrl() {
  return serverConfig.siteUrl;
}

function stripeSecretKey() {
  const key = getOptionalEnv('STRIPE_SECRET_KEY', '');
  if (!key) throw new HttpError(500, 'Billing provider is not configured.', { code: 'BILLING_NOT_CONFIGURED' });
  return key;
}

async function stripeRequest(path, params = {}) {
  requireBillingEnabled();
  const form = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  const { response, text: raw } = await fetchWithPolicy(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  }, { timeoutMs: 8_000, maxResponseBytes: 512 * 1024, redirect: 'error' });
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!response.ok) {
    throw new HttpError(response.status, data?.error?.message || 'Billing provider request failed.', {
      code: data?.error?.code || 'BILLING_PROVIDER_ERROR',
      details: data,
    });
  }
  return data;
}

async function stripeGet(path) {
  requireBillingEnabled();
  const { response, text } = await fetchWithPolicy(`${STRIPE_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey()}` },
  }, { timeoutMs: 8_000, maxResponseBytes: 512 * 1024, redirect: 'error' });
  const data = (() => { try { return JSON.parse(text); } catch { return null; } })();
  if (!response.ok) {
    throw new HttpError(response.status, data?.error?.message || 'Billing provider request failed.', {
      code: data?.error?.code || 'BILLING_PROVIDER_ERROR',
      details: data,
    });
  }
  return data;
}

function requireBillingAdmin(context) {
  const role = String(context.role || '').toLowerCase();
  if (!['owner', 'admin'].includes(role)) {
    throw new HttpError(403, 'Only workspace owners and admins can manage billing.', { code: 'BILLING_ADMIN_REQUIRED' });
  }
}

async function planByCode(code) {
  const planCode = String(code || '').trim().toLowerCase();
  if (!planCode || planCode === 'free') {
    throw new HttpError(400, 'Choose a paid plan to start checkout.', { code: 'INVALID_PLAN' });
  }
  const rows = await supabaseFetch(`/rest/v1/plans?code=eq.${eq(planCode)}&select=*&limit=1`, { service: true });
  const plan = rows?.[0] || null;
  if (!plan) throw new HttpError(404, 'Plan was not found.', { code: 'PLAN_NOT_FOUND' });
  return plan;
}

function priceIdForPlan(plan, interval) {
  const yearly = String(interval || 'monthly').toLowerCase() === 'yearly';
  const priceId = yearly
    ? (plan.stripe_yearly_price_id || plan.external_yearly_price_id || plan.external_price_id)
    : (plan.stripe_monthly_price_id || plan.external_monthly_price_id || plan.external_price_id);
  if (!priceId) {
    throw new HttpError(500, 'This plan is missing a billing price id.', { code: 'PRICE_NOT_CONFIGURED' });
  }
  return priceId;
}

async function existingBillingCustomer(orgId) {
  const rows = await supabaseFetch(`/rest/v1/billing_customers?org_id=eq.${eq(orgId)}&provider=eq.${PROVIDER}&select=*&limit=1`, {
    service: true,
  });
  return rows?.[0] || null;
}

async function ensureBillingCustomer(context) {
  const existing = await existingBillingCustomer(context.organization.id);
  if (existing?.provider_customer_id) return existing.provider_customer_id;

  const customer = await stripeRequest('/customers', {
    email: context.user.email || '',
    name: context.organization.name || 'VeriTrust Workspace',
    'metadata[org_id]': context.organization.id,
    'metadata[user_id]': context.user.id,
  });

  await supabaseFetch('/rest/v1/billing_customers?on_conflict=org_id,provider', {
    method: 'POST',
    service: true,
    body: {
      org_id: context.organization.id,
      provider: PROVIDER,
      provider_customer_id: customer.id,
      email: context.user.email || null,
      metadata: customer,
    },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  });
  return customer.id;
}

async function createCheckoutSession(req, context, options = {}) {
  requireServiceRole();
  requireBillingEnabled();
  requireBillingAdmin(context);
  requireRecentAuthentication(req);
  const plan = await planByCode(options.plan);
  const priceId = priceIdForPlan(plan, options.interval);
  const customerId = await ensureBillingCustomer(context);
  const origin = siteUrl();
  const session = await stripeRequest('/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    client_reference_id: context.organization.id,
    success_url: `${origin}/dashboard?billing=success`,
    cancel_url: `${origin}/dashboard?billing=cancelled`,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'metadata[org_id]': context.organization.id,
    'metadata[user_id]': context.user.id,
    'metadata[plan_code]': plan.code,
    'subscription_data[metadata][org_id]': context.organization.id,
    'subscription_data[metadata][plan_code]': plan.code,
    allow_promotion_codes: 'true',
  });
  return {
    id: session.id,
    url: session.url,
    plan: {
      code: plan.code,
      name: plan.name,
    },
  };
}

async function createPortalSession(req, context) {
  requireServiceRole();
  requireBillingEnabled();
  requireBillingAdmin(context);
  requireRecentAuthentication(req);
  const customer = await existingBillingCustomer(context.organization.id);
  if (!customer?.provider_customer_id) {
    throw new HttpError(404, 'No billing customer exists for this workspace yet.', { code: 'BILLING_CUSTOMER_NOT_FOUND' });
  }
  const origin = siteUrl();
  const session = await stripeRequest('/billing_portal/sessions', {
    customer: customer.provider_customer_id,
    return_url: `${origin}/dashboard?billing=portal`,
  });
  return {
    id: session.id,
    url: session.url,
  };
}

function readRawBody(req, maxBytes = 1024 * 1024) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'Webhook payload is too large.', { code: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, signatureHeader, options = {}) {
  const configuredSecrets = [
    getOptionalEnv('STRIPE_WEBHOOK_SECRET', ''),
    getOptionalEnv('STRIPE_WEBHOOK_SECRET_PREVIOUS', ''),
  ].flatMap((item) => String(item || '').split(',')).map((item) => item.trim()).filter(Boolean);
  const secrets = options.secrets || configuredSecrets;
  if (!secrets.length) throw new HttpError(500, 'Billing webhook secret is not configured.', { code: 'BILLING_WEBHOOK_NOT_CONFIGURED' });
  const parts = String(signatureHeader || '').split(',').map((item) => item.trim().split('=')).filter((item) => item.length === 2);
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value).filter((value) => /^[a-f0-9]{64}$/i.test(value));
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) {
    throw new HttpError(400, 'Missing billing webhook signature.', { code: 'INVALID_WEBHOOK_SIGNATURE' });
  }
  const nowSeconds = Number(options.nowSeconds || Math.floor(Date.now() / 1000));
  const toleranceSeconds = Number(options.toleranceSeconds || serverConfig.stripeWebhookToleranceSeconds);
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    throw new HttpError(400, 'Billing webhook signature expired.', { code: 'WEBHOOK_SIGNATURE_EXPIRED' });
  }
  const valid = secrets.some((secret) => {
    const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return signatures.some((received) => {
      const receivedBuffer = Buffer.from(received, 'hex');
      return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
    });
  });
  if (!valid) {
    throw new HttpError(400, 'Invalid billing webhook signature.', { code: 'INVALID_WEBHOOK_SIGNATURE' });
  }
  return { timestamp: Number(timestamp) };
}

async function planForPrice(priceId, fallbackCode) {
  const filters = [
    `stripe_monthly_price_id=eq.${eq(priceId)}`,
    `stripe_yearly_price_id=eq.${eq(priceId)}`,
    `external_price_id=eq.${eq(priceId)}`,
  ];
  for (const filter of filters) {
    const rows = await supabaseFetch(`/rest/v1/plans?${filter}&select=*&limit=1`, { service: true });
    if (rows?.[0]) return rows[0];
  }
  if (fallbackCode) return planByCode(fallbackCode);
  return null;
}

function subscriptionPeriod(subscription) {
  const item = subscription?.items?.data?.[0] || {};
  return {
    priceId: item.price?.id || subscription?.plan?.id || null,
    periodStart: item.current_period_start || subscription.current_period_start || null,
    periodEnd: item.current_period_end || subscription.current_period_end || null,
  };
}

async function syncSubscription(subscription, fallback = {}) {
  const metadata = subscription.metadata || fallback.metadata || {};
  const orgId = metadata.org_id || fallback.org_id;
  if (!orgId) return null;
  const period = subscriptionPeriod(subscription);
  const eventCreated = Number(fallback.event_created || subscription.created || 0);
  if (subscription.id && eventCreated) {
    const existingRows = await supabaseFetch(`/rest/v1/organization_subscriptions?provider=eq.${PROVIDER}&provider_subscription_id=eq.${eq(subscription.id)}&select=provider_event_created_at&limit=1`, { service: true });
    const existingCreated = Number(existingRows?.[0]?.provider_event_created_at || 0);
    if (existingCreated > eventCreated) return existingRows[0];
  }
  const plan = await planForPrice(period.priceId, metadata.plan_code || fallback.plan_code);

  if (plan?.id) {
    await supabaseFetch(`/rest/v1/organizations?id=eq.${eq(orgId)}`, {
      method: 'PATCH',
      service: true,
      body: { plan_id: plan.id },
    });
  }

  const rows = await supabaseFetch('/rest/v1/organization_subscriptions?on_conflict=provider,provider_subscription_id', {
    method: 'POST',
    service: true,
    body: {
      org_id: orgId,
      plan_id: plan?.id || null,
      provider: PROVIDER,
      provider_customer_id: subscription.customer || fallback.customer || null,
      provider_subscription_id: subscription.id,
      provider_price_id: period.priceId,
      status: subscription.status || fallback.status || 'active',
      current_period_start: period.periodStart ? new Date(period.periodStart * 1000).toISOString() : null,
      current_period_end: period.periodEnd ? new Date(period.periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      metadata: subscription,
      provider_event_created_at: eventCreated || null,
    },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  });
  return rows?.[0] || null;
}

async function claimBillingEvent(event) {
  const rows = await supabaseFetch('/rest/v1/billing_events?on_conflict=provider,event_id&select=id', {
    method: 'POST',
    service: true,
    body: {
      provider: PROVIDER,
      event_id: event.id,
      event_type: event.type,
      status: 'processing',
      received_at: new Date().toISOString(),
      payload: { id: event.id, type: event.type, created: event.created || null, object_id: event.data?.object?.id || null },
    },
    headers: {
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
  });
  return rows?.[0]?.id || null;
}

async function finishBillingEvent(eventId, status, errorMessage = null) {
  await supabaseFetch(`/rest/v1/billing_events?id=eq.${eq(eventId)}`, {
    method: 'PATCH', service: true,
    body: { status, error_message: errorMessage, processed_at: new Date().toISOString() },
  });
}

async function handleStripeWebhook(req) {
  requireServiceRole();
  requireBillingEnabled();
  const rawBody = await readRawBody(req);
  verifyStripeSignature(rawBody, req.headers['stripe-signature']);
  let event;
  try { event = JSON.parse(rawBody); } catch { throw new HttpError(400, 'Webhook body must be valid JSON.', { code: 'INVALID_WEBHOOK_BODY' }); }
  if (!event?.id || !event?.type || !event?.data?.object) throw new HttpError(400, 'Webhook event is invalid.', { code: 'INVALID_WEBHOOK_EVENT' });
  const claimId = await claimBillingEvent(event);
  if (!claimId) return { received: true, duplicate: true, type: event.type };

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      if (session.subscription) {
        const subscription = await stripeGet(`/subscriptions/${encodeURIComponent(session.subscription)}`);
        await syncSubscription(subscription, {
          org_id: session.metadata?.org_id || session.client_reference_id,
          plan_code: session.metadata?.plan_code,
          customer: session.customer,
          event_created: event.created,
        });
      }
    }

    if (event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted') {
      await syncSubscription(event.data?.object || {}, { event_created: event.created });
    }

    await finishBillingEvent(claimId, 'processed');
    return { received: true, type: event.type };
  } catch (error) {
    await finishBillingEvent(claimId, 'failed', String(error.code || 'WEBHOOK_PROCESSING_FAILED').slice(0, 120)).catch(() => null);
    throw error;
  }
}

async function subscriptionPayload(context) {
  const snapshot = await billingSnapshot(context);
  return {
    billing: snapshot,
  };
}

module.exports = {
  createCheckoutSession,
  createPortalSession,
  handleStripeWebhook,
  subscriptionPayload,
  verifyStripeSignature,
};
