const {
  DEFAULT_LINK_MODEL,
  LINK_MODELS,
} = require('../../link-intelligence');
const {
  externalApiError,
  recordApiUsage,
  requestId,
  requireApiKey,
} = require('../../api-keys');
const { applyEntitlementHeaders } = require('../../entitlements');
const { runLinkDetection } = require('../../detection-service');
const {
  HttpError,
  handleOptions,
  parseJsonBody,
  requireMethod,
  sendJson,
} = require('../../veritrust-api');
function validateLinkModel(modelKey) {
  const normalized = String(modelKey || DEFAULT_LINK_MODEL).trim().toLowerCase() || DEFAULT_LINK_MODEL;
  if (!Object.prototype.hasOwnProperty.call(LINK_MODELS, normalized)) {
    throw new HttpError(400, 'Unknown Link Intelligence model.', { code: 'INVALID_MODEL' });
  }
  if (LINK_MODELS[normalized].locked || LINK_MODELS[normalized].comingSoon) {
    throw new HttpError(400, 'VeriTrust Sentinel is not available in this version.', { code: 'INVALID_MODEL' });
  }
  return normalized;
}

function requireJsonContentType(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'Use application/json for this endpoint.', { code: 'INVALID_INPUT' });
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const request_id = requestId();
  const started = Date.now();
  let auth = null;

  try {
    requireMethod(req, 'POST');
    auth = await requireApiKey(req, 'link:scan');
    applyEntitlementHeaders(res, auth.entitlement);
    requireJsonContentType(req);

    const body = await parseJsonBody(req, 16000);
    const modelKey = validateLinkModel(body.model);
    const createdAt = new Date().toISOString();
    const { payload } = await runLinkDetection({
      url: body.url,
      text: body.text,
      context: body.context,
      modelKey,
      createdAt,
    });
    const usage = await recordApiUsage(auth, {
      endpoint: '/api/v1/link-check',
      scan_type: 'link',
      status: 'success',
      request_id,
      latency_ms: Date.now() - started,
    });

    sendJson(res, 200, {
      ok: true,
      request_id,
      scan_type: 'link',
      created_at: createdAt,
      model: payload.model,
      result: payload.result,
      scores: payload.scores || [],
      usage: usage || auth.usage,
    });
  } catch (error) {
    if (auth) {
      await recordApiUsage(auth, {
        endpoint: '/api/v1/link-check',
        scan_type: 'link',
        status: 'error',
        request_id,
        latency_ms: Date.now() - started,
        error_code: error.code || error.extra?.code || 'INTERNAL_ERROR',
      });
    }
    externalApiError(res, error, 'Link analysis failed.', request_id);
  }
};
