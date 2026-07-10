const { structuredLog } = require('../lib/security');
const { handleApiError, parseJsonBody, requireMethod, sendJson } = require('../lib/veritrust-api');

module.exports = async function handler(req, res) {
  try {
    requireMethod(req, 'POST');
    const body = await parseJsonBody(req, 16 * 1024);
    const report = body['csp-report'] || body.body || body;
    structuredLog('warn', 'browser.csp_violation', {
      request_id: req.requestId,
      violated_directive: String(report['violated-directive'] || report.effectiveDirective || '').slice(0, 120),
      disposition: String(report.disposition || '').slice(0, 40),
      blocked_origin: (() => { try { return new URL(report['blocked-uri'] || report.blockedURL).origin; } catch { return 'redacted'; } })(),
    });
    res.statusCode = 204;
    res.end();
  } catch (error) {
    handleApiError(res, error, 'CSP report rejected.');
  }
};

