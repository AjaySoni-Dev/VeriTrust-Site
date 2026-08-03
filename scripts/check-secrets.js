const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDED_DIRECTORIES = new Set(['.git', '.vercel', 'coverage', 'node_modules', 'output', 'tmp']);
const TEXT_EXTENSIONS = new Set([
  '.css', '.csv', '.html', '.js', '.json', '.md', '.sql', '.ts', '.txt', '.webmanifest', '.xml', '.yaml', '.yml',
]);
const RULES = [
  ['private key', /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/u],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/u],
  ['Hugging Face token', /\bhf_[A-Za-z0-9]{24,}\b/u],
  ['Supabase access token', /\bsbp_[A-Za-z0-9]{24,}\b/u],
  ['Stripe live key', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/u],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{16,}\b/u],
  ['npm access token', /\bnpm_[A-Za-z0-9]{30,}\b/u],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u],
];

function textFiles(directory = ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...textFiles(absolute));
    else if (entry.isFile() && (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || entry.name === '.gitignore' || entry.name === '.vercelignore')) {
      files.push(absolute);
    }
  }
  return files;
}

const findings = [];
const files = textFiles().sort();
for (const file of files) {
  const relative = path.relative(ROOT, file);
  if (path.basename(file).startsWith('.env') && path.basename(file) !== '.env.example') {
    findings.push({ relative, rule: 'environment file' });
    continue;
  }
  const source = fs.readFileSync(file, 'utf8');
  for (const [rule, pattern] of RULES) {
    if (pattern.test(source)) findings.push({ relative, rule });
  }
}

if (findings.length) {
  console.error('Secret scan failed. Potential credentials were detected; values are intentionally not printed.');
  for (const finding of findings) console.error(`- ${finding.relative}: ${finding.rule}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed: ${files.length} text files checked with ${RULES.length} credential rules.`);
}
