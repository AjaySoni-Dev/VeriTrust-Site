const { handleOptions, sendJson } = require('../lib/veritrust-api');

const routes = Object.freeze({
  health: require('../lib/routes/system/health'),
  'client-config': require('../lib/routes/system/client-config'),
  'learning-access': require('../lib/routes/system/learning-access'),
  'model-cards': require('../lib/routes/system/model-cards'),
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
  sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown VeriTrust system endpoint.' } });
};

module.exports.routeName = routeName;
