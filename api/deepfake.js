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
  const riskLevel = fakeScore >= 0.75 ? 'High' : fakeScore >= 0.45 ? 'Medium' : 'Low';

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
      confidence: Number(confidence.toFixed(5)),
      fake_score: Number(fakeScore.toFixed(5)),
      real_score: Number(realScore.toFixed(5)),
      risk_level: riskLevel,
      explanation: label === 'Fake'
        ? 'The model found stronger synthetic-media evidence than real-media evidence.'
        : 'The model found stronger real-media evidence than synthetic-media evidence.',
    },
    scores: normalized,
  };
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    requireMethod(req, 'POST');

    const { fields, files } = await parseMultipart(req);
    const modelKey = String(fields.model || 'pixel').trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(DEEPFAKE_MODELS, modelKey)) {
      throw new HttpError(400, 'Unknown deepfake model.');
    }

    const upload = files.image;
    if (!upload || !upload.buffer || upload.buffer.length === 0) {
      throw new HttpError(400, 'Upload an image using the image field.');
    }

    const fallbackKey = modelKey === 'prism' ? 'pixel' : 'prism';
    const modelOrder = [...new Set([modelKey, fallbackKey])];
    let lastError = null;

    for (const key of modelOrder) {
      try {
        const payload = await runDeepfakeModel(key, upload);
        if (key !== modelKey) {
          payload.model.fallback_from = modelKey;
          payload.result.explanation += ' The selected model was temporarily unavailable, so the backup model was used.';
        }
        sendJson(res, 200, payload);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new HttpError(502, 'Deepfake analysis failed.');
  } catch (error) {
    handleApiError(res, error, 'Deepfake analysis failed.');
  }
};
