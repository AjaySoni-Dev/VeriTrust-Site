(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const config = window.NEXORA_CONFIG || window.CONFIG || {};
  const storageConfig = config.TEMPLATE_STORAGE || {};
  const state = {
    catalog: [],
    query: '',
    tier: 'All',
    category: 'All',
    activeTemplate: null,
    previewObserver: null,
    user: null,
    planTier: 'free',
    billingStatus: 'active',
    paid: false,
    loading: true,
    error: null
  };

  const previewDocumentCache = new Map();
  const isFileProtocol = window.location.protocol === 'file:';
  const chatRoute = isFileProtocol ? new URL('../chat/index.html', window.location.href).href : (config.ROUTES?.CHAT || '/chat');
  const loginRoute = isFileProtocol ? new URL('../login/index.html', window.location.href).href : (config.ROUTES?.LOGIN || '/login');
  const fullPreviewRoute = isFileProtocol ? new URL('./preview.html', window.location.href).href : '/pages/template/preview.html';

  const sidebar = $('#sidebar');
  const overlay = $('#mobileOverlay');
  const templateSearch = $('#templateSearch');
  const sidebarSearch = $('#sidebarSearchInput');
  const categoryStrip = $('#categoryStrip');
  const sections = $('#templateSections');
  const empty = $('#catalogEmpty');
  const resultsTitle = $('#resultsTitle');
  const resultsSummary = $('#resultsSummary');
  const previewModal = $('#previewModal');
  const previewFrame = $('#previewFrame');
  const previewTitle = $('#previewTitle');
  const previewCategory = $('#previewCategory');
  const previewTier = $('#previewTier');
  const previewAddress = $('#previewAddress');
  const useTemplateModal = $('#useTemplateModal');

  const CATEGORY_DESCRIPTIONS = Object.freeze({
    business: 'Professional business website with strong positioning, services, and conversion structure.',
    dashboard: 'Application dashboard interface with data-rich panels and operational workflows.',
    ecommerce: 'Commerce-focused storefront with product discovery, conversion, and shopping interactions.',
    event: 'Event experience with schedules, speakers, registration, and high-impact promotional sections.',
    landing: 'Focused landing page designed for clear messaging, conversion, and responsive presentation.',
    personal: 'Personal website direction with expressive typography, profile content, and polished interactions.',
    portfolio: 'Portfolio presentation built to showcase work, skills, case studies, and personal brand.',
    'real-estate': 'Property-focused experience for listings, discovery, lead capture, and real-estate presentation.',
    restaurant: 'Food and hospitality website with menu, venue, ordering, and reservation-oriented sections.',
    saas: 'Product-led SaaS website with feature storytelling, pricing, proof, and conversion flows.',
    tools: 'Utility-focused interface with clear task flows, controls, feedback, and responsive behavior.'
  });

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  function normalize(value = '') { return String(value).trim().toLowerCase(); }

  function titleCase(value = '') {
    return String(value).replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  }

  function storageSettings() {
    const supabaseUrl = String(config.SUPABASE_URL || '').replace(/\/$/, '');
    return {
      supabaseUrl,
      previewBucket: String(storageConfig.PREVIEW_BUCKET || 'template-previews').trim(),
      catalogPath: String(storageConfig.CATALOG_PATH || 'catalog.json').replace(/^\/+/, ''),
      version: String(storageConfig.CATALOG_VERSION || '1').trim()
    };
  }

  function encodeStoragePath(path = '') {
    return String(path).split('/').filter(Boolean).map(segment => encodeURIComponent(segment)).join('/');
  }

  function publicObjectUrl(path = '') {
    const { supabaseUrl, previewBucket } = storageSettings();
    if (!supabaseUrl || !previewBucket) return '';
    const rawPath = String(path || '');
    const trailingSlash = rawPath.endsWith('/') ? '/' : '';
    return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(previewBucket)}/${encodeStoragePath(rawPath)}${trailingSlash}`;
  }

  function catalogUrl() {
    const { catalogPath, version } = storageSettings();
    const base = publicObjectUrl(catalogPath);
    return version ? `${base}?v=${encodeURIComponent(version)}` : base;
  }

  function normalizeCatalogItem(raw) {
    const category = String(raw?.category || 'other').trim().toLowerCase();
    const tierLower = String(raw?.tier || 'free').trim().toLowerCase();
    const tier = tierLower === 'premium' ? 'Premium' : 'Free';
    const previewBasePath = String(raw?.preview_base_path || '').replace(/^\/+/, '');
    const previewIndexPath = String(raw?.preview_index_path || '').replace(/^\/+/, '');
    const packagePath = String(raw?.package_path || '').replace(/^\/+/, '');
    const id = String(raw?.template_id || raw?.id || '').trim();
    const slug = String(raw?.slug || '').trim();
    if (!id || !slug || !previewIndexPath || !previewBasePath || !packagePath) return null;
    return {
      id,
      slug,
      title: String(raw?.name || titleCase(slug)).trim(),
      tier,
      category,
      categoryLabel: titleCase(category),
      description: CATEGORY_DESCRIPTIONS[category] || 'Production-ready website starter with responsive layout and polished visual structure.',
      version: String(raw?.version || '1.0.0').trim(),
      previewBasePath,
      previewIndexPath,
      previewBaseUrl: publicObjectUrl(previewBasePath),
      previewIndexUrl: publicObjectUrl(previewIndexPath),
      packagePath,
      packageSha256: String(raw?.package_sha256 || '').trim(),
      packageSizeBytes: Number(raw?.package_size_bytes || 0) || 0
    };
  }

  function setTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('light', next === 'light');
    const themeText = $('#themeText');
    if (themeText) {
      themeText.textContent = next === 'light' ? 'Light' : 'Dark';
    }
    try { localStorage.setItem('nexora-theme', next); } catch {}
  }

  function loadTheme() {
    let saved = 'dark';
    try { saved = localStorage.getItem('nexora-theme') || 'dark'; } catch {}
    setTheme(saved);
  }

  function navigateToChat(panel = '') {
    const target = new URL(chatRoute, window.location.href);
    if (panel) target.searchParams.set('panel', panel);
    window.location.href = target.href;
  }

  function showNotice(message, tone = 'info') {
    let toast = $('#templateNotice');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'templateNotice';
      toast.className = 'template-notice';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.className = `template-notice ${tone}`;
    toast.textContent = String(message || '');
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(showNotice._timer);
    showNotice._timer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  function syncSearch(value, source) {
    state.query = value;
    if (source !== templateSearch && templateSearch) templateSearch.value = value;
    if (source !== sidebarSearch && sidebarSearch) sidebarSearch.value = value;
    render();
  }

  function categories() {
    return ['All', ...Array.from(new Set(state.catalog.map(item => item.categoryLabel))).sort((a,b) => a.localeCompare(b))];
  }

  function renderCategories() {
    if (!categoryStrip) return;
    categoryStrip.innerHTML = categories().map(category => `<button type="button" class="category-chip${state.category === category ? ' active' : ''}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join('');
    $$('.category-chip', categoryStrip).forEach(button => button.addEventListener('click', () => {
      state.category = button.dataset.category || 'All';
      renderCategories();
      render();
    }));
  }

  function filteredCatalog() {
    const query = normalize(state.query);
    return state.catalog.filter(item => {
      if (state.tier !== 'All' && item.tier !== state.tier) return false;
      if (state.category !== 'All' && item.categoryLabel !== state.category) return false;
      if (!query) return true;
      return normalize([item.title, item.categoryLabel, item.tier, item.description, item.slug].join(' ')).includes(query);
    });
  }

  function useButtonLabel(item) {
    return item.tier === 'Premium' && !state.paid ? 'Upgrade to use' : 'Use template';
  }

  function cardHTML(item) {
    const premium = item.tier === 'Premium';
    const locked = premium && !state.paid;
    return `<article class="catalog-card${premium ? ' is-premium' : ''}${locked ? ' is-locked' : ''}" data-template-id="${escapeHTML(item.id)}">
      <div class="card-preview" data-preview-template="${escapeHTML(item.id)}" role="button" tabindex="0" aria-label="Preview ${escapeHTML(item.title)}">
        <iframe data-preview-frame="${escapeHTML(item.id)}" title="${escapeHTML(item.title)} miniature preview" tabindex="-1" sandbox="allow-scripts allow-forms allow-modals"></iframe>
        <span class="card-preview-loading" aria-hidden="true"><span></span></span>
        <span class="card-preview-overlay"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>Live preview</span></span>
      </div>
      <div class="card-body">
        <div class="card-meta"><span class="card-category">${escapeHTML(item.categoryLabel)}</span><span class="tier-badge${premium ? ' premium' : ''}">${escapeHTML(item.tier)}</span></div>
        <h5 title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</h5>
        <p>${escapeHTML(item.description)}</p>
        <div class="card-actions">
          <button class="card-action preview" type="button" data-preview-template="${escapeHTML(item.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>Preview</button>
          <button class="card-action use${locked ? ' locked' : ''}" type="button" data-use-template="${escapeHTML(item.id)}">${escapeHTML(useButtonLabel(item))}</button>
        </div>
      </div>
    </article>`;
  }

  function sectionHTML(tier, items) {
    if (!items.length) return '';
    const helper = tier === 'Free' ? 'Ready to use on every account.' : 'Premium design directions available on an active paid plan.';
    return `<section class="template-tier-section" data-tier="${tier}">
      <div class="tier-section-header"><div class="tier-section-title"><h4>${tier} templates</h4><span>${items.length}</span></div><p>${helper}</p></div>
      <div class="catalog-grid">${items.map(cardHTML).join('')}</div>
    </section>`;
  }

  function renderLoading() {
    if (!sections) return;
    sections.hidden = false;
    empty.hidden = true;
    sections.innerHTML = `<div class="catalog-loading" role="status"><span class="catalog-spinner" aria-hidden="true"></span><strong>Loading templates from Supabase Storage…</strong><p>Nexora is reading the published catalog and preparing secure previews.</p></div>`;
    resultsTitle.textContent = 'Loading templates';
    resultsSummary.textContent = 'Connecting to the Supabase template catalog.';
  }

  function renderError() {
    if (!sections) return;
    sections.hidden = false;
    empty.hidden = true;
    sections.innerHTML = `<div class="catalog-loading catalog-error" role="alert"><strong>Template library is unavailable</strong><p>${escapeHTML(state.error || 'Could not load catalog.json from Supabase Storage.')}</p><button type="button" id="retryCatalog">Retry</button></div>`;
    $('#retryCatalog')?.addEventListener('click', loadCatalog);
    resultsTitle.textContent = 'Templates unavailable';
    resultsSummary.textContent = 'Check that template-previews is public and catalog.json exists at the bucket root.';
  }

  function bindCardActions() {
    $$('[data-preview-template]', sections).forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        openPreview(node.dataset.previewTemplate);
      });
      if (node.classList.contains('card-preview')) {
        node.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPreview(node.dataset.previewTemplate);
          }
        });
      }
    });
    $$('[data-use-template]', sections).forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      useTemplate(button.dataset.useTemplate);
    }));
    installPreviewObserver();
  }

  function render() {
    if (state.loading) { renderLoading(); return; }
    if (state.error) { renderError(); return; }
    const items = filteredCatalog();
    const free = items.filter(item => item.tier === 'Free');
    const premium = items.filter(item => item.tier === 'Premium');
    sections.innerHTML = sectionHTML('Free', free) + sectionHTML('Premium', premium);
    empty.hidden = items.length > 0;
    sections.hidden = items.length === 0;
    bindCardActions();

    const filterName = state.tier === 'All' ? 'All templates' : `${state.tier} templates`;
    resultsTitle.textContent = state.category === 'All' ? filterName : `${filterName} · ${state.category}`;
    const parts = [`Showing ${items.length} of ${state.catalog.length} templates`];
    if (state.query) parts.push(`matching “${state.query}”`);
    if (state.category !== 'All') parts.push(`in ${state.category}`);
    if (state.tier === 'All') parts.push('sorted Free first and Premium second');
    resultsSummary.textContent = `${parts.join(', ')}.`;
    $('#headerTemplateCount').textContent = items.length;
  }

  function findTemplate(id) { return state.catalog.find(item => item.id === id) || null; }

  function previewShell(message = 'Loading live preview…') {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#0d0f12;color:#9aa1ab;font:600 14px system-ui,sans-serif}</style></head><body>${escapeHTML(message)}</body></html>`;
  }

  function injectBaseHref(html, baseUrl, isThumbnail = false) {
    const safeBase = String(baseUrl || '').replace(/"/g, '&quot;');
    const baseTag = `<base href="${safeBase}">`;
    const thumbnailReset = isThumbnail ? `<style>
      html, body {
        overflow: hidden !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        margin: 0 !important;
        padding: 0 !important;
        pointer-events: none !important;
        user-select: none !important;
        width: 100% !important;
        min-width: 100% !important;
      }
      ::-webkit-scrollbar { display: none !important; }
    </style>` : '';
    let source = String(html || '');
    if (isThumbnail) {
      // Strip scripts in thumbnail previews for blazing-fast instant CSS rendering without script stalling
      source = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<script\b[^>]*\/>/gi, '');
    }
    if (/<base\s/i.test(source)) {
      source = source.replace(/<base\b[^>]*>/i, baseTag);
    } else if (/<head\b[^>]*>/i.test(source)) {
      source = source.replace(/<head\b([^>]*)>/i, `<head$1>${baseTag}`);
    } else {
      source = `<!doctype html><html><head>${baseTag}</head><body>${source}</body></html>`;
    }
    if (thumbnailReset) {
      if (/<head\b[^>]*>/i.test(source)) {
        return source.replace(/<\/head>/i, `${thumbnailReset}</head>`);
      }
      return thumbnailReset + source;
    }
    return source;
  }

  async function fetchPreviewWithRetry(url, maxRetries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, { cache: 'force-cache', mode: 'cors' });
        if (!response.ok) throw new Error(`Preview returned HTTP ${response.status}.`);
        const html = await response.text();
        if (!html.trim()) throw new Error('Preview HTML is empty.');
        return html;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error('Failed to load preview.');
  }

  async function previewDocument(item, isThumbnail = true) {
    if (!item) throw new Error('Template was not found.');
    const cacheKey = `${item.id}:${isThumbnail ? 'thumb' : 'full'}`;
    if (previewDocumentCache.has(cacheKey)) return previewDocumentCache.get(cacheKey);
    const promise = (async () => {
      const html = await fetchPreviewWithRetry(item.previewIndexUrl, 2);
      return injectBaseHref(html, item.previewBaseUrl, isThumbnail);
    })();
    previewDocumentCache.set(cacheKey, promise);
    try {
      return await promise;
    } catch (error) {
      previewDocumentCache.delete(cacheKey);
      throw error;
    }
  }

  async function hydrateFrame(frame, item) {
    if (!frame || !item || frame.dataset.loaded === '1' || frame.dataset.loaded === 'loading') return;
    frame.dataset.loaded = 'loading';
    try {
      const docHtml = await previewDocument(item, true);
      frame.srcdoc = docHtml;
      frame.dataset.loaded = '1';
      frame.closest('.card-preview')?.classList.add('preview-ready');
    } catch (error) {
      frame.dataset.loaded = 'error';
      frame.srcdoc = previewShell('Preview unavailable');
      console.warn(`Template preview failed for ${item.slug}:`, error);
    }
  }

  function installPreviewObserver() {
    state.previewObserver?.disconnect?.();
    const frames = $$('[data-preview-frame]', sections);
    if (!frames.length) return;

    // Immediately hydrate the first 8 cards for instant visibility
    frames.slice(0, 8).forEach(frame => {
      hydrateFrame(frame, findTemplate(frame.dataset.previewFrame));
    });

    if (!('IntersectionObserver' in window)) {
      frames.forEach(frame => hydrateFrame(frame, findTemplate(frame.dataset.previewFrame)));
      return;
    }
    state.previewObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const frame = entry.target;
        state.previewObserver.unobserve(frame);
        hydrateFrame(frame, findTemplate(frame.dataset.previewFrame));
      });
    }, { root: $('#templateScroll') || null, rootMargin: '1000px 0px', threshold: 0 });
    frames.forEach(frame => {
      if (frame.dataset.loaded !== '1') {
        state.previewObserver.observe(frame);
      }
    });
  }

  async function openPreview(id) {
    const item = findTemplate(id);
    if (!item) return;
    state.activeTemplate = item;
    previewTitle.textContent = item.title;
    previewCategory.textContent = `${item.categoryLabel} · v${item.version}`;
    previewTier.textContent = item.tier;
    previewTier.classList.toggle('premium', item.tier === 'Premium');
    previewAddress.textContent = `supabase://${storageSettings().previewBucket}/${item.previewIndexPath}`;
    if (useTemplateModal) {
      useTemplateModal.textContent = useButtonLabel(item);
      useTemplateModal.classList.toggle('locked', item.tier === 'Premium' && !state.paid);
    }
    previewFrame.srcdoc = previewShell();
    previewModal.classList.add('open');
    previewModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('preview-open');
    $('[data-close-preview]', previewModal)?.focus?.({ preventScroll: true });
    try {
      previewFrame.srcdoc = await previewDocument(item, false);
    } catch (error) {
      previewFrame.srcdoc = previewShell('Preview could not be loaded from Supabase Storage.');
      showNotice(error?.message || 'Preview unavailable.', 'error');
    }
  }

  function closePreview() {
    previewModal.classList.remove('open');
    previewModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('preview-open');
    previewFrame.srcdoc = previewShell('Preview closed');
    state.activeTemplate = null;
  }

  function storeTemplateSelection(item) {
    const selection = {
      id: item.id,
      version: item.version,
      name: item.title,
      tier: item.tier,
      category: item.categoryLabel,
      selectedAt: new Date().toISOString()
    };
    try { sessionStorage.setItem('nexora:selected-template', JSON.stringify(selection)); } catch {}
    return selection;
  }

  function useTemplate(id) {
    const item = findTemplate(id);
    if (!item) return;
    if (item.tier === 'Premium' && !state.paid) {
      showNotice('This premium template requires an active paid plan. Upgrade from Settings to use it.', 'warning');
      return;
    }
    storeTemplateSelection(item);
    const prompt = `Build my website using the “${item.title}” template as the starting implementation. Adapt its real layout, styling, hierarchy, and interactions to my requirements while keeping the result responsive and production-ready.`;
    const target = new URL(chatRoute, window.location.href);
    target.searchParams.set('templateId', item.id);
    target.searchParams.set('templateVersion', item.version);
    target.searchParams.set('template', item.title);
    target.searchParams.set('templateTier', item.tier);
    target.searchParams.set('templateCategory', item.categoryLabel);
    target.searchParams.set('templatePrompt', prompt);
    window.location.href = target.href;
  }

  function wireNavigation() {
    $('#logoLink')?.addEventListener('click', event => { event.preventDefault(); navigateToChat(); });
    $('#btnNewChat')?.addEventListener('click', () => navigateToChat());
    $('#backToChat')?.addEventListener('click', () => navigateToChat());
    $('#navProjects')?.addEventListener('click', () => navigateToChat('projects'));
    $('#navLibrary')?.addEventListener('click', () => navigateToChat('library'));
    $('#navSettings')?.addEventListener('click', () => navigateToChat('settings'));
    $('#navTemplates')?.addEventListener('click', () => $('#templateScroll')?.scrollTo({ top: 0, behavior: 'smooth' }));

    $('#btnCollapse')?.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
      } else {
        sidebar.classList.toggle('collapsed');
        try { localStorage.setItem('nexora-sidebar-collapsed', sidebar.classList.contains('collapsed') ? '1' : '0'); } catch {}
      }
    });
    $('#btnMenuToggle')?.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('visible'); });
    overlay?.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('visible'); });
    $('#themeToggle')?.addEventListener('click', () => setTheme(document.body.classList.contains('light') ? 'dark' : 'light'));

    templateSearch?.addEventListener('input', event => syncSearch(event.target.value, templateSearch));
    sidebarSearch?.addEventListener('input', event => syncSearch(event.target.value, sidebarSearch));
    $('#clearFilters')?.addEventListener('click', () => {
      state.query = ''; state.tier = 'All'; state.category = 'All';
      templateSearch.value = ''; sidebarSearch.value = '';
      $$('.tier-tab').forEach(tab => {
        const active = tab.dataset.tier === 'All'; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderCategories(); render(); templateSearch.focus();
    });

    $$('.tier-tab').forEach(tab => tab.addEventListener('click', () => {
      state.tier = tab.dataset.tier || 'All';
      $$('.tier-tab').forEach(button => {
        const active = button === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      render();
    }));

    $$('[data-close-preview]').forEach(button => button.addEventListener('click', closePreview));
    $('#openFullPreview')?.addEventListener('click', () => {
      if (!state.activeTemplate) return;
      const target = new URL(fullPreviewRoute, window.location.href);
      target.searchParams.set('id', state.activeTemplate.id);
      target.searchParams.set('version', state.activeTemplate.version);
      window.open(target.href, '_blank', 'noopener,noreferrer');
    });
    useTemplateModal?.addEventListener('click', () => { if (state.activeTemplate) useTemplate(state.activeTemplate.id); });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && previewModal.classList.contains('open')) { closePreview(); return; }
      if (event.key === '/' && !previewModal.classList.contains('open') && !/input|textarea/i.test(document.activeElement?.tagName || '')) {
        event.preventDefault(); templateSearch?.focus();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) { sidebar.classList.remove('open'); overlay.classList.remove('visible'); }
    });
  }

  function populateCounts() {
    const freeCount = state.catalog.filter(item => item.tier === 'Free').length;
    const premiumCount = state.catalog.filter(item => item.tier === 'Premium').length;
    const setters = [['#totalCount',state.catalog.length],['#headerTemplateCount',state.catalog.length],['#freeCount',freeCount],['#premiumCount',premiumCount]];
    setters.forEach(([selector,value]) => { const node=$(selector); if(node) node.textContent=value; });
    if ($('#footerCount')) $('#footerCount').textContent = `${state.catalog.length} production-ready starters`;
    $$('.tier-tab').forEach(tab => {
      const span = $('span', tab); if (!span) return;
      span.textContent = tab.dataset.tier === 'Free' ? freeCount : tab.dataset.tier === 'Premium' ? premiumCount : state.catalog.length;
    });
  }

  function restoreSidebarState() {
    if (window.innerWidth <= 768) return;
    try { if (localStorage.getItem('nexora-sidebar-collapsed') === '1') sidebar.classList.add('collapsed'); } catch {}
  }

  async function hydrateAccount() {
    const bridge = window.NexoraSupabaseBridge;
    if (!bridge?.hasUsableSupabaseConfig(config) || !window.supabase?.createClient) return;
    const client = bridge.createClient(config);
    if (!client) return;
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data?.session) { window.location.replace(loginRoute); return; }
      const user = data.session.user;
      state.user = user;
      const metadata = user.user_metadata || {};
      const displayName = String(metadata.full_name || metadata.name || user.email?.split('@')[0] || 'User').trim();
      const avatarUrl = String(metadata.avatar_url || metadata.picture || '').trim();
      $('#profileName').textContent = displayName;
      $('#profileAvatar').textContent = (displayName[0] || 'U').toUpperCase();
      if (avatarUrl) {
        $('#profileAvatar').classList.add('has-image');
        $('#profileAvatar').style.backgroundImage = `url("${avatarUrl.replace(/"/g, '%22')}")`;
        $('#profileAvatar').textContent = '';
      }
      $('#btnSignOut')?.addEventListener('click', async () => { try { await client.auth.signOut(); } finally { window.location.replace(loginRoute); } });
      try {
        const { data: billing } = await client.from('billing').select('plan_tier,status').eq('user_id', user.id).maybeSingle();
        state.planTier = String(billing?.plan_tier || 'free').toLowerCase();
        state.billingStatus = String(billing?.status || 'active').toLowerCase();
        state.paid = state.planTier !== 'free' && ['active', 'trialing', 'paid'].includes(state.billingStatus);
        $('#profilePlan').textContent = state.planTier === 'free' ? 'Free Plan' : `${titleCase(state.planTier)} Plan`;
        if (!state.loading && !state.error) render();
      } catch (billingError) {
        console.warn('Template billing hydration failed:', billingError);
      }
    } catch (error) {
      console.warn('Template account hydration failed:', error);
    }
  }

  async function loadCatalog() {
    state.loading = true;
    state.error = null;
    render();
    const url = catalogUrl();
    if (!url) {
      state.loading = false;
      state.error = 'SUPABASE_URL or TEMPLATE_STORAGE configuration is missing.';
      render();
      return;
    }
    try {
      const response = await fetch(url, { cache: 'no-cache', mode: 'cors', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`catalog.json returned HTTP ${response.status}.`);
      const payload = await response.json();
      const rawTemplates = Array.isArray(payload) ? payload : payload?.templates;
      if (!Array.isArray(rawTemplates)) throw new Error('catalog.json does not contain a templates array.');
      const normalized = rawTemplates.map(normalizeCatalogItem).filter(Boolean);
      if (!normalized.length) throw new Error('catalog.json contains no valid templates.');
      normalized.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier === 'Free' ? -1 : 1;
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.title.localeCompare(b.title);
      });
      state.catalog = normalized;
      state.loading = false;
      populateCounts();
      renderCategories();
      render();
    } catch (error) {
      state.catalog = [];
      state.loading = false;
      state.error = error?.message || 'Could not load the Supabase template catalog.';
      populateCounts();
      renderCategories();
      render();
      console.error('Supabase template catalog failed:', error);
    }
  }

  loadTheme();
  restoreSidebarState();
  wireNavigation();
  hydrateAccount();
  loadCatalog();
  document.body.classList.remove('is-loading');
})();
