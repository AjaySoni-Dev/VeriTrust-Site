// Private route implementation; api/system.js is the Vercel entrypoint.
const {
  handleApiError,
  handleOptions,
  requireMethod,
  sendJson,
} = require('../../veritrust-api');
const { serverConfig } = require('../../config');
const { MAX_IMAGE_BYTES } = require('../../validators');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'GET');
    sendJson(res, 200, {
      ok: true,
      config: {
        cropApiUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space/api/crop-image',
        cropOutputBaseUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space',
        maxImageBytes: MAX_IMAGE_BYTES,
        supabase: {
          url: serverConfig.supabaseUrl,
          anonKey: serverConfig.supabaseAnonKey,
        },
        api: {
          health: '/api/health',
          deepfake: '/api/deepfake',
          linkCheck: '/api/link-check',
          phishing: '/api/phishing',
          session: '/api/session',
          scans: '/api/scans',
          cases: '/api/cases',
          apiKeys: '/api/api-keys',
          dashboard: '/api/dashboard',
          authSession: '/api/auth-session',
          profile: '/api/profile',
          privacy: '/api/privacy',
          jobs: '/api/jobs',
          modelCards: '/api/model-cards',
        },
      },
    });
  } catch (error) {
    handleApiError(res, error, 'Client configuration is unavailable.');
  }
};
