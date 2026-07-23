const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

  if (!/<title>[^<]+<\/title>/i.test(html)) failures.push(`${file}: missing a non-empty title`);
  if (!/<meta\s+name=["']description["']\s+content=["'][^"']{30,}["']/i.test(html)) {
    failures.push(`${file}: missing a meaningful meta description`);
  }
  if (!/<main\b/i.test(html)) failures.push(`${file}: missing a main landmark`);
  if (!/<h1\b/i.test(html)) failures.push(`${file}: missing an h1`);
  if (!/assets\/js\/site\.js/i.test(html)) failures.push(`${file}: missing the shared site chrome script`);
  if (!/assets\/js\/config\.js/i.test(html)) failures.push(`${file}: missing runtime configuration`);
  if (!/assets\/js\/supabase-client\.js/i.test(html)) failures.push(`${file}: missing the shared session client`);
  if (!/assets\/css\/glass-system\.css\?v=20260723-global3/i.test(html)) {
    failures.push(`${file}: missing the shared responsive glass system`);
  }
  if (/<footer\b[^>]*class=["'][^"']*doc-section/i.test(html)) {
    failures.push(`${file}: article-level footer must use the shared site footer`);
  }

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

const authHtml = fs.readFileSync(path.join(root, 'auth.html'), 'utf8');
if (/<[^>]+data-auth-provider|<div[^>]+social-logins|>Or continue with<|Google and GitHub sign-in/i.test(authHtml)) {
  failures.push('auth.html: inactive social authentication controls must not be rendered');
}

const homeHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!/<meta\s+property=["']og:site_name["']\s+content=["']VeriTrust["']/i.test(homeHtml)) {
  failures.push('index.html: og:site_name must identify the site as VeriTrust');
}
if (!/"@type"\s*:\s*"WebSite"[\s\S]*?"name"\s*:\s*"VeriTrust"/i.test(homeHtml)) {
  failures.push('index.html: WebSite structured data must identify the site as VeriTrust');
}
if (/"name"\s*:\s*"VeriTrustLab"/i.test(homeHtml)) {
  failures.push('index.html: legacy VeriTrustLab structured-data name must not be used');
}
if (!/textLength=["']128["'][^>]*>Model score, not forensic proof</i.test(homeHtml)) {
  failures.push('index.html: console limitation text must be constrained inside its result card');
}
const webManifest = fs.readFileSync(path.join(root, 'site.webmanifest'), 'utf8');
if (!/"name"\s*:\s*"VeriTrust"/i.test(webManifest)) {
  failures.push('site.webmanifest: application name must be VeriTrust');
}
const structuredDataMatch = homeHtml.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
if (!structuredDataMatch) {
  failures.push('index.html: homepage structured data is missing');
} else {
  try {
    JSON.parse(structuredDataMatch[1]);
  } catch {
    failures.push('index.html: homepage structured data is not valid JSON');
  }
  const structuredDataHash = `sha256-${crypto.createHash('sha256').update(structuredDataMatch[1]).digest('base64')}`;
  const vercelConfig = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  if (!vercelConfig.includes(structuredDataHash)) {
    failures.push('vercel.json: Content Security Policy does not allow the current homepage structured data');
  }
}

const siteScript = fs.readFileSync(path.join(root, 'assets', 'js', 'site.js'), 'utf8');
if (!/const\s+shouldBlockForAuth\s*=\s*isAuth\s*\|\|\s*!isPublic/i.test(siteScript)) {
  failures.push('assets/js/site.js: public content must not be hidden behind session verification');
}
const glassStyles = fs.readFileSync(path.join(root, 'assets', 'css', 'glass-system.css'), 'utf8');
if (!/--vt-ambient-blue:\s*rgba\(37,\s*99,\s*235,/i.test(glassStyles)) {
  failures.push('assets/css/glass-system.css: shared blue ambient lighting is missing');
}
if (!/\.tool-menu-toggle[\s\S]*?background:\s*transparent\s*!important/i.test(glassStyles)) {
  failures.push('assets/css/glass-system.css: mobile menu trigger must remain background-free');
}
const gatewayHtml = fs.readFileSync(path.join(root, 'gateway.html'), 'utf8');
if (!/<h1>\s*Unified signal review\.\s*<\/h1>/i.test(gatewayHtml)
  || /Review multiple signals together/i.test(gatewayHtml)) {
  failures.push('gateway.html: gateway heading must use the compact professional title');
}
const sharedChromeTargets = [
  'index.html',
  'auth.html',
  'detection.html',
  'deepfake.html',
  'phishing.html',
  'link-check.html',
  'gateway.html',
  'cli.html',
  'developers.html',
  'gateway-powershell.html',
  'docs.html',
  'model-performance.html',
  'dashboard.html',
  'scans.html',
  'api-access.html',
  'billing.html',
  'account.html',
  'security.html',
  'privacy.html',
  'terms.html',
  'disclaimer.html',
];
for (const href of sharedChromeTargets) {
  if (!siteScript.includes(`href="${href}"`)) {
    failures.push(`assets/js/site.js: shared header/footer is missing ${href}`);
  }
}
for (const file of htmlFiles) {
  const pageId = path.basename(file, '.html');
  const contextPattern = new RegExp(`(?:^|\\n)\\s*(?:${pageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|'${pageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}')\\s*:`);
  if (!contextPattern.test(siteScript)) {
    failures.push(`assets/js/site.js: shared header has no page context for ${file}`);
  }
}
if (!/data\.siteHeader|dataset\.siteHeader/i.test(siteScript) || !/data\.siteFooter|dataset\.siteFooter/i.test(siteScript)) {
  failures.push('assets/js/site.js: shared header and footer markers are missing');
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

console.log(`Navigation integrity check passed: ${htmlFiles.length} pages, ${intentContracts.length} intent contracts, and shared chrome/content contracts.`);
