const {
  handleApiError,
  handleOptions,
  requireMethod,
  sendJson,
} = require('../lib/veritrust-api');
const { getOptionalEnv, serverConfig } = require('../lib/config');
const { MAX_IMAGE_BYTES } = require('../lib/validators');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'GET');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    sendJson(res, 200, {
      ok: true,
      config: {
        schemaVersion: '1',
        maxImageBytes: MAX_IMAGE_BYTES,
        modelCatalogVersion: getOptionalEnv('VERITRUST_MODEL_CATALOG_VERSION', '2026-07-10'),
        buildId: getOptionalEnv('VERCEL_GIT_COMMIT_SHA', getOptionalEnv('VERITRUST_BUILD_ID', 'development')).slice(0, 120),
        features: {
          billing: serverConfig.billingEnabled,
          externalApi: serverConfig.externalApiEnabled,
          preprocessing: Boolean(serverConfig.preprocessingUrl),
        },
        preprocessing: {
          enabled: Boolean(serverConfig.preprocessingUrl),
          providerName: getOptionalEnv('VERITRUST_PREPROCESSING_PROVIDER_NAME', ''),
          consentVersion: getOptionalEnv('VERITRUST_PREPROCESSING_CONSENT_VERSION', ''),
        },
        api: {
          health: '/api/health',
          deepfake: '/api/deepfake',
          linkCheck: '/api/link-check',
          phishing: '/api/phishing',
          session: '/api/session',
          scans: '/api/scans',
          apiKeys: '/api/api-keys',
        },
      },
    });
  } catch (error) {
    handleApiError(res, error, 'Client configuration is unavailable.');
  }
};
