// Private route implementation; api/detection.js is the Vercel entrypoint.
const {
  DEFAULT_LINK_MODEL,
  LINK_MODELS,
  validateLinkInput,
} = require('../lib/link-intelligence');
const { enforceRateLimit } = require('../lib/rate-limit');
const { runLinkDetection } = require('../lib/detection-service');
const {
  getProfileContext,
  requireServiceRole,
  runScanLifecycle,
  scanIdempotencyKey,
  textHash,
} = require('../lib/supabase-server');
const {
  HttpError,
  handleApiError,
  handleOptions,
  parseJsonBody,
  requireMethod,
  sendJson,
} = require('../lib/veritrust-api');
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

  try {
    requireMethod(req, 'POST');
    requireServiceRole();
    requireJsonContentType(req);

    const body = await parseJsonBody(req, 16000);
    const modelKey = validateLinkModel(body.model);
    const linkInput = validateLinkInput({
      url: body.url,
      text: body.text,
      context: body.context,
    });

    const context = await getProfileContext(req, body.org_id || null);
    await enforceRateLimit({ req, endpoint: 'link', context });

    const { payload } = await runScanLifecycle(context, {
      scanType: 'link',
      inputKind: 'url',
      modelKey,
      projectId: body.project_id || null,
      textPreview: `${linkInput.url}${linkInput.context ? ` ${linkInput.context}` : ''}`.slice(0, 500),
      textHash: textHash(`${linkInput.url}\n${linkInput.context || ''}`),
      metadata: {
        normalized_url: linkInput.url,
        urls_found: linkInput.urls_found,
        context_length: linkInput.context.length,
      },
      endpoint: '/api/link-check',
      requestId: scanIdempotencyKey(req, 'link'),
    }, async (scanId) => runLinkDetection({
      url: body.url,
      text: body.text,
      context: body.context,
      modelKey,
      scanId,
      context,
      createdAt: new Date().toISOString(),
    }));
    sendJson(res, 200, payload);
  } catch (error) {
    handleApiError(res, error, 'Link analysis failed.');
  }
};
