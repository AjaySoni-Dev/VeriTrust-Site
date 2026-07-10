const test = require('node:test');
const assert = require('node:assert/strict');

global.location = { origin: 'https://veritrust.example' };
const { validateRuntimeConfig } = require('../assets/js/core/config-client.js');

function validConfig() {
  return {
    schemaVersion: '1', maxImageBytes: 4194304, modelCatalogVersion: 'v1', buildId: 'test',
    features: { billing: false, externalApi: false, preprocessing: false },
    preprocessing: { enabled: false, providerName: '', consentVersion: '' },
    api: { health: '/api/health', session: '/api/session', scans: '/api/scans', apiKeys: '/api/api-keys', deepfake: '/api/deepfake', phishing: '/api/phishing', linkCheck: '/api/link-check' },
  };
}

test('VT-066 runtime config accepts only approved same-origin routes', () => {
  const output = validateRuntimeConfig(validConfig());
  assert.equal(output.api.session, '/api/session');
  const malicious = validConfig();
  malicious.api.session = 'https://evil.example/session';
  assert.throws(() => validateRuntimeConfig(malicious), /same-origin|invalid/i);
});

test('VT-098 runtime config rejects unknown keys and unsafe limits', () => {
  assert.throws(() => validateRuntimeConfig({ ...validConfig(), surprise: true }), /unknown/i);
  assert.throws(() => validateRuntimeConfig({ ...validConfig(), maxImageBytes: -1 }), /limit/i);
});

