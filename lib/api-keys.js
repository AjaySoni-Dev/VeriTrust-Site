const crypto = require('crypto');
const { HttpError } = require('./veritrust-api');
const {
  SupabaseError,
  eq,
  requireServiceRole,
  supabaseFetch,
} = require('./supabase-server');

const DEFAULT_SCOPES = ['deepfake:scan', 'phishing:scan', 'usage:read'];
const DEFAULT_DAILY_LIMIT = 100;

function requestId() {
  return `vt_req_${crypto.randomBytes(12).toString('hex')}`;
}

function generateApiKey(mode = 'live') {
  const safeMode = mode === 'test' ? 'test' : 'live';
  return `vtg_${safeMode}_${crypto.randomBytes(24).toString('base64url')}`;
}

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey || ''), 'utf8').digest('hex');
}

function maskApiKey(rawKey) {
  const key = String(rawKey || '');
  if (key.length <= 18) return `${key.slice(0, 8)}...`;
  return `${key.slice(0, 13)}...${key.slice(-6)}`;
}

function keyPrefix(rawKey) {
  return String(rawKey || '').split('_').slice(0, 3).join('_');
}

function bearerApiKey(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function normalizeScopes(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return DEFAULT_SCOPES;
}

function publicKeyRow(row) {
  const scopes = normalizeScopes(row.scopes);
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    masked_key: row.masked_key || row.key_prefix,
    scopes,
    status: row.status,
    usage_limit_daily: Number(row.usage_limit_daily || DEFAULT_DAILY_LIMIT),
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at || null,
  };
}

async function apiUsageForKey(apiKeyId) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const rows = await supabaseFetch(`/rest/v1/api_usage_events?api_key_id=eq.${eq(apiKeyId)}&created_at=gte.${encodeURIComponent(since.toISOString())}&select=id`, {
    service: true,
    headers: { Prefer: 'count=exact' },
  });
  return Array.isArray(rows) ? rows.length : 0;
}

function usageSnapshot(row, usedToday) {
  const limit = Number(row.usage_limit_daily || DEFAULT_DAILY_LIMIT);
  const used = Number(usedToday || 0);
  return {
    limit_daily: limit,
    used_today: used,
    remaining_today: Math.max(0, limit - used),
  };
}

async function listApiKeys(context) {
  requireServiceRole();
  const rows = await supabaseFetch(`/rest/v1/api_keys?org_id=eq.${eq(context.organization.id)}&created_by=eq.${eq(context.user.id)}&select=id,name,key_prefix,masked_key,scopes,status,usage_limit_daily,created_at,last_used_at,revoked_at&order=created_at.desc`, {
    service: true,
  });

  const keys = [];
  for (const row of rows || []) {
    const usedToday = await apiUsageForKey(row.id);
    keys.push({
      ...publicKeyRow(row),
      usage: usageSnapshot(row, usedToday),
    });
  }
  return keys;
}

async function createApiKey(context, options = {}) {
  requireServiceRole();
  const rawKey = generateApiKey(options.mode);
  const scopes = Array.isArray(options.scopes) && options.scopes.length
    ? options.scopes.filter((scope) => DEFAULT_SCOPES.includes(scope))
    : DEFAULT_SCOPES;
  const name = String(options.name || 'VeriTrust API Key').trim().slice(0, 80) || 'VeriTrust API Key';
  const usageLimitDaily = Math.max(1, Math.min(100000, Number(options.usage_limit_daily || DEFAULT_DAILY_LIMIT)));

  const rows = await supabaseFetch('/rest/v1/api_keys?select=id,name,key_prefix,masked_key,scopes,status,usage_limit_daily,created_at,last_used_at,revoked_at', {
    method: 'POST',
    service: true,
    body: {
      org_id: context.organization.id,
      created_by: context.user.id,
      user_id: context.user.id,
      name,
      key_prefix: keyPrefix(rawKey),
      key_hash: hashApiKey(rawKey),
      masked_key: maskApiKey(rawKey),
      scopes,
      status: 'active',
      usage_limit_daily: usageLimitDaily,
    },
    headers: {
      Prefer: 'return=representation',
    },
  });

  const row = rows?.[0];
  return {
    ...publicKeyRow(row),
    key: rawKey,
    usage: usageSnapshot(row, 0),
  };
}

