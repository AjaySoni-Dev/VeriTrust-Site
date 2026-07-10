(function bootstrapRuntimeConfig(global) {
  const safeInitialConfig = Object.freeze({
    schemaVersion: '1',
    maxImageBytes: 4 * 1024 * 1024,
    api: Object.freeze({
      health: '/api/health',
      clientConfig: '/api/client-config',
      deepfake: '/api/deepfake',
      linkCheck: '/api/link-check',
      phishing: '/api/phishing',
      session: '/api/session',
      scans: '/api/scans',
      apiKeys: '/api/api-keys',
    }),
    features: Object.freeze({ billing: false, externalApi: false, preprocessing: false }),
    preprocessing: Object.freeze({ enabled: false, providerName: '', consentVersion: '' }),
    modelCatalogVersion: 'loading',
    buildId: 'loading',
  });

  global.VeriTrust_CONFIG = safeInitialConfig;
  global.VeriTrust_CONFIG_STATE = 'loading';
  global.VeriTrust_CONFIG_READY = (async () => {
    try {
      if (!global.VeriTrustConfigClient?.loadRuntimeConfig) throw new Error('Configuration client is unavailable.');
      const config = await global.VeriTrustConfigClient.loadRuntimeConfig({ timeoutMs: 5000 });
      global.VeriTrust_CONFIG = config;
      global.VeriTrust_CONFIG_STATE = 'ready';
      global.dispatchEvent(new CustomEvent('veritrust:config-ready', { detail: config }));
      return config;
    } catch (error) {
      global.VeriTrust_CONFIG_STATE = 'error';
      global.VeriTrust_CONFIG_ERROR = Object.freeze({ code: error.code || 'CONFIG_FAILED', message: 'Service configuration unavailable.' });
      global.dispatchEvent(new CustomEvent('veritrust:config-error', { detail: global.VeriTrust_CONFIG_ERROR }));
      throw error;
    }
  })();
})(window);

