const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { verifyStripeSignature } = require('../lib/billing');

test('VT-008 accepts any matching v1 signature within tolerance', () => {
  const body = '{"id":"evt_test"}';
  const now = 1_800_000_000;
  const secret = 'whsec_test';
  const valid = crypto.createHmac('sha256', secret).update(`${now}.${body}`).digest('hex');
  assert.doesNotThrow(() => verifyStripeSignature(body, `t=${now},v1=deadbeef,v1=${valid}`, {
    secrets: [secret], nowSeconds: now, toleranceSeconds: 300,
  }));
});

test('VT-008 rejects stale webhook signatures', () => {
  const body = '{}';
  const timestamp = 1_700_000_000;
  const secret = 'whsec_test';
  const valid = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  assert.throws(() => verifyStripeSignature(body, `t=${timestamp},v1=${valid}`, {
    secrets: [secret], nowSeconds: timestamp + 301, toleranceSeconds: 300,
  }), /expired/i);
});

