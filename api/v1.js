const {
  handleOptions,
  sendJson,
} = require('../lib/veritrust-api');

const routes = {
  deepfake: require('../lib/routes/v1/deepfake'),
  phishing: require('../lib/routes/v1/phishing'),
  'link-check': require('../lib/routes/v1/link-check'),
  usage: require('../lib/routes/v1/usage'),
};

function routeName(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const fromQuery = url.searchParams.get('route');
  if (fromQuery) return fromQuery;
  const parts = url.pathname.split('/').filter(Boolean);
  return parts[2] || '';
}

module.exports = async function handler(req, res) {
  const route = routeName(req);
  const routeHandler = routes[route];

  if (!routeHandler) {
    if (handleOptions(req, res)) return;
    sendJson(res, 404, {
      ok: false,
      request_id: `vt_req_${Date.now().toString(36)}`,
      error: {
        code: 'NOT_FOUND',
        message: 'Unknown VeriTrust API v1 endpoint.',
      },
    });
    return;
  }

  return routeHandler(req, res);
};
