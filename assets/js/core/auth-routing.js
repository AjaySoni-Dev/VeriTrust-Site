(function initAuthRouting(global) {
  const ALLOWED_PATHS = new Set(['/dashboard', '/deepfake', '/phishing', '/link-check', '/auth']);
  const ALLOWED_QUERY_KEYS = new Set(['source', 'billing']);

  function safeReturnPath(value, fallback = '/dashboard') {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 512 || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(raw)) return fallback;
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(decoded)) return fallback;
      const parsed = new URL(raw, global.location.origin);
      const path = parsed.pathname.replace(/\.html$/i, '');
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== global.location.origin
          || parsed.username || parsed.password || !ALLOWED_PATHS.has(path)) return fallback;
      const query = new URLSearchParams();
      for (const [key, item] of parsed.searchParams) {
        if (ALLOWED_QUERY_KEYS.has(key) && item.length <= 100) query.append(key, item);
      }
      return `${path}${query.size ? `?${query}` : ''}`;
    } catch {
      return fallback;
    }
  }

  const api = { safeReturnPath };
  global.VeriTrustAuthRouting = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

