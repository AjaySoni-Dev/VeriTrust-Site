const { createCheckoutSession } = require('../../lib/billing');
const { getProfileContext } = require('../../lib/supabase-server');
const {
  handleApiError,
  handleOptions,
  parseJsonBody,
  requireMethod,
  sendJson,
} = require('../../lib/veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'POST');
    const context = await getProfileContext(req);
    const body = await parseJsonBody(req, 4096);
    const checkout = await createCheckoutSession(req, context, {
      plan: body.plan,
      interval: body.interval || 'monthly',
    });
    sendJson(res, 200, { ok: true, checkout });
  } catch (error) {
    handleApiError(res, error, 'Unable to start checkout.');
  }
};
