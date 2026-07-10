const crypto = require('crypto');
const { serverConfig } = require('./config');
const { HttpError } = require('./veritrust-api');
const { structuredLog, timingSafeStringEqual } = require('./security');
const { eq, requireServiceRole, supabaseFetch } = require('./supabase-server');
const { enforceEntitlement, recordBillableUsage } = require('./entitlements');

const DEFAULT_SCOPES = Object.freeze(['deepfake:scan', 'phishing:scan', 'link:scan', 'usage:read']);
const DEFAULT_DAILY_LIMIT = 100;
const KEY_VERSION = 1;

function requestId() {
  return `vt_req_${crypto.randomBytes(12).toString('hex')}`;
}

function requireExternalApiEnabled() {
  if (!serverConfig.externalApiEnabled) {
    throw new HttpError(503, 'External API access is temporarily disabled while credentials are migrated.', {
      code: 'EXTERNAL_API_DISABLED',
      meta: { retry_after: 3600 },
    });
  }
}

function generateApiKey(mode = 'live') {
  if (mode !== 'live') throw new HttpError(400, 'Test keys are disabled until an isolated sandbox is available.', { code: 'SANDBOX_UNAVAILABLE' });
  const publicId = crypto.randomBytes(12).toString('base64url');
  const secret = crypto.randomBytes(32).toString('base64url');
  const rawKey = `vtg_live_${publicId}_${secret}`;
  return {
    version: KEY_VERSION,
    publicId,
    secret,
    rawKey,
    displayHint: `vtg_live_${publicId}_...${secret.slice(-4)}`,
  };
}

function parseApiKey(rawKey) {
  const match = String(rawKey || '').trim().match(/^vtg_live_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{40,64})$/);
  if (!match) throw new HttpError(401, 'Invalid API key.', { code: 'INVALID_API_KEY' });
  return { mode: 'live', publicId: match[1], secret: match[2], version: KEY_VERSION };
}

function deriveApiKeyDigest(secret, pepper, version = KEY_VERSION) {
  if (!pepper) throw new HttpError(500, 'API key verification is not configured.', { code: 'SERVER_CONFIG_ERROR' });
  return crypto.createHmac('sha256', pepper).update(`veritrust-api-key:v${version}:${String(secret || '')}`).digest('hex');
}

function hashApiKey(rawKey) {
  const parsed = parseApiKey(rawKey);
  return deriveApiKeyDigest(parsed.secret, serverConfig.apiKeyPepper, parsed.version);
}

function maskApiKey(rawKey) {
  const parsed = parseApiKey(rawKey);
  return `vtg_live_${parsed.publicId}_...${parsed.secret.slice(-4)}`;
}

function bearerApiKey(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function normalizeScopes(value, { allowDefault = false } = {}) {
  const scopes = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  if (!scopes.length && allowDefault) return [...DEFAULT_SCOPES];
  if (!scopes.length) throw new HttpError(400, 'Select at least one API scope.', { code: 'API_SCOPE_REQUIRED' });
  const unique = [...new Set(scopes)];
  const invalid = unique.filter((scope) => !DEFAULT_SCOPES.includes(scope));
  if (invalid.length) throw new HttpError(400, 'One or more API scopes are invalid.', { code: 'API_SCOPE_INVALID', meta: { invalid_scopes: invalid } });
  return unique;
}

function publicKeyRow(row) {
  return {
    id: row.id,
    name: row.name,
    public_id: row.public_id,
    display_hint: row.display_hint || `vtg_live_${row.public_id}_...`,
    ownership: row.ownership || 'organization',
    scopes: normalizeScopes(row.scopes, { allowDefault: true }),
    status: row.status,
    usage_limit_daily: Number.isInteger(Number(row.usage_limit_daily)) ? Number(row.usage_limit_daily) : DEFAULT_DAILY_LIMIT,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at || null,
  };
}

function requireKeyAdmin(context) {
  if (!['owner', 'admin'].includes(String(context?.role || '').toLowerCase())) {
    throw new HttpError(403, 'Only workspace owners and admins can manage organization API keys.', { code: 'API_KEY_ADMIN_REQUIRED' });
  }
}

async function usageMapForOrganization(orgId) {
  const rows = await supabaseFetch('/rest/v1/rpc/api_key_usage_today', {
    method: 'POST',
    service: true,
    body: { target_org_id: orgId },
  });
  return new Map((rows || []).map((row) => [row.api_key_id, Number(row.used_today || 0)]));
}

function usageSnapshot(row, usedToday) {
  const limit = Number.isInteger(Number(row.usage_limit_daily)) ? Number(row.usage_limit_daily) : DEFAULT_DAILY_LIMIT;
  const used = Math.max(0, Number(usedToday || 0));
  return { limit_daily: limit, used_today: used, remaining_today: Math.max(0, limit - used), disabled: limit === 0 };
}

async function listApiKeys(context) {
  requireServiceRole();
  requireKeyAdmin(context);
  const [rows, usage] = await Promise.all([
    supabaseFetch(`/rest/v1/api_keys?org_id=eq.${eq(context.organization.id)}&select=id,name,public_id,display_hint,ownership,scopes,status,usage_limit_daily,created_at,last_used_at,revoked_at&order=created_at.desc`, { service: true }),
    usageMapForOrganization(context.organization.id),
  ]);
  return (rows || []).map((row) => ({ ...publicKeyRow(row), usage: usageSnapshot(row, usage.get(row.id) || 0) }));
}

function parseUsageLimit(value, maximum) {
  if (value === undefined || value === null || value === '') return maximum;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new HttpError(400, `Daily usage limit must be an integer from 0 to ${maximum}.`, { code: 'API_LIMIT_INVALID' });
  }
  return parsed;
}

