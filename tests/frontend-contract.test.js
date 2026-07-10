const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html')).sort();

test('VT-073 every document has unique canonical metadata and one H1', () => {
  const descriptions = new Set();
  const canonicals = new Set();
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal((html.match(/<h1\b/gi) || []).length, 1, file);
    const description = html.match(/<meta name="description" content="([^"]+)"/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    assert.ok(description && !descriptions.has(description), `${file} description`);
    assert.ok(canonical && !canonicals.has(canonical), `${file} canonical`);
    descriptions.add(description);
    canonicals.add(canonical);
    const ids = [...html.matchAll(/\sid="([^"]+)"/gi)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file} duplicate ids`);
    assert.doesNotMatch(html, /href="[^"]+\.html(?:[?#"])/i, `${file} legacy internal link`);
  }
});

test('VT-075 private pages are noindex', () => {
  for (const file of ['auth.html', 'dashboard.html']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /<meta name="robots" content="noindex, nofollow">/i);
  }
});

test('VT-071 deployment config enforces core browser headers', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const catchAll = config.headers.find((item) => item.source === '/(.*)');
  const headers = Object.fromEntries(catchAll.headers.map((item) => [item.key.toLowerCase(), item.value]));
  assert.match(headers['content-security-policy'], /script-src 'self'/);
  assert.match(headers['content-security-policy'], /object-src 'none'/);
  assert.match(headers['strict-transport-security'], /max-age=31536000/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
});

