// Private route implementation; api/system.js is the Vercel entrypoint.
const {
  handleApiError,
  handleOptions,
  requireMethod,
  sendJson,
} = require('../lib/veritrust-api');
const { serverConfig } = require('../lib/config');
const { MAX_IMAGE_BYTES } = require('../lib/validators');

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
          apiKeys: '/api/api-keys',
          dashboard: '/api/dashboard',
        },
        storage: {
          scanUploadsBucket: 'scan-uploads',
          scanCropsBucket: 'scan-crops',
          avatarsBucket: 'avatars',
          exportsBucket: 'exports',
        },
      },
    });
  } catch (error) {
    handleApiError(res, error, 'Client configuration is unavailable.');
  }
};
