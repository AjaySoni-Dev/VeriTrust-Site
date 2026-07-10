const { subscriptionPayload } = require('../../lib/billing');
const { getProfileContext } = require('../../lib/supabase-server');
const {
  handleApiError,
  handleOptions,
  requireMethod,
  sendJson,
} = require('../../lib/veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'GET');
    const context = await getProfileContext(req);
    const payload = await subscriptionPayload(context);
    sendJson(res, 200, { ok: true, ...payload });
  } catch (error) {
    handleApiError(res, error, 'Unable to load billing status.');
  }
};
