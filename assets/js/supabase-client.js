(function initVeriTrustSupabase(global) {
  const runtimeConfig = global.VeriTrust_CONFIG || global['VERI' + 'TRUST_CONFIG'] || {};
  const supabaseConfig = runtimeConfig.supabase || {};
  const apiConfig = runtimeConfig.api || {};
  const storageKey = 'veritrust.supabase.session';

  function normalizeUrl(url) {
    return String(url || '').replace(/\/$/, '');
  }

  function normalizeCredential(value) {
    const cleaned = String(value || '').trim();
    const lines = cleaned.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    return lines.length > 1 && new Set(lines).size === 1 ? lines[0] : cleaned;
  }

  const baseUrl = normalizeUrl(supabaseConfig.url);
  const anonKey = normalizeCredential(supabaseConfig.anonKey);

  function isConfigured() {
    return Boolean(baseUrl && anonKey && !/[\u0000-\u001f\u007f]/u.test(anonKey));
  }

  function getStoredSession() {
    try {
      const raw = global.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setStoredSession(session) {
    if (!session) {
      global.localStorage.removeItem(storageKey);
      return null;
    }

    const expiresIn = Number(session.expires_in || 3600);
    const normalized = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: session.token_type || 'bearer',
      expires_at: session.expires_at || Math.floor(Date.now() / 1000) + expiresIn,
      user: session.user || null,
    };
    global.localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  }

  async function supabaseFetch(path, options = {}) {
    if (!isConfigured()) {
      throw new Error('Account service is unavailable.');
    }

    const accessToken = options.accessToken || null;
    const legacyJwtKey = anonKey.split('.').length === 3 ? anonKey : null;
    const headers = {
      apikey: anonKey,
      ...(accessToken || legacyJwtKey ? { Authorization: `Bearer ${accessToken || legacyJwtKey}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error_description || data?.error || `Account request failed with status ${response.status}.`;
      throw new Error(message);
    }

    return data;
  }

  async function signUp({ email, password, fullName, workspaceName }) {
    const redirectTo = new URL('/auth', global.location.origin).href;
    const data = await supabaseFetch(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST',
      body: {
        email,
        password,
        data: {
          full_name: fullName,
          workspace_name: workspaceName,
        },
      },
    });

    if (data?.access_token) setStoredSession(data);
    return data;
  }

  async function signIn({ email, password }) {
    const data = await supabaseFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    });
    return setStoredSession(data);
  }

  async function refreshSession(session = getStoredSession()) {
    if (!session?.refresh_token) return null;
    const data = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    });
    return setStoredSession(data);
  }

  async function getSession() {
    const session = getStoredSession();
    if (!session?.access_token) return null;

    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at - now < 90) {
      try {
        return await refreshSession(session);
      } catch {
        setStoredSession(null);
        return null;
      }
    }
    return session;
  }

  async function getAccessToken() {
    const session = await getSession();
    return session?.access_token || null;
  }

  async function signOut() {
    const session = await getSession();
    if (session?.access_token) {
      try {
        await supabaseFetch('/auth/v1/logout', {
          method: 'POST',
          accessToken: session.access_token,
        });
      } catch {
        // Local sign-out should still succeed if the remote session is already gone.
      }
    }
    setStoredSession(null);
  }

  async function resetPassword(email) {
    const redirectTo = new URL('auth.html', window.location.href).href;
    return supabaseFetch('/auth/v1/recover', {
      method: 'POST',
      body: {
        email,
        redirect_to: redirectTo,
      },
    });
  }

  function consumeAuthCallback() {
    const hash = new URLSearchParams(global.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(global.location.search);
    const error = hash.get('error_description') || query.get('error_description') || hash.get('error') || query.get('error');
    if (error) throw new Error(error);

    const accessToken = hash.get('access_token') || query.get('access_token');
    const refreshToken = hash.get('refresh_token') || query.get('refresh_token');
    if (!accessToken) return null;

    const expiresIn = Number(hash.get('expires_in') || query.get('expires_in') || 3600);
    const session = setStoredSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      expires_at: Number(hash.get('expires_at') || query.get('expires_at')) || undefined,
      token_type: hash.get('token_type') || query.get('token_type') || 'bearer',
    });
    const type = hash.get('type') || query.get('type') || 'confirmation';

    const cleanUrl = new URL(global.location.href);
    ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'type', 'error', 'error_description'].forEach((key) => cleanUrl.searchParams.delete(key));
    cleanUrl.hash = '';
    global.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}`);
    return { session, type };
  }

  async function updatePassword(password) {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Your recovery session has expired. Request a new password reset email.');
    if (String(password || '').length < 8) throw new Error('Use at least 8 characters for your new password.');
    return supabaseFetch('/auth/v1/user', {
      method: 'PUT',
      accessToken: session.access_token,
      body: { password },
    });
  }

  async function callAppApi(url, options = {}) {
    const token = await getAccessToken();
    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error?.message || data?.error || `Request failed with status ${response.status}.`);
    }

    return data;
  }

  async function getSessionContext() {
    return callAppApi(apiConfig.session || '/api/session', { cache: 'no-store' });
  }

  async function getDashboard(options = {}) {
    const params = new URLSearchParams({
      limit: String(Math.max(1, Math.min(100, Number(options.limit) || 100))),
      offset: String(Math.max(0, Math.min(10000, Number(options.offset) || 0))),
    });
    if (options.orgId) params.set('org_id', options.orgId);
    return callAppApi(`${apiConfig.dashboard || '/api/dashboard'}?${params}`, { cache: 'no-store' });
  }

  async function getRecentScans(orgId, limit = 20) {
    const params = new URLSearchParams({
      org_id: orgId,
      limit: String(limit),
    });
    return callAppApi(`${apiConfig.scans || '/api/scans'}?${params}`, { cache: 'no-store' });
  }

  async function updateProfile(profilePatch) {
    const token = await getAccessToken();
    if (!token) throw new Error('Sign in before updating your profile.');
    return supabaseFetch('/rest/v1/rpc/update_my_profile', {
      method: 'POST',
      accessToken: token,
      body: { profile_patch: profilePatch || {} },
    });
  }

  function avatarObjectUrl(path, operation = 'authenticated') {
    const safePath = String(path || '').split('/').map(encodeURIComponent).join('/');
    const operationPath = operation ? `${operation}/` : '';
    return `${baseUrl}/storage/v1/object/${operationPath}avatars/${safePath}`;
  }

  async function getAvatarBlobUrl(path) {
    if (!path) return null;
    const token = await getAccessToken();
    if (!token) return null;
    const response = await fetch(avatarObjectUrl(path), {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return URL.createObjectURL(await response.blob());
  }

  async function uploadAvatar(file) {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!session?.access_token || !userId) throw new Error('Sign in before uploading an avatar.');
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Use a JPEG, PNG, or WebP avatar.');
    }
    if (file.size > 2 * 1024 * 1024) throw new Error('Keep the avatar under 2 MB.');

    const objectPath = `${userId}/avatar`;
    const response = await fetch(avatarObjectUrl(objectPath, ''), {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': file.type,
        'x-upsert': 'true',
      },
      body: file,
    });
    if (!response.ok) {
      let message = 'Unable to upload the avatar.';
      try {
        const data = await response.json();
        message = data?.message || data?.error || message;
      } catch {
        // Keep the safe default message.
      }
      throw new Error(message);
    }
    return objectPath;
  }

  global.VeriTrustSupabase = {
    isConfigured,
    getStoredSession,
    getSession,
    getAccessToken,
    getSessionContext,
    getDashboard,
    getRecentScans,
    getAvatarBlobUrl,
    updateProfile,
    uploadAvatar,
    signIn,
    signOut,
    signUp,
    resetPassword,
    consumeAuthCallback,
    updatePassword,
    callAppApi,
  };
})(window);