async function createApiKey(context, options = {}) {
  requireServiceRole();
  requireExternalApiEnabled();
  requireKeyAdmin(context);
  const entitlement = await enforceEntitlement(context, { action: 'api_key_create', source: 'api' });
  const generated = generateApiKey(options.mode || 'live');
  const scopes = normalizeScopes(options.scopes);
  const name = String(options.name || 'VeriTrust API Key').trim().slice(0, 80) || 'VeriTrust API Key';
  const planDailyLimit = Math.max(0, Number(entitlement?.limits?.daily_api_limit ?? DEFAULT_DAILY_LIMIT));
  const usageLimitDaily = parseUsageLimit(options.usage_limit_daily, planDailyLimit);
  const pepperVersion = serverConfig.apiKeyPepperVersion;
  const rows = await supabaseFetch('/rest/v1/api_keys?select=id,name,public_id,display_hint,ownership,scopes,status,usage_limit_daily,created_at,last_used_at,revoked_at', {
    method: 'POST',
    service: true,
    body: {
      org_id: context.organization.id,
      created_by: context.user.id,
      user_id: context.user.id,
      name,
      public_id: generated.publicId,
      display_hint: generated.displayHint,
      ownership: 'organization',
      key_hash: deriveApiKeyDigest(generated.secret, serverConfig.apiKeyPepper, pepperVersion),
      key_version: pepperVersion,
      scopes,
      status: 'active',
      usage_limit_daily: usageLimitDaily,
    },
    headers: { Prefer: 'return=representation' },
  });
  const row = rows?.[0];
  return { ...publicKeyRow(row), key: generated.rawKey, usage: usageSnapshot(row, 0) };
}

async function revokeApiKey(context, id) {
  requireServiceRole();
  requireKeyAdmin(context);
  const keyId = String(id || '').trim();
  if (!keyId) throw new HttpError(400, 'API key id is required.', { code: 'INVALID_INPUT' });
  const rows = await supabaseFetch(`/rest/v1/api_keys?id=eq.${eq(keyId)}&org_id=eq.${eq(context.organization.id)}&select=id`, { service: true });
  if (!rows?.length) throw new HttpError(404, 'API key was not found.', { code: 'NOT_FOUND' });
  await supabaseFetch(`/rest/v1/api_keys?id=eq.${eq(keyId)}`, {
    method: 'PATCH', service: true, body: { status: 'revoked', revoked_at: new Date().toISOString() },
  });
  return { id: keyId };
}

