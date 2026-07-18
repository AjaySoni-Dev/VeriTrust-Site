// Private route implementation; api/detection.js is the Vercel entrypoint.
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
  getUserFromRequest,
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

function persistenceWarning(message) {
  return {
    code: 'SCAN_HISTORY_UNAVAILABLE',
    message: message || 'Link analysis completed, but scan history could not be saved. Apply the latest Supabase schema to enable saved link scans.',
  };
}

function runtimeWarning(code, message) {
  return { code, message };
}

function appendWarning(warnings, warning) {
  if (warning?.code && !warnings.some((item) => item.code === warning.code)) {
    warnings.push(warning);
  }
}

function isInfrastructureError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || error?.extra?.code || '').toUpperCase();
  const details = typeof error?.details === 'string' ? error.details : JSON.stringify(error?.details || '');
  const text = `${error?.message || ''} ${details}`.toLowerCase();
  return status >= 500
    || code === 'SERVER_CONFIG_ERROR'
    || code === 'CONFIG_MISSING'
    || text.includes('schema cache')
    || text.includes('does not exist')
    || text.includes('could not find')
    || text.includes('invalid input value for enum')
    || text.includes('invalid input syntax')
    || text.includes('violates check constraint')
    || text.includes('new row for relation')
    || text.includes('pgrst202')
    || text.includes('pgrst205');
}

function isRecoverableContextError(error, preferredOrgId) {
  const status = Number(error?.status || 0);
  const text = `${error?.message || ''} ${JSON.stringify(error?.details || '')}`.toLowerCase();
  return isInfrastructureError(error)
    || (status === 403 && (
      text.includes('no veritrust workspace is available')
      || text.includes('you do not have access to this veritrust workspace')
    ));
}

async function getLinkContext(req, preferredOrgId, warnings) {
  try {
    return await getProfileContext(req, preferredOrgId);
  } catch (error) {
    if (!isRecoverableContextError(error, preferredOrgId)) throw error;
    const auth = await getUserFromRequest(req);
    appendWarning(warnings, runtimeWarning(
      'SCAN_HISTORY_UNAVAILABLE',
      'Link analysis completed, but workspace persistence is temporarily unavailable. Check the Supabase service role and production schema.'
    ));
    return {
      token: auth.token,
      user: auth.user,
      profile: null,
      organization: null,
      role: null,
    };
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'POST');
    requireJsonContentType(req);

    const body = await parseJsonBody(req, 16000);
    const modelKey = validateLinkModel(body.model);
    const linkInput = validateLinkInput({
      url: body.url,
      text: body.text,
      context: body.context,
    });

    const warnings = [];
    const context = await getLinkContext(req, body.org_id || null, warnings);

    if (context.organization?.id) {
      try {
        await enforceEntitlement(context, {
          action: 'web_scan',
          source: 'web',
          scanType: 'link',
        });
        await enforceRateLimit({ req, endpoint: 'link', context });
      } catch (error) {
        if (!isInfrastructureError(error)) throw error;
        appendWarning(warnings, runtimeWarning(
          'USAGE_TRACKING_UNAVAILABLE',
          'Link analysis completed, but quota or usage tracking is temporarily unavailable.'
        ));
        console.error('VeriTrust link quota infrastructure unavailable', {
          status: error.status,
          code: error.code,
          message: error.message,
        });
      }
    } else {
      appendWarning(warnings, runtimeWarning(
        'SCAN_HISTORY_UNAVAILABLE',
        'Link analysis completed, but scan history could not be saved because no workspace context is available.'
      ));
    }

    const createdAt = new Date().toISOString();
    let scanId = null;
    let historyWarning = null;

    if (context.organization?.id) {
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
        appendWarning(warnings, historyWarning);
        console.error('VeriTrust link scan history create failed', {
          status: error.status,
          code: error.code,
          message: error.message,
        });
      }
    } else {
      historyWarning = persistenceWarning('Link analysis completed, but scan history could not be saved because workspace persistence is unavailable.');
      appendWarning(warnings, historyWarning);
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
        appendWarning(warnings, historyWarning);
        payload.scan = {
          id: scanId,
          persisted: false,
          organization_id: context.organization?.id || null,
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
        organization_id: context.organization?.id || null,
      };
    }

    if (context.organization?.id) {
      try {
        await recordBillableUsage(context, {
          source: 'web',
          scanType: 'link',
          endpoint: '/api/link-check',
          requestId: scanId ? `scan:${scanId}` : null,
          metadata: {
            scan_id: scanId,
            model_key: modelKey,
          },
        });
      } catch (error) {
        appendWarning(warnings, runtimeWarning(
          'USAGE_TRACKING_UNAVAILABLE',
          'Link analysis completed, but usage tracking could not be updated.'
        ));
        console.error('VeriTrust link billable usage failed', {
          status: error.status,
          code: error.code,
          message: error.message,
        });
      }
    }

    if (historyWarning) appendWarning(warnings, historyWarning);
    if (warnings.length) {
      payload.warning = warnings[0];
      payload.warnings = warnings;
    }
    sendJson(res, 200, payload);
  } catch (error) {
    handleApiError(res, error, 'Link analysis failed.');
  }
};
