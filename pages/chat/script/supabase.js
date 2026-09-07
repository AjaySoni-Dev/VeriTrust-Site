(function initNexoraSupabaseBridge(window) {
  'use strict';

  function hasUsableSupabaseConfig(config = {}) {
    return Boolean(
      config.SUPABASE_URL &&
      config.SUPABASE_ANON_KEY &&
      !String(config.SUPABASE_URL).includes('YOUR_SUPABASE') &&
      !String(config.SUPABASE_ANON_KEY).includes('YOUR_SUPABASE')
    );
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function createTimeoutSignal(timeoutMs) {
    if (typeof AbortController === 'undefined') return { signal: undefined, cancel: () => {} };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return { signal: controller.signal, cancel: () => clearTimeout(timer) };
  }

  function shouldRetryResponse(response) {
    return response && (response.status === 408 || response.status === 429 || response.status >= 500);
  }

  function shouldRetryError(error) {
    return Boolean(error?.name === 'AbortError' || /network|fetch|timeout|failed/i.test(String(error?.message || error || '')));
  }

  async function resilientFetch(input, init = {}) {
    const attempts = 3;
    const method = String(init?.method || 'GET').toUpperCase();
    const canRetry = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const timeout = createTimeoutSignal(22000);
      try {
        const response = await fetch(input, { ...init, signal: init.signal || timeout.signal });
        timeout.cancel();
        if (!canRetry || !shouldRetryResponse(response) || attempt === attempts - 1) return response;
        await sleep(250 * (attempt + 1) + Math.floor(Math.random() * 120));
      } catch (error) {
        timeout.cancel();
        lastError = error;
        if (!canRetry || !shouldRetryError(error) || attempt === attempts - 1) throw error;
        await sleep(300 * (attempt + 1) + Math.floor(Math.random() * 160));
      }
    }

    throw lastError || new Error('Supabase request failed.');
  }

  function createClient(config = {}) {
    if (!window.supabase?.createClient || !hasUsableSupabaseConfig(config)) return null;
    return window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      global: { fetch: resilientFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  function getRoutes(config = {}) {
    const isFileProtocol = window.location.protocol === 'file:';
    return {
      isFileProtocol,
      loginRoute: isFileProtocol
        ? new URL('../login/index.html', window.location.href).href
        : (config.ROUTES?.LOGIN || '/pages/login/index.html'),
      templateRoute: isFileProtocol
        ? new URL('../template/template.html', window.location.href).href
        : (config.ROUTES?.TEMPLATE || '/template')
    };
  }

  window.NexoraSupabaseBridge = Object.freeze({
    hasUsableSupabaseConfig,
    createClient,
    getRoutes,
    resilientFetch
  });
})(window);
