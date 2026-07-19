const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root)
  .filter((name) => name.toLowerCase().endsWith('.html'))
  .sort();
const pageIds = new Map();
const failures = [];

function normalizeTarget(sourceFile, href) {
  const withoutQuery = href.split('?')[0];
  const [pathname, fragment = ''] = withoutQuery.split('#', 2);
  const decodedPath = decodeURIComponent(pathname || '');
  const targetPath = decodedPath
    ? path.resolve(root, decodedPath.replace(/^\/+/, ''))
    : path.resolve(root, sourceFile);
  return { fragment: decodeURIComponent(fragment), targetPath };
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const ids = new Set([...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]));
  pageIds.set(path.resolve(root, file), ids);
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const anchors = [...html.matchAll(/<a\b[^>]*\shref=["']([^"']*)["'][^>]*>/gi)];

  for (const match of anchors) {
    const href = match[1].trim();
    if (!href) {
      failures.push(`${file}: anchor has an empty href`);
      continue;
    }
    if (/^(?:https?:|mailto:|tel:|javascript:)/i.test(href)) continue;
    if (href === '#') {
      failures.push(`${file}: anchor uses a placeholder # target`);
      continue;
    }

    let target;
    try {
      target = normalizeTarget(file, href);
    } catch {
      failures.push(`${file}: cannot decode href ${href}`);
      continue;
    }

    if (!target.targetPath.startsWith(`${root}${path.sep}`) && target.targetPath !== root) {
      failures.push(`${file}: href escapes the project root: ${href}`);
      continue;
    }

    if (!fs.existsSync(target.targetPath)) {
      failures.push(`${file}: href target does not exist: ${href}`);
      continue;
    }

    if (target.fragment) {
      const ids = pageIds.get(target.targetPath);
      if (!ids || !ids.has(target.fragment)) {
        failures.push(`${file}: fragment target does not exist: ${href}`);
      }
    }
  }
}

const intentContracts = [
  { file: 'index.html', label: 'Start Free Scan', href: 'detection.html' },
  { file: 'index.html', label: 'Open Dashboard', href: 'dashboard.html' },
  { file: 'dashboard.html', label: 'New Scan', href: 'detection.html' },
  { file: 'gateway-powershell.html', label: 'Create an API key', href: 'api-access.html' },
];

for (const contract of intentContracts) {
  const html = fs.readFileSync(path.join(root, contract.file), 'utf8');
  const escapedLabel = contract.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedHref = contract.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<a\\b[^>]*href=["']${escapedHref}["'][^>]*>\\s*${escapedLabel}\\s*</a>`, 'i');
  if (!pattern.test(html)) {
    failures.push(`${contract.file}: ${contract.label} must navigate to ${contract.href}`);
  }
}

if (failures.length) {
  console.error('Navigation integrity check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Navigation integrity check passed: ${htmlFiles.length} pages and ${intentContracts.length} intent contracts.`);
