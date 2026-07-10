const crypto = require('crypto');
const { serverConfig } = require('./config');
const {
  eq,
  getProfileContext,
  supabaseFetch,
} = require('./supabase-server');
const {
  appendSetCookie,
  assertSameOrigin,
  cookie,
  parseCookies,
  securityError,
  timingSafeStringEqual,
} = require('./security');

const ACCESS_COOKIE = 'vt_access';
const REFRESH_COOKIE = 'vt_refresh';
const CSRF_COOKIE = 'vt_csrf';
const RECENT_COOKIE = 'vt_recent';
const RECOVERY_VERIFIER_COOKIE = 'vt_recovery_verifier';
const SESSION_COOKIE = 'vt_session_id';

function secureCookies() {
  return process.env.NODE_ENV === 'production';
}

function cookieOptions(maxAge, extra = {}) {
  return {
    maxAge,
    secure: secureCookies(),
    sameSite: 'Lax',
    path: '/',
    ...extra,
  };
}

function signedRecentAuth(timestamp = Math.floor(Date.now() / 1000)) {
  const value = String(timestamp);
  const signature = crypto.createHmac('sha256', serverConfig.sessionSecret).update(`recent:${value}`).digest('base64url');
  return `${value}.${signature}`;
}

function verifyRecentAuth(value, maximumAgeSeconds = 600) {
  const [timestamp, signature] = String(value || '').split('.');
  if (!/^\d{10}$/.test(timestamp) || !signature) return false;
  const expected = signedRecentAuth(Number(timestamp)).split('.')[1];
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  return age >= 0 && age <= maximumAgeSeconds && timingSafeStringEqual(signature, expected);
}

function requireRecentAuthentication(req, maximumAgeSeconds = 600) {
  if (!verifyRecentAuth(parseCookies(req)[RECENT_COOKIE], maximumAgeSeconds)) {
    throw securityError(403, 'RECENT_AUTH_REQUIRED', 'Please sign in again before this sensitive action.', {
      meta: { step_up_required: true },
    });
  }
}

function csrfToken(req, res) {
  const existing = parseCookies(req)[CSRF_COOKIE];
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
  const value = crypto.randomBytes(32).toString('base64url');
  appendSetCookie(res, cookie(CSRF_COOKIE, value, cookieOptions(24 * 60 * 60, { httpOnly: false })));
  return value;
}

function requireCsrf(req) {
  const cookies = parseCookies(req);
  const cookieValue = cookies[CSRF_COOKIE];
  const headerValue = String(req.headers['x-csrf-token'] || '');
  if (!cookieValue || !headerValue || !timingSafeStringEqual(cookieValue, headerValue)) {
    throw securityError(403, 'CSRF_TOKEN_INVALID', 'CSRF validation failed.');
  }
}

function enforceMutationBoundary(req, { requireToken = true } = {}) {
  assertSameOrigin(req, serverConfig.siteUrl);
  if (requireToken) requireCsrf(req);
}

function setSessionCookies(res, session, { recent = false } = {}) {
  if (!session?.access_token || !session?.refresh_token) {
    throw securityError(502, 'SESSION_CONTRACT_ERROR', 'Account provider returned an invalid session.');
  }
  const accessMaxAge = Math.max(60, Math.min(Number(session.expires_in || 3600), 3600));
  appendSetCookie(res, cookie(ACCESS_COOKIE, session.access_token, cookieOptions(accessMaxAge)));
  appendSetCookie(res, cookie(REFRESH_COOKIE, session.refresh_token, cookieOptions(30 * 24 * 60 * 60)));
  const sessionId = crypto.randomBytes(24).toString('base64url');
  appendSetCookie(res, cookie(SESSION_COOKIE, sessionId, cookieOptions(30 * 24 * 60 * 60)));
  if (recent) appendSetCookie(res, cookie(RECENT_COOKIE, signedRecentAuth(), cookieOptions(10 * 60)));
  return sessionId;
}

