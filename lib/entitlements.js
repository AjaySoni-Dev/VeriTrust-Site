const { HttpError } = require('./veritrust-api');
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

function isLinkBillingCompatibilityError(error, scanType) {
  if (scanType !== 'link' || !(error instanceof SupabaseError)) return false;
  const text = `${error?.message || ''} ${JSON.stringify(error?.details || '')}`.toLowerCase();
  return text.includes('link_count')
    || text.includes('target_scan_type')
    || text.includes('scan_type')
    || text.includes('invalid input value for enum')
    || text.includes('violates check constraint');
}

async function tryService(path, fallback) {
  try {
    return await supabaseFetch(path, { service: true });
  } catch (error) {
    if (isMissingBillingObject(error)) return fallback;
    throw error;
  }
}

async function countActiveApiKeys(orgId) {
  const rows = await tryService(`/rest/v1/api_keys?org_id=eq.${eq(orgId)}&status=eq.active&select=id`, []);
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

  const monthTimestamp = `${currentMonth}T00:00:00.000Z`;
  const [subscriptionRows, usageRows, apiKeyCount, webUsageEvents] = await Promise.all([
    tryService(`/rest/v1/organization_subscriptions?org_id=eq.${eq(orgId)}&select=*&order=created_at.desc&limit=1`, []),
    tryService(`/rest/v1/usage_monthly?org_id=eq.${eq(orgId)}&month_start=eq.${currentMonth}&select=*`, []),
    countActiveApiKeys(orgId),
    tryService(`/rest/v1/usage_events?org_id=eq.${eq(orgId)}&source=eq.web&status=eq.success&created_at=gte.${eq(monthTimestamp)}&select=scan_type,units,metadata&order=created_at.desc`, []),
  ]);
  const subscription = subscriptionRows?.[0] || null;
  const usage = usageRows?.[0] || {};
  const apiUsed = Number(usage.api_deepfake_count || 0)
    + Number(usage.api_phishing_count || 0)
    + Number(usage.api_link_count || 0)
    + Number(usage.api_usage_count || 0);
  const webUsed = Number(usage.web_deepfake_count || 0)
    + Number(usage.web_phishing_count || 0)
    + Number(usage.web_link_count || 0);
  const webByType = {
    deepfake: 0,
    link: 0,
    phishing: 0,
  };
  let remainingWebUnits = webUsed;
  for (const event of webUsageEvents || []) {
    if (remainingWebUnits <= 0) break;
    const units = Math.min(remainingWebUnits, Math.max(0, Number(event.units || 1)));
    const logicalType = event.metadata?.logical_scan_type === 'link' ? 'link' : event.scan_type;
    if (Object.prototype.hasOwnProperty.call(webByType, logicalType)) {
      webByType[logicalType] += units;
      remainingWebUnits -= units;
    }
  }
  if (!(webUsageEvents || []).length) {
    webByType.deepfake = Number(usage.web_deepfake_count || 0);
    webByType.link = Number(usage.web_link_count || 0);
    webByType.phishing = Number(usage.web_phishing_count || 0);
  }

  return {
    organization_id: orgId,
    plan,
    subscription,
    current_month: currentMonth,
    usage: {
      web_used: webUsed,
      api_used: apiUsed,
      total_used: webUsed + apiUsed,
      api_keys_used: apiKeyCount,
      web_by_type: webByType,
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
  if (!status) return true;
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
    if (isMissingBillingObject(error) || isLinkBillingCompatibilityError(error, options.scanType)) return null;
    throw error;
  }
}

async function enforceEntitlement(context, options = {}) {
  requireServiceRole();
  const action = options.action || (options.source === 'api' ? 'api_scan' : 'web_scan');
  const source = options.source || 'web';
  const rpcResult = await rpcDecision(context, { ...options, action, source });

  let snapshot = null;
  let decision = rpcResult;
  if (!decision) {
    snapshot = await billingSnapshot(context);
    decision = localDecision(snapshot, action, source);
  }

  const allowed = Boolean(decision?.allowed);
  if (!allowed) {
    throw new HttpError(Number(decision?.status || 429), decision?.message || 'Plan limit reached.', {
      code: decision?.code || 'PLAN_LIMIT_REACHED',
      meta: decision,
    });
  }

  return {
    ...(snapshot || {}),
    decision,
    plan: decision?.plan || snapshot?.plan,
    usage: decision?.usage || snapshot?.usage,
    limits: decision?.limits || snapshot?.limits,
    features: decision?.features || snapshot?.features,
  };
}

async function recordBillableUsage(context, options = {}) {
  if (!context?.organization?.id) return null;
  const metadata = options.scanType === 'link'
    ? { ...(options.metadata || {}), logical_scan_type: 'link' }
    : (options.metadata || {});
  const requestBody = {
    target_org_id: context.organization.id,
    target_user_id: context.user?.id || null,
    target_source: options.source || 'web',
    target_scan_type: options.scanType || null,
    target_endpoint: options.endpoint || null,
    target_status: options.status || 'success',
    target_units: Number(options.units || 1),
    target_request_id: options.requestId || null,
    target_metadata: metadata,
  };
  try {
    const rows = await supabaseFetch('/rest/v1/rpc/record_billable_usage', {
      method: 'POST',
      service: true,
      body: requestBody,
    });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    if (isLinkBillingCompatibilityError(error, options.scanType)) {
      try {
        const rows = await supabaseFetch('/rest/v1/rpc/record_billable_usage', {
          method: 'POST',
          service: true,
          body: { ...requestBody, target_scan_type: 'phishing' },
        });
        return Array.isArray(rows) ? rows[0] : rows;
      } catch (fallbackError) {
        if (!isMissingBillingObject(fallbackError)) {
          console.error('VeriTrust compatibility usage logging failed', {
            status: fallbackError.status,
            message: fallbackError.message,
          });
        }
        return null;
      }
    }
    if (!isMissingBillingObject(error)) {
      console.error('VeriTrust billable usage logging failed', {
        status: error.status,
        message: error.message,
      });
    }
    return null;
  }
}

function applyEntitlementHeaders(res, entitlement) {
  if (!res || !entitlement) return;
  const plan = entitlement.plan || {};
  const usage = entitlement.usage || {};
  const limits = entitlement.limits || {};
  const apiLimit = Number(limits.monthly_api_limit || plan.monthly_api_limit || 0);
  const apiUsed = Number(usage.api_used || 0);
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
};
