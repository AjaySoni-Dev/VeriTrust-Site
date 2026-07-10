const {
  externalApiError,
  recordApiUsage,
  requestId,
  requireApiKey,
} = require('../../api-keys');
const { applyEntitlementHeaders, releaseQuotaReservation } = require('../../entitlements');
const { abandonIdempotentRequest, beginIdempotentRequest, completeIdempotentRequest, requestHash } = require('../../idempotency');
const { externalModelKey, runPhishingDetection } = require('../../detection-service');
const {
  PHISHING_MODELS,
  handleOptions,
  parseJsonBody,
  requireMethod,
  sendJson,
} = require('../../veritrust-api');
const {
  validateJsonContentType,
  validateModelKey,
  validatePhishingText,
} = require('../../validators');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, { methods: ['POST', 'OPTIONS'], credentials: false })) return;
  const request_id = requestId();
  const started = Date.now();
  let auth = null;
  let idempotency = null;

  try {
    requireMethod(req, 'POST');
    auth = await requireApiKey(req, 'phishing:scan');
    applyEntitlementHeaders(res, auth.entitlement);
    validateJsonContentType(req);
    const body = await parseJsonBody(req, 16000);
    const text = validatePhishingText(body.text);
    const modelKey = validateModelKey(externalModelKey('phishing', body.model), PHISHING_MODELS, 'phishing');
    idempotency = await beginIdempotentRequest(req, auth, '/api/v1/phishing', requestHash({ text, modelKey }));
    if (idempotency.replay) {
      await releaseQuotaReservation(auth.entitlement?.decision?.reservation_id, 'idempotent_replay');
      sendJson(res, idempotency.replay.status, idempotency.replay.body);
      return;
    }
    const createdAt = new Date().toISOString();
    const { payload } = await runPhishingDetection({ text, modelKey, createdAt });
    const usage = await recordApiUsage(auth, {
      endpoint: '/api/v1/phishing',
      scan_type: 'phishing',
      status: 'success',
      request_id,
      latency_ms: Date.now() - started,
    });

    const responseBody = {
      ok: true,
      request_id,
      scan_type: 'phishing',
      created_at: createdAt,
      model: payload.model,
      result: payload.result,
      scores: payload.scores || [],
      usage: usage || auth.usage,
    };
    await completeIdempotentRequest(idempotency.id, 200, responseBody);
    sendJson(res, 200, responseBody);
  } catch (error) {
    await abandonIdempotentRequest(idempotency?.id);
    if (auth) {
      await releaseQuotaReservation(auth.entitlement?.decision?.reservation_id, error.code || 'request_failed');
      await recordApiUsage(auth, {
        endpoint: '/api/v1/phishing',
        scan_type: 'phishing',
        status: 'error',
        request_id,
        latency_ms: Date.now() - started,
        error_code: error.code || error.extra?.code || 'INTERNAL_ERROR',
      });
    }
    externalApiError(res, error, 'Phishing analysis failed.', request_id);
  }
};
