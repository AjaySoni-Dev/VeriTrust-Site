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
  const command = read('assets/powershell/VeriTrust.EmailInvestigation.ps1');

  assert.match(guide, /assets\/powershell\/VeriTrust\.EmailInvestigation\.ps1/u);
  assert.match(guide, /Get-Command Invoke-VeriTrustEmailInvestigation -ErrorAction Stop/u);
  assert.match(guide, /if \(-not \(Get-Command Invoke-VeriTrustEmailInvestigation/u);
  assert.match(command, /function Invoke-VeriTrustEmailInvestigation/u);
  assert.match(command, /ParameterSetName = 'Text'/u);
  assert.match(command, /ParameterSetName = 'Eml'/u);
  assert.match(command, /\/api\/v1\/gateway\/email\/analyze-text/u);
  assert.match(command, /\/api\/v1\/gateway\/email\/analyze-eml/u);
  assert.match(command, /-ContentType 'message\/rfc822'/u);
  assert.match(command, /-InFile \$EmailFile\.FullName/u);
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
  assert.match(page, /email-report-pdf\.js/u);
  assert.match(script, /data-download-email-pdf/u);
});

test('Email investigation builds a light PDF with complete evidence and a final glossary', () => {
  const pdf = require('../assets/js/core/email-report-pdf.js');
  const bytes = pdf.buildEmailReportPdf({
    ok: true,
    scan_id: 'scan-test-123',
    gateway_decision: { risk: 0.91, recommendation: 'quarantine', degraded: true },
    evidence: {
      state: 'LIKELY_PHISHING',
      input_mode: 'eml',
      limitations: ['SPF_UNAVAILABLE_WITHOUT_TRUSTED_RECEIVER_FACTS'],
      observations: [{ protocol: 'DKIM', result: 'PASS' }, { code: 'CREDENTIAL_REQUEST' }],
      relationships: [{ edge_type: 'FROM_TO_REPLY_TO', target_value: 'example.test' }],
      children: [{ type: 'url', state: 'completed', metadata: { hostname: 'example.test' } }],
      infrastructure: [{ ip_address: '203.0.113.10', country: 'Test' }],
      model_evidence: [{ status: 'completed', p_phish: 0.93 }],
    },
  });
  const content = Buffer.from(bytes).toString('ascii');

  assert.match(content, /^%PDF-1\.4/u);
  assert.match(content, /Complete technical evidence appendix/u);
  assert.match(content, /report\.evidence\.observations\[0\]\.protocol/u);
  assert.match(content, /Glossary: terms and meanings/u);
  assert.match(content, /SPF/u);
  assert.match(content, /Manual review/u);
  assert.ok((content.match(/\/Type \/Page\b/gu) || []).length >= 2);
});
