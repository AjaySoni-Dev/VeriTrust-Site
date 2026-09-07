(function initNexoraChatConfig(window) {
  'use strict';

  const runtime = window.NEXORA_CONFIG || window.CONFIG || {};

  window.NexoraChatConfig = Object.freeze({
    runtime,
    openRouter: Object.freeze({
      apiUrl: runtime.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
      proxyUrl: runtime.OPENROUTER_PROXY_URL || '/api/openrouter',
      apiKey: runtime.OPENROUTER_API_KEY || '',
      model: runtime.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free',
      models: Array.isArray(runtime.OPENROUTER_MODELS) ? runtime.OPENROUTER_MODELS : [],
      appTitle: 'Nexora AI'
    }),
    schemas: Object.freeze({
      webProject: 'nexora.web-project',
      webProjectVersion: '1.0.0',
      pageDocument: 'nexora.page-document',
      pageDocumentVersion: '1.0.0',
      visualDocument: 'nexora.visual-document',
      visualDocumentVersion: '3.0.0',
      visualBlueprint: 'nexora.visual-blueprint',
      aiWebsiteBundle: 'nexora.ai-website-bundle'
    }),
    storage: Object.freeze({
      pendingVisualDocument: 'nexora_pending_visual_document',
      pendingWebProject: 'nexora_pending_web_project',
      pendingPageDocument: 'nexora_pending_page_document',
      pendingUniversalPage: 'nexora_pending_universal_page',
      pendingEditorHandoff: 'nexora_pending_editor_handoff_v5',
      pendingGeneratedProject: 'nexora_pending_generated_project'
    })
  });
})(window);
