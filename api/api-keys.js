const {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} = require('../lib/api-keys');
const {
  getProfileContext,
} = require('../lib/supabase-server');
const { requireRecentAuthentication } = require('../lib/session');
const {
  handleApiError,
  handleOptions,
  parseJsonBody,
  sendJson,
} = require('../lib/veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, { methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] })) return;

  try {
    const context = await getProfileContext(req);

    if (req.method === 'GET') {
      const keys = await listApiKeys(context);
      sendJson(res, 200, { ok: true, api_keys: keys });
      return;
    }

    if (req.method === 'POST') {
      requireRecentAuthentication(req);
      const body = await parseJsonBody(req, 4096);
      const apiKey = await createApiKey(context, {
        name: body.name,
        scopes: body.scopes,
        mode: body.mode,
        usage_limit_daily: body.usage_limit_daily,
      });
      sendJson(res, 201, {
        ok: true,
        api_key: apiKey,
        warning: 'Copy this key now. It will not be shown again.',
      });
      return;
    }

    if (req.method === 'DELETE') {
      requireRecentAuthentication(req);
      const url = new URL(req.url || '/', 'http://localhost');
      const body = req.headers['content-type']?.includes('application/json')
        ? await parseJsonBody(req, 2048)
        : {};
      const id = url.searchParams.get('id') || body.id;
      const revoked = await revokeApiKey(context, id);
      sendJson(res, 200, { ok: true, revoked });
      return;
    }

    sendJson(res, 405, {
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use GET, POST, or DELETE for this endpoint.',
      },
    });
  } catch (error) {
    handleApiError(res, error, 'Unable to manage API keys.');
  }
};
