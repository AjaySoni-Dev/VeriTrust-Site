const { externalApiError, recordApiUsage, requestId, requireApiKey } = require('../../api-keys');
const { applyEntitlementHeaders, releaseQuotaReservation } = require('../../entitlements');
const { abandonIdempotentRequest, beginIdempotentRequest, completeIdempotentRequest, requestHash } = require('../../idempotency');
const { externalModelKey, runDeepfakeDetection } = require('../../detection-service');
const { DEEPFAKE_MODELS, HttpError, handleOptions, parseMultipart, requireMethod, sendJson } = require('../../veritrust-api');
const { validateImageUpload, validateModelKey } = require('../../validators');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, { methods: ['POST', 'OPTIONS'], credentials: false })) return;
  const request_id = requestId();
  const started = Date.now();
  let auth = null;
  let idempotency = null;
  try {
    requireMethod(req, 'POST');
    auth = await requireApiKey(req, 'deepfake:scan');
    applyEntitlementHeaders(res, auth.entitlement);
    const { fields, files } = await parseMultipart(req);
    if (['1', 'true', 'yes', 'on'].includes(String(fields.crop || fields.auto_crop || '').toLowerCase())) {
      throw new HttpError(409, 'Third-party preprocessing is disabled for the external API. Submit the exact image bytes you intend to analyze.', { code: 'PREPROCESSING_CONSENT_REQUIRED' });
    }
    const modelKey = validateModelKey(externalModelKey('deepfake', fields.model), DEEPFAKE_MODELS, 'deepfake');
    const upload = validateImageUpload(files.image);
    idempotency = await beginIdempotentRequest(req, auth, '/api/v1/deepfake', requestHash(Buffer.concat([upload.buffer, Buffer.from(`:${modelKey}`)])));
    if (idempotency.replay) {
      await releaseQuotaReservation(auth.entitlement?.decision?.reservation_id, 'idempotent_replay');
      sendJson(res, idempotency.replay.status, idempotency.replay.body);
      return;
    }
    const createdAt = new Date().toISOString();
    const { payload } = await runDeepfakeDetection({
      upload, modelKey, createdAt,
      metadata: { mime_type: upload.mimeType, size_bytes: upload.size, preprocessing: 'none', generated_filename: upload.filename },
    });
    await recordApiUsage(auth, {
      endpoint: '/api/v1/deepfake', scan_type: 'deepfake', status: 'success', request_id, latency_ms: Date.now() - started,
    });
    const responseBody = {
      ok: true, request_id, scan_type: 'deepfake', created_at: createdAt,
      model: payload.model, result: payload.result, scores: payload.scores || [],
      preprocessing: { requested: false, used: false, status: 'not_requested' },
    };
    await completeIdempotentRequest(idempotency.id, 200, responseBody);
    sendJson(res, 200, responseBody);
  } catch (error) {
    await abandonIdempotentRequest(idempotency?.id);
    if (auth) {
      await releaseQuotaReservation(auth.entitlement?.decision?.reservation_id, error.code || 'request_failed');
      await recordApiUsage(auth, { endpoint: '/api/v1/deepfake', scan_type: 'deepfake', status: 'error', request_id, latency_ms: Date.now() - started, error_code: error.code || 'INTERNAL_ERROR' });
    }
    externalApiError(res, error, 'Deepfake analysis failed.', request_id);
  }
};