async function revokeApiKey(context, id) {
  requireServiceRole();
  const keyId = String(id || '').trim();
  if (!keyId) throw new HttpError(400, 'API key id is required.', { code: 'INVALID_INPUT' });

  const rows = await supabaseFetch(`/rest/v1/api_keys?id=eq.${eq(keyId)}&org_id=eq.${eq(context.organization.id)}&created_by=eq.${eq(context.user.id)}&select=id`, {
    service: true,
  });
  if (!rows?.length) throw new HttpError(404, 'API key was not found.', { code: 'NOT_FOUND' });

  await supabaseFetch(`/rest/v1/api_keys?id=eq.${eq(keyId)}`, {
    method: 'PATCH',
    service: true,
    body: {
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    },
  });
  return { id: keyId };
}

async function verifyApiKey(rawKey) {
  requireServiceRole();
  const key = String(rawKey || '').trim();
  if (!key) throw new HttpError(401, 'Missing API key.', { code: 'MISSING_API_KEY' });
  if (!/^vtg_(live|test)_[A-Za-z0-9_-]{20,}$/.test(key)) {
    throw new HttpError(401, 'Invalid API key.', { code: 'INVALID_API_KEY' });
  }

  const rows = await supabaseFetch(`/rest/v1/api_keys?key_hash=eq.${eq(hashApiKey(key))}&select=id,org_id,created_by,user_id,name,key_prefix,masked_key,scopes,status,usage_limit_daily,created_at,last_used_at,revoked_at`, {
    service: true,
  });
  const row = rows?.[0] || null;
  if (!row) throw new HttpError(401, 'Invalid or revoked API key.', { code: 'INVALID_API_KEY' });
  if (row.status !== 'active' || row.revoked_at) {
    throw new HttpError(401, 'Invalid or revoked API key.', { code: 'REVOKED_API_KEY' });
  }

  return {
    row,
    public: publicKeyRow(row),
    user: { id: row.user_id || row.created_by },
    organization: { id: row.org_id },
  };
}

async function requireApiKey(req, requiredScope) {
  const auth = await verifyApiKey(bearerApiKey(req));
  const scopes = normalizeScopes(auth.row.scopes);
  if (requiredScope && !scopes.includes(requiredScope)) {
    throw new HttpError(403, 'API key does not have the required scope.', { code: 'INSUFFICIENT_SCOPE' });
  }

  const usedToday = await apiUsageForKey(auth.row.id);
  const usage = usageSnapshot(auth.row, usedToday);
  if (usage.remaining_today <= 0) {
    throw new HttpError(429, 'Daily API usage limit exceeded.', {
      code: 'RATE_LIMITED',
      meta: { usage },
    });
  }

  return {
    ...auth,
    scopes,
    usage,
  };
}

async function recordApiUsage(auth, data = {}) {
  if (!auth?.row?.id) return null;
  const createdAt = new Date().toISOString();
  try {
    await supabaseFetch('/rest/v1/api_usage_events', {
      method: 'POST',
      service: true,
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
    await supabaseFetch(`/rest/v1/api_keys?id=eq.${eq(auth.row.id)}`, {
      method: 'PATCH',
      service: true,
      body: { last_used_at: createdAt },
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      console.error('VeriTrust API usage logging failed', {
        status: error.status,
        message: error.message,
      });
    }
  }
  const usedToday = await apiUsageForKey(auth.row.id);
  return usageSnapshot(auth.row, usedToday);
}

function externalApiError(res, error, fallback = 'Request failed.', request_id = requestId()) {
  const status = Number(error.status || 500);
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  const code = error.code || error.extra?.code || (safeStatus >= 500 ? 'INTERNAL_ERROR' : 'INVALID_INPUT');
  const safeMessage = safeStatus >= 500 && code !== 'MODEL_ERROR'
    ? fallback
    : (error.message || fallback);

  if (safeStatus >= 500) {
    console.error('VeriTrust external API error', {
      request_id,
      code,
      status: safeStatus,
      message: error.message,
    });
  }

  res.statusCode = safeStatus;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: false,
    request_id,
    error: {
      code,
      message: safeMessage,
    },
  }));
}

module.exports = {
  DEFAULT_DAILY_LIMIT,
  DEFAULT_SCOPES,
  createApiKey,
  externalApiError,
  generateApiKey,
  hashApiKey,
  listApiKeys,
  maskApiKey,
  recordApiUsage,
  requestId,
  requireApiKey,
  revokeApiKey,
  usageSnapshot,
  verifyApiKey,
};
