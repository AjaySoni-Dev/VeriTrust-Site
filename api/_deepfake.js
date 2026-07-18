// Private route implementation; api/detection.js is the Vercel entrypoint.
const {
  DEEPFAKE_MODELS,
  HttpError,
  contains,
  flattenScores,
  handleApiError,
  handleOptions,
  hfBinaryInference,
  parseMultipart,
  requireMethod,
  scoreItem,
  sendJson,
} = require('../lib/veritrust-api');
const { enforceRateLimit } = require('../lib/rate-limit');
const {
  enforceEntitlement,
  recordBillableUsage,
} = require('../lib/entitlements');
const {
  completeScanRecord,
  createScanRecord,
  failScanRecord,
  getProfileContext,
  requireServiceRole,
} = require('../lib/supabase-server');
const {
  validateImageUpload,
  validateModelKey,
} = require('../lib/validators');
const {
  buildDeepfakeEvidence,
  buildSafeSummary,
  confidenceBand,
  riskFromScore,
} = require('../lib/risk-engine');
const { runDeepfakeDetection } = require('../lib/detection-service');

const DEEPFAKE_DISCLAIMER = 'AI-assisted result. This is not legal, forensic, or final proof.';

function reportPayload(scanId, payload, createdAt) {
  return {
    scan_id: scanId,
    scan_type: 'deepfake',
    created_at: createdAt,
    model: {
      key: payload.model.key,
      name: payload.model.name,
      fallback_used: Boolean(payload.model.fallback_used || payload.model.fallback_from),
      ...(payload.model.fallback_from ? { fallback_from: payload.model.fallback_from } : {}),
    },
    result: payload.result,
    scores: payload.scores || [],
    report: {
      title: 'VeriTrust Scan Report',
      disclaimer: DEEPFAKE_DISCLAIMER,
      exportable: true,
    },
  };
}

function finalizeDeepfakePayload(payload, { scanId, context, metadata, createdAt }) {
  const result = payload.result || {};
  result.risk_level = riskFromScore(result.fake_score);
  result.confidence_band = confidenceBand(result.confidence);
  result.evidence = buildDeepfakeEvidence({
    ...payload,
    metadata,
  });
  result.indicators = result.evidence;
  result.summary = buildSafeSummary('deepfake', payload);
  result.explanation = result.summary;
  result.disclaimer = DEEPFAKE_DISCLAIMER;
  payload.result = result;
  payload.scan_id = scanId;
  payload.scan_type = 'deepfake';
  payload.created_at = createdAt;
  payload.model.fallback_used = Boolean(payload.model.fallback_used || payload.model.fallback_from);
  payload.report = {
    title: 'VeriTrust Scan Report',
    disclaimer: DEEPFAKE_DISCLAIMER,
    exportable: true,
  };
  payload.scan = {
    id: scanId,
    persisted: true,
    organization_id: context.organization.id,
  };
  payload.report_payload = reportPayload(scanId, payload, createdAt);
  return payload;
}

async function runDeepfakeModel(modelKey, upload) {
  const model = DEEPFAKE_MODELS[modelKey];
  const result = await hfBinaryInference(model.provider, model.hf_model, upload.buffer, upload.mimeType);
  if (!result.ok) {
    throw new HttpError(502, 'Hugging Face deepfake inference failed.', {
      status: result.status,
      details: result.json || result.raw || result.error,
    });
  }

  const scores = flattenScores(result.json);
  if (!scores.length) {
    throw new HttpError(502, 'The deepfake model returned an unexpected response.', {
      raw: result.json,
    });
  }

  let realScore = null;
  let fakeScore = null;
  const normalized = [];

  for (const item of scores) {
    const label = String(item.label || '');
    const score = Number(item.score || 0);
    const lower = label.toLowerCase();
    normalized.push(scoreItem(label, score));

    if (contains(lower, 'real')) {
      realScore = Math.max(realScore || 0, score);
    }
    if (contains(lower, 'fake')) {
      fakeScore = Math.max(fakeScore || 0, score);
    }
  }

  if (realScore === null || fakeScore === null) {
    normalized.sort((a, b) => b.score - a.score);
    const top = normalized[0] || { label: 'Unknown', score: 0 };
    const topLabel = String(top.label || '').toLowerCase();
    if (contains(topLabel, 'fake') || contains(topLabel, '1')) {
      fakeScore = top.score;
      realScore = 1 - fakeScore;
    } else {
      realScore = top.score;
      fakeScore = 1 - realScore;
    }
  }

  const label = fakeScore >= realScore ? 'Fake' : 'Real';
  const confidence = Math.max(fakeScore, realScore);
  const riskLevel = riskFromScore(fakeScore);
  const roundedConfidence = Number(confidence.toFixed(5));
  const roundedFakeScore = Number(fakeScore.toFixed(5));
  const roundedRealScore = Number(realScore.toFixed(5));

  return {
    ok: true,
    type: 'deepfake',
    model: {
      key: modelKey,
      name: model.display_name,
      hf_model: model.hf_model,
    },
    result: {
      label,
      confidence: roundedConfidence,
      fake_score: roundedFakeScore,
      real_score: roundedRealScore,
      risk_level: riskLevel,
      confidence_band: confidenceBand(roundedConfidence),
      summary: label === 'Fake'
        ? 'The image is likely synthetic based on the selected model score.'
        : 'The image is lower-risk based on the selected model score.',
      explanation: label === 'Fake'
        ? 'The image is likely synthetic based on the selected model score.'
        : 'The image is lower-risk based on the selected model score.',
      evidence: [],
      disclaimer: DEEPFAKE_DISCLAIMER,
    },
    scores: normalized,
  };
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'POST');
    requireServiceRole();

    const { fields, files } = await parseMultipart(req);
    const modelKey = validateModelKey(fields.model || 'pixel', DEEPFAKE_MODELS, 'deepfake');
    const upload = validateImageUpload(files.image);

    const context = await getProfileContext(req, fields.org_id || null);
    await enforceEntitlement(context, {
      action: 'web_scan',
      source: 'web',
      scanType: 'deepfake',
    });
    await enforceRateLimit({ req, endpoint: 'deepfake', context });

    const inputMetadata = {
      filename: upload.filename,
      mime_type: upload.mimeType,
      size_bytes: upload.size,
      retain_file: String(fields.retain_file || 'false') === 'true',
    };
    const scanId = await createScanRecord(context, {
      scanType: 'deepfake',
      inputKind: 'image',
      modelKey,
      projectId: fields.project_id || null,
      metadata: inputMetadata,
    });
    const createdAt = new Date().toISOString();

    try {
      const { payload, modelRuns } = await runDeepfakeDetection({
        upload,
        modelKey,
        scanId,
        context,
        metadata: inputMetadata,
        createdAt,
      });
      await completeScanRecord(scanId, payload, modelRuns);
      await recordBillableUsage(context, {
        source: 'web',
        scanType: 'deepfake',
        endpoint: '/api/deepfake',
        requestId: scanId ? `scan:${scanId}` : null,
        metadata: {
          scan_id: scanId,
          model_key: modelKey,
        },
      });
      sendJson(res, 200, payload);
    } catch (error) {
      await failScanRecord(scanId, error.message || 'Deepfake analysis failed.');
      throw error;
    }
  } catch (error) {
    handleApiError(res, error, 'Deepfake analysis failed.');
  }
};
