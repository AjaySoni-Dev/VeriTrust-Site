// Backward-compatible loader for older cached HTML that still points to index.js.
// The chat app is now split into pages/chat/script/*.js modules.
(function loadModularChatScripts() {
  'use strict';

  const scripts = [
    'script/config.js',
    'script/supabase.js',
    'script/openrouter.js',
    'script/storage.js',
    '../../shared/nexora-visual-document.js',
    '../../shared/nexora-modular-json-pipeline.js',
    'script/app.js'
  ];

  function isAlreadyLoaded(src) {
    return Array.from(document.scripts).some(script => (script.getAttribute('src') || '').endsWith(src));
  }

  function loadSequentially(index = 0) {
    if (index >= scripts.length) return;
    const src = scripts[index];
    if (isAlreadyLoaded(src)) {
      loadSequentially(index + 1);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.defer = false;
    script.onload = () => loadSequentially(index + 1);
    script.onerror = () => console.error(`[Nexora] Failed to load ${src}`);
    document.body.appendChild(script);
  }

  loadSequentially();
})();
