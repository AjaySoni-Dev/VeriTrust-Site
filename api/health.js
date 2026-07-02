const {
  DEEPFAKE_MODELS,
  PHISHING_MODELS,
  findHfToken,
  handleOptions,
  sendJson,
} = require('../lib/veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  sendJson(res, 200, {
    ok: true,
    service: 'VeriTrust Vercel proxy',
    token_configured: Boolean(findHfToken()),
    deepfake_models: Object.values(DEEPFAKE_MODELS).map((item) => item.display_name),
    phishing_models: Object.values(PHISHING_MODELS).map((item) => item.display_name),
    runtime: 'vercel-node',
  });
};
