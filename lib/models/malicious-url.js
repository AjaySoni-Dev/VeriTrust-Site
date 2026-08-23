const { runLinkDetection, runLinkDetectionBatch } = require('../detection-service');

function confidenceBand(value) {
  const normalized = String(value || '').toLowerCase();
  if (['strong', 'high'].includes(normalized)) return 'high';
  if (['moderate', 'medium'].includes(normalized)) return 'medium';
  if (['weak', 'low'].includes(normalized)) return 'low';
  return 'unknown';
}

function verdictForResult(result) {
  const label = String(result.label || '').toLowerCase();
  if (['malicious', 'phishing'].includes(label) || Number(result.link_score) >= 0.75) return 'malicious';
  if (label === 'suspicious' || Number(result.link_score) >= 0.45) return 'suspicious';
  return 'safe';
}

async function execute(artifact, options = {}) {
  const started = Date.now();
  try {
    const result = await runLinkDetection({
      url: artifact.content,
      modelKey: options.modelKey || 'swift',
      allowProviderFallback: Boolean(options.allowProviderFallback),
      allowLocalFallback: false,
      timeoutMs: options.timeoutMs,
      modelContract: options.modelContract,
    });
    const payload = result.payload;
    const score = Number(payload.result.link_score);
    const indicators = Array.isArray(payload.result.indicators) ? payload.result.indicators : [];
    return {
      attempts: result.modelRuns || [],
      evidence: {
        artifactId: artifact.id,
        kind: 'link',
        modelKey: payload.model.key,
        status: 'completed',
        score,
        verdict: verdictForResult(payload.result),
        confidence: confidenceBand(payload.result.confidence_band),
        confidenceValue: Number(payload.result.confidence),
        indicators,
        reasonCodes: [...new Set(indicators.map((item) => item?.type ? `URL_${String(item.type).toUpperCase()}` : null).filter(Boolean))],
        degraded: Boolean(payload.model.fallback_used),
        required: options.required !== false,
        latencyMs: Date.now() - started,
        rawResponseRedacted: {
          label: payload.result.label,
          model_score: payload.result.model_score,
          rule_score: payload.result.rule_score,
          hostname: payload.result.extracted?.hostname || null,
          query_present: Boolean(payload.result.extracted?.query_present),
        },
      },
    };
  } catch (error) {
    return {
      attempts: error.modelRuns || [],
      evidence: {
        artifactId: artifact.id,
        kind: 'link',
        modelKey: options.modelKey || 'swift',
        status: error.name === 'TimeoutError' || /TIMEOUT/u.test(String(error.code || '')) ? 'timed_out' : 'failed',
        score: null,
        verdict: 'unknown',
        confidence: 'unknown',
        confidenceValue: null,
        indicators: [],
        reasonCodes: ['LINK_MODEL_UNAVAILABLE'],
        degraded: true,
        required: options.required !== false,
        latencyMs: Date.now() - started,
        errorCode: error.code || 'MODEL_ERROR',
        rawResponseRedacted: {
          error_code: error.code || 'MODEL_ERROR',
          upstream_status: Number(error?.extra?.status) || null,
        },
      },
    };
  }
}

async function executeBatch(artifacts, options = {}) {
  if (!Array.isArray(artifacts) || !artifacts.length) return [];
  const started = Date.now();
  try {
    const result = await runLinkDetectionBatch({
      items: artifacts.map((artifact) => ({ url: artifact.content })),
      modelKey: options.modelKey || 'swift',
      timeoutMs: options.timeoutMs,
      modelContract: options.modelContract,
    });
    return artifacts.map((artifact, index) => {
      const payload = result.payloads[index];
      const score = Number(payload.result.link_score);
      const indicators = Array.isArray(payload.result.indicators) ? payload.result.indicators : [];
      return {
        attempts: result.modelRuns || [],
        evidence: {
          artifactId: artifact.id,
          kind: 'link',
          modelKey: payload.model.key,
          status: 'completed',
          score,
          verdict: verdictForResult(payload.result),
          confidence: confidenceBand(payload.result.confidence_band),
          confidenceValue: Number(payload.result.confidence),
          indicators,
          reasonCodes: [...new Set(indicators.map((item) => item?.type ? `URL_${String(item.type).toUpperCase()}` : null).filter(Boolean))],
          degraded: Boolean(payload.model.fallback_used),
          required: options.required !== false,
          latencyMs: Date.now() - started,
          rawResponseRedacted: {
            label: payload.result.label,
            model_score: payload.result.model_score,
            rule_score: payload.result.rule_score,
            hostname: payload.result.extracted?.hostname || null,
            query_present: Boolean(payload.result.extracted?.query_present),
            batch_size: artifacts.length,
          },
        },
      };
    });
  } catch (error) {
    return artifacts.map((artifact) => ({
      attempts: error.modelRuns || [],
      evidence: {
        artifactId: artifact.id,
        kind: 'link',
        modelKey: options.modelKey || 'swift',
        status: error.name === 'TimeoutError' || /TIMEOUT/u.test(String(error.code || '')) ? 'timed_out' : 'failed',
        score: null,
        verdict: 'unknown',
        confidence: 'unknown',
        confidenceValue: null,
        indicators: [],
        reasonCodes: ['LINK_MODEL_UNAVAILABLE', error.code || 'MODEL_ERROR'],
        degraded: true,
        required: options.required !== false,
        latencyMs: Date.now() - started,
        errorCode: error.code || 'MODEL_ERROR',
        rawResponseRedacted: {
          error_code: error.code || 'MODEL_ERROR',
          upstream_status: Number(error?.extra?.status) || null,
          batch_size: artifacts.length,
        },
      },
    }));
  }
}

module.exports = {
  execute,
  executeBatch,
  supports(artifact) { return artifact?.type === 'url'; },
};
