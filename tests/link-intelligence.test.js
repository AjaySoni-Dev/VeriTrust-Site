const test = require('node:test');
const assert = require('node:assert/strict');

const { baseDomain, normalizeSwiftOutput } = require('../lib/link-intelligence');

test('VT-017 uses the public suffix list for registrable domains', () => {
  assert.equal(baseDomain('www.sbi.co.in'), 'sbi.co.in');
  assert.equal(baseDomain('login.example.co.uk'), 'example.co.uk');
});

test('VT-021 unknown model labels fail closed', () => {
  assert.throws(() => normalizeSwiftOutput([{ label: 'totally_unknown', score: 0.99 }]), /contract/i);
});

