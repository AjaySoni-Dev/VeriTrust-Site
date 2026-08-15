const crypto = require('crypto');
const { ConfigError, getRequiredEnv } = require('./config');
const { HttpError } = require('./veritrust-api');
const { parseCookies } = require('./browser-session');

const LEARNING_ACCESS_COOKIE = 'veritrust_learning_access';
const LEARNING_ACCESS_MAX_AGE = 8 * 60 * 60;
const TOKEN_VERSION = 'v1';

function learningAccessKey() {
  const value = getRequiredEnv('VERITRUST_LEARNING_ACCESS_KEY');
  if (Buffer.byteLength(value, 'utf8') < 32 || Buffer.byteLength(value, 'utf8') > 256) {
    throw new ConfigError('VERITRUST_LEARNING_ACCESS_KEY', { invalid: true });
  }
  return value;
}

function signature(payload, key = learningAccessKey()) {
  return crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

function constantTimeTextEqual(leftValue, rightValue) {
  const left = crypto.createHash('sha256').update(String(leftValue || '')).digest();
  const right = crypto.createHash('sha256').update(String(rightValue || '')).digest();
  return crypto.timingSafeEqual(left, right);
}

function learningAccessKeyMatches(candidate) {
  return constantTimeTextEqual(candidate, learningAccessKey());
}

function createLearningAccessToken(now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + LEARNING_ACCESS_MAX_AGE;
  const nonce = crypto.randomBytes(18).toString('base64url');
  const payload = `${TOKEN_VERSION}.${expiresAt}.${nonce}`;
  return `${payload}.${signature(payload)}`;
}

function verifyLearningAccessToken(token, now = Date.now()) {
  try {
    const [version, expiresRaw, nonce, received] = String(token || '').split('.');
    if (version !== TOKEN_VERSION || !/^\d{10}$/u.test(expiresRaw) || !/^[A-Za-z0-9_-]{20,40}$/u.test(nonce) || !received) {
      return false;
    }
    const expiresAt = Number(expiresRaw);
    const nowSeconds = Math.floor(now / 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + LEARNING_ACCESS_MAX_AGE + 60) {
      return false;
    }
    const expected = signature(`${version}.${expiresRaw}.${nonce}`);
    return constantTimeTextEqual(received, expected);
  } catch {
    return false;
  }
}

function hasLearningAccess(req) {
  return verifyLearningAccessToken(parseCookies(req)[LEARNING_ACCESS_COOKIE] || '');
}

function requireLearningAccess(req) {
  if (!hasLearningAccess(req)) {
    throw new HttpError(403, 'Learning preview access is required.', { code: 'LEARNING_PREVIEW_LOCKED' });
  }
}

function cookieSecurity() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) ? '; Secure' : '';
}

function learningAccessCookie(token) {
  return `${LEARNING_ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${LEARNING_ACCESS_MAX_AGE}${cookieSecurity()}`;
}

function expiredLearningAccessCookie() {
  return `${LEARNING_ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${cookieSecurity()}`;
}

function safeLearningDestination(value, fallback = '/learn') {
  try {
    const target = new URL(String(value || fallback), 'https://veritrust.invalid');
    if (target.origin !== 'https://veritrust.invalid') return fallback;
    const allowed = /^\/learn(?:\/|$)/u.test(target.pathname)
      || /^\/(?:learning|course|lesson|assessment|learning-admin)(?:\.html)?$/u.test(target.pathname)
      || target.pathname === '/certificates';
    return allowed ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  LEARNING_ACCESS_COOKIE,
  LEARNING_ACCESS_MAX_AGE,
  createLearningAccessToken,
  expiredLearningAccessCookie,
  hasLearningAccess,
  learningAccessCookie,
  learningAccessKeyMatches,
  requireLearningAccess,
  safeLearningDestination,
  verifyLearningAccessToken,
};
