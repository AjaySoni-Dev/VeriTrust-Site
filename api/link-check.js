const { DEFAULT_LINK_MODEL, LINK_MODELS, validateLinkInput } = require('../lib/link-intelligence');
const { enforceRateLimit } = require('../lib/rate-limit');
const { enforceEntitlement, recordBillableUsage, releaseQuotaReservation } = require('../lib/entitlements');
const { runLinkDetection } = require('../lib/detection-service');
const {
  completeScanRecord,
  createScanRecord,
  failScanRecord,
  getProfileContext,
  requireServiceRole,
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
  const model = LINK_MODELS[normalized];
  if (!model || model.locked || model.comingSoon) throw new HttpError(400, 'Selected Link Intelligence model is unavailable.', { code: 'INVALID_MODEL' });
  return normalized;
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  let scanId = null;
  let reservationId = null;
  let originalError = null;
  try {
    requireMethod(req, 'POST');
    requireServiceRole();
    if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
      throw new HttpError(415, 'Use application/json for this endpoint.', { code: 'CONTENT_TYPE_UNSUPPORTED' });
    }
    const body = await parseJsonBody(req, 16_000);
    const modelKey = validateLinkModel(body.model);
    const linkInput = validateLinkInput({ url: body.url, text: body.text, context: body.context });
    const context = await getProfileContext(req, body.org_id || null);
    const entitlement = await enforceEntitlement(context, { action: 'web_scan', source: 'web', scanType: 'link' });
    reservationId = entitlement.decision?.reservation_id || null;
    await enforceRateLimit({ req, endpoint: 'link', context });
    scanId = await createScanRecord(context, {
      scanType: 'link', inputKind: 'url', modelKey, projectId: body.project_id || null,
      retainText: false,
      textPreview: null,
      textHash: textHash(`${linkInput.url}\n${linkInput.context || ''}`),
      metadata: { url_hash_only: true, url_count: linkInput.urls_found.length, context_length: linkInput.context.length },
    });
    const { payload, modelRuns } = await runLinkDetection({
      url: body.url, text: body.text, contextText: body.context, modelKey, scanId, authContext: context,
    });
    await completeScanRecord(scanId, payload, modelRuns);
    await recordBillableUsage(context, {
      source: 'web', scanType: 'link', endpoint: '/api/link-check', requestId: req.requestId,
      reservationId,
      metadata: { scan_id: scanId, model_key: modelKey },
    });
    payload.scan = { id: scanId, persisted: true, organization_id: context.organization.id };
    sendJson(res, 200, payload);
  } catch (error) {
    originalError = error;
    await releaseQuotaReservation(reservationId, error.code || 'LINK_SCAN_FAILED');
    if (scanId) {
      try { await failScanRecord(scanId, String(error.code || 'LINK_SCAN_FAILED')); }
      catch (cleanupError) { originalError.cleanup_error = cleanupError.code || 'SCAN_FAILURE_PERSIST_FAILED'; }
    }
    handleApiError(res, originalError, 'Link analysis failed.');
  }
};
