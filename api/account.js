const { handleOptions, sendJson } = require('../lib/veritrust-api');

const routes = Object.freeze({
  session: require('./_session'),
  scans: require('./_scans'),
  cases: require('./_cases'),
  dashboard: require('./_dashboard'),
  'api-keys': require('./_api-keys'),
  'auth-session': require('./_auth-session'),
  profile: require('./_profile'),
  privacy: require('./_privacy'),
  jobs: require('./_jobs'),
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
  sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown VeriTrust account endpoint.' } });
};

module.exports.routeName = routeName;

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
