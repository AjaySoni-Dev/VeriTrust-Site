const { HttpError } = require('./veritrust-api');
const { serverConfig } = require('./config');
const { structuredLog } = require('./security');
const {
  SupabaseError,
  eq,
  requireServiceRole,
  supabaseFetch,
} = require('./supabase-server');

const PLAN_DEFAULTS = {
  free: {
    code: 'free',
    name: 'Free',
    monthly_web_scan_limit: 100,
    monthly_api_limit: 100,
    daily_api_limit: 10,
    max_api_keys: 1,
    max_members: 1,
    retention_days: 0,
    allow_api_access: true,
    allow_pdf_export: true,
    allow_batch_scans: false,
    allow_webhooks: false,
    allow_priority_models: false,
  },
  developer: {
    code: 'developer',
    name: 'Developer',
    monthly_web_scan_limit: 1000,
    monthly_api_limit: 10000,
    daily_api_limit: 1000,
    max_api_keys: 3,
    max_members: 2,
    retention_days: 7,
    allow_api_access: true,
    allow_pdf_export: true,
    allow_batch_scans: false,
    allow_webhooks: false,
    allow_priority_models: false,
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    monthly_web_scan_limit: 5000,
    monthly_api_limit: 50000,
    daily_api_limit: 5000,
    max_api_keys: 10,
    max_members: 10,
    retention_days: 30,
    allow_api_access: true,
    allow_pdf_export: true,
    allow_batch_scans: true,
    allow_webhooks: true,
    allow_priority_models: true,
  },
  business: {
    code: 'business',
    name: 'Business',
    monthly_web_scan_limit: 25000,
    monthly_api_limit: 250000,
    daily_api_limit: 25000,
    max_api_keys: 25,
    max_members: 50,
    retention_days: 90,
    allow_api_access: true,
    allow_pdf_export: true,
    allow_batch_scans: true,
    allow_webhooks: true,
    allow_priority_models: true,
  },
  enterprise: {
    code: 'enterprise',
    name: 'Enterprise',
    monthly_web_scan_limit: 1000000,
    monthly_api_limit: 1000000,
    daily_api_limit: 100000,
    max_api_keys: 100,
    max_members: 500,
    retention_days: 365,
    allow_api_access: true,
    allow_pdf_export: true,
    allow_batch_scans: true,
    allow_webhooks: true,
    allow_priority_models: true,
  },
};

