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
const {
  completeScanRecord,
  createScanRecord,
  failScanRecord,
  getProfileContext,
  requireServiceRole,
  textHash,
} = require('../lib/supabase-server');

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
  });

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
  const riskLevel = phishing >= 0.75 ? 'High' : phishing >= 0.45 ? 'Medium' : 'Low';

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
      phishing_score: Number(phishing.toFixed(5)),
      legitimate_score: Number(legitimate.toFixed(5)),
      risk_level: riskLevel,
      explanation: label === 'Phishing'
        ? 'MailGuard found stronger phishing-related evidence.'
        : 'MailGuard found stronger legitimate-message evidence.',
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
      content: 'You are VeriTrust Cortex, a strict phishing detection analyst. Return only compact JSON with keys: label, confidence, risk_level, explanation, indicators. The label must be either Phishing or Legitimate. Confidence must be a number from 0 to 1.',
    },
    {
      role: 'user',
      content: `Analyze this message for phishing, smishing, scam, credential theft, impersonation, malicious links, urgency pressure, and financial fraud:\n\n${text}`,
    },
  ];

  const result = await hfChatCompletion(model.hf_model, messages);
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
  const riskLevel = String(parsed.risk_level || (label === 'Phishing' ? 'High' : 'Low'));
  const indicators = Array.isArray(parsed.indicators) ? parsed.indicators : [parsed.indicators].filter(Boolean);

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
      phishing_score: label === 'Phishing' ? Number(confidence.toFixed(5)) : Number((1 - confidence).toFixed(5)),
      legitimate_score: label === 'Legitimate' ? Number(confidence.toFixed(5)) : Number((1 - confidence).toFixed(5)),
      risk_level: riskLevel,
      explanation: String(parsed.explanation || 'Cortex completed the phishing analysis.'),
      indicators,
    },
  };
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'POST');
    requireServiceRole();

    const body = await parseJsonBody(req, 16000);
    const modelKey = String(body.model || 'mailguard').trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(PHISHING_MODELS, modelKey)) {
      throw new HttpError(400, 'Unknown phishing model.');
    }

    const text = String(body.text || '').trim();
    if (!text) {
      throw new HttpError(400, 'Paste an email, SMS, URL, or message to analyze.');
    }
    if (text.length > 12000) {
      throw new HttpError(400, 'Text payload is too long. Keep it under 12,000 characters.');
    }

    const context = await getProfileContext(req, body.org_id || null);
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

    const fallbackKey = modelKey === 'cortex' ? 'mailguard' : 'cortex';
    const modelOrder = [...new Set([modelKey, fallbackKey])];
    let lastError = null;
    const modelRuns = [];

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
          payload.result.explanation += ' The selected model was temporarily unavailable, so the backup model was used.';
        }
        await completeScanRecord(scanId, payload, modelRuns);
        payload.scan = {
          id: scanId,
          persisted: true,
          organization_id: context.organization.id,
        };
        sendJson(res, 200, payload);
        return;
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

    await failScanRecord(scanId, (lastError && lastError.message) || 'Phishing analysis failed.');
    throw lastError || new HttpError(502, 'Phishing analysis failed.');
  } catch (error) {
    handleApiError(res, error, 'Phishing analysis failed.');
  }
};
