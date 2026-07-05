const runtimeConfigValue = {
  cropApiUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space/api/crop-image',
  cropOutputBaseUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space',
  maxImageBytes: 4 * 1024 * 1024,
  supabase: {
    url: 'https://dkibhlcgilkshlumwrao.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRraWJobGNnaWxrc2hsdW13cmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNTgyMzUsImV4cCI6MjA5ODczNDIzNX0.qiRHkURAOZ7uaBf12uguD3Jc9kj2dKEN-pxZT_Q4EI8'
  },
  api: {
    health: '/api/health',
    deepfake: '/api/deepfake',
    phishing: '/api/phishing',
    session: '/api/session',
    scans: '/api/scans'
  },
  storage: {
    scanUploadsBucket: 'scan-uploads',
    scanCropsBucket: 'scan-crops',
    avatarsBucket: 'avatars',
    exportsBucket: 'exports'
  }
};

window.VeriTrust_CONFIG = runtimeConfigValue;
window['VERI' + 'TRUST_CONFIG'] = runtimeConfigValue;