async function registerSession(req, userId, sessionId) {
  if (!userId || !sessionId) return;
  const sessionHash = crypto.createHash('sha256').update(sessionId).digest('hex');
  const agent = String(req.headers['user-agent'] || 'Unknown device').replace(/[\r\n]/g, ' ').slice(0, 160);
  await supabaseFetch('/rest/v1/user_sessions?on_conflict=session_hash', {
    method: 'POST', service: true,
    body: { user_id: userId, session_hash: sessionHash, user_agent_label: agent, last_seen_at: new Date().toISOString() },
    headers: { Prefer: 'resolution=merge-duplicates' },
  });
}

function clearSessionCookies(res) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, RECENT_COOKIE, SESSION_COOKIE, RECOVERY_VERIFIER_COOKIE]) {
    appendSetCookie(res, cookie(name, '', cookieOptions(0)));
  }
}

async function refreshSession(req, res) {
  const refreshToken = parseCookies(req)[REFRESH_COOKIE];
  if (!refreshToken) return null;
  try {
    const session = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      timeoutMs: 8_000,
    });
    const existingSessionId = parseCookies(req)[SESSION_COOKIE];
    const newSessionId = setSessionCookies(res, session);
    await registerSession(req, session.user?.id, newSessionId);
    if (existingSessionId) {
      const oldHash = crypto.createHash('sha256').update(existingSessionId).digest('hex');
      await supabaseFetch(`/rest/v1/user_sessions?session_hash=eq.${eq(oldHash)}`, { method: 'PATCH', service: true, body: { revoked_at: new Date().toISOString(), revoke_reason: 'rotated' } }).catch(() => null);
    }
    req.headers.authorization = `Bearer ${session.access_token}`;
    return session;
  } catch (error) {
    clearSessionCookies(res);
    if (error.status === 400 || error.status === 401) return null;
    throw error;
  }
}

async function sessionContext(req, res, preferredOrgId = null) {
  try {
    return await getProfileContext(req, preferredOrgId);
  } catch (error) {
    if (![400, 401].includes(Number(error.status))) throw error;
    if (error.code === 'SESSION_REVOKED') {
      clearSessionCookies(res);
      throw error;
    }
    const refreshed = await refreshSession(req, res);
    if (!refreshed) throw error;
    return getProfileContext(req, preferredOrgId);
  }
}

async function signIn(req, res, body) {
  enforceMutationBoundary(req, { requireToken: false });
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password || password.length > 1024) throw securityError(400, 'INVALID_CREDENTIALS', 'Email and password are required.');
  const session = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  const sessionId = setSessionCookies(res, session, { recent: true });
  await registerSession(req, session.user?.id, sessionId);
  return { authenticated: true, user: { id: session.user?.id, email: session.user?.email } };
}

async function signUp(req, res, body) {
  enforceMutationBoundary(req, { requireToken: false });
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || password.length < 10 || password.length > 1024) {
    throw securityError(400, 'SIGNUP_INVALID', 'Use a valid email and a password of at least 10 characters.');
  }
  const result = await supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    body: {
      email,
      password,
      data: {
        full_name: String(body.fullName || '').trim().slice(0, 120),
        workspace_name: String(body.workspaceName || '').trim().slice(0, 120),
      },
    },
  });
  if (result?.access_token && result?.refresh_token) {
    const sessionId = setSessionCookies(res, result, { recent: true });
    await registerSession(req, result.user?.id, sessionId);
  }
  return {
    authenticated: Boolean(result?.access_token),
    verification_required: !result?.access_token,
    user: result?.user ? { id: result.user.id, email: result.user.email } : null,
  };
}

async function requestRecovery(req, res, body) {
  enforceMutationBoundary(req, { requireToken: false });
  const email = String(body.email || '').trim().toLowerCase();
  if (!email) throw securityError(400, 'EMAIL_REQUIRED', 'Enter your email address.');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  appendSetCookie(res, cookie(RECOVERY_VERIFIER_COOKIE, verifier, cookieOptions(10 * 60)));
  await supabaseFetch('/auth/v1/recover', {
    method: 'POST',
    body: {
      email,
      redirect_to: `${serverConfig.siteUrl}/auth?mode=recovery`,
      code_challenge: challenge,
      code_challenge_method: 's256',
    },
  }).catch((error) => {
    if (Number(error.status) >= 500) throw error;
    return null;
  });
  return { accepted: true };
}

