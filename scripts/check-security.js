const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function fail(message) {
  throw new Error(`Security check failed: ${message}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const ignoredDirectories = new Set([
  '.git',
  '.vercel',
  'node_modules',
  'output',
  'VeriTrust-Domain - Copy',
]);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.sql', '.txt', '.xml', '.yaml', '.yml']);

function textFiles(directory = root) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...textFiles(absolute));
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }
  return files;
}

const vercelIgnore = read('.vercelignore');
for (const required of ['.env*', '*.log', 'legacy-php/', 'node_modules/', 'output/', 'test/', 'VeriTrust-Domain - Copy/']) {
  if (!vercelIgnore.split(/\r?\n/u).includes(required)) fail(`.vercelignore must exclude ${required}`);
}

const vercel = JSON.parse(read('vercel.json'));
const globalHeaders = vercel.headers?.find((entry) => entry.source === '/(.*)')?.headers || [];
const headerMap = new Map(globalHeaders.map((header) => [header.key.toLowerCase(), header.value]));
for (const required of [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-frame-options',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
]) {
  if (!headerMap.has(required)) fail(`vercel.json is missing ${required}`);
}
const csp = headerMap.get('content-security-policy') || '';
for (const directive of ["default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'", "script-src-attr 'none'"]) {
  if (!csp.includes(directive)) fail(`CSP is missing ${directive}`);
}

for (const requiredFile of [
  'docs/supabase-security-audit.sql',
  'docs/supabase-security-hardening.sql',
]) {
  if (!fs.existsSync(path.join(root, requiredFile))) fail(`${requiredFile} is missing`);
}

const securityCriticalSources = {
  'api/_auth-session.js': ['enforceRateLimit', 'validateJsonContentType'],
  'api/_api-keys.js': ['validateJsonContentType'],
  'lib/supabase-server.js': ['AbortSignal.timeout', 'UPSTREAM_RESPONSE_TOO_LARGE'],
  'lib/billing.js': ['AbortSignal.timeout', 'BILLING_RESPONSE_TOO_LARGE'],
  'api/_profile.js': ['AbortSignal.timeout', 'validateImageUpload'],
  'api/learning.js': ['enforceRateLimit', 'idempotencyKey', 'validateJsonContentType', 'X-Request-Id'],
  'lib/learning/repository.js': ['learningUnavailable', 'user_id=eq.', 'learning_public_credentials'],
};
for (const [relativePath, requirements] of Object.entries(securityCriticalSources)) {
  const source = read(relativePath);
  for (const requirement of requirements) {
    if (!source.includes(requirement)) fail(`${relativePath} is missing ${requirement}`);
  }
}

for (const relativePath of [
  'assets/js/learning-api.js',
  'assets/js/learning.js',
  'assets/js/course.js',
  'assets/js/lesson.js',
  'assets/js/assessment.js',
  'assets/js/certificate.js',
  'assets/js/learning-admin.js',
]) {
  const source = read(relativePath);
  for (const forbidden of ['correct_answer', 'correct_payload', 'SUPABASE_SERVICE_ROLE_KEY', 'service_role']) {
    if (source.toLowerCase().includes(forbidden.toLowerCase())) {
      fail(`${relativePath} must not contain protected learning field ${forbidden}`);
    }
  }
}

const secretPatterns = [
  /\bhf_[A-Za-z0-9]{24,}\b/u,
  /\bsbp_[A-Za-z0-9]{24,}\b/u,
  /\bsk_live_[A-Za-z0-9]{20,}\b/u,
  /\bwhsec_[A-Za-z0-9]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u,
];
for (const absolute of textFiles()) {
  if (path.basename(absolute) === '.env.example') continue;
  const source = fs.readFileSync(absolute, 'utf8');
  if (secretPatterns.some((pattern) => pattern.test(source))) {
    fail(`possible committed credential in ${path.relative(root, absolute)}`);
  }
}

console.log('Security configuration check passed.');