async function verifyApiKey(rawKey) {
  requireServiceRole();
  requireExternalApiEnabled();
  const parsed = parseApiKey(rawKey);
  const rows = await supabaseFetch(`/rest/v1/api_keys?public_id=eq.${eq(parsed.publicId)}&select=id,org_id,created_by,user_id,name,public_id,display_hint,ownership,key_hash,key_version,scopes,status,usage_limit_daily,created_at,last_used_at,revoked_at&limit=1`, { service: true });
  const row = rows?.[0] || null;
  if (!row || row.status !== 'active' || row.revoked_at) throw new HttpError(401, 'Invalid or revoked API key.', { code: 'INVALID_API_KEY' });
  const expected = deriveApiKeyDigest(parsed.secret, serverConfig.apiKeyPepper, Number(row.key_version || 1));
  if (!timingSafeStringEqual(row.key_hash, expected)) throw new HttpError(401, 'Invalid or revoked API key.', { code: 'INVALID_API_KEY' });
  return { row, public: publicKeyRow(row), user: { id: row.user_id || row.created_by }, organization: { id: row.org_id } };
}

async function requireApiKey(req, requiredScope) {
  const auth = await verifyApiKey(bearerApiKey(req));
  const scopes = normalizeScopes(auth.row.scopes, { allowDefault: true });
  if (requiredScope && !scopes.includes(requiredScope)) throw new HttpError(403, 'API key does not have the required scope.', { code: 'INSUFFICIENT_SCOPE' });
  const isUsageRead = requiredScope === 'usage:read';
  const entitlement = await enforceEntitlement(auth, {
    action: isUsageRead ? 'api_usage_read' : 'api_scan',
    source: 'api',
    scanType: requiredScope?.split(':')[0] || null,
  });
  const usageRows = await usageMapForOrganization(auth.row.org_id);
  const usage = usageSnapshot(auth.row, usageRows.get(auth.row.id) || 0);
  if (!isUsageRead && (usage.disabled || usage.remaining_today <= 0)) {
    throw new HttpError(429, 'Daily API usage limit exceeded.', { code: 'RATE_LIMITED', meta: { usage, retry_after: 3600 } });
  }
  return { ...auth, scopes, entitlement, usage };
}

async function recordApiUsage(auth, data = {}) {
  if (!auth?.row?.id) return null;
  try {
    await supabaseFetch('/rest/v1/api_usage_events', {
      method: 'POST', service: true,
      body: {
        api_key_id: auth.row.id,
        org_id: auth.row.org_id,
        user_id: auth.row.user_id || auth.row.created_by,
        endpoint: data.endpoint || 'unknown',
        scan_type: data.scan_type || null,
        status: data.status || 'success',
        request_id: data.request_id || null,
        latency_ms: Number.isFinite(Number(data.latency_ms)) ? Number(data.latency_ms) : null,
        error_code: data.error_code || null,
      },
    });
    if (data.status === 'success' && data.scan_type) {
      await recordBillableUsage({ organization: { id: auth.row.org_id }, user: { id: auth.row.user_id || auth.row.created_by } }, {
        source: 'api', scanType: data.scan_type, endpoint: data.endpoint || 'unknown', requestId: data.request_id || null,
        reservationId: auth.entitlement?.decision?.reservation_id || null,
        metadata: { api_key_id: auth.row.id },
      });
    }
  } catch (error) {
    structuredLog('error', 'api.usage_log_failed', { request_id: data.request_id, status: error.status, code: error.code });
  }
  return null;
}

function externalApiError(res, error, fallback = 'Request failed.', request_id = requestId()) {
  const status = Number(error.status || 500);
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  const code = error.code || error.extra?.code || (safeStatus >= 500 ? 'INTERNAL_ERROR' : 'INVALID_INPUT');
  const safeMessage = safeStatus >= 500 && !['MODEL_ERROR', 'EXTERNAL_API_DISABLED'].includes(code) ? fallback : (error.message || fallback);
  if (safeStatus >= 500) structuredLog('error', 'external_api.request_failed', { request_id, code, status: safeStatus });
  if ((safeStatus === 429 || safeStatus === 503) && error.extra?.meta?.retry_after) res.setHeader('Retry-After', String(error.extra.meta.retry_after));
  res.statusCode = safeStatus;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Request-ID', request_id);
  res.end(JSON.stringify({ ok: false, request_id, error: { code, message: safeMessage } }));
}

module.exports = {
  DEFAULT_DAILY_LIMIT,
  DEFAULT_SCOPES,
  createApiKey,
  deriveApiKeyDigest,
  externalApiError,
  generateApiKey,
  hashApiKey,
  listApiKeys,
  maskApiKey,
  normalizeScopes,
  parseApiKey,
  publicKeyRow,
  recordApiUsage,
  requestId,
  requireApiKey,
  revokeApiKey,
  usageSnapshot,
  verifyApiKey,
};
