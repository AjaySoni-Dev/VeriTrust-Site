const crypto = require('crypto');
const { getOptionalEnv } = require('./config');
const { HttpError } = require('./veritrust-api');
const {
  eq,
  requireServiceRole,
  supabaseFetch,
} = require('./supabase-server');
const { billingSnapshot } = require('./entitlements');

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const PROVIDER = 'stripe';

function siteUrl(req) {
  const configured = getOptionalEnv('VERITRUST_SITE_URL', '');
  if (configured) return configured.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : 'https://veritrustsite.vercel.app';
}

function stripeSecretKey() {
  const key = getOptionalEnv('STRIPE_SECRET_KEY', '');
  if (!key) throw new HttpError(500, 'Billing provider is not configured.', { code: 'BILLING_NOT_CONFIGURED' });
  return key;
}

async function stripeRequest(path, params = {}) {
  const form = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const raw = await response.text();
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
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey()}` },
  });
  const data = await response.json().catch(() => null);
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
  requireBillingAdmin(context);
  const plan = await planByCode(options.plan);
  const priceId = priceIdForPlan(plan, options.interval);
  const customerId = await ensureBillingCustomer(context);
  const origin = siteUrl(req);
  const session = await stripeRequest('/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    client_reference_id: context.organization.id,
    success_url: `${origin}/dashboard.html?billing=success`,
    cancel_url: `${origin}/dashboard.html?billing=cancelled`,
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
  requireBillingAdmin(context);
  const customer = await existingBillingCustomer(context.organization.id);
  if (!customer?.provider_customer_id) {
    throw new HttpError(404, 'No billing customer exists for this workspace yet.', { code: 'BILLING_CUSTOMER_NOT_FOUND' });
  }
  const origin = siteUrl(req);
  const session = await stripeRequest('/billing_portal/sessions', {
    customer: customer.provider_customer_id,
    return_url: `${origin}/dashboard.html?billing=portal`,
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

function verifyStripeSignature(rawBody, signatureHeader) {
  const secret = getOptionalEnv('STRIPE_WEBHOOK_SECRET', '');
  if (!secret) throw new HttpError(500, 'Billing webhook secret is not configured.', { code: 'BILLING_WEBHOOK_NOT_CONFIGURED' });
  const parts = Object.fromEntries(String(signatureHeader || '').split(',').map((item) => {
    const [key, value] = item.split('=');
    return [key, value];
  }));
  const timestamp = parts.t;
  const received = parts.v1;
  if (!timestamp || !received) {
    throw new HttpError(400, 'Missing billing webhook signature.', { code: 'INVALID_WEBHOOK_SIGNATURE' });
  }
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new HttpError(400, 'Invalid billing webhook signature.', { code: 'INVALID_WEBHOOK_SIGNATURE' });
  }
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
    },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  });
  return rows?.[0] || null;
}

async function recordBillingEvent(event, status = 'processed', errorMessage = null) {
  await supabaseFetch('/rest/v1/billing_events?on_conflict=provider,event_id', {
    method: 'POST',
    service: true,
    body: {
      provider: PROVIDER,
      event_id: event.id,
      event_type: event.type,
      status,
      error_message: errorMessage,
      payload: event,
      processed_at: new Date().toISOString(),
    },
    headers: {
      Prefer: 'resolution=merge-duplicates',
    },
  });
}

async function handleStripeWebhook(req) {
  requireServiceRole();
  const rawBody = await readRawBody(req);
  verifyStripeSignature(rawBody, req.headers['stripe-signature']);
  const event = JSON.parse(rawBody);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      if (session.subscription) {
        const subscription = await stripeGet(`/subscriptions/${encodeURIComponent(session.subscription)}`);
        await syncSubscription(subscription, {
          org_id: session.metadata?.org_id || session.client_reference_id,
          plan_code: session.metadata?.plan_code,
          customer: session.customer,
        });
      }
    }

    if (event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted') {
      await syncSubscription(event.data?.object || {});
    }

    await recordBillingEvent(event, 'processed');
    return { received: true, type: event.type };
  } catch (error) {
    await recordBillingEvent(event, 'failed', error.message || 'Webhook processing failed.');
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
};
