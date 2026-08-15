// Private route implementation; api/detection.js is the Vercel entrypoint.
const crypto = require('node:crypto');
const {
  DEEPFAKE_MODELS,
  handleApiError,
  handleOptions,
  parseMultipart,
  requireMethod,
  sendJson,
} = require('../../veritrust-api');
const { runDeepfakeDetection } = require('../../detection-service');
const { enforceRateLimit } = require('../../rate-limit');
const {
  getProfileContext,
  requireServiceRole,
  runScanLifecycle,
  scanIdempotencyKey,
} = require('../../supabase-server');
const { validateImageUpload, validateModelKey } = require('../../validators');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'POST');
    requireServiceRole();

    const { fields, files } = await parseMultipart(req);
    const modelKey = validateModelKey(fields.model || 'pixel', DEEPFAKE_MODELS, 'deepfake');
    const upload = validateImageUpload(files.image);
    const context = await getProfileContext(req, fields.org_id || null);
    await enforceRateLimit({ req, endpoint: 'deepfake', context });

    const inputMetadata = {
      filename: upload.filename,
      mime_type: upload.mimeType,
      size_bytes: upload.size,
      retain_file: String(fields.retain_file || 'false') === 'true',
    };
    const { payload } = await runScanLifecycle(context, {
      scanType: 'deepfake',
      inputKind: 'image',
      modelKey,
      projectId: fields.project_id || null,
      textHash: crypto.createHash('sha256').update(upload.buffer).digest('hex'),
      metadata: inputMetadata,
      endpoint: '/api/deepfake',
      requestId: scanIdempotencyKey(req, 'deepfake'),
    }, (scanId) => runDeepfakeDetection({
      upload,
      modelKey,
      scanId,
      context,
      metadata: inputMetadata,
      createdAt: new Date().toISOString(),
    }));
    sendJson(res, 200, payload);
  } catch (error) {
    handleApiError(res, error, 'Deepfake analysis failed.');
  }
};
