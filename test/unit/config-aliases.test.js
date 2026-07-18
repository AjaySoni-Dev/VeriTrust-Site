const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanEnvValue, serverConfig } = require('../../lib/config');

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try { callback(); } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('Vercel short security variable names are supported', () => {
  withEnvironment({
    VERITRUST_ADMIN_SECRET: undefined,
    VERITRUST_CONTENT_HMAC_KEY: undefined,
    VERITRUST_GATEWAY_DISPATCH_SECRET: undefined,
    VERITRUST_WEBHOOK_ENCRYPTION_KEY: undefined,
    ADMIN: 'admin-short-name',
    CONTENT_HMAC: 'content-short-name',
    DISPATCH: 'dispatch-short-name',
    WEBHOOK_ENCRYPTION: 'webhook-short-name',
  }, () => {
    assert.equal(serverConfig.adminSecret, 'admin-short-name');
    assert.equal(serverConfig.gatewayContentHmacKey, 'content-short-name');
    assert.equal(serverConfig.gatewayDispatchSecret, 'dispatch-short-name');
    assert.equal(serverConfig.gatewayWebhookEncryptionKey, 'webhook-short-name');
  });
});

test('canonical names take precedence when both forms exist', () => {
  withEnvironment({
    VERITRUST_ADMIN_SECRET: 'canonical-admin',
    VERITRUST_CONTENT_HMAC_KEY: 'canonical-content',
    VERITRUST_GATEWAY_DISPATCH_SECRET: 'canonical-dispatch',
    VERITRUST_WEBHOOK_ENCRYPTION_KEY: 'canonical-webhook',
    ADMIN: 'short-admin',
    CONTENT_HMAC: 'short-content',
    DISPATCH: 'short-dispatch',
    WEBHOOK_ENCRYPTION: 'short-webhook',
  }, () => {
    assert.equal(serverConfig.adminSecret, 'canonical-admin');
    assert.equal(serverConfig.gatewayContentHmacKey, 'canonical-content');
    assert.equal(serverConfig.gatewayDispatchSecret, 'canonical-dispatch');
    assert.equal(serverConfig.gatewayWebhookEncryptionKey, 'canonical-webhook');
  });
});

test('identical credentials pasted on repeated lines collapse safely', () => {
  const token = 'eyJheader.payload.signature';
  assert.equal(cleanEnvValue(`${token}\n${token}\n${token}`), token);
  assert.equal(cleanEnvValue(`${token}\ndifferent`), `${token}\ndifferent`);
});
