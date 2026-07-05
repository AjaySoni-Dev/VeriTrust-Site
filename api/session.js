const {
  getProfileContext,
  isServiceRoleConfigured,
  isSupabaseConfigured,
  workspaceStats,
} = require('../lib/supabase-server');
const {
  handleApiError,
  handleOptions,
  requireMethod,
  sendJson,
} = require('../lib/veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'GET');
    const url = new URL(req.url || '/', 'http://localhost');
    const context = await getProfileContext(req, url.searchParams.get('org_id'));
    const stats = await workspaceStats(context);

    sendJson(res, 200, {
      ok: true,
      supabase_configured: isSupabaseConfigured(),
      service_role_configured: isServiceRoleConfigured(),
      user: {
        id: context.user.id,
        email: context.user.email,
      },
      profile: context.profile,
      organization: context.organization,
      role: context.role,
      stats,
    });
  } catch (error) {
    handleApiError(res, error, 'Session check failed.');
  }
};