function monthStart(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function numberField(row, key, fallback) {
  const value = Number(row?.[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boolField(row, key, fallback) {
  if (typeof row?.[key] === 'boolean') return row[key];
  return fallback;
}

function normalizePlan(rawPlan = {}) {
  const code = String(rawPlan.code || 'free').toLowerCase();
  const defaults = PLAN_DEFAULTS[code] || PLAN_DEFAULTS.free;
  const monthlyWeb = numberField(rawPlan, 'monthly_web_scan_limit', numberField(rawPlan, 'monthly_scan_limit', defaults.monthly_web_scan_limit));
  const monthlyApi = numberField(rawPlan, 'monthly_api_limit', defaults.monthly_api_limit);
  return {
    ...defaults,
    ...rawPlan,
    code,
    name: rawPlan.name || defaults.name,
    monthly_web_scan_limit: monthlyWeb,
    monthly_api_limit: monthlyApi,
    monthly_total_limit: numberField(rawPlan, 'monthly_total_limit', monthlyWeb + monthlyApi),
    daily_api_limit: numberField(rawPlan, 'daily_api_limit', defaults.daily_api_limit),
    max_api_keys: numberField(rawPlan, 'max_api_keys', defaults.max_api_keys),
    max_members: numberField(rawPlan, 'max_members', defaults.max_members),
    retention_days: numberField(rawPlan, 'retention_days', numberField(rawPlan, 'file_retention_days', defaults.retention_days)),
    allow_api_access: boolField(rawPlan, 'allow_api_access', defaults.allow_api_access),
    allow_pdf_export: boolField(rawPlan, 'allow_pdf_export', defaults.allow_pdf_export),
    allow_batch_scans: boolField(rawPlan, 'allow_batch_scans', defaults.allow_batch_scans),
    allow_webhooks: boolField(rawPlan, 'allow_webhooks', defaults.allow_webhooks),
    allow_priority_models: boolField(rawPlan, 'allow_priority_models', defaults.allow_priority_models),
  };
}

function isMissingBillingObject(error) {
  const text = `${error?.message || ''} ${JSON.stringify(error?.details || '')}`.toLowerCase();
  return error instanceof SupabaseError
    && (error.status === 404
      || text.includes('could not find')
      || text.includes('does not exist')
      || text.includes('schema cache')
      || text.includes('pgrst202')
      || text.includes('pgrst205'));
}

async function countActiveApiKeys(orgId) {
  const rows = await supabaseFetch(`/rest/v1/api_keys?org_id=eq.${eq(orgId)}&status=eq.active&select=id`, { service: true });
  return Array.isArray(rows) ? rows.length : 0;
}

async function billingSnapshot(contextOrOrgId) {
  requireServiceRole();
  const orgId = typeof contextOrOrgId === 'string'
    ? contextOrOrgId
    : contextOrOrgId?.organization?.id;
  if (!orgId) throw new HttpError(400, 'Organization is required.', { code: 'INVALID_ORGANIZATION' });

  const orgRows = await supabaseFetch(`/rest/v1/organizations?id=eq.${eq(orgId)}&select=id,name,plan_id,plans(*)&limit=1`, {
    service: true,
  });
  const organization = orgRows?.[0] || null;
  const plan = normalizePlan(organization?.plans || contextOrOrgId?.organization?.plans || {});
  const currentMonth = monthStart();

  const subscriptionRows = serverConfig.billingEnabled
    ? await supabaseFetch(`/rest/v1/organization_subscriptions?org_id=eq.${eq(orgId)}&select=*&order=created_at.desc&limit=1`, { service: true })
    : [];
  const usageRows = await supabaseFetch(`/rest/v1/usage_monthly?org_id=eq.${eq(orgId)}&month_start=eq.${currentMonth}&select=*`, { service: true });
  const apiKeyCount = await countActiveApiKeys(orgId);
  const subscription = subscriptionRows?.[0] || null;
  const usage = usageRows?.[0] || {};
  const apiTypeTotal = Number(usage.api_deepfake_count ?? 0) + Number(usage.api_phishing_count ?? 0) + Number(usage.api_link_count ?? 0);
  const apiUsed = usage.api_usage_count == null ? apiTypeTotal : Number(usage.api_usage_count);
  const webUsed = Number(usage.web_deepfake_count ?? 0) + Number(usage.web_phishing_count ?? 0) + Number(usage.web_link_count ?? 0);

  return {
    organization_id: orgId,
    available: serverConfig.billingEnabled,
    contract_version: '2026-07-10',
    plan,
    subscription,
    current_month: currentMonth,
    usage: {
      web_used: webUsed,
      api_used: apiUsed,
      total_used: webUsed + apiUsed,
      api_keys_used: apiKeyCount,
      raw: usage,
    },
    limits: {
      monthly_web_scan_limit: plan.monthly_web_scan_limit,
      monthly_api_limit: plan.monthly_api_limit,
      monthly_total_limit: plan.monthly_total_limit,
      daily_api_limit: plan.daily_api_limit,
      max_api_keys: plan.max_api_keys,
      max_members: plan.max_members,
      retention_days: plan.retention_days,
    },
    features: {
      allow_api_access: plan.allow_api_access,
      allow_pdf_export: plan.allow_pdf_export,
      allow_batch_scans: plan.allow_batch_scans,
      allow_webhooks: plan.allow_webhooks,
      allow_priority_models: plan.allow_priority_models,
    },
  };
}

function subscriptionAllowsUse(snapshot) {
  const code = snapshot?.plan?.code || 'free';
  if (code === 'free') return true;
  const status = String(snapshot?.subscription?.status || snapshot?.plan?.billing_status || '').toLowerCase();
  if (!status) return false;
  return ['active', 'trialing', 'manual', 'enterprise', 'past_due_grace'].includes(status);
}

function localDecision(snapshot, action, source) {
  if (!subscriptionAllowsUse(snapshot)) {
    return {
      allowed: false,
      status: 402,
      code: 'SUBSCRIPTION_INACTIVE',
      message: 'Your subscription is not active. Update billing to continue.',
    };
  }

  if ((action === 'api_scan' || action === 'api_usage_read') && !snapshot.features.allow_api_access) {
    return {
      allowed: false,
      status: 403,
      code: 'API_NOT_INCLUDED',
      message: 'API access is not included in the current plan.',
    };
  }

  if (action === 'api_key_create' && snapshot.usage.api_keys_used >= snapshot.limits.max_api_keys) {
    return {
      allowed: false,
      status: 403,
      code: 'API_KEY_LIMIT_REACHED',
      message: `This plan allows ${snapshot.limits.max_api_keys} active API key${snapshot.limits.max_api_keys === 1 ? '' : 's'}.`,
    };
  }

  if (action === 'api_scan' && snapshot.usage.api_used >= snapshot.limits.monthly_api_limit) {
    return {
      allowed: false,
      status: 429,
      code: 'MONTHLY_API_LIMIT_REACHED',
      message: 'Monthly API usage limit reached for this workspace.',
    };
  }

  if (source === 'web' && snapshot.usage.web_used >= snapshot.limits.monthly_web_scan_limit) {
    return {
      allowed: false,
      status: 429,
      code: 'MONTHLY_SCAN_LIMIT_REACHED',
      message: 'Monthly scan limit reached for this workspace.',
    };
  }

  return {
    allowed: true,
    status: 200,
    code: 'ALLOWED',
    message: 'Allowed.',
  };
}

async function rpcDecision(context, options) {
  try {
    const rows = await supabaseFetch('/rest/v1/rpc/check_entitlement_quota', {
      method: 'POST',
      service: true,
      body: {
        target_org_id: context.organization.id,
        target_user_id: context.user?.id || null,
        target_action: options.action,
        target_source: options.source || 'web',
        target_scan_type: options.scanType || null,
        target_units: Number(options.units || 1),
      },
    });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    if (isMissingBillingObject(error)) {
      throw new HttpError(503, 'Quota service is not available.', {
        code: 'QUOTA_UNAVAILABLE',
        meta: { retry_after: 60 },
      });
    }
    throw error;
  }
}

async function enforceEntitlement(context, options = {}) {
  requireServiceRole();
  const action = options.action || (options.source === 'api' ? 'api_scan' : 'web_scan');
  const source = options.source || 'web';
  const rpcResult = await rpcDecision(context, { ...options, action, source });

  const snapshot = await billingSnapshot(context);
  const decision = rpcResult;
  if (!decision || typeof decision.allowed !== 'boolean') {
    throw new HttpError(503, 'Quota service returned an invalid response.', {
      code: 'QUOTA_CONTRACT_ERROR',
      meta: { retry_after: 60 },
    });
  }

  const allowed = Boolean(decision?.allowed);
  if (!allowed) {
    throw new HttpError(Number(decision?.status || 429), decision?.message || 'Plan limit reached.', {
      code: decision?.code || 'PLAN_LIMIT_REACHED',
      meta: decision,
    });
  }

  return {
    ...snapshot,
    decision,
    plan: decision?.plan || snapshot.plan,
    usage: decision?.usage || snapshot.usage,
    limits: decision?.limits || snapshot.limits,
    features: decision?.features || snapshot.features,
  };
}

async function recordBillableUsage(context, options = {}) {
  if (!context?.organization?.id) return null;
  try {
    const rows = await supabaseFetch('/rest/v1/rpc/record_billable_usage', {
      method: 'POST',
      service: true,
      body: {
        target_org_id: context.organization.id,
        target_user_id: context.user?.id || null,
        target_source: options.source || 'web',
        target_scan_type: options.scanType || null,
        target_endpoint: options.endpoint || null,
        target_status: options.status || 'success',
        target_units: Number(options.units || 1),
        target_request_id: options.requestId || null,
        target_metadata: options.metadata || {},
        target_reservation_id: options.reservationId || null,
      },
    });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    if (!isMissingBillingObject(error)) {
      structuredLog('error', 'billing.usage_record_failed', { status: error.status, code: error.code, request_id: options.requestId });
    }
    return null;
  }
}

async function releaseQuotaReservation(reservationId, reason = 'request_failed') {
  if (!reservationId) return null;
  try {
    return await supabaseFetch('/rest/v1/rpc/release_quota_reservation', {
      method: 'POST', service: true,
      body: { target_reservation_id: reservationId, release_reason: String(reason || 'request_failed').slice(0, 120) },
    });
  } catch (error) {
    structuredLog('error', 'quota.reservation_release_failed', { reservation_id: reservationId, code: error.code, status: error.status });
    return null;
  }
}

function applyEntitlementHeaders(res, entitlement) {
  if (!res || !entitlement) return;
  const plan = entitlement.plan || {};
  const usage = entitlement.usage || {};
  const limits = entitlement.limits || {};
  const apiLimit = Number(limits.monthly_api_limit ?? plan.monthly_api_limit ?? 0);
  const apiUsed = Number(usage.api_used ?? 0);
  res.setHeader('X-VeriTrust-Plan', plan.code || 'free');
  if (apiLimit > 0) {
    res.setHeader('X-RateLimit-Limit', String(apiLimit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, apiLimit - apiUsed)));
  }
}

module.exports = {
  PLAN_DEFAULTS,
  applyEntitlementHeaders,
  billingSnapshot,
  enforceEntitlement,
  monthStart,
  normalizePlan,
  recordBillableUsage,
  releaseQuotaReservation,
};
