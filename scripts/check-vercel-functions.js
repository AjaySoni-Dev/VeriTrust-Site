const fs = require('node:fs');
const path = require('node:path');

const API_ROOT = path.resolve(__dirname, '..', 'api');
const HOBBY_LIMIT = 12;

function entrypoints(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...entrypoints(absolute));
    else if (entry.isFile() && /\.(?:js|mjs|cjs|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) results.push(absolute);
  }
  return results;
}

const functions = entrypoints(API_ROOT).sort();
if (functions.length > HOBBY_LIMIT) {
  console.error(`Vercel Hobby function limit exceeded: ${functions.length}/${HOBBY_LIMIT}.`);
  for (const file of functions) console.error(`- ${path.relative(path.resolve(__dirname, '..'), file)}`);
  process.exitCode = 1;
} else {
  console.log(`Vercel Hobby function budget passed: ${functions.length}/${HOBBY_LIMIT}.`);
}
