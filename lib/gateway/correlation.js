const { CORRELATION_VERSION } = require('./contracts');
const { applyEnforcementGuard, recommendationForScore } = require('./policy');

const SEVERITY_SCORE = Object.freeze({ low: 0.1, medium: 0.45, high: 0.75, critical: 0.9, unknown: 0.5 });
const ACTION_PRIORITY = Object.freeze({ allow: 0, warn: 1, manual_review: 2, hold: 3, quarantine: 4, block: 5 });

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function scoreSeverity(score) {
  const value = clamp01(score);
  if (value >= 0.9) return 'critical';
  if (value >= 0.75) return 'high';
  if (value >= 0.45) return 'medium';
  return 'low';
}

function maxAction(left, right) {
  return ACTION_PRIORITY[right] > ACTION_PRIORITY[left] ? right : left;
}

function normalizeEvidence(evidence) {
  const status = String(evidence.status || 'failed');
  const score = status === 'completed' && Number.isFinite(Number(evidence.score)) ? clamp01(evidence.score) : null;
  return {
    ...evidence,
    id: evidence.id || null,
    kind: String(evidence.kind || evidence.model || 'unknown'),
    status,
    score,
    verdict: String(evidence.verdict || 'unknown').toLowerCase(),
    confidence: String(evidence.confidence || 'unknown').toLowerCase(),
    reasonCodes: Array.isArray(evidence.reasonCodes) ? evidence.reasonCodes.map(String) : [],
    required: Boolean(evidence.required),
  };
}

function containsContext(context, names) {
  const values = new Set((context || []).map((value) => String(value).toLowerCase()));
  return names.some((name) => values.has(name));
}

function correlate(rawEvidence, policy, options = {}) {
  const evidence = rawEvidence.map(normalizeEvidence).sort((a, b) => {
    const left = `${a.kind}:${a.artifactId || ''}:${a.modelKey || ''}:${a.id || ''}`;
    const right = `${b.kind}:${b.artifactId || ''}:${b.modelKey || ''}:${b.id || ''}`;
    return left.localeCompare(right);
  });
  const completed = evidence.filter((item) => item.status === 'completed');
  const unresolved = evidence.filter((item) => ['pending', 'queued', 'leased', 'running'].includes(item.status));
  const requiredFailures = evidence.filter((item) => item.required && ['failed', 'timed_out', 'cancelled'].includes(item.status));
  const reasonCodes = new Set(completed.flatMap((item) => item.reasonCodes));
  let risk = completed.reduce((maximum, item) => Math.max(maximum, item.score), 0);
  let verdict = 'unknown';

  const maliciousLinks = completed.filter((item) => item.kind === 'link' && item.score >= 0.75 && ['malicious', 'suspicious'].includes(item.verdict));
  if (maliciousLinks.length) {
    risk = Math.max(risk, 0.75);
    reasonCodes.add('MALICIOUS_URL');
  }

  const phishing = completed.filter((item) => item.kind === 'phishing').reduce((maximum, item) => Math.max(maximum, item.score), 0);
  const link = completed.filter((item) => item.kind === 'link').reduce((maximum, item) => Math.max(maximum, item.score), 0);
  if (phishing >= 0.55 && link >= 0.45) {
    risk = Math.max(risk, Math.min(1, Math.max(phishing, link) + 0.12));
    reasonCodes.add('PHISHING_LINK_INTERACTION');
  }

  const manipulated = completed.some((item) => item.kind.startsWith('deepfake') && item.score >= 0.75);
  if (manipulated && containsContext(options.contextCategories, ['financial', 'credential', 'identity'])) {
    risk = Math.max(risk, 0.9);
    reasonCodes.add('MANIPULATED_MEDIA_CONSEQUENTIAL_CONTEXT');
  }

  if (risk >= 0.9) verdict = 'critical';
  else if (risk >= 0.75) verdict = 'high';
  else if (risk >= 0.45) verdict = 'medium';
  else if (completed.length) verdict = 'low';

  let failModeApplied = null;
  if (!completed.length && requiredFailures.length) risk = Math.max(risk, SEVERITY_SCORE.unknown);
  let recommendation = recommendationForScore(risk, policy);
  if (requiredFailures.length) {
    failModeApplied = policy.failure_modes.interactive_text_url;
    recommendation = maxAction(recommendation, failModeApplied);
    reasonCodes.add('REQUIRED_MODEL_UNAVAILABLE');
  }

  const guarded = applyEnforcementGuard(recommendation, policy, [...reasonCodes]);
  recommendation = guarded.recommendation;
  const finalReasons = [...new Set(guarded.reasonCodes)].sort();
  const degraded = requiredFailures.length > 0 || evidence.some((item) => item.degraded);
  const decisionState = unresolved.length ? 'preliminary' : 'final';
  const manualReviewRequired = ['manual_review', 'quarantine', 'block', 'hold'].includes(recommendation)
    || finalReasons.includes('MANIPULATED_MEDIA_CONSEQUENTIAL_CONTEXT');

  return {
    risk: Number(clamp01(risk).toFixed(6)),
    severity: scoreSeverity(risk),
    verdict,
    recommendation,
    decision_state: decisionState,
    reason_codes: finalReasons,
    evidence_ids: evidence.map((item) => item.id).filter(Boolean).sort(),
    correlation_version: CORRELATION_VERSION,
    fail_mode_applied: failModeApplied,
    manual_review_required: manualReviewRequired,
    degraded,
  };
}

module.exports = {
  correlate,
  scoreSeverity,
};
