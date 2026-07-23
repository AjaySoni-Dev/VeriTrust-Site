const { getOptionalEnv } = require('./config');

const ACCESS_COOKIE = 'veritrust_access';
const REFRESH_COOKIE = 'veritrust_refresh';

function parseCookies(req) {
  return String(req?.headers?.cookie || '').split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return cookies;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = '';
    }
    return cookies;
  }, {});
}

function cookieSecurity() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) ? '; Secure' : '';
}

function sessionCookie(name, value) {
  return `${name}=${encodeURIComponent(String(value || ''))}; Path=/; HttpOnly; SameSite=Lax${cookieSecurity()}`;
}

function expiredCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${cookieSecurity()}`;
}

function setSessionCookies(res, session) {
  if (!session?.access_token || !session?.refresh_token) throw new Error('Authentication provider did not return a complete session.');
  res.setHeader('Set-Cookie', [
    sessionCookie(ACCESS_COOKIE, session.access_token),
    sessionCookie(REFRESH_COOKIE, session.refresh_token),
  ]);
}

function clearSessionCookies(res) {
  res.setHeader('Set-Cookie', [
    expiredCookie(ACCESS_COOKIE),
    expiredCookie(REFRESH_COOKIE),
  ]);
}

function accessCookie(req) {
  return parseCookies(req)[ACCESS_COOKIE] || null;
}

function refreshCookie(req) {
  return parseCookies(req)[REFRESH_COOKIE] || null;
}

function trustedSiteOrigin(req) {
  const configured = getOptionalEnv('VERITRUST_SITE_URL', '');
  const production = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (production && !configured) {
    throw Object.assign(new Error('Trusted site origin is not configured.'), { status: 500, code: 'SERVER_CONFIG_ERROR' });
  }
  const raw = configured || `${String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()}://${String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim()}`;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw Object.assign(new Error('Trusted site origin is invalid.'), { status: 500, code: 'SERVER_CONFIG_ERROR' });
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw Object.assign(new Error('Trusted site origin must use HTTPS.'), { status: 500, code: 'SERVER_CONFIG_ERROR' });
  }
  return parsed.origin;
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookie,
  clearSessionCookies,
  parseCookies,
  refreshCookie,
  setSessionCookies,
  trustedSiteOrigin,
};
