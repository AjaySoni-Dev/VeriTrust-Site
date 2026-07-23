const assert = require('node:assert/strict');
const test = require('node:test');

const { getModelPath } = require('../../lib/config');
const { DEFAULT_SCOPES, scopesForContext } = require('../../lib/api-keys');
const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookie,
  setSessionCookies,
  trustedSiteOrigin,
} = require('../../lib/browser-session');
const { consumeRateLimit } = require('../../lib/rate-limit');
const { validateImageUpload } = require('../../lib/validators');
const { sendJson } = require('../../lib/veritrust-api');
const {
  hostMatchesPattern,
  validateWebhookUrl,
} = require('../../lib/gateway/webhooks');

function withEnv(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  const restore = () => {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  };
  try {
    const result = callback();
    if (result && typeof result.finally === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('Hugging Face model paths come from server environment variables', () => {
  withEnv({
    HF_DEEPFAKE_PIXEL_MODEL: 'private-owner/private-model',
    HF_MODEL_PATHS: undefined,
    HF_MODEL_PATH: undefined,
  }, () => {
    assert.equal(getModelPath('deepfake_pixel'), 'private-owner/private-model');
  });

  withEnv({
    HF_LINK_SWIFT_MODEL: undefined,
    HF_MODEL_PATHS: JSON.stringify({ link_swift: 'private-owner/link-model' }),
  }, () => {
    assert.equal(getModelPath('link_swift'), 'private-owner/link-model');
  });
});

test('invalid model paths are rejected before provider routing', () => {
  withEnv({
    HF_LINK_SWIFT_MODEL: 'https://attacker.example/model',
    HF_MODEL_PATHS: undefined,
  }, () => {
    assert.throws(() => getModelPath('link_swift'), /invalid value/i);
  });
});

test('image validation checks magic bytes as well as declared MIME type', () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(12),
  ]);
  assert.equal(validateImageUpload({
    buffer: png,
    mimeType: 'image/png',
    size: png.length,
  }).mimeType, 'image/png');

  assert.throws(() => validateImageUpload({
    buffer: Buffer.from('not an image'),
    mimeType: 'image/png',
    size: 12,
  }), (error) => error.code === 'IMAGE_CONTENT_MISMATCH');
});

test('JSON responses centrally redact provider model paths', () => {
  let body = '';
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name] = value; },
    end(value) { body = value; },
  };
  sendJson(response, 200, {
    ok: true,
    model: { key: 'pixel', hf_model: 'private/repository' },
    run: { provider_model: 'private/repository' },
  });
  assert.deepEqual(JSON.parse(body), { ok: true, model: { key: 'pixel' }, run: {} });
  assert.equal(headers['Cache-Control'], 'no-store');
});

test('production rate limiting fails closed without persistence configuration', async () => {
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }, async () => {
    await assert.rejects(
      consumeRateLimit({ req: { headers: {}, socket: {} }, endpoint: 'test' }),
      (error) => error.code === 'RATE_LIMIT_UNAVAILABLE' && error.status === 503
    );
  });
});

test('webhook destinations require approved DNS hosts and standard HTTPS', () => {
  assert.equal(hostMatchesPattern('hooks.example.edu', 'hooks.example.edu'), true);
  assert.equal(hostMatchesPattern('dept.hooks.example.edu', '*.hooks.example.edu'), true);
  assert.equal(hostMatchesPattern('hooks.example.edu', '*.hooks.example.edu'), false);

  withEnv({ VERITRUST_WEBHOOK_ALLOWED_HOSTS: 'hooks.example.edu' }, () => {
    assert.equal(validateWebhookUrl('https://hooks.example.edu/events'), 'https://hooks.example.edu/events');
    assert.throws(
      () => validateWebhookUrl('https://hooks.example.edu:8443/events'),
      (error) => error.code === 'WEBHOOK_PORT_DENIED'
    );
    assert.throws(
      () => validateWebhookUrl('https://other.example.edu/events'),
      (error) => error.code === 'WEBHOOK_HOST_NOT_ALLOWED'
    );
  });
});

test('browser sessions use HttpOnly SameSite cookies and are readable server-side', () => {
  withEnv({ NODE_ENV: 'production', VERCEL: '1' }, () => {
    let cookies = [];
    const response = {
      setHeader(name, value) {
        if (name === 'Set-Cookie') cookies = value;
      },
    };
    setSessionCookies(response, {
      access_token: 'access.value',
      refresh_token: 'refresh value',
    });
    assert.equal(cookies.length, 2);
    assert.match(cookies[0], new RegExp(`^${ACCESS_COOKIE}=access.value;`));
    assert.match(cookies[0], /; HttpOnly; SameSite=Lax; Secure$/);
    assert.match(cookies[1], new RegExp(`^${REFRESH_COOKIE}=refresh%20value;`));
    assert.equal(accessCookie({ headers: { cookie: cookies[0] } }), 'access.value');
  });
});

test('production auth redirects require an explicit trusted site origin', () => {
  withEnv({ NODE_ENV: 'production', VERCEL: '1', VERITRUST_SITE_URL: undefined }, () => {
    assert.throws(
      () => trustedSiteOrigin({ headers: { host: 'attacker.example', 'x-forwarded-proto': 'https' } }),
      (error) => error.code === 'SERVER_CONFIG_ERROR'
    );
  });
  withEnv({ NODE_ENV: 'production', VERCEL: '1', VERITRUST_SITE_URL: 'https://www.veritrustlab.in' }, () => {
    assert.equal(trustedSiteOrigin({ headers: {} }), 'https://www.veritrustlab.in');
  });
});

test('gateway management API-key scopes require an owner or admin context', () => {
  const requested = ['gateway:scan', 'gateway:policy:write', 'gateway:webhook:manage'];
  assert.deepEqual(scopesForContext({ role: 'member' }, requested), ['gateway:scan']);
  assert.deepEqual(scopesForContext({ role: 'owner' }, requested), requested);
  assert.deepEqual(scopesForContext({ role: 'member' }), DEFAULT_SCOPES);
});
