const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs', 'build-manifest.json');
const excluded = new Set(['node_modules', 'tmp', 'output', '.vercel', '.git']);
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && excluded.has(entry.name)) return [];
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (full === output || entry.name.endsWith('.log')) return [];
    return [full];
  });
}
const assets = Object.fromEntries(walk(root).sort().map((file) => [
  path.relative(root, file).replaceAll('\\', '/'),
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
]));
const treeHash = crypto.createHash('sha256').update(JSON.stringify(assets)).digest('hex');
const manifest = {
  schema_version: '1',
  release_id: process.env.VERITRUST_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || treeHash.slice(0, 16),
  source_commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  generated_at: new Date().toISOString(),
  source_tree_sha256: treeHash,
  api_contract: 'docs/openapi.yaml',
  migration_versions: fs.readdirSync(path.join(root, 'supabase', 'migrations')).filter((name) => name.endsWith('.sql')).sort(),
  model_catalog_version: process.env.VERITRUST_MODEL_CATALOG_VERSION || 'configuration-required',
  assets,
};
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${output}\n`);

