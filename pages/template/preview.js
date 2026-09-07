(() => {
  'use strict';
  const config = window.NEXORA_CONFIG || window.CONFIG || {};
  const storage = config.TEMPLATE_STORAGE || {};
  const frame = document.getElementById('fullPreviewFrame');
  const stateNode = document.getElementById('previewState');
  const nameNode = document.getElementById('templateName');
  const metaNode = document.getElementById('templateMeta');

  function encodePath(path = '') { return String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/'); }
  function publicUrl(path = '') {
    const base = String(config.SUPABASE_URL || '').replace(/\/$/, '');
    const bucket = String(storage.PREVIEW_BUCKET || 'template-previews');
    const rawPath = String(path || '');
    const trailingSlash = rawPath.endsWith('/') ? '/' : '';
    return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodePath(rawPath)}${trailingSlash}`;
  }
  function injectBase(html, baseUrl) {
    const tag = `<base href="${String(baseUrl).replace(/"/g,'&quot;')}">`;
    if (/<base\s/i.test(html)) return html.replace(/<base\b[^>]*>/i, tag);
    if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b([^>]*)>/i, `<head$1>${tag}`);
    return `<!doctype html><html><head>${tag}</head><body>${html}</body></html>`;
  }
  function fail(message) {
    stateNode.classList.add('error');
    stateNode.innerHTML = `<strong>${String(message || 'Preview unavailable').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</strong>`;
  }

  async function boot() {
    try {
      const url = new URL(window.location.href);
      const id = String(url.searchParams.get('id') || '').trim();
      const version = String(url.searchParams.get('version') || '').trim();
      if (!id) throw new Error('Template ID is missing.');
      const catalogPath = String(storage.CATALOG_PATH || 'catalog.json').replace(/^\/+/, '');
      const catalogResponse = await fetch(publicUrl(catalogPath), { cache: 'no-cache', headers: { Accept: 'application/json' } });
      if (!catalogResponse.ok) throw new Error(`Catalog returned HTTP ${catalogResponse.status}.`);
      const payload = await catalogResponse.json();
      const templates = Array.isArray(payload) ? payload : payload?.templates;
      if (!Array.isArray(templates)) throw new Error('Template catalog is invalid.');
      const item = templates.find(row => String(row?.template_id || row?.id || '') === id && (!version || String(row?.version || '') === version));
      if (!item) throw new Error('This template/version is not present in the published catalog.');
      const indexPath = String(item.preview_index_path || '').replace(/^\/+/, '');
      const basePath = String(item.preview_base_path || '').replace(/^\/+/, '');
      if (!indexPath || !basePath) throw new Error('Preview paths are missing from the template catalog.');
      nameNode.textContent = String(item.name || item.slug || 'Template preview');
      metaNode.textContent = `${String(item.tier || 'free').toUpperCase()} · ${String(item.category || 'template')} · v${String(item.version || '1.0.0')}`;
      document.title = `${nameNode.textContent} - Nexora.AI Preview`;
      const response = await fetch(publicUrl(indexPath), { cache: 'force-cache', mode: 'cors' });
      if (!response.ok) throw new Error(`Preview returned HTTP ${response.status}.`);
      const html = await response.text();
      frame.srcdoc = injectBase(html, publicUrl(basePath));
      stateNode.classList.add('hidden');
    } catch (error) {
      console.error('Nexora full preview failed:', error);
      fail(error?.message || 'Could not load this template from Supabase Storage.');
    }
  }
  boot();
})();
