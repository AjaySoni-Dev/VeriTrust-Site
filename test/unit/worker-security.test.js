const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const gateway = require('../../api/gateway');
const {
  hasDispatchSignatureHeaders,
  signingMessage,
  verifyDispatchSignature,
} = require('../../lib/gateway/worker-auth');

function responseRecorder() {
  return {
    headers: {},
    statusCode: 0,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = value; },
  };
}

test('unsigned public worker requests are rejected before worker execution', async () => {
  const req = {
    method: 'POST',
    url: '/api/gateway?resource=worker',
    headers: { 'content-type': 'application/json' },
    body: { source: 'manual' },
  };
  const res = responseRecorder();

  await gateway(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body).error.code, 'UNAUTHORIZED');
});

test('dispatch signature envelope accepts a valid signed request', () => {
  const secret = 'dispatch-test-secret';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const dispatch = { source: 'manual', queue: null, jobId: null };
  const signature = `v1=${crypto.createHmac('sha256', secret)
    .update(signingMessage(dispatch, timestamp, nonce), 'utf8')
    .digest('hex')}`;
  const req = { headers: {
    'x-veritrust-dispatch-timestamp': timestamp,
    'x-veritrust-dispatch-nonce': nonce,
    'x-veritrust-dispatch-signature': signature,
  } };

  assert.equal(hasDispatchSignatureHeaders(req), true);
  assert.equal(verifyDispatchSignature(req, secret, dispatch), true);
});
