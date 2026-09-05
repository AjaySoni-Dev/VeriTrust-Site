import moduleConfig from './config/modules.json';

const COOKIE_NAME = 'veritrust_learning_access';
const MAX_AGE_SECONDS = 8 * 60 * 60;
const LEARNING_UI_ENABLED = false;

const MODULES = moduleConfig;

const MODULE_PAGE: Record<string, keyof typeof MODULES> = {
  deepfake: 'deepfake',
  phishing: 'phishing',
  'link-check': 'link',
  gateway: 'gateway',
  'gateway-powershell': 'gateway',
};

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/learn/:path*',
    '/learning',
    '/learning.html',
    '/course',
    '/course.html',
    '/lesson',
    '/lesson.html',
    '/assessment',
    '/assessment.html',
    '/learning-admin',
    '/learning-admin.html',
    '/learning-access',
    '/learning-access.html',
    '/certificate',
    '/certificate.html',
    '/certificates',
    '/deepfake',
    '/deepfake.html',
    '/phishing',
    '/phishing.html',
    '/link-check',
    '/link-check.html',
    '/gateway',
    '/gateway.html',
    '/gateway-powershell',
    '/gateway-powershell.html',
  ],
};

function cookieValue(request, name) {
  const parts = String(request.headers.get('cookie') || '').split(';');
  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator < 1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

function base64UrlBytes(value) {
  const normalized = String(value || '').replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function validAccessToken(token, secret) {
  try {
    const [version, expiresRaw, nonce, received] = String(token || '').split('.');
    if (version !== 'v1' || !/^\d{10}$/u.test(expiresRaw) || !/^[A-Za-z0-9_-]{20,40}$/u.test(nonce) || !received) {
      return false;
    }
    const expiresAt = Number(expiresRaw);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + MAX_AGE_SECONDS + 60) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlBytes(received),
      encoder.encode(`${version}.${expiresRaw}.${nonce}`),
    );
  } catch {
    return false;
  }
}

export default async function learningPreviewMiddleware(request) {
  const page = new URL(request.url).pathname.split('/').filter(Boolean).pop()?.replace(/\.html$/iu, '') || '';
  const moduleName = MODULE_PAGE[page];
  if (moduleName && !MODULES[moduleName]) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow, nosnippet',
      },
    });
  }

  if (moduleName) return;

  // The learning experience is intentionally unavailable in this deployment.
  // Keep the implementation isolated in the repository, but do not expose any
  // learning, assessment, administration, or credential UI route.
  if (!LEARNING_UI_ENABLED) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow, nosnippet',
      },
    });
  }

  const secret = String(process.env.VERITRUST_LEARNING_ACCESS_KEY || '');
  const unlocked = secret.length >= 32
    && await validAccessToken(cookieValue(request, COOKIE_NAME), secret);
  if (unlocked) return;

  const current = new URL(request.url);
  const destination = new URL('/learning-access', request.url);
  destination.searchParams.set('next', `${current.pathname}${current.search}`);
  if (secret.length < 32) destination.searchParams.set('reason', 'configuration');
  return new Response(null, {
    status: 307,
    headers: {
      Location: destination.toString(),
      'Cache-Control': 'no-store',
    },
  });
}
