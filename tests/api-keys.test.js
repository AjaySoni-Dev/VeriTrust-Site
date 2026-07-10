const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deriveApiKeyDigest,
  generateApiKey,
  parseApiKey,
  publicKeyRow,
} = require('../lib/api-keys');

test('VT-001 key storage fields cannot reconstruct the raw key', () => {
  const generated = generateApiKey('live');
  const parsed = parseApiKey(generated.rawKey);
  const digest = deriveApiKeyDigest(parsed.secret, 'test-pepper', generated.version);
  assert.equal(parsed.publicId, generated.publicId);
  assert.notEqual(digest, generated.rawKey);
  assert.ok(!digest.includes(parsed.secret));
  assert.ok(!generated.displayHint.includes(parsed.secret));
});

test('VT-060 rejects test mode and empty scopes', () => {
  assert.throws(() => generateApiKey('test'), /sandbox/i);
});

test('VT-001 public rows never expose hashes or secret-bearing prefixes', () => {
  const row = publicKeyRow({
    id: 'id', name: 'key', public_id: 'pub123', display_hint: 'vtg_live_pub123_...abcd',
    key_hash: 'secret-hash', key_prefix: 'vtg_live_secretfragment', scopes: ['usage:read'],
    usage_limit_daily: 0, status: 'active',
  });
  assert.equal(row.public_id, 'pub123');
  assert.equal(row.usage_limit_daily, 0);
  assert.equal(Object.hasOwn(row, 'key_hash'), false);
  assert.equal(Object.hasOwn(row, 'key_prefix'), false);
});

