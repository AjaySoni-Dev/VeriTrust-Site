const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDED = new Set(['.git', '.vercel', 'coverage', 'node_modules', 'output', 'tmp']);

function files(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...files(absolute));
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(absolute);
  }
  return result;
}

let failed = false;
for (const file of files(ROOT).sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
  }
}
if (failed) process.exitCode = 1;
else process.stdout.write('JavaScript syntax check passed.\n');