async function exchangeRecoveryCode(req, res, body) {
  enforceMutationBoundary(req, { requireToken: false });
  const authCode = String(body.code || '').trim();
  const verifier = parseCookies(req)[RECOVERY_VERIFIER_COOKIE];
  if (!authCode || !verifier) throw securityError(400, 'RECOVERY_LINK_INVALID', 'Recovery link is invalid or expired.');
  const session = await supabaseFetch('/auth/v1/token?grant_type=pkce', {
    method: 'POST',
    body: { auth_code: authCode, code_verifier: verifier },
  });
  const sessionId = setSessionCookies(res, session, { recent: true });
  await registerSession(req, session.user?.id, sessionId);
  appendSetCookie(res, cookie(RECOVERY_VERIFIER_COOKIE, '', cookieOptions(0)));
  return { authenticated: true, recovery_ready: true };
}

async function updatePassword(req, body) {
  enforceMutationBoundary(req);
  requireRecentAuthentication(req);
  const password = String(body.password || '');
  if (password.length < 10 || password.length > 1024) throw securityError(400, 'PASSWORD_INVALID', 'Password must be at least 10 characters.');
  const accessToken = parseCookies(req)[ACCESS_COOKIE];
  if (!accessToken) throw securityError(401, 'SESSION_REQUIRED', 'Recovery session is missing or expired.');
  await supabaseFetch('/auth/v1/user', { method: 'PUT', accessToken, body: { password } });
  return { updated: true };
}

async function signOut(req, res) {
  enforceMutationBoundary(req);
  const accessToken = parseCookies(req)[ACCESS_COOKIE];
  if (accessToken) {
    await supabaseFetch('/auth/v1/logout', { method: 'POST', accessToken }).catch(() => null);
  }
  const sessionId = parseCookies(req)[SESSION_COOKIE];
  if (sessionId) {
    const sessionHash = crypto.createHash('sha256').update(sessionId).digest('hex');
    await supabaseFetch(`/rest/v1/user_sessions?session_hash=eq.${eq(sessionHash)}`, { method: 'PATCH', service: true, body: { revoked_at: new Date().toISOString(), revoke_reason: 'signed_out' } }).catch(() => null);
  }
  clearSessionCookies(res);
  return { signed_out: true };
}

async function listSessions(context, req) {
  const currentHash = crypto.createHash('sha256').update(parseCookies(req)[SESSION_COOKIE] || '').digest('hex');
  try {
    const rows = await supabaseFetch(`/rest/v1/user_sessions?user_id=eq.${eq(context.user.id)}&revoked_at=is.null&select=id,session_hash,created_at,last_seen_at,user_agent_label&order=last_seen_at.desc`, { service: true });
    return (rows || []).map((row) => ({ id: row.id, created_at: row.created_at, last_seen_at: row.last_seen_at, user_agent_label: row.user_agent_label, current: row.session_hash === currentHash }));
  } catch {
    return [];
  }
}

async function revokeSessions(req, context, { sessionId = null, all = false } = {}) {
  enforceMutationBoundary(req);
  requireRecentAuthentication(req);
  const filter = all ? '' : `&id=eq.${eq(sessionId)}`;
  if (!all && !sessionId) throw securityError(400, 'SESSION_ID_REQUIRED', 'Session id is required.');
  await supabaseFetch(`/rest/v1/user_sessions?user_id=eq.${eq(context.user.id)}&revoked_at=is.null${filter}`, {
    method: 'PATCH', service: true, body: { revoked_at: new Date().toISOString(), revoke_reason: all ? 'revoke_all' : 'user_revoked' },
  });
  return { revoked: true, all };
}

module.exports = {
  clearSessionCookies,
  csrfToken,
  exchangeRecoveryCode,
  listSessions,
  revokeSessions,
  refreshSession,
  requestRecovery,
  requireCsrf,
  requireRecentAuthentication,
  sessionContext,
  setSessionCookies,
  signIn,
  signOut,
  signUp,
  updatePassword,
  verifyRecentAuth,
};
