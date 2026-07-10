const crypto = require('crypto');
const { serverConfig } = require('./config');
const { HttpError, sendJson } = require('./veritrust-api');
const {
  isServiceRoleConfigured,
  supabaseFetch,
} = require('./supabase-server');

const LIMITS = {
  guestDaily: 3,
  freeAuthenticatedDaily: 25,
  unknownPlanDaily: 10,
};

function clientIp(req) {
  if (serverConfig.trustProxy) {
    const forwardedValues = String(req.headers['x-forwarded-for'] || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (forwardedValues.length === 1 && !/[\r\n]/.test(forwardedValues[0])) return forwardedValues[0];
    const real = String(req.headers['x-real-ip'] || '').trim();
    if (real && !/[\r\n,]/.test(real)) return real;
  }
  return String(req.socket?.remoteAddress || '').trim() || 'unknown';
}

function hashIdentity(value) {
  return crypto.createHash('sha256').update(String(value || 'unknown')).digest('hex');
}

function planCodeFromContext(context) {
  const plan = context?.organization?.plans || context?.organization?.plan || null;
  return String(plan?.code || context?.organization?.plan_code || '').toLowerCase();
}

function limitForContext(context) {
  if (!context?.user?.id) return LIMITS.guestDaily;
  const plan = context?.organization?.plans || context?.organization?.plan || null;
  const planCode = planCodeFromContext(context);
  if (planCode === 'free') return LIMITS.freeAuthenticatedDaily;
  if (Number(plan?.daily_scan_limit) > 0) return Number(plan.daily_scan_limit);
  return LIMITS.unknownPlanDaily;
}

async function consumeRateLimit({ req, endpoint, context = null, limit = null }) {
  if (!isServiceRoleConfigured()) {
    throw new HttpError(503, 'Rate limit service is unavailable.', {
      code: 'RATE_LIMIT_UNAVAILABLE',
      meta: { retry_after: 60 },
    });
  }

  const isUser = Boolean(context?.user?.id);
  const identityType = isUser ? 'user' : 'ip';
  const identityValue = isUser ? context.user.id : clientIp(req);
  const limitCount = Math.max(1, Number(limit || limitForContext(context)));

  const rows = await supabaseFetch('/rest/v1/rpc/consume_api_rate_limit', {
    method: 'POST',
    service: true,
    body: {
      target_identity_type: identityType,
      target_identity_hash: hashIdentity(identityValue),
      target_endpoint: endpoint,
      target_limit_count: limitCount,
      target_metadata: {
        authenticated: isUser,
        plan_code: planCodeFromContext(context) || null,
      },
    },
  });

  const result = Array.isArray(rows) ? rows[0] : rows;
  if (!result) {
    throw new HttpError(500, 'Rate limit check failed.', { code: 'RATE_LIMIT_UNAVAILABLE' });
  }

  return {
    allowed: Boolean(result.allowed),
    limit: Number(result.limit_count || limitCount),
    remaining: Math.max(0, Number(result.remaining || 0)),
    resetAt: result.reset_at || null,
    count: Number(result.request_count || 0),
  };
}

async function enforceRateLimit(options) {
  const result = await consumeRateLimit(options);
  if (result.allowed) return result;

  throw new HttpError(429, 'Daily request limit reached. Please try again tomorrow.', {
    code: 'RATE_LIMIT_EXCEEDED',
    meta: {
      limit: result.limit,
      remaining: 0,
      reset_at: result.resetAt,
    },
  });
}

function sendRateLimitError(res, error) {
  sendJson(res, 429, {
    ok: false,
    error: {
      code: error.code || 'RATE_LIMIT_EXCEEDED',
      message: error.message || 'Daily request limit reached. Please try again tomorrow.',
    },
    ...(error.extra?.meta ? { rate_limit: error.extra.meta } : {}),
  });
}

module.exports = {
  LIMITS,
  clientIp,
  consumeRateLimit,
  enforceRateLimit,
  sendRateLimitError,
};
