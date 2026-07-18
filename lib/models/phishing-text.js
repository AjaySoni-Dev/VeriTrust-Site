const { runPhishingDetection } = require('../detection-service');

function confidenceBand(value) {
  const normalized = String(value || '').toLowerCase();
  if (['strong', 'high'].includes(normalized)) return 'high';
  if (['moderate', 'medium'].includes(normalized)) return 'medium';
  if (['weak', 'low'].includes(normalized)) return 'low';
  return 'unknown';
}

function verdictForScore(score) {
  if (score >= 0.75) return 'malicious';
  if (score >= 0.45) return 'suspicious';
  return 'safe';
}

function reasonCodes(indicators) {
  return [...new Set((indicators || []).map((item) => {
    const type = typeof item === 'object' ? item.type : null;
    return type ? `PHISHING_${String(type).toUpperCase()}` : null;
  }).filter(Boolean))];
}

async function execute(artifact, options = {}) {
  const started = Date.now();
  try {
    const result = await runPhishingDetection({
      text: artifact.content,
      modelKey: options.modelKey || 'mailguard',
      allowProviderFallback: Boolean(options.allowProviderFallback),
      allowLocalFallback: false,
      timeoutMs: options.timeoutMs,
    });
    const payload = result.payload;
    const score = Number(payload.result.phishing_score);
    const indicators = Array.isArray(payload.result.indicators) ? payload.result.indicators : [];
    return {
      attempts: result.modelRuns || [],
      evidence: {
        artifactId: artifact.id,
        kind: 'phishing',
        modelKey: payload.model.key,
        status: 'completed',
        score,
        verdict: verdictForScore(score),
        confidence: confidenceBand(payload.result.confidence_band),
        confidenceValue: Number(payload.result.confidence),
        indicators,
        reasonCodes: reasonCodes(indicators),
        degraded: Boolean(payload.model.fallback_used),
        required: options.required !== false,
        latencyMs: Date.now() - started,
        rawResponseRedacted: {
          label: payload.result.label,
          model_score: payload.result.model_score,
          rule_score: payload.result.rule_score,
        },
      },
    };
  } catch (error) {
    return {
      attempts: error.modelRuns || [],
      evidence: {
        artifactId: artifact.id,
        kind: 'phishing',
        modelKey: options.modelKey || 'mailguard',
        status: error.name === 'TimeoutError' ? 'timed_out' : 'failed',
        score: null,
        verdict: 'unknown',
        confidence: 'unknown',
        confidenceValue: null,
        indicators: [],
        reasonCodes: ['PHISHING_MODEL_UNAVAILABLE'],
        degraded: true,
        required: options.required !== false,
        latencyMs: Date.now() - started,
        errorCode: error.code || 'MODEL_ERROR',
        rawResponseRedacted: { error_code: error.code || 'MODEL_ERROR' },
      },
    };
  }
}

module.exports = {
  execute,
  supports(artifact) { return artifact?.type === 'text'; },
};
