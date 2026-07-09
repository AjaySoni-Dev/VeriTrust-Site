const {
  externalApiError,
  recordApiUsage,
  requestId,
  requireApiKey,
} = require('../../lib/api-keys');
const { externalModelKey, runDeepfakeDetection } = require('../../lib/detection-service');
const {
  DEEPFAKE_MODELS,
  handleOptions,
  parseMultipart,
  requireMethod,
  sendJson,
} = require('../../lib/veritrust-api');
const {
  validateImageUpload,
  validateModelKey,
} = require('../../lib/validators');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const request_id = requestId();
  const started = Date.now();
  let auth = null;

  try {
    requireMethod(req, 'POST');
    auth = await requireApiKey(req, 'deepfake:scan');
    const { fields, files } = await parseMultipart(req);
    const modelKey = validateModelKey(externalModelKey('deepfake', fields.model), DEEPFAKE_MODELS, 'deepfake');
    const upload = validateImageUpload(files.image);
    const createdAt = new Date().toISOString();
    const { payload } = await runDeepfakeDetection({
      upload,
      modelKey,
      createdAt,
      metadata: {
        filename: upload.filename,
        mime_type: upload.mimeType,
        size_bytes: upload.size,
      },
    });
    const usage = await recordApiUsage(auth, {
      endpoint: '/api/v1/deepfake',
      scan_type: 'deepfake',
      status: 'success',
      request_id,
      latency_ms: Date.now() - started,
    });

    sendJson(res, 200, {
      ok: true,
      request_id,
      scan_type: 'deepfake',
      created_at: createdAt,
      model: payload.model,
      result: payload.result,
      scores: payload.scores || [],
      usage: usage || auth.usage,
    });
  } catch (error) {
    if (auth) {
      await recordApiUsage(auth, {
        endpoint: '/api/v1/deepfake',
        scan_type: 'deepfake',
        status: 'error',
        request_id,
        latency_ms: Date.now() - started,
        error_code: error.code || error.extra?.code || 'INTERNAL_ERROR',
      });
    }
    externalApiError(res, error, 'Deepfake analysis failed.', request_id);
  }
};
