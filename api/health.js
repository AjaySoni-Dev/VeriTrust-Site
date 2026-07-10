const { handleApiError, handleOptions, requireMethod, sendJson } = require('../lib/veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res, { methods: ['GET', 'OPTIONS'], credentials: false })) return;
  try {
    requireMethod(req, 'GET');
    res.setHeader('Cache-Control', 'no-store');
    sendJson(res, 200, { ok: true, status: 'live' });
  } catch (error) {
    handleApiError(res, error, 'Health check failed.');
  }
};

