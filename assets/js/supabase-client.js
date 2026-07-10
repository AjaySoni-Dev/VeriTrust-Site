(function initSessionClient(global) {
  let sessionPromise = null;
  let sessionContext = null;
  let csrfToken = '';
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('veritrust-session') : null;

  class AppError extends Error {
    constructor({ code = 'REQUEST_FAILED', message = 'Request failed.', status = 0, requestId = null, retryAfter = null, retryable = false, detailsSafe = null } = {}) {
      super(message);
      this.name = 'AppError';
      this.code = code;
      this.status = status;
      this.requestId = requestId;
      this.retryAfter = retryAfter;
      this.retryable = retryable;
      this.detailsSafe = detailsSafe;
    }
  }

  async function runtimeConfig() {
    if (global.VeriTrust_CONFIG_READY) await global.VeriTrust_CONFIG_READY;
    return global.VeriTrust_CONFIG || {};
  }

  function apiError(response, data) {
    const retryAfter = response.headers.get('retry-after');
    return new AppError({
      code: data?.error?.code || 'REQUEST_FAILED',
      message: data?.error?.message || `Request failed with status ${response.status}.`,
      status: response.status,
      requestId: data?.request_id || response.headers.get('x-request-id'),
      retryAfter,
      retryable: response.status === 429 || response.status === 503 || response.status >= 500,
      detailsSafe: data?.meta || null,
    });
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(15_000, Number(options.timeoutMs || 10_000)));
    const method = options.method || 'GET';
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method) ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(options.headers || {}),
    };
    try {
      const response = await fetch(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (data?.csrf_token) csrfToken = data.csrf_token;
      if (!response.ok || data?.ok === false) throw apiError(response, data);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new AppError({ code: 'REQUEST_TIMEOUT', message: 'Request timed out.', retryable: true });
      if (error instanceof AppError) throw error;
      throw new AppError({ code: 'NETWORK_ERROR', message: 'Unable to reach VeriTrust.', retryable: true });
    } finally {
      clearTimeout(timeout);
    }
  }

  function isConfigured() {
    return global.VeriTrust_CONFIG_STATE !== 'error';
  }

  async function loadSession({ force = false } = {}) {
    if (sessionContext && !force) return sessionContext;
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const config = await runtimeConfig();
        try {
          sessionContext = await request(config.api?.session || '/api/session');
          return sessionContext;
        } catch (error) {
          if (error.status === 401) sessionContext = null;
          throw error;
        } finally {
          sessionPromise = null;
        }
      })();
    }
    return sessionPromise;
  }

  async function getSession() {
    try {
      const context = await loadSession();
      return context?.authenticated ? { authenticated: true, user: context.user } : null;
    } catch (error) {
      if (error.status === 401) return null;
      throw error;
    }
  }

  async function sessionAction(action, body = {}) {
    const config = await runtimeConfig();
    const result = await request(config.api?.session || '/api/session', { method: 'POST', body: { action, ...body } });
    sessionContext = null;
    return result;
  }

  const signIn = ({ email, password }) => sessionAction('sign-in', { email, password });
  const signUp = ({ email, password, fullName, workspaceName }) => sessionAction('sign-up', { email, password, fullName, workspaceName });
  const resetPassword = (email) => sessionAction('recover', { email });
  const exchangeRecovery = (code) => sessionAction('exchange-recovery', { code });
  const updatePassword = (password) => sessionAction('update-password', { password });
  const revokeSession = (sessionId) => sessionAction('revoke-session', { session_id: sessionId });
  const revokeAllSessions = () => sessionAction('revoke-all-sessions');

  async function signOut() {
    const config = await runtimeConfig();
    await request(config.api?.session || '/api/session', { method: 'DELETE' });
    sessionContext = null;
    channel?.postMessage({ type: 'signed-out' });
  }

  async function callAppApi(url, options = {}) {
    const method = options.method || 'GET';
    let body = options.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = undefined; }
    }
    return request(url, { ...options, method, body });
  }

  async function getSessionContext() {
    return loadSession();
  }

  async function getRecentScans(orgId, limit = 20) {
    const config = await runtimeConfig();
    const params = new URLSearchParams({ org_id: orgId, limit: String(limit) });
    return request(`${config.api?.scans || '/api/scans'}?${params}`);
  }

  function authHeaders() {
    return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
  }

  channel?.addEventListener('message', (event) => {
    if (event.data?.type === 'signed-out') {
      sessionContext = null;
      global.dispatchEvent(new CustomEvent('veritrust:signed-out'));
    }
  });

  global.VeriTrustSupabase = {
    AppError,
    authHeaders,
    callAppApi,
    exchangeRecovery,
    getAccessToken: async () => null,
    getRecentScans,
    getSession,
    getSessionContext,
    isConfigured,
    resetPassword,
    revokeAllSessions,
    revokeSession,
    signIn,
    signOut,
    signUp,
    updatePassword,
  };
})(window);
