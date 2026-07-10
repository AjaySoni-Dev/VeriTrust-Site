const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeConfiguredOrigin,
  redactValue,
  safeReturnPath,
  validateRequestId,
} = require('../lib/security');

test('VT-005 rejects off-origin and encoded redirect attacks', () => {
  const origin = 'https://veritrust.example';
  const attacks = [
    'https://evil.example/',
    '//evil.example/path',
    'javascript:alert(1)',
    'data:text/html,pwned',
    '/\\evil.example',
    '/%0d%0aLocation:https://evil.example',
    'https://user:pass@veritrust.example/dashboard',
  ];
  for (const value of attacks) assert.equal(safeReturnPath(value, origin), '/dashboard');
  assert.equal(safeReturnPath('/phishing?source=nav', origin), '/phishing?source=nav');
});

test('VT-030 normalizes only exact configured origins', () => {
  assert.equal(normalizeConfiguredOrigin('https://Example.com/'), 'https://example.com');
  assert.throws(() => normalizeConfiguredOrigin('https://example.com/path'));
  assert.throws(() => normalizeConfiguredOrigin('null'));
});

test('VT-092 redacts nested credentials and personal data', () => {
  const redacted = redactValue({
    authorization: 'Bearer secret',
    email: 'person@example.com',
    nested: { api_key: 'vtg_live_public_secret', message: 'private content' },
  });
  assert.equal(redacted.authorization, '[REDACTED]');
  assert.equal(redacted.email, '[REDACTED]');
  assert.equal(redacted.nested.api_key, '[REDACTED]');
  assert.equal(redacted.nested.message, '[REDACTED]');
});

test('VT-108 accepts bounded request IDs only', () => {
  assert.equal(validateRequestId('vt_req_ABC-123'), 'vt_req_ABC-123');
  assert.equal(validateRequestId('bad id\r\nx: injected'), null);
  assert.equal(validateRequestId('x'.repeat(200)), null);
});

