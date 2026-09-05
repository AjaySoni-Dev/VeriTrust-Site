const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Unified Gateway exposes text, EML, and evidence email routes', () => {
  const configuration = JSON.parse(read('vercel.json'));
  const rewrites = new Map(configuration.rewrites.map((item) => [item.source, item.destination]));

  assert.equal(rewrites.get('/api/v1/gateway/email/analyze-text'), '/api/gateway?resource=email-text');
  assert.equal(rewrites.get('/api/v1/gateway/email/analyze-eml'), '/api/gateway?resource=email-eml');
  assert.equal(rewrites.get('/api/v1/gateway/email/evidence/:id'), '/api/gateway?resource=email-evidence&id=:id');
});

test('PowerShell guide supports both pasted text and an original EML file', () => {
  const guide = read('gateway-powershell.html');

  assert.match(guide, /function Invoke-VeriTrustEmailInvestigation/u);
  assert.match(guide, /ParameterSetName = "Text"/u);
  assert.match(guide, /ParameterSetName = "Eml"/u);
  assert.match(guide, /\/api\/v1\/gateway\/email\/analyze-text/u);
  assert.match(guide, /\/api\/v1\/gateway\/email\/analyze-eml/u);
  assert.match(guide, /-ContentType "message\/rfc822"/u);
  assert.match(guide, /-InFile \$EmailFile\.FullName/u);
});

test('Email investigation UI uses the Gateway aliases and accessible contextual help', () => {
  const page = read('phishing.html');
  const script = read('assets/js/pages/email-investigation.js');

  assert.match(page, /id="emailHelpTooltip"[^>]*role="tooltip"/u);
  assert.match(page, /data-email-help=/u);
  assert.doesNotMatch(page, /data-email-mode="receiver"/u);
  assert.match(script, /\/api\/v1\/gateway\/email\/analyze-text/u);
  assert.match(script, /\/api\/v1\/gateway\/email\/analyze-eml/u);
  assert.match(script, /aria-label.*Explain/u);
  assert.match(script, /email-help-button/u);
});
