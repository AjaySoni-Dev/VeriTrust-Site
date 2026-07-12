const {
  DEEPFAKE_MODELS,
  PHISHING_MODELS,
  HttpError,
  contains,
  flattenScores,
  hfBinaryInference,
  hfChatCompletion,
  hfJsonInference,
  scoreItem,
} = require('./veritrust-api');
const {
  buildDeepfakeEvidence,
  buildPhishingIndicators,
  buildSafeSummary,
  combinePhishingScores,
  confidenceBand,
  extractPhishingEntities,
  normalizeRiskLevel,
  riskFromScore,
  scorePhishingIndicators,
} = require('./risk-engine');
const {
  DEFAULT_LINK_MODEL,
  LINK_DISCLAIMER,
  LINK_MODELS,
  analyzeUrlRules,
  buildLinkResult,
  normalizeSwiftOutput,
  normalizeSentinelOutput,
  scoreUrlRules,
  validateLinkInput,
} = require('./link-intelligence');

const DEEPFAKE_DISCLAIMER = 'AI-assisted result. This is not legal, forensic, or final proof.';
const PHISHING_DISCLAIMER = 'AI-assisted result. Verify suspicious messages through official channels before taking action.';

function externalModelKey(type, model) {
  const requested = String(model || '').trim().toLowerCase();
  if (type === 'link') {
    if (!requested || requested === 'fast') return 'swift';
    if (requested === 'robust') return 'sentinel';
    return requested;
  }
  if (!requested || requested === 'fast') return type === 'deepfake' ? 'pixel' : 'mailguard';
  if (requested === 'robust') return type === 'deepfake' ? 'prism' : 'cortex';
  return requested;
}

function reportPayload(scanId, scanType, payload, createdAt, disclaimer) {
  return {
    scan_id: scanId,
    scan_type: scanType,
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
      disclaimer,
      exportable: true,
    },
  };
}

function finalizeDeepfakePayload(payload, { scanId = null, createdAt = new Date().toISOString(), context = null, metadata = {} } = {}) {
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
  if (context?.organization?.id) {
    payload.scan = {
      id: scanId,
      persisted: Boolean(scanId),
      organization_id: context.organization.id,
    };
  }
  payload.report_payload = reportPayload(scanId, 'deepfake', payload, createdAt, DEEPFAKE_DISCLAIMER);
  return payload;
}

