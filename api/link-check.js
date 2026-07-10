const {
  DEFAULT_LINK_MODEL,
  LINK_MODELS,
  validateLinkInput,
} = require('../lib/link-intelligence');
const { enforceRateLimit } = require('../lib/rate-limit');
const {
  enforceEntitlement,
  recordBillableUsage,
} = require('../lib/entitlements');
const { runLinkDetection } = require('../lib/detection-service');
const {
  completeScanRecord,
  createScanRecord,
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
  if (!Object.prototype.hasOwnProperty.call(LINK_MODELS, normalized)) {
    throw new HttpError(400, 'Unknown Link Intelligence model.', { code: 'INVALID_MODEL' });
  }
  if (LINK_MODELS[normalized].locked || LINK_MODELS[normalized].comingSoon) {
    throw new HttpError(400, 'VeriTrust Sentinel is locked and coming soon.', { code: 'INVALID_MODEL' });
  }
  return normalized;
}

function requireJsonContentType(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'Use application/json for this endpoint.', { code: 'INVALID_INPUT' });
  }
}

function persistenceWarning(message) {
  return {
    code: 'SCAN_HISTORY_UNAVAILABLE',
    message: message || 'Link analysis completed, but scan history could not be saved. Apply the latest Supabase schema to enable saved link scans.',
  };
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
    await enforceEntitlement(context, {
      action: 'web_scan',
      source: 'web',
      scanType: 'link',
    });
    await enforceRateLimit({ req, endpoint: 'link', context });

    const createdAt = new Date().toISOString();
    let scanId = null;
    let historyWarning = null;

    try {
      scanId = await createScanRecord(context, {
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
      });
    } catch (error) {
      historyWarning = persistenceWarning();
      console.error('VeriTrust link scan history create failed', {
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }

    const { payload, modelRuns } = await runLinkDetection({
      url: body.url,
      text: body.text,
      context: body.context,
      modelKey,
      scanId,
      context,
      createdAt,
    });

    if (scanId) {
      try {
        await completeScanRecord(scanId, payload, modelRuns);
      } catch (error) {
        historyWarning = persistenceWarning();
        payload.scan = {
          id: scanId,
          persisted: false,
          organization_id: context.organization.id,
        };
        console.error('VeriTrust link scan history complete failed', {
          status: error.status,
          code: error.code,
          message: error.message,
        });
      }
    } else {
      payload.scan = {
        id: null,
        persisted: false,
        organization_id: context.organization.id,
      };
    }

    try {
      await recordBillableUsage(context, {
        source: 'web',
        scanType: 'link',
        endpoint: '/api/link-check',
        metadata: {
          scan_id: scanId,
          model_key: modelKey,
        },
      });
    } catch (error) {
      console.error('VeriTrust link billable usage failed', {
        status: error.status,
        code: error.code,
        message: error.message,
      });
    }

    if (historyWarning) payload.warning = historyWarning;
    sendJson(res, 200, payload);
  } catch (error) {
    handleApiError(res, error, 'Link analysis failed.');
  }
};
