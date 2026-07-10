function loadServerRuntimeConfig() {
  try {
    const request = new XMLHttpRequest();
    request.open('GET', '/api/client-config', false);
    request.setRequestHeader('Accept', 'application/json');
    request.send(null);
    if (request.status >= 200 && request.status < 300) {
      const payload = JSON.parse(request.responseText || '{}');
      return payload.config || {};
    }
  } catch {
    return {};
  }
  return {};
}

const injectedConfig = window.VeriTrust_PUBLIC_CONFIG || {};
const serverRuntimeConfig = loadServerRuntimeConfig();

const runtimeConfigValue = {
  cropApiUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space/api/crop-image',
  cropOutputBaseUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space',
  maxImageBytes: 4 * 1024 * 1024,
  supabase: {
    url: '',
    anonKey: ''
  },
  api: {
    health: '/api/health',
    deepfake: '/api/deepfake',
    linkCheck: '/api/link-check',
    phishing: '/api/phishing',
    session: '/api/session',
    scans: '/api/scans',
    apiKeys: '/api/api-keys'
  },
  storage: {
    scanUploadsBucket: 'scan-uploads',
    scanCropsBucket: 'scan-crops',
    avatarsBucket: 'avatars',
    exportsBucket: 'exports'
  },
  ...serverRuntimeConfig,
  ...injectedConfig,
  supabase: {
    url: '',
    anonKey: '',
    ...(serverRuntimeConfig.supabase || {}),
    ...(injectedConfig.supabase || {})
  },
  api: {
    health: '/api/health',
    deepfake: '/api/deepfake',
    linkCheck: '/api/link-check',
    phishing: '/api/phishing',
    session: '/api/session',
    scans: '/api/scans',
    apiKeys: '/api/api-keys',
    ...(serverRuntimeConfig.api || {}),
    ...(injectedConfig.api || {})
  },
  storage: {
    scanUploadsBucket: 'scan-uploads',
    scanCropsBucket: 'scan-crops',
    avatarsBucket: 'avatars',
    exportsBucket: 'exports',
    ...(serverRuntimeConfig.storage || {}),
    ...(injectedConfig.storage || {})
  }
};

window.VeriTrust_CONFIG = runtimeConfigValue;
window['VERI' + 'TRUST_CONFIG'] = runtimeConfigValue;
