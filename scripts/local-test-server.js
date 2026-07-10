const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 3000);
const routes = new Map([
  ['/', 'index.html'], ['/auth', 'auth.html'], ['/dashboard', 'dashboard.html'], ['/detection', 'detection.html'],
  ['/deepfake', 'deepfake.html'], ['/phishing', 'phishing.html'], ['/link-check', 'link-check.html'], ['/docs', 'docs.html'],
  ['/developers', 'developers.html'], ['/model-performance', 'model-performance.html'], ['/privacy', 'privacy.html'],
  ['/terms', 'terms.html'], ['/security', 'security.html'], ['/disclaimer', 'disclaimer.html'],
]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/client-config') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ok: true, config: { schemaVersion: '1', maxImageBytes: 4194304, modelCatalogVersion: 'test', buildId: 'local-test', features: { billing: false, externalApi: false, preprocessing: false }, preprocessing: { enabled: false, providerName: '', consentVersion: '' }, api: { health: '/api/health', session: '/api/session', scans: '/api/scans', apiKeys: '/api/api-keys', deepfake: '/api/deepfake', phishing: '/api/phishing', linkCheck: '/api/link-check' } } }));
    return;
  }
  if (url.pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, status: 'live' }));
    return;
  }
  let relative = routes.get(url.pathname) || url.pathname.replace(/^\//, '');
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  res.setHeader('Content-Type', types[path.extname(target).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
}).listen(port, '127.0.0.1', () => process.stdout.write(`Local QA server listening on http://127.0.0.1:${port}\n`));
