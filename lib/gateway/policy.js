const crypto = require('crypto');
const { CORRELATION_VERSION, isPlainObject } = require('./contracts');
const { stableStringify } = require('./idempotency');

const TOP_LEVEL_KEYS = Object.freeze([
  'actions',
  'routing',
  'timeouts',
  'failure_modes',
  'retention',
  'enforcement',
  'webhooks',
  'model_rollout',
  'correlation_version',
]);
const ACTION_KEYS = Object.freeze(['allow_below', 'warn_below', 'manual_review_below', 'quarantine_below', 'block_at_or_above']);
const TIMEOUT_KEYS = Object.freeze(['overall_ms', 'synchronous_ms', 'per_model_ms']);
const FAILURE_MODES = Object.freeze(['allow', 'warn', 'hold', 'block']);

class PolicyValidationError extends Error {
  constructor(errors) {
    super('Gateway policy is invalid.');
    this.name = 'PolicyValidationError';
    this.status = 400;
    this.code = 'GATEWAY_POLICY_INVALID';
    this.errors = errors;
    this.extra = { code: this.code, meta: { errors } };
  }
}

function unknownKeys(value, allowed, path, errors) {
  if (!isPlainObject(value)) {
    errors.push({ path, code: 'OBJECT_REQUIRED' });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push({ path: `${path}.${key}`, code: 'UNKNOWN_KEY' });
  }
}

function numberInRange(value, path, errors, min, max) {
  if (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) {
    errors.push({ path, code: 'NUMBER_OUT_OF_RANGE', min, max });
    return null;
  }
  return Number(value);
}

function validatePolicy(document) {
  const errors = [];
  unknownKeys(document, TOP_LEVEL_KEYS, '$', errors);
  if (!isPlainObject(document)) return errors;
  for (const key of TOP_LEVEL_KEYS.filter((name) => name !== 'correlation_version')) {
    if (!isPlainObject(document[key])) errors.push({ path: `$.${key}`, code: 'OBJECT_REQUIRED' });
  }

  if (isPlainObject(document.actions)) {
    unknownKeys(document.actions, ACTION_KEYS, '$.actions', errors);
    const thresholds = ACTION_KEYS.map((key) => numberInRange(document.actions[key], `$.actions.${key}`, errors, 0, 1));
    if (thresholds.every((value) => value !== null)) {
      for (let index = 1; index < thresholds.length; index += 1) {
        if (thresholds[index] < thresholds[index - 1]) errors.push({ path: '$.actions', code: 'THRESHOLDS_NOT_MONOTONIC' });
      }
      if (thresholds[3] !== thresholds[4]) errors.push({ path: '$.actions', code: 'QUARANTINE_BLOCK_BOUNDARY_GAP' });
    }
  }

  if (isPlainObject(document.timeouts)) {
    unknownKeys(document.timeouts, TIMEOUT_KEYS, '$.timeouts', errors);
    const overall = numberInRange(document.timeouts.overall_ms, '$.timeouts.overall_ms', errors, 1000, 300000);
    const synchronous = numberInRange(document.timeouts.synchronous_ms, '$.timeouts.synchronous_ms', errors, 250, 60000);
    const perModel = numberInRange(document.timeouts.per_model_ms, '$.timeouts.per_model_ms', errors, 100, 300000);
    if (overall && synchronous && synchronous > overall) errors.push({ path: '$.timeouts.synchronous_ms', code: 'EXCEEDS_OVERALL_TIMEOUT' });
    if (overall && perModel && perModel > overall) errors.push({ path: '$.timeouts.per_model_ms', code: 'EXCEEDS_OVERALL_TIMEOUT' });
  }

  if (isPlainObject(document.failure_modes)) {
    for (const key of ['interactive_text_url', 'uploads', 'critical_required_model']) {
      if (!FAILURE_MODES.includes(document.failure_modes[key])) errors.push({ path: `$.failure_modes.${key}`, code: 'FAILURE_MODE_INVALID' });
    }
  }

  if (isPlainObject(document.enforcement)) {
    if (!['advisory', 'enforcing'].includes(document.enforcement.mode)) errors.push({ path: '$.enforcement.mode', code: 'MODE_INVALID' });
    if (typeof document.enforcement.automatic_block !== 'boolean') errors.push({ path: '$.enforcement.automatic_block', code: 'BOOLEAN_REQUIRED' });
    if (!['warn', 'manual_review', 'quarantine', 'hold'].includes(document.enforcement.convert_block_to)) {
      errors.push({ path: '$.enforcement.convert_block_to', code: 'ACTION_INVALID' });
    }
    if (!Array.isArray(document.enforcement.require_review_for)) errors.push({ path: '$.enforcement.require_review_for', code: 'ARRAY_REQUIRED' });
  }

  if (document.correlation_version !== CORRELATION_VERSION) {
    errors.push({ path: '$.correlation_version', code: 'CORRELATION_VERSION_UNSUPPORTED' });
  }
  return errors;
}

function compilePolicy(document) {
  const errors = validatePolicy(document);
  if (errors.length) throw new PolicyValidationError(errors);
  const compiled = JSON.parse(JSON.stringify(document));
  compiled.actions = Object.fromEntries(Object.entries(compiled.actions).map(([key, value]) => [key, Number(value)]));
  compiled.timeouts = Object.fromEntries(Object.entries(compiled.timeouts).map(([key, value]) => [key, Number(value)]));
  compiled.checksum = crypto.createHash('sha256').update(stableStringify(document), 'utf8').digest('hex');
  return Object.freeze(compiled);
}

function recommendationForScore(score, policy) {
  const value = Math.max(0, Math.min(1, Number(score) || 0));
  const actions = policy.actions;
  if (value < actions.allow_below) return 'allow';
  if (value < actions.warn_below) return 'warn';
  if (value < actions.manual_review_below) return 'manual_review';
  if (value < actions.block_at_or_above) return 'quarantine';
  return 'block';
}

function applyEnforcementGuard(recommendation, policy, reasonCodes = []) {
  if (recommendation !== 'block') return { recommendation, reasonCodes };
  if (policy.enforcement.mode === 'enforcing' && policy.enforcement.automatic_block) return { recommendation, reasonCodes };
  return {
    recommendation: policy.enforcement.convert_block_to || 'quarantine',
    reasonCodes: [...new Set([...reasonCodes, 'AUTOMATIC_BLOCK_DISABLED'])],
  };
}

module.exports = {
  ACTION_KEYS,
  PolicyValidationError,
  applyEnforcementGuard,
  compilePolicy,
  recommendationForScore,
  validatePolicy,
};
