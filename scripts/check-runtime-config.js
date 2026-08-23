const { getOptionalEnv, getOptionalEnvAliases } = require('../lib/config');
const { isModuleEnabled } = require('../lib/modules');
const { modelContractReadiness } = require('../lib/model-contracts');

const failures = [];
const warnings = [];

function present(name) {
  const configured = Boolean(getOptionalEnv(name, ''));
  if (!configured) failures.push(`${name} is missing`);
  return configured;
}

function minimumAliasLength(names, length) {
  const value = getOptionalEnvAliases(names, '');
  const label = names.join(' or ');
  if (!value) {
    failures.push(`${label} is missing`);
  } else if (Buffer.byteLength(value, 'utf8') < length) {
    failures.push(`${label} must be at least ${length} bytes`);
  }
}

for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) present(name);
if (!getOptionalEnv('HF_TOKEN', '') && !getOptionalEnv('HF_ACCESS_TOKEN', '')) failures.push('HF_TOKEN or HF_ACCESS_TOKEN is missing');

if (isModuleEnabled('phishing')) {
  for (const key of ['mailguard']) {
    const readiness = modelContractReadiness(key);
    if (!readiness.ready) {
      failures.push(readiness.code === 'MODEL_CONTRACT_MISSING_FOR_CONFIGURED_PATH'
        ? `HF_MODEL_CONTRACTS.${key} is missing even though its HF model repository is configured`
        : `HF_MODEL_CONTRACTS.${key} is not ready (${readiness.code})`);
    }
  }
  if (!modelContractReadiness('cortex').ready) warnings.push('Cortex is unavailable until a qualified cortex contract is configured');
}

if (isModuleEnabled('link') && !getOptionalEnv('HF_LINK_SWIFT_MODEL', '') && !modelContractReadiness('swift').ready) {
  failures.push('HF_LINK_SWIFT_MODEL or a qualified HF_MODEL_CONTRACTS.swift entry is missing');
}
if (isModuleEnabled('link') && isModuleEnabled('gateway') && !modelContractReadiness('swift').ready) {
  warnings.push('Gateway Link Intelligence requires a qualified database swift row; HF_LINK_SWIFT_MODEL alone is not a Gateway contract');
}

if (isModuleEnabled('gateway')) {
  minimumAliasLength(['VERITRUST_CONTENT_HMAC_KEY', 'CONTENT_HMAC'], 32);
  minimumAliasLength(['VERITRUST_GATEWAY_DISPATCH_SECRET', 'DISPATCH'], 32);
  minimumAliasLength(['VERITRUST_WEBHOOK_ENCRYPTION_KEY', 'WEBHOOK_ENCRYPTION'], 32);
  warnings.push('Database gateway_model_versions rows and Supabase migrations must also be verified against the deployed project');
}

const report = {
  ok: failures.length === 0,
  failures,
  warnings,
  modules: {
    phishing: isModuleEnabled('phishing'),
    deepfake: isModuleEnabled('deepfake'),
    link: isModuleEnabled('link'),
    gateway: isModuleEnabled('gateway'),
  },
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
