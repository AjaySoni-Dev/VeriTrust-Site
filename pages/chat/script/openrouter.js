(function initNexoraOpenRouterBridge(window) {
  'use strict';

  function hasBrowserKey(apiKey = '') {
    const key = String(apiKey || '').trim();
    return Boolean(key && key !== 'PASTE_YOUR_OPENROUTER_API_KEY_HERE');
  }

  function shouldUseProxy({ runtimeConfig = {}, proxyUrl = '', apiKey = '' } = {}) {
    if (runtimeConfig.FORCE_OPENROUTER_PROXY === true) return window.location.protocol !== 'file:';
    if (runtimeConfig.FORCE_OPENROUTER_PROXY === false) return false;
    if (!proxyUrl || window.location.protocol === 'file:') return false;
    return !hasBrowserKey(apiKey);
  }

  function getEndpoint(options = {}) {
    return shouldUseProxy(options) ? options.proxyUrl : options.apiUrl;
  }

  function getHeaders({ runtimeConfig = {}, proxyUrl = '', apiUrl = '', apiKey = '', appTitle = 'Nexora AI' } = {}) {
    const useProxy = shouldUseProxy({ runtimeConfig, proxyUrl, apiKey, apiUrl });
    const headers = { 'Content-Type': 'application/json' };
    if (!useProxy) {
      headers.Authorization = `Bearer ${String(apiKey || '').trim()}`;
      headers['X-OpenRouter-Title'] = appTitle;
    }
    return headers;
  }

  function getConnectionHelp(options = {}) {
    return shouldUseProxy(options)
      ? 'Set OPENROUTER_API_KEY in Vercel Project Settings > Environment Variables, then redeploy. The model is read from config/app.config.js.'
      : 'For local direct testing, set OPENROUTER_API_KEY in config/app.config.js, or run with `vercel dev` so /api/openrouter can use your .env file.';
  }

  window.NexoraOpenRouterBridge = Object.freeze({
    hasBrowserKey,
    shouldUseProxy,
    getEndpoint,
    getHeaders,
    getConnectionHelp
  });
})(window);
