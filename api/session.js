const { workspaceStats } = require('../lib/supabase-server');
const { billingSnapshot } = require('../lib/entitlements');
const {
  csrfToken,
  exchangeRecoveryCode,
  listSessions,
  requestRecovery,
  revokeSessions,
  sessionContext,
  signIn,
  signOut,
  signUp,
  updatePassword,
} = require('../lib/session');
const {
  handleApiError,
  handleOptions,
  parseJsonBody,
  sendJson,
} = require('../lib/veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, { methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] })) return;

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url || '/', 'http://localhost');
      const context = await sessionContext(req, res, url.searchParams.get('org_id'));
      const [stats, billing] = await Promise.all([
        workspaceStats(context),
        billingSnapshot(context),
      ]);
      const sessions = await listSessions(context, req);
      sendJson(res, 200, {
        ok: true,
        contract_version: '2026-07-10',
        csrf_token: csrfToken(req, res),
        authenticated: true,
        user: { id: context.user.id, email: context.user.email, email_verified: Boolean(context.user.email_confirmed_at) },
        profile: context.profile,
        organization: context.organization,
        role: context.role,
        stats,
        billing,
        sessions,
      });
      return;
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req, 16 * 1024);
      const action = String(body.action || '').trim().toLowerCase();
      let result;
      if (action === 'sign-in') result = await signIn(req, res, body);
      else if (action === 'sign-up') result = await signUp(req, res, body);
      else if (action === 'recover') result = await requestRecovery(req, res, body);
      else if (action === 'exchange-recovery') result = await exchangeRecoveryCode(req, res, body);
      else if (action === 'update-password') result = await updatePassword(req, body);
      else if (action === 'revoke-session' || action === 'revoke-all-sessions') {
        const context = await sessionContext(req, res);
        result = await revokeSessions(req, context, { sessionId: body.session_id, all: action === 'revoke-all-sessions' });
      }
      else {
        const error = new Error('Unknown session action.');
        error.status = 400;
        error.code = 'SESSION_ACTION_INVALID';
        throw error;
      }
      sendJson(res, 200, { ok: true, csrf_token: csrfToken(req, res), ...result });
      return;
    }

    if (req.method === 'DELETE') {
      const result = await signOut(req, res);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET, POST, DELETE, or OPTIONS.' } });
  } catch (error) {
    handleApiError(res, error, 'Session request failed.');
  }
};
