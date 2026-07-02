const runtimeConfigValue = {
  cropApiUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space/api/crop-image',
  cropOutputBaseUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space',
  maxImageBytes: 4 * 1024 * 1024,
  api: {
    health: '/api/health',
    deepfake: '/api/deepfake',
    phishing: '/api/phishing'
  }
};

window.VeriTrust_CONFIG = runtimeConfigValue;
window['VERI' + 'TRUST_CONFIG'] = runtimeConfigValue;
