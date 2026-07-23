// Private route implementation; api/system.js is the Vercel entrypoint.
const {
  DEEPFAKE_MODELS,
  PHISHING_MODELS,
  constantTimeEqual,
  handleApiError,
  handleOptions,
  requireMethod,
  sendJson,
} = require('../lib/veritrust-api');
const { getOptionalEnv, serverConfig } = require('../lib/config');
const {
  isServiceRoleConfigured,
  isSupabaseConfigured,
} = require('../lib/supabase-server');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'GET');

    const payload = {
      ok: true,
      service: 'VeriTrust API',
      status: 'operational',
      timestamp: new Date().toISOString(),
    };

    const adminSecret = serverConfig.adminSecret;
    const providedSecret = String(req.headers['x-veritrust-admin-secret'] || '').trim();
    if (constantTimeEqual(providedSecret, adminSecret)) {
      payload.diagnostics = {
        runtime: 'vercel-node',
        supabase_configured: isSupabaseConfigured(),
        supabase_service_role_configured: isServiceRoleConfigured(),
        hf_configured: Boolean(getOptionalEnv('HF_TOKEN') || getOptionalEnv('HF_ACCESS_TOKEN')),
        allowed_origin_count: serverConfig.allowedOrigins.length,
        deepfake_models: Object.values(DEEPFAKE_MODELS).map((item) => item.display_name),
        phishing_models: Object.values(PHISHING_MODELS).map((item) => item.display_name),
      };
    }

    sendJson(res, 200, payload);
  } catch (error) {
    handleApiError(res, error, 'Health check failed.');
  }
};
