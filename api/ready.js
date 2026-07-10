const { getOptionalEnv, serverConfig } = require('../lib/config');
const { getProfileContext, isServiceRoleConfigured, isSupabaseConfigured, supabaseFetch } = require('../lib/supabase-server');
const { requireRecentAuthentication } = require('../lib/session');
const { HttpError, handleApiError, handleOptions, requireMethod, sendJson } = require('../lib/veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, { methods: ['GET', 'OPTIONS'] })) return;
  try {
    requireMethod(req, 'GET');
    const context = await getProfileContext(req);
    if (!['owner', 'admin'].includes(String(context.role || '').toLowerCase())) {
      throw new HttpError(403, 'Administrator access is required.', { code: 'ADMIN_REQUIRED' });
    }
    requireRecentAuthentication(req);
    const configHealthy = isSupabaseConfigured() && isServiceRoleConfigured()
      && Boolean(getOptionalEnv('HF_TOKEN') || getOptionalEnv('HF_ACCESS_TOKEN'));
    if (!configHealthy) throw new HttpError(503, 'Required configuration is incomplete.', { code: 'READINESS_FAILED' });
    await supabaseFetch('/rest/v1/plans?select=id&limit=1', { service: true, timeoutMs: 3000, maxResponseBytes: 16 * 1024 });
    sendJson(res, 200, {
      ok: true,
      status: 'ready',
      build_id: getOptionalEnv('VERCEL_GIT_COMMIT_SHA', getOptionalEnv('VERITRUST_BUILD_ID', 'development')).slice(0, 120),
      contracts: { billing: serverConfig.billingEnabled ? 'enabled' : 'disabled', external_api: serverConfig.externalApiEnabled ? 'enabled' : 'disabled' },
    });
  } catch (error) {
    handleApiError(res, error, 'Readiness check failed.');
  }
};
