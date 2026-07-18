const { handleOptions, sendJson } = require('../lib/veritrust-api');

const routes = Object.freeze({
  deepfake: require('./_deepfake'),
  phishing: require('./_phishing'),
  'link-check': require('./_link-check'),
});

function routeName(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  return url.searchParams.get('route') || '';
}

module.exports = async function handler(req, res) {
  const selected = routeName(req);
  const routeHandler = routes[selected];
  if (routeHandler) return routeHandler(req, res);
  if (handleOptions(req, res)) return;
  sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown VeriTrust detection endpoint.' } });
};

module.exports.routeName = routeName;
