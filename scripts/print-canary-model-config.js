const contracts = require('../config/hf-model-contracts.canary.json');

const values = {
  HF_PHISHING_MAILGUARD_MODEL: contracts.mailguard.repository_id,
  HF_LINK_SWIFT_MODEL: contracts.swift.repository_id,
  HF_MODEL_CONTRACTS: JSON.stringify(contracts),
};

console.log(JSON.stringify(values, null, 2));
