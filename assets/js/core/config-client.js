(function initConfigClient(global) {
  const API_PATHS = new Set([
    '/api/health', '/api/client-config', '/api/session', '/api/scans', '/api/api-keys',
    '/api/deepfake', '/api/phishing', '/api/link-check', '/api/billing/subscription',
  ]);

  function configError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function sameOriginPath(value) {
    const raw = String(value || '');
    if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n\0]/.test(raw)) throw configError('CONFIG_URL_INVALID', 'Runtime API route is invalid.');
    const parsed = new URL(raw, global.location?.origin || 'https://veritrust.invalid');
    if (global.location?.origin && parsed.origin !== global.location.origin) throw configError('CONFIG_URL_INVALID', 'Runtime API route must be same-origin.');
    if (!API_PATHS.has(parsed.pathname)) throw configError('CONFIG_URL_UNKNOWN', 'Runtime API route is not approved.');
    return parsed.pathname;
  }

  function validateRuntimeConfig(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw configError('CONFIG_SCHEMA_INVALID', 'Runtime configuration is invalid.');
    const known = new Set(['schemaVersion', 'api', 'features', 'maxImageBytes', 'modelCatalogVersion', 'preprocessing', 'buildId']);
    for (const key of Object.keys(input)) if (!known.has(key)) throw configError('CONFIG_KEY_UNKNOWN', `Unknown runtime configuration key: ${key}`);
    if (input.schemaVersion !== '1') throw configError('CONFIG_VERSION_UNSUPPORTED', 'Runtime configuration version is unsupported.');
    const maxImageBytes = Number(input.maxImageBytes);
    if (!Number.isInteger(maxImageBytes) || maxImageBytes < 1024 || maxImageBytes > 16 * 1024 * 1024) {
      throw configError('CONFIG_LIMIT_INVALID', 'Runtime upload limit is invalid.');
    }
    const api = Object.fromEntries(Object.entries(input.api || {}).map(([key, value]) => [key, sameOriginPath(value)]));
    for (const required of ['health', 'session', 'scans', 'apiKeys', 'deepfake', 'phishing', 'linkCheck']) {
      if (!api[required]) throw configError('CONFIG_API_MISSING', `Runtime API route is missing: ${required}`);
    }
    const features = {};
    for (const [key, value] of Object.entries(input.features || {})) {
      if (typeof value !== 'boolean') throw configError('CONFIG_FEATURE_INVALID', `Feature flag must be boolean: ${key}`);
      features[key] = value;
    }
    const preprocessing = input.preprocessing || { enabled: false };
    if (typeof preprocessing.enabled !== 'boolean') throw configError('CONFIG_PREPROCESSING_INVALID', 'Preprocessing configuration is invalid.');
    return Object.freeze({
      schemaVersion: '1',
      api: Object.freeze(api),
      features: Object.freeze(features),
      maxImageBytes,
      modelCatalogVersion: String(input.modelCatalogVersion || 'unavailable').slice(0, 100),
      preprocessing: Object.freeze({
        enabled: preprocessing.enabled,
        providerName: String(preprocessing.providerName || '').slice(0, 120),
        consentVersion: String(preprocessing.consentVersion || '').slice(0, 80),
      }),
      buildId: String(input.buildId || 'development').slice(0, 120),
    });
  }

  async function loadRuntimeConfig({ signal, timeoutMs = 5000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(5000, Math.max(100, Number(timeoutMs) || 5000)));
    const relayAbort = () => controller.abort();
    signal?.addEventListener('abort', relayAbort, { once: true });
    try {
      const response = await fetch('/api/client-config', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw configError('CONFIG_FETCH_FAILED', 'Service configuration is unavailable.');
      const payload = await response.json();
      return validateRuntimeConfig(payload?.config);
    } catch (error) {
      if (error.name === 'AbortError') throw configError('CONFIG_TIMEOUT', 'Service configuration timed out.');
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', relayAbort);
    }
  }

  const api = { loadRuntimeConfig, sameOriginPath, validateRuntimeConfig };
  global.VeriTrustConfigClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

