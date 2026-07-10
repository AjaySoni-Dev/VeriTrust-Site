const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function filesIn(relative, extension) {
  const base = path.join(root, relative);
  return fs.readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) return filesIn(path.relative(root, full), extension);
    return entry.name.endsWith(extension) ? [full] : [];
  });
}

test('VT-065 browser startup contains no synchronous XMLHttpRequest', () => {
  for (const file of filesIn('assets/js', '.js')) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /new\s+XMLHttpRequest\s*\(/, path.relative(root, file));
  }
});

test('VT-066 browser bundles contain no hard-coded preprocessing service', () => {
  for (const file of filesIn('assets/js', '.js')) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /ajaysoni-dev-deepfakefusion|hf\.space\/api\/crop-image/i, path.relative(root, file));
  }
});

test('VT-035 browser code does not persist auth tokens', () => {
  const client = fs.readFileSync(path.join(root, 'assets/js/supabase-client.js'), 'utf8');
  assert.doesNotMatch(client, /localStorage|sessionStorage|refresh_token|access_token/i);
});

test('VT-082 pages load no remote fonts or stylesheets', () => {
  for (const file of filesIn('.', '.html')) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /fonts\.googleapis\.com|fonts\.gstatic\.com/i, path.relative(root, file));
  }
});