function normalizeDeepfakeScores(scores) {
  let realScore = null;
  let fakeScore = null;
  const normalized = [];

  for (const item of scores) {
    const label = String(item.label || '');
    const score = Number(item.score || 0);
    const lower = label.toLowerCase();
    normalized.push(scoreItem(label, score));

    if (contains(lower, 'real')) realScore = Math.max(realScore || 0, score);
    if (contains(lower, 'fake')) fakeScore = Math.max(fakeScore || 0, score);
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

  return { fakeScore, normalized, realScore };
}

async function runDeepfakeModel(modelKey, upload) {
  const model = DEEPFAKE_MODELS[modelKey];
  const result = await hfBinaryInference(model.provider, model.hf_model, upload.buffer, upload.mimeType);
  if (!result.ok) {
    throw new HttpError(502, 'Deepfake model inference failed.', {
      code: 'MODEL_ERROR',
      status: result.status,
    });
  }

  const scores = flattenScores(result.json);
  if (!scores.length) {
    throw new HttpError(502, 'The deepfake model returned an unexpected response.', { code: 'MODEL_ERROR' });
  }

  const { fakeScore, normalized, realScore } = normalizeDeepfakeScores(scores);
  const label = fakeScore >= realScore ? 'Fake' : 'Real';
  const confidence = Math.max(fakeScore, realScore);
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
      risk_level: riskFromScore(roundedFakeScore),
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

async function runDeepfakeDetection({ upload, modelKey, scanId = null, context = null, metadata = {}, createdAt = new Date().toISOString() }) {
  const fallbackKey = modelKey === 'prism' ? 'pixel' : 'prism';
  const modelOrder = [...new Set([modelKey, fallbackKey])];
  const modelRuns = [];
  let lastError = null;

  for (const key of modelOrder) {
    const started = Date.now();
    try {
      const payload = await runDeepfakeModel(key, upload);
      modelRuns.push({
        model_key: key,
        provider: DEEPFAKE_MODELS[key].provider,
        provider_model: DEEPFAKE_MODELS[key].hf_model,
        status: 'completed',
        latency_ms: Date.now() - started,
      });
      if (key !== modelKey) {
        payload.model.fallback_from = modelKey;
        payload.model.fallback_used = true;
      }
      return {
        payload: finalizeDeepfakePayload(payload, { scanId, context, metadata, createdAt }),
        modelRuns,
      };
    } catch (error) {
      modelRuns.push({
        model_key: key,
        provider: DEEPFAKE_MODELS[key].provider,
        provider_model: DEEPFAKE_MODELS[key].hf_model,
        status: 'failed',
        latency_ms: Date.now() - started,
        error_message: error.message,
      });
      lastError = error;
    }
  }

  throw lastError || new HttpError(502, 'Deepfake analysis failed.', { code: 'MODEL_ERROR' });
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
  return { legitimate: legitimate / total, normalized, phishing: phishing / total };
}

async function runMailGuard(text) {
  const modelKey = 'mailguard';
  const model = PHISHING_MODELS[modelKey];
  const result = await hfJsonInference(model.provider, model.hf_model, {
    inputs: text,
    options: { wait_for_model: true },
  }, 25000);

  if (!result.ok) {
    throw new HttpError(502, 'Phishing classifier failed.', { code: 'MODEL_ERROR', status: result.status });
  }

  const scores = flattenScores(result.json);
  if (!scores.length) {
    throw new HttpError(502, 'The phishing classifier returned an unexpected response.', { code: 'MODEL_ERROR' });
  }

  const { legitimate, normalized, phishing } = normalizeMailGuard(scores);
  const label = phishing >= legitimate ? 'Phishing' : 'Legitimate';
  const confidence = Math.max(phishing, legitimate);
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
      risk_level: riskFromScore(roundedPhishing),
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
    throw new HttpError(502, 'Cortex inference failed.', { code: 'MODEL_ERROR', status: result.status });
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
      risk_level: normalizeRiskLevel(parsed.risk_level || (label === 'Phishing' ? 'High' : 'Low')),
      confidence_band: confidenceBand(confidence),
      explanation: String(parsed.explanation || 'Cortex completed the phishing analysis.'),
      indicators: Array.isArray(parsed.indicators) ? parsed.indicators : [parsed.indicators].filter(Boolean),
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
    [0.2, /\b(verify|confirm|update|restore|unlock|suspend(?:ed)?|limited|restricted)\b/, 'Uses account-action language often seen in credential theft attempts.'],
    [0.18, /\b(urgent|immediately|within\s+\d+\s+(hours?|days?)|final notice|act now)\b/, 'Creates urgency or pressure to act quickly.'],
    [0.18, /\b(password|passcode|otp|2fa|security code|login|sign in|bank|wallet|payment)\b/, 'References sensitive account, payment, or authentication details.'],
    [0.16, /(https?:\/\/|www\.|bit\.ly|tinyurl|t\.co|shorturl|rebrand\.ly)/, 'Contains a link or shortened URL that should be verified before opening.'],
    [0.14, /\b(prize|winner|refund|invoice|payment failed|delivery failed|gift card|crypto)\b/, 'Uses common scam or lure wording.'],
    [0.12, /\b(click here|open attachment|download|scan qr|re-login|validate your account)\b/, 'Asks for a risky follow-up action.'],
  ];

  for (const [weight, pattern, indicator] of checks) {
    if (pattern.test(lower)) {
      phishing += weight;
      indicators.push(indicator);
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
      risk_level: riskFromScore(roundedPhishing),
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

function finalizePhishingPayload(payload, { text, scanId = null, context = null, createdAt = new Date().toISOString() } = {}) {
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
  if (band === 'Weak') result.summary += ' The model confidence is weak, so manual review is recommended.';
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
  if (context?.organization?.id) {
    payload.scan = {
      id: scanId,
      persisted: Boolean(scanId),
      organization_id: context.organization.id,
    };
  }
  payload.report_payload = reportPayload(scanId, 'phishing', payload, createdAt, PHISHING_DISCLAIMER);
  return payload;
}

function linkReportPayload(scanId, payload, createdAt) {
  return {
    scan_id: scanId,
    scan_type: 'link',
    created_at: createdAt,
    model: {
      key: payload.model.key,
      name: payload.model.name,
      hf_model: payload.model.hf_model,
      fallback_used: Boolean(payload.model.fallback_used || payload.model.fallback_from),
      ...(payload.model.fallback_from ? { fallback_from: payload.model.fallback_from } : {}),
    },
    result: payload.result,
    scores: payload.scores || [],
    report: {
      title: 'VeriTrust Link Intelligence Report',
      disclaimer: 'AI-assisted result. Not legal, forensic, cybersecurity, or final proof.',
      exportable: true,
    },
  };
}

function finalizeLinkPayload(payload, { scanId = null, context = null, createdAt = new Date().toISOString() } = {}) {
  payload.scan_id = scanId;
  payload.scan_type = 'link';
  payload.created_at = createdAt;
  payload.type = 'link';
  payload.model.fallback_used = Boolean(payload.model.fallback_used || payload.model.fallback_from);
  payload.report = {
    title: 'VeriTrust Link Intelligence Report',
    disclaimer: 'AI-assisted result. Not legal, forensic, cybersecurity, or final proof.',
    exportable: true,
  };
  if (context?.organization?.id) {
    payload.scan = {
      id: scanId,
      persisted: Boolean(scanId),
      organization_id: context.organization.id,
    };
  }
  payload.report_payload = linkReportPayload(scanId, payload, createdAt);
  return payload;
}

async function runLinkModel(modelKey, normalizedUrl, ruleAnalysis, contextText = '') {
  const model = LINK_MODELS[modelKey] || LINK_MODELS[DEFAULT_LINK_MODEL];
  if (model.locked || model.comingSoon || !model.hfModel || !model.provider) {
    throw new HttpError(400, `${model.name} is locked and coming soon.`, { code: 'INVALID_MODEL' });
  }
  const result = await hfJsonInference(model.provider, model.hfModel, {
    inputs: normalizedUrl,
  }, 25000);

  if (!result.ok) {
    throw new HttpError(502, 'Link model inference failed.', { code: 'MODEL_ERROR', status: result.status });
  }

  const normalizer = modelKey === 'sentinel' ? normalizeSentinelOutput : normalizeSwiftOutput;
  const normalized = normalizer(result.json);
  if (!normalized.scores.length) {
    throw new HttpError(502, 'The link classifier returned an unexpected response.', { code: 'MODEL_ERROR' });
  }

  const modelMeta = {
    key: model.key,
    name: model.name,
    hf_model: model.hfModel,
    fallback_used: false,
  };
  const linkResult = buildLinkResult({
    url: normalizedUrl,
    context: contextText,
    modelKey,
    modelOutput: result.json,
    ruleAnalysis,
    modelMeta,
  });

  return {
    ok: true,
    type: 'link',
    model: modelMeta,
    result: linkResult,
    scores: normalized.scores,
  };
}

function runLocalLinkFallback(normalizedUrl, ruleAnalysis, selectedModelKey) {
  const model = LINK_MODELS[DEFAULT_LINK_MODEL];
  const ruleScore = scoreUrlRules(ruleAnalysis?.indicators || []);
  const selectedModel = LINK_MODELS[selectedModelKey] || model;
  const fallbackScores = [
    scoreItem('benign', Math.max(0.04, 1 - ruleScore)),
    scoreItem('phishing', ruleScore),
  ];
  const modelOutput = fallbackScores;
  const modelMeta = {
    key: model.key,
    name: model.name,
    hf_model: model.hfModel,
    fallback_used: true,
    fallback_from: selectedModelKey,
    fallback_from_name: selectedModel.name,
    fallback_reason: 'Hosted Hugging Face inference was unavailable; URL pattern fallback was used.',
    inference_mode: 'url_pattern_fallback',
    provider_status: 'unavailable',
  };
  const payload = {
    ok: true,
    type: 'link',
    model: modelMeta,
    result: buildLinkResult({
      url: normalizedUrl,
      modelKey: DEFAULT_LINK_MODEL,
      modelOutput,
      ruleAnalysis,
      modelMeta,
    }),
    scores: fallbackScores,
  };
  payload.result.summary = ruleAnalysis.indicators.length
    ? payload.result.summary
    : 'No strong URL risk indicators were found. The live model was unavailable, so this result is based on URL pattern analysis.';
  payload.result.disclaimer = LINK_DISCLAIMER;
  return payload;
}

async function runLinkDetection({ url, text, context: contextText = '', modelKey = DEFAULT_LINK_MODEL, scanId = null, context = null, createdAt = new Date().toISOString() }) {
  const validated = validateLinkInput({ url, text, context: contextText });
  const ruleAnalysis = analyzeUrlRules(validated.url, validated.context);
  ruleAnalysis.extracted.urls_found = validated.urls_found.length ? validated.urls_found : ruleAnalysis.extracted.urls_found;

  const requestedKey = modelKey || DEFAULT_LINK_MODEL;
  const modelOrder = requestedKey === 'sentinel' ? ['sentinel', 'swift'] : ['swift'];
  const modelRuns = [];
  let lastError = null;

  for (const key of modelOrder) {
    const started = Date.now();
    const model = LINK_MODELS[key];
    try {
      const payload = await runLinkModel(key, validated.url, ruleAnalysis, validated.context);
      if (key !== requestedKey) {
        payload.model.fallback_from = requestedKey;
        payload.model.fallback_used = true;
        payload.result.model_meta = {
          key: payload.model.key,
          name: payload.model.name,
          fallback_used: true,
          fallback_from: requestedKey,
        };
      }
      modelRuns.push({
        model_key: key,
        provider: model.provider,
        provider_model: model.hfModel,
        status: 'completed',
        latency_ms: Date.now() - started,
      });
      return {
        payload: finalizeLinkPayload(payload, { scanId, context, createdAt }),
        modelRuns,
        validated,
      };
    } catch (error) {
      lastError = error;
      modelRuns.push({
        model_key: key,
        provider: model.provider,
        provider_model: model.hfModel,
        status: 'failed',
        latency_ms: Date.now() - started,
        error_message: error.message,
      });
    }
  }

  const payload = runLocalLinkFallback(validated.url, ruleAnalysis, requestedKey);
  modelRuns.push({
    model_key: DEFAULT_LINK_MODEL,
    provider: 'local',
    provider_model: 'veritrust-link-url-pattern-review',
    status: 'completed',
    latency_ms: 0,
    request_metadata: {
      fallback_reason: (lastError && lastError.message) || 'Provider inference failed.',
    },
  });

  return {
    payload: finalizeLinkPayload(payload, { scanId, context, createdAt }),
    modelRuns,
    validated,
  };
}

async function runPhishingDetection({ text, modelKey, scanId = null, context = null, createdAt = new Date().toISOString() }) {
  const fallbackKey = modelKey === 'cortex' ? 'mailguard' : 'cortex';
  const modelOrder = [...new Set([modelKey, fallbackKey])];
  const modelRuns = [];
  let lastError = null;

  for (const key of modelOrder) {
    const started = Date.now();
    try {
      const payload = key === 'mailguard' ? await runMailGuard(text) : await runCortex(text);
      modelRuns.push({
        model_key: key,
        provider: PHISHING_MODELS[key].provider,
        provider_model: PHISHING_MODELS[key].hf_model,
        status: 'completed',
        latency_ms: Date.now() - started,
      });
      if (key !== modelKey) {
        payload.model.fallback_from = modelKey;
        payload.model.fallback_used = true;
      }
      return {
        payload: finalizePhishingPayload(payload, { text, scanId, context, createdAt }),
        modelRuns,
      };
    } catch (error) {
      modelRuns.push({
        model_key: key,
        provider: PHISHING_MODELS[key].provider,
        provider_model: PHISHING_MODELS[key].hf_model,
        status: 'failed',
        latency_ms: Date.now() - started,
        error_message: error.message,
      });
      lastError = error;
    }
  }

  const payload = runLocalPhishingFallback(text, modelKey);
  modelRuns.push({
    model_key: 'mailguard',
    provider: 'local',
    provider_model: 'veritrust-phishing-safety-review',
    status: 'completed',
    latency_ms: 0,
    request_metadata: {
      fallback_reason: (lastError && lastError.message) || 'Provider inference failed.',
    },
  });
  return {
    payload: finalizePhishingPayload(payload, { text, scanId, context, createdAt }),
    modelRuns,
  };
}

module.exports = {
  DEEPFAKE_DISCLAIMER,
  LINK_DISCLAIMER,
  LINK_MODELS,
  PHISHING_DISCLAIMER,
  externalModelKey,
  finalizeDeepfakePayload,
  finalizeLinkPayload,
  finalizePhishingPayload,
  runDeepfakeDetection,
  runLinkDetection,
  runPhishingDetection,
};
