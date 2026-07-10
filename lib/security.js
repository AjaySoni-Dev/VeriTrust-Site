const crypto = require('crypto');

const SAFE_RETURN_PATHS = new Set([
  '/dashboard',
  '/deepfake',
  '/phishing',
  '/link-check',
  '/auth',
]);
const SAFE_RETURN_QUERY_KEYS = new Set(['source', 'billing', 'mode']);
const REDACTED_KEYS = /(?:authorization|cookie|token|secret|password|api[_-]?key|email|filename|message|prompt|content|url|query)/i;

function securityError(status, code, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.extra = extra;
  return error;
}

function normalizeConfiguredOrigin(value, options = {}) {
  const raw = String(value || '').trim();
  if (!raw || raw === 'null' || /[\\\r\n\0]/.test(raw)) {
    throw securityError(500, 'INVALID_ORIGIN_CONFIG', 'Configured origin is invalid.');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw securityError(500, 'INVALID_ORIGIN_CONFIG', 'Configured origin is invalid.');
  }
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (!['https:', ...(options.allowHttpLocal && isLocal ? ['http:'] : [])].includes(url.protocol)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw securityError(500, 'INVALID_ORIGIN_CONFIG', 'Configured origin must be an HTTPS origin without path, credentials, query, or fragment.');
  }
  return url.origin;
}

function safeReturnPath(value, origin, fallback = '/dashboard') {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 512 || /[\\\u0000-\u001f\u007f]/u.test(raw)) return fallback;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (/[\\\u0000-\u001f\u007f]/u.test(decoded) || decoded.startsWith('//')) return fallback;
  let parsed;
  try {
    parsed = new URL(raw, origin);
  } catch {
    return fallback;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.origin !== origin
      || parsed.username
      || parsed.password
      || !SAFE_RETURN_PATHS.has(parsed.pathname.replace(/\.html$/i, ''))) return fallback;
  const query = new URLSearchParams();
  for (const [key, item] of parsed.searchParams) {
    if (SAFE_RETURN_QUERY_KEYS.has(key) && item.length <= 100 && !/[\r\n\0]/.test(item)) query.append(key, item);
  }
  const canonicalPath = parsed.pathname.replace(/\.html$/i, '');
  return `${canonicalPath}${query.size ? `?${query}` : ''}`;
}

function validateRequestId(value) {
  const id = String(value || '').trim();
  return /^(?:vt_req_)?[A-Za-z0-9][A-Za-z0-9._:-]{5,95}$/.test(id) ? id : null;
}

function requestId(req) {
  const supplied = validateRequestId(req?.headers?.['x-request-id']);
  return supplied || `vt_req_${crypto.randomBytes(12).toString('hex')}`;
}

function attachRequestContext(req, res) {
  if (!req.requestId) req.requestId = requestId(req);
  if (res) {
    res.requestId = req.requestId;
    if (!res.headersSent) res.setHeader('X-Request-ID', req.requestId);
  }
  return req.requestId;
}

function redactValue(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactValue(item, depth + 1));
  if (!value || typeof value !== 'object') {
    const text = typeof value === 'string' ? value : null;
    if (text && /(?:Bearer\s+\S+|vtg_(?:live|test)_\S+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i.test(text)) return '[REDACTED]';
    return value;
  }
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
    key,
    REDACTED_KEYS.test(key) ? '[REDACTED]' : redactValue(item, depth + 1),
  ]));
}

function structuredLog(level, event, fields = {}) {
  const entry = JSON.stringify({
    level,
    event: String(event || 'unknown').slice(0, 100),
    ...redactValue(fields),
  });
  const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  writer(entry);
}

function parseCookies(req) {
  const header = String(req?.headers?.cookie || '');
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      cookies[key] = '';
    }
  }
  return cookies;
}

function cookie(name, value, options = {}) {
  const pieces = [`${name}=${encodeURIComponent(String(value || ''))}`, `Path=${options.path || '/'}`];
  if (options.maxAge !== undefined) pieces.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) pieces.push('HttpOnly');
  if (options.secure !== false) pieces.push('Secure');
  pieces.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.domain) pieces.push(`Domain=${options.domain}`);
  return pieces.join('; ');
}

function appendSetCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  const values = current ? (Array.isArray(current) ? current : [current]) : [];
  res.setHeader('Set-Cookie', [...values, value]);
}

function timingSafeStringEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function assertSameOrigin(req, expectedOrigin) {
  const origin = String(req?.headers?.origin || '').trim();
  const fetchSite = String(req?.headers?.['sec-fetch-site'] || '').toLowerCase();
  if (origin) {
    let normalized;
    try {
      normalized = new URL(origin).origin;
    } catch {
      throw securityError(403, 'CSRF_ORIGIN_DENIED', 'Request origin is invalid.');
    }
    if (normalized !== expectedOrigin) throw securityError(403, 'CSRF_ORIGIN_DENIED', 'Cross-site request denied.');
    return true;
  }
  if (fetchSite === 'same-origin') return true;
  throw securityError(403, 'CSRF_ORIGIN_REQUIRED', 'A same-origin request is required.');
}

async function fetchWithPolicy(url, options = {}, policy = {}) {
  const timeoutMs = Math.max(100, Math.min(Number(policy.timeoutMs || 10_000), 30_000));
  const maxResponseBytes = Math.max(1, Number(policy.maxResponseBytes || 1024 * 1024));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = options.signal;
  const onAbort = () => controller.abort();
  if (upstreamSignal) upstreamSignal.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: policy.redirect || 'error' });
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxResponseBytes) throw securityError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Upstream response exceeded the allowed size.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxResponseBytes) throw securityError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'Upstream response exceeded the allowed size.');
    return { response, buffer, text: buffer.toString('utf8') };
  } catch (error) {
    if (error.name === 'AbortError') throw securityError(504, 'UPSTREAM_TIMEOUT', 'Upstream request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
    if (upstreamSignal) upstreamSignal.removeEventListener('abort', onAbort);
  }
}

module.exports = {
  appendSetCookie,
  assertSameOrigin,
  attachRequestContext,
  cookie,
  fetchWithPolicy,
  normalizeConfiguredOrigin,
  parseCookies,
  redactValue,
  requestId,
  safeReturnPath,
  securityError,
  structuredLog,
  timingSafeStringEqual,
  validateRequestId,
};
