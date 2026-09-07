// Nexora.AI shared browser configuration
// Supabase anon keys are public browser keys. Keep service-role keys private and never place them here.
// Keep OpenRouter/NVIDIA private keys out of this file. Nexora stores user-entered provider keys in browser localStorage and sends them only per request to the Vercel agent runtime.
window.NEXORA_CONFIG = {
  SUPABASE_URL: 'https://swvykvhyiwbkymdsjifr.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dnlrdmh5aXdia3ltZHNqaWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTgzOTIsImV4cCI6MjA5NTE5NDM5Mn0.HP5FynJUtbvlc32L5gzOYYe8ZnM94CoiE_03qmVt8EY',
  TEMPLATE_STORAGE: {
    PREVIEW_BUCKET: 'template-previews',
    CATALOG_PATH: 'catalog.json',
    CATALOG_VERSION: '2026-08-31'
  },
  OPENROUTER_API_KEY: '',
  OPENROUTER_PROXY_URL: '/api/openrouter',
  FORCE_OPENROUTER_PROXY: false,
  OPENROUTER_MODEL: 'openai/gpt-4o-mini',
  OPENROUTER_MODELS: [
    {
      id: 'openai/gpt-4o-mini',
      label: 'ChatGPT-4O Mini',
      premium: false
    },
    {
      id: 'deepseek/deepseek-v4-flash',
      label: 'DeepSeek Chat',
      premium: false
    }
  ],
  ROUTES: {
    ROOT: '/',
    LOGIN: '/login',
    SIGNUP: '/signup',
    CHAT: '/chat',
    TEMPLATE: '/template'
  }
};

// Backward compatibility for older scripts that read window.CONFIG.
window.CONFIG = window.NEXORA_CONFIG;
