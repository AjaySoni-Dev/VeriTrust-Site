const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'deployment-manifest.json'), 'utf8'));
const ignorePatterns = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8')
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const ignoreSet = new Set(ignorePatterns);
const runtimeFiles = new Set(manifest.runtimeFiles);
const runtimeDirectories = new Set(Object.keys(manifest.runtimeDirectories));

function fail(message) {
  throw new Error(`Deployment inventory check failed: ${message}`);
}

function globExpression(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`, 'u');
}

function ignoredTopLevel(name, isDirectory) {
  return ignorePatterns.some((pattern) => {
    const directoryPattern = pattern.endsWith('/');
    if (directoryPattern && !isDirectory) return false;
    const candidate = directoryPattern ? `${name}/` : name;
    return globExpression(pattern).test(candidate);
  });
}

function validateRuntimeDirectory(relativeDirectory, extensions) {
  const absoluteDirectory = path.join(ROOT, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) fail(`required runtime directory is missing: ${relativeDirectory}/`);
  const allowed = new Set(extensions.map((extension) => extension.toLowerCase()));
  const pending = [absoluteDirectory];
  let files = 0;
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`runtime source may not be a symbolic link: ${path.relative(ROOT, absolute)}`);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) {
        files += 1;
        const extension = path.extname(entry.name).toLowerCase();
        if (!allowed.has(extension)) {
          fail(`unapproved file type in ${relativeDirectory}/: ${path.relative(ROOT, absolute)}`);
        }
      }
    }
  }
  if (!files) fail(`runtime directory is empty: ${relativeDirectory}/`);
  return files;
}

for (const pattern of manifest.requiredIgnorePatterns) {
  if (!ignoreSet.has(pattern)) fail(`.vercelignore is missing required rule ${pattern}`);
}

for (const runtimeFile of runtimeFiles) {
  const absolute = path.join(ROOT, runtimeFile);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail(`required runtime file is missing: ${runtimeFile}`);
  if (ignoredTopLevel(runtimeFile, false)) fail(`required runtime file is excluded by .vercelignore: ${runtimeFile}`);
}

let runtimeSourceFiles = 0;
for (const [directory, extensions] of Object.entries(manifest.runtimeDirectories)) {
  if (ignoredTopLevel(directory, true)) fail(`required runtime directory is excluded by .vercelignore: ${directory}/`);
  runtimeSourceFiles += validateRuntimeDirectory(directory, extensions);
}

for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (entry.name === '.vercelignore') continue;
  if (entry.isDirectory() && runtimeDirectories.has(entry.name)) continue;
  if (entry.isFile() && runtimeFiles.has(entry.name)) continue;
  if (ignoredTopLevel(entry.name, entry.isDirectory())) continue;
  fail(`unapproved top-level deployment candidate: ${entry.name}`);
}

console.log(`Deployment inventory check passed: ${runtimeFiles.size} root files and ${runtimeSourceFiles} runtime source files approved.`);
