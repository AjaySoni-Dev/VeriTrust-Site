const {
  externalApiError,
  requestId,
  requireApiKey,
} = require('../../api-keys');
const { applyEntitlementHeaders } = require('../../entitlements');
const {
  handleOptions,
  requireMethod,
  sendJson,
} = require('../../veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, { methods: ['GET', 'OPTIONS'], credentials: false })) return;
  const request_id = requestId();
  let auth = null;

  try {
    requireMethod(req, 'GET');
    auth = await requireApiKey(req, 'usage:read');
    applyEntitlementHeaders(res, auth.entitlement);
    sendJson(res, 200, {
      ok: true,
      request_id,
      usage: auth.usage,
      billing: auth.entitlement || null,
      api_key: {
        name: auth.public.name,
        display_hint: auth.public.display_hint,
        status: auth.public.status,
        last_used_at: auth.public.last_used_at,
      },
    });
  } catch (error) {
    externalApiError(res, error, 'Unable to load API usage.', request_id);
  }
};
