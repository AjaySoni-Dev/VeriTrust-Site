// Private route implementation; api/detection.js is the Vercel entrypoint.
const {
  PHISHING_MODELS,
  HttpError,
  contains,
  flattenScores,
  handleApiError,
  handleOptions,
  hfChatCompletion,
  hfJsonInference,
  parseJsonBody,
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
  getProfileContext,
  requireServiceRole,
  textHash,
} = require('../lib/supabase-server');
const {
  validateJsonContentType,
  validateModelKey,
  validatePhishingText,
} = require('../lib/validators');
const {
  buildPhishingIndicators,
  buildSafeSummary,
  combinePhishingScores,
  confidenceBand,
  extractPhishingEntities,
  normalizeRiskLevel,
  riskFromScore,
  scorePhishingIndicators,
} = require('../lib/risk-engine');
const { runPhishingDetection } = require('../lib/detection-service');

const PHISHING_DISCLAIMER = 'AI-assisted result. Verify suspicious messages through official channels before taking action.';

function reportPayload(scanId, payload, createdAt) {
  return {
    scan_id: scanId,
    scan_type: 'phishing',
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
      disclaimer: PHISHING_DISCLAIMER,
      exportable: true,
    },
  };
}

function finalizePhishingPayload(payload, { text, scanId, context, createdAt }) {
  const result = payload.result || {};
  const modelScore = Number.isFinite(Number(result.model_score))
    ? Number(result.model_score)
    : Number(result.phishing_score || 0);
  const indicators = buildPhishingIndicators(text, {
    indicators: result.indicators,
  });
  const ruleScore = scorePhishingIndicators(indicators);
  const phishingScore = combinePhishingScores(modelScore, ruleScore);
  const legitimateScore = Number((1 - phishingScore).toFixed(5));
  const label = phishingScore >= 0.5 ? 'Phishing' : 'Legitimate';
  const confidence = Number(Math.max(phishingScore, legitimateScore).toFixed(5));
  const band = confidenceBand(confidence);

  result.label = label;
  result.confidence = confidence;
  result.phishing_score = phishingScore;
  result.legitimate_score = legitimateScore;
  result.model_score = Number(Math.max(0, Math.min(1, modelScore)).toFixed(5));
  result.rule_score = ruleScore;
  result.risk_level = riskFromScore(phishingScore);
  result.confidence_band = band;
  result.indicators = indicators;
  result.extracted = extractPhishingEntities(text);
  result.summary = buildSafeSummary('phishing', { result });
  if (band === 'Weak') {
    result.summary += ' The model confidence is weak, so manual review is recommended.';
  }
  result.explanation = result.summary;
  result.disclaimer = PHISHING_DISCLAIMER;

  payload.result = result;
  payload.scan_id = scanId;
  payload.scan_type = 'phishing';
  payload.created_at = createdAt;
  payload.model.fallback_used = Boolean(payload.model.fallback_used || payload.model.fallback_from);
  payload.report = {
    title: 'VeriTrust Scan Report',
    disclaimer: PHISHING_DISCLAIMER,
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

function normalizeMailGuard(scores) {
  let legitimate = 0;
  let phishing = 0;
  const normalized = [];

  for (const item of scores) {
    const label = String(item.label || '');
    const score = Math.max(0, Math.min(1, Number(item.score || 0)));
    const lower = label.toLowerCase();
    normalized.push(scoreItem(label, score));

    if (['label_0', 'legitimate_email', 'label_2', 'legitimate_url'].includes(lower) || contains(lower, 'legitimate')) {
      legitimate += score;
    } else if (['label_1', 'phishing_url', 'label_3', 'phishing_url_alt'].includes(lower) || contains(lower, 'phishing')) {
      phishing += score;
    }
  }

  let total = legitimate + phishing;
  if (total <= 0 && normalized.length) {
    normalized.sort((a, b) => b.score - a.score);
    const top = normalized[0];
    const topLabel = String(top.label || '').toLowerCase();
    if (contains(topLabel, 'phish') || contains(topLabel, 'label_1') || contains(topLabel, 'label_3')) {
      phishing = top.score;
      legitimate = 1 - top.score;
    } else {
      legitimate = top.score;
      phishing = 1 - top.score;
    }
    total = legitimate + phishing;
  }

  total = Math.max(0.00001, total);
  legitimate /= total;
  phishing /= total;

  return { legitimate, normalized, phishing };
}

async function runMailGuard(text) {
  const modelKey = 'mailguard';
  const model = PHISHING_MODELS[modelKey];
  const result = await hfJsonInference(model.provider, model.hf_model, {
    inputs: text,
    options: { wait_for_model: true },
  }, 25000);

  if (!result.ok) {
    throw new HttpError(502, 'Hugging Face phishing classifier failed.', {
      status: result.status,
      details: result.json || result.raw || result.error,
    });
  }

  const scores = flattenScores(result.json);
  if (!scores.length) {
    throw new HttpError(502, 'The phishing classifier returned an unexpected response.', {
      raw: result.json,
    });
  }

  const { legitimate, normalized, phishing } = normalizeMailGuard(scores);
  const label = phishing >= legitimate ? 'Phishing' : 'Legitimate';
  const confidence = Math.max(phishing, legitimate);
  const riskLevel = riskFromScore(phishing);
  const roundedPhishing = Number(phishing.toFixed(5));
  const roundedLegitimate = Number(legitimate.toFixed(5));
  const roundedConfidence = Number(confidence.toFixed(5));

  return {
    ok: true,
    type: 'phishing',
    model: {
      key: modelKey,
      name: model.display_name,
      hf_model: model.hf_model,
    },
    result: {
      label,
      confidence: roundedConfidence,
      phishing_score: roundedPhishing,
      legitimate_score: roundedLegitimate,
      model_score: roundedPhishing,
      rule_score: 0,
      risk_level: riskLevel,
      confidence_band: confidenceBand(roundedConfidence),
      explanation: label === 'Phishing'
        ? 'MailGuard found stronger phishing-related model signals.'
        : 'MailGuard found stronger legitimate-message model signals.',
      summary: label === 'Phishing'
        ? 'The message is likely phishing based on the selected model score.'
        : 'The message is lower-risk based on the selected model score.',
      indicators: [],
      extracted: { urls: [], domains: [], emails: [], phones: [] },
      disclaimer: PHISHING_DISCLAIMER,
    },
    scores: normalized,
  };
}

async function runCortex(text) {
  const modelKey = 'cortex';
  const model = PHISHING_MODELS[modelKey];
  const messages = [
    {
      role: 'system',
      content: 'You are VeriTrust Cortex, a phishing detection analyst. Return only compact JSON with keys: label, confidence, risk_level, explanation, indicators. The label must be either Phishing or Legitimate. Confidence must be a number from 0 to 1. Use cautious language and do not claim certainty.',
    },
    {
      role: 'user',
      content: `Analyze this message for phishing, smishing, scam, credential theft, impersonation, malicious links, urgency pressure, and financial fraud:\n\n${text}`,
    },
  ];

  const result = await hfChatCompletion(model.hf_model, messages, 25000);
  if (!result.ok) {
    throw new HttpError(502, 'Hugging Face Cortex inference failed.', {
      status: result.status,
      details: result.json || result.raw || result.error,
    });
  }

  const content = String(result.json?.choices?.[0]?.message?.content || '');
  const match = content.match(/\{[\s\S]*\}/);
  let parsed = null;
  try {
    parsed = JSON.parse(match ? match[0] : content);
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object') {
    parsed = {
      label: contains(content.toLowerCase(), 'phishing') ? 'Phishing' : 'Legitimate',
      confidence: 0.5,
      risk_level: 'Medium',
      explanation: content.trim() || 'Cortex returned an unstructured response.',
      indicators: [],
    };
  }

  const rawLabel = String(parsed.label || 'Legitimate');
  const label = contains(rawLabel.toLowerCase(), 'phish') ? 'Phishing' : 'Legitimate';
  let confidence = Number(parsed.confidence || 0.5);
  if (confidence > 1) confidence /= 100;
  confidence = Math.max(0, Math.min(1, confidence));
  const riskLevel = normalizeRiskLevel(parsed.risk_level || (label === 'Phishing' ? 'High' : 'Low'));
  const indicators = Array.isArray(parsed.indicators) ? parsed.indicators : [parsed.indicators].filter(Boolean);
  const phishingScore = label === 'Phishing' ? Number(confidence.toFixed(5)) : Number((1 - confidence).toFixed(5));
  const legitimateScore = label === 'Legitimate' ? Number(confidence.toFixed(5)) : Number((1 - confidence).toFixed(5));

  return {
    ok: true,
    type: 'phishing',
    model: {
      key: modelKey,
      name: model.display_name,
      hf_model: model.hf_model,
    },
    result: {
      label,
      confidence: Number(confidence.toFixed(5)),
      phishing_score: phishingScore,
      legitimate_score: legitimateScore,
      model_score: phishingScore,
      rule_score: 0,
      risk_level: riskLevel,
      confidence_band: confidenceBand(confidence),
      explanation: String(parsed.explanation || 'Cortex completed the phishing analysis.'),
      indicators,
      extracted: { urls: [], domains: [], emails: [], phones: [] },
      disclaimer: PHISHING_DISCLAIMER,
    },
  };
}

function runLocalPhishingFallback(text, selectedModelKey) {
  const lower = text.toLowerCase();
  const indicators = [];
  let phishing = 0.12;

  const checks = [
    {
      weight: 0.2,
      pattern: /\b(verify|confirm|update|restore|unlock|suspend(?:ed)?|limited|restricted)\b/,
      indicator: 'Uses account-action language often seen in credential theft attempts.',
    },
    {
      weight: 0.18,
      pattern: /\b(urgent|immediately|within\s+\d+\s+(hours?|days?)|final notice|act now)\b/,
      indicator: 'Creates urgency or pressure to act quickly.',
    },
    {
      weight: 0.18,
      pattern: /\b(password|passcode|otp|2fa|security code|login|sign in|bank|wallet|payment)\b/,
      indicator: 'References sensitive account, payment, or authentication details.',
    },
    {
      weight: 0.16,
      pattern: /(https?:\/\/|www\.|bit\.ly|tinyurl|t\.co|shorturl|rebrand\.ly)/,
      indicator: 'Contains a link or shortened URL that should be verified before opening.',
    },
    {
      weight: 0.14,
      pattern: /\b(prize|winner|refund|invoice|payment failed|delivery failed|gift card|crypto)\b/,
      indicator: 'Uses common scam or lure wording.',
    },
    {
      weight: 0.12,
      pattern: /\b(click here|open attachment|download|scan qr|re-login|validate your account)\b/,
      indicator: 'Asks for a risky follow-up action.',
    },
  ];

  for (const check of checks) {
    if (check.pattern.test(lower)) {
      phishing += check.weight;
      indicators.push(check.indicator);
    }
  }

  if (/[!]{2,}/.test(text) || /[A-Z]{8,}/.test(text)) {
    phishing += 0.06;
    indicators.push('Uses unusually forceful formatting.');
  }

  phishing = Math.max(0.03, Math.min(0.96, phishing));
  const legitimate = 1 - phishing;
  const label = phishing >= 0.5 ? 'Phishing' : 'Legitimate';
  const confidence = Math.max(phishing, legitimate);
  const riskLevel = riskFromScore(phishing);
  const roundedPhishing = Number(phishing.toFixed(5));
  const roundedLegitimate = Number(legitimate.toFixed(5));
  const roundedConfidence = Number(confidence.toFixed(5));
  const model = PHISHING_MODELS.mailguard;

  return {
    ok: true,
    type: 'phishing',
    model: {
      key: 'mailguard',
      name: model.display_name,
      hf_model: model.hf_model,
      fallback_from: selectedModelKey,
    },
    result: {
      label,
      confidence: roundedConfidence,
      phishing_score: roundedPhishing,
      legitimate_score: roundedLegitimate,
      model_score: roundedPhishing,
      rule_score: 0,
      risk_level: riskLevel,
      confidence_band: confidenceBand(roundedConfidence),
      explanation: 'The live phishing models were temporarily unavailable, so VeriTrust completed a local risk-indicator review.',
      indicators,
      extracted: extractPhishingEntities(text),
      disclaimer: PHISHING_DISCLAIMER,
    },
    scores: [
      scoreItem('phishing', phishing),
      scoreItem('legitimate', legitimate),
    ],
  };
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'POST');
    requireServiceRole();
    validateJsonContentType(req);

    const body = await parseJsonBody(req, 16000);
    const modelKey = validateModelKey(body.model || 'mailguard', PHISHING_MODELS, 'phishing');
    const text = validatePhishingText(body.text);

    const context = await getProfileContext(req, body.org_id || null);
    await enforceEntitlement(context, {
      action: 'web_scan',
      source: 'web',
      scanType: 'phishing',
    });
    await enforceRateLimit({ req, endpoint: 'phishing', context });

    const scanId = await createScanRecord(context, {
      scanType: 'phishing',
      inputKind: 'text',
      modelKey,
      projectId: body.project_id || null,
      textPreview: text.slice(0, 500),
      textHash: textHash(text),
      metadata: {
        length: text.length,
        retain_text: Boolean(body.retain_text),
      },
    });
    const createdAt = new Date().toISOString();

    const { payload, modelRuns } = await runPhishingDetection({
      text,
      modelKey,
      scanId,
      context,
      createdAt,
    });
    await completeScanRecord(scanId, payload, modelRuns);
    await recordBillableUsage(context, {
      source: 'web',
      scanType: 'phishing',
      endpoint: '/api/phishing',
      requestId: scanId ? `scan:${scanId}` : null,
      metadata: {
        scan_id: scanId,
        model_key: modelKey,
      },
    });
    sendJson(res, 200, payload);
  } catch (error) {
    handleApiError(res, error, 'Phishing analysis failed.');
  }
};
