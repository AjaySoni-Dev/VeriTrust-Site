const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  originalImageFile: null,
  selectedDeepfakeFile: null,
  selectedCropIndex: 0,
  cropFaces: [],
  lastCropData: null,
};

const DEFAULT_CONFIG = {
  cropApiUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space/api/crop-image',
  cropOutputBaseUrl: 'https://ajaysoni-dev-deepfakefusion.hf.space',
  maxImageBytes: 4 * 1024 * 1024,
  api: {
    health: '/api/health',
    deepfake: '/api/deepfake',
    phishing: '/api/phishing',
  },
};

const runtimeConfig = window.VeriTrust_CONFIG || window['VERI' + 'TRUST_CONFIG'] || {};
const config = {
  ...DEFAULT_CONFIG,
  ...runtimeConfig,
  cropApiUrl: runtimeConfig.cropApiUrl || DEFAULT_CONFIG.cropApiUrl,
  cropOutputBaseUrl: runtimeConfig.cropOutputBaseUrl || DEFAULT_CONFIG.cropOutputBaseUrl,
  maxImageBytes: runtimeConfig.maxImageBytes || DEFAULT_CONFIG.maxImageBytes,
  api: {
    ...DEFAULT_CONFIG.api,
    ...(runtimeConfig.api || {}),
  },
};
const apiConfig = config.api || {};
const MAX_PHISHING_CHARS = 12000;

function absoluteCropUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const base = (config.cropOutputBaseUrl || '').replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function setLog(message) {
  setText('activityLog', message);
}

function setLoading(button, loading, label) {
  if (!button) return;
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
  button.disabled = loading;
  button.textContent = label || button.dataset.defaultLabel;
  button.classList.toggle('is-loading', loading);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function parseJsonResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (!response.ok) {
      throw new Error(`The server could not complete this check. Status ${response.status}.`);
    }
    throw new Error('The server returned an unexpected response.');
  }
  if (!response.ok || data.ok === false) {
    const details = data.details || data.raw || data.error || '';
    const detailText = typeof details === 'string'
      ? details
      : details?.error || details?.message || '';
    const message = data.error || detailText || 'Request failed.';
    throw new Error(message);
  }
  return data;
}

async function requestJson(url, options, fallbackMessage) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(fallbackMessage || 'Unable to reach the analysis server. Please try again.');
  }
  return parseJsonResponse(response);
}

function dataUrlToFile(dataUrl, filename) {
  const [head, body] = dataUrl.split(',');
  const mime = (head.match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

async function urlToFile(url, filename) {
  const response = await fetch(absoluteCropUrl(url), { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to fetch crop from the Space.');
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

function renderImagePreview(file) {
  const box = qs('#imagePreviewBox');
  const image = qs('#imagePreview');
  if (!box || !image || !file) return;
  image.src = URL.createObjectURL(file);
  box.classList.add('active');
  setText('imageFileName', `${file.name} (${Math.round(file.size / 1024)} KB)`);
}

function resetResult(targetId, message) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.classList.add('result-empty');
  target.classList.remove('result-ready', 'result-loading');
  target.innerHTML = message;
}

function showPlainPanel(targetId, message) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.classList.add('result-empty');
  target.classList.remove('result-ready', 'result-loading');
  target.textContent = message;
}

function renderLoadingResult(targetId, title, message) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.classList.remove('result-empty', 'result-ready');
  target.classList.add('result-loading');
  target.innerHTML = `
    <div class="loading-state">
      <span class="spinner" aria-hidden="true"></span>
      <strong>${title}</strong>
      <p>${message}</p>
    </div>
  `;
}

function renderCropLoading(message) {
  const wrap = qs('#cropResults');
  if (!wrap) return;
  wrap.classList.remove('has-crop');
  wrap.innerHTML = `
    <div class="loading-state small">
      <span class="spinner" aria-hidden="true"></span>
      <p>${message}</p>
    </div>
  `;
}

function cropSource(face) {
  if (!face) return '';
  return face.data_url || absoluteCropUrl(face.crop_url);
}

function renderSelectedCropPreview(index) {
  const wrap = qs('#cropResults');
  if (!wrap) return;
  const face = state.cropFaces[index];
  if (!face) {
    wrap.classList.remove('has-crop');
    wrap.textContent = 'No face was found. The full image will be checked.';
    return;
  }

  const cropUrl = cropSource(face);
  const annotatedUrl = absoluteCropUrl(state.lastCropData?.annotated_url || '');
  const faceButtons = state.cropFaces.map((item, itemIndex) => `
    <button class="${itemIndex === index ? 'active' : ''}" type="button" data-crop-index="${itemIndex}">
      Face ${item.face_index || itemIndex + 1}
    </button>
  `).join('');

  wrap.classList.add('has-crop');
  wrap.innerHTML = `
    <div class="crop-preview-head">
      <strong>Face preview</strong>
      <div class="crop-preview-actions">
        <a id="downloadCrop" download="VeriTrust-face-crop.jpg" href="${cropUrl}">Download</a>
        ${annotatedUrl ? `<a target="_blank" rel="noreferrer" href="${annotatedUrl}">View marked image</a>` : ''}
      </div>
    </div>
    <div class="crop-preview-grid${annotatedUrl ? '' : ' single'}">
      <figure>
        <img src="${cropUrl}" alt="Selected cropped face">
        <figcaption>Focused face</figcaption>
      </figure>
      ${annotatedUrl ? `
        <figure>
          <img src="${annotatedUrl}" alt="Annotated original image">
          <figcaption>Marked original</figcaption>
        </figure>
      ` : ''}
    </div>
    ${state.cropFaces.length > 1 ? `<div class="crop-face-list">${faceButtons}</div>` : ''}
  `;

  qsa('[data-crop-index]', wrap).forEach((button) => {
    button.addEventListener('click', async () => {
      const nextIndex = Number(button.dataset.cropIndex || 0);
      await setSelectedCropFile(nextIndex, false);
      renderSelectedCropPreview(nextIndex);
    });
  });
}

async function renderCropResults(data) {
  const wrap = qs('#cropResults');
  if (!wrap) return;
  state.lastCropData = data;
  state.cropFaces = data.faces || [];
  state.selectedCropIndex = 0;

  if (!state.cropFaces.length) {
    wrap.classList.remove('has-crop');
    wrap.textContent = 'No face was found. The full image will be checked.';
    state.selectedDeepfakeFile = state.originalImageFile;
    return;
  }

  await setSelectedCropFile(0, false);
  renderSelectedCropPreview(0);
}

async function setSelectedCropFile(index, updatePreview = true) {
  const face = state.cropFaces[index];
  if (!face) return;
  const filename = face.crop_filename || `VeriTrust-face-${index + 1}.jpg`;
  state.selectedDeepfakeFile = face.data_url
    ? dataUrlToFile(face.data_url, filename)
    : await urlToFile(face.crop_url, filename);
  state.selectedCropIndex = index;

  const link = qs('#downloadCrop');
  if (link) {
    link.href = cropSource(face);
  }
  if (updatePreview) renderSelectedCropPreview(index);
  setLog(`Face ${index + 1} selected for checking.`);
}

async function cropImage() {
  if (!state.originalImageFile) throw new Error('Choose an image first.');
  if (!config.cropApiUrl) throw new Error('Face preparation is not available right now.');

  const form = new FormData();
  form.append('image', state.originalImageFile);
  form.append('processing_size', qs('#processingSize')?.value || '768');
  form.append('crop_size', qs('#cropSize')?.value || '256');
  form.append('margin', qs('#cropMargin')?.value || '0.15');
  form.append('include_crops', '1');

  renderCropLoading('Preparing the face area...');
  setLog('Preparing the image...');
  const data = await requestJson(
    config.cropApiUrl,
    { method: 'POST', body: form },
    'Face preparation could not connect. The image can still be checked without cropping.'
  );
  await renderCropResults(data);
  setLog(data.face_count ? 'Face area ready.' : 'No face was found. The full image can still be checked.');
  return data;
}

function riskClass(result) {
  const level = String(result.risk_level || '').toLowerCase();
  if (level === 'high') return 'risk-high';
  if (level === 'medium') return 'risk-medium';
  return '';
}

function renderResult(targetId, data) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.classList.remove('result-empty', 'result-loading');
  target.classList.add('result-ready');
  const result = data.result || {};
  const labelLower = String(result.label || '').toLowerCase();
  const isError = labelLower === 'error';
  const isBad = isError || ['fake', 'phishing'].includes(labelLower);
  const confidence = Math.round(Number(result.confidence || 0) * 100);
  const primaryScore = data.type === 'deepfake'
    ? Math.round(Number(result.fake_score || 0) * 100)
    : Math.round(Number(result.phishing_score || 0) * 100);

  const modelLabel = data.model?.name || (data.type === 'deepfake' ? 'VeriTrust Pixel' : 'VeriTrust MailGuard');
  let explanation = result.explanation || 'Check complete.';
  if (labelLower === 'fake') {
    explanation = 'This image shows signs that it may be edited or generated.';
  } else if (labelLower === 'real') {
    explanation = 'This image does not show strong signs of being edited or generated.';
  } else if (labelLower === 'phishing') {
    explanation = 'This message has signs commonly seen in scams or phishing.';
  } else if (labelLower === 'legitimate') {
    explanation = 'This message does not show strong scam or phishing signs.';
  } else if (isError) {
    explanation = result.explanation || 'The check could not be completed. Please try again.';
  }

  target.innerHTML = `
    <div class="result-summary">
      <div>
        <span class="result-kicker">Verdict</span>
        <span class="final-label ${isBad ? 'bad' : 'good'}">${result.label || 'Unknown'}</span>
      </div>
      <span class="status-pill">${modelLabel}</span>
    </div>
    <div class="score-meter"><span class="${riskClass(result)}" style="width:${Math.max(2, confidence)}%"></span></div>
    <div class="result-metrics">
      <div class="metric"><span>Confidence</span><strong>${confidence}%</strong></div>
      <div class="metric"><span>Concern</span><strong>${primaryScore}%</strong></div>
      <div class="metric"><span>Risk</span><strong>${result.risk_level || 'Low'}</strong></div>
    </div>
    <p class="result-note">${explanation}</p>
    ${Array.isArray(result.indicators) && result.indicators.length ? `
      <div class="log-box">${result.indicators.map((item) => `- ${String(item)}`).join('<br>')}</div>
    ` : ''}
  `;
}

async function analyzeDeepfake() {
  if (!state.originalImageFile) throw new Error('Choose an image first.');
  const autoCrop = qs('#autoCropToggle')?.checked;

  if (autoCrop && (!state.selectedDeepfakeFile || state.selectedDeepfakeFile === state.originalImageFile)) {
    try {
      await cropImage();
    } catch (error) {
      state.selectedDeepfakeFile = state.originalImageFile;
      const cropResults = qs('#cropResults');
      if (cropResults) {
        cropResults.classList.remove('has-crop');
        cropResults.textContent = 'Face preparation was skipped. Checking the original image.';
      }
      setLog('Face preparation skipped. Checking the original image.');
    }
  }

  const image = state.selectedDeepfakeFile || state.originalImageFile;
  if (!image) throw new Error('No image is ready to check.');
  const maxBytes = Number(config.maxImageBytes || 0);
  if (maxBytes && image.size > maxBytes) {
    throw new Error(`This image is too large for direct checking. Use a smaller image under ${formatBytes(maxBytes)} or prepare the face first.`);
  }

  const form = new FormData();
  form.append('image', image);
  form.append('model', qs('#deepfakeModel')?.value || 'pixel');

  setLog('Checking image...');
  const data = await requestJson(
    apiConfig.deepfake || '/api/deepfake',
    { method: 'POST', body: form },
    'Unable to reach image analysis. Please check your connection and try again.'
  );
  renderResult('deepfakeResult', data);
  setLog('Image check complete.');
}

async function analyzePhishing() {
  const text = qs('#phishingText')?.value.trim() || '';
  if (!text) throw new Error('Paste a message to check.');
  if (text.length > MAX_PHISHING_CHARS) {
    throw new Error(`Message is too long. Keep it under ${MAX_PHISHING_CHARS.toLocaleString()} characters.`);
  }

  setLog('Checking message...');
  const data = await requestJson(
    apiConfig.phishing || '/api/phishing',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model: qs('#phishingModel')?.value || 'mailguard',
      }),
    },
    'Unable to reach message analysis. Please check your connection and try again.'
  );
  renderResult('phishingResult', data);
  setLog('Message check complete.');
}

function bindModules() {
  qsa('[data-module]').forEach((button) => {
    button.addEventListener('click', () => {
      const module = button.dataset.module;
      qsa('[data-module]').forEach((item) => item.classList.remove('active'));
      qsa('.workspace').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      qs(`#${module}Workspace`)?.classList.add('active');
      setLog(`${module === 'deepfake' ? 'Deepfake' : 'Phishing'} module selected.`);
    });
  });
}

function bindCustomModelSelects() {
  const controls = qsa('[data-model-select]');
  if (!controls.length) return;

  const closeAll = (except = null) => {
    controls.forEach((control) => {
      if (control === except) return;
      control.classList.remove('open');
      qs('.model-select-trigger', control)?.setAttribute('aria-expanded', 'false');
    });
  };

  controls.forEach((control) => {
    const select = document.getElementById(control.dataset.modelSelect || '');
    const trigger = qs('.model-select-trigger', control);
    const options = qsa('.model-option', control);
    const label = qs('[data-model-label]', control);
    const desc = qs('[data-model-desc]', control);
    const badge = qs('[data-model-badge]', control);
    if (!select || !trigger || !options.length) return;

    const setValue = (value, announce = true) => {
      const selectedOption = options.find((option) => option.dataset.value === value) || options[0];
      if (!selectedOption) return;
      select.value = selectedOption.dataset.value || '';
      options.forEach((option) => {
        const isActive = option === selectedOption;
        option.classList.toggle('active', isActive);
        option.setAttribute('aria-selected', String(isActive));
      });
      if (label) label.textContent = selectedOption.dataset.label || selectedOption.dataset.value || '';
      if (desc) desc.textContent = selectedOption.dataset.desc || '';
      if (badge) badge.textContent = selectedOption.dataset.badge || '';
      closeAll();
      if (announce) select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = control.classList.contains('open');
      closeAll(control);
      control.classList.toggle('open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAll();
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        trigger.click();
      }
    });

    options.forEach((option) => {
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        setValue(option.dataset.value || '');
      });
    });

    setValue(select.value || options[0].dataset.value || '', false);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-model-select]')) closeAll();
  });
}

async function checkHealth() {
  try {
    const data = await requestJson(apiConfig.health || '/api/health', { cache: 'no-store' }, 'Health check unavailable.');
    const status = qs('#proxyStatus');
    if (status) {
      status.classList.toggle('ready', Boolean(data.token_configured));
      status.classList.toggle('warn', !data.token_configured);
      status.querySelector('span:last-child').textContent = data.token_configured ? 'Ready' : 'Setup needed';
    }
  } catch (error) {
    const status = qs('#proxyStatus');
    if (status) {
      status.classList.add('warn');
      status.querySelector('span:last-child').textContent = 'Not ready';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindModules();
  bindCustomModelSelects();
  checkHealth();

  qs('#deepfakeImage')?.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    state.originalImageFile = file;
    state.selectedDeepfakeFile = file;
    state.cropFaces = [];
    state.lastCropData = null;
    renderImagePreview(file);
    const cropResults = qs('#cropResults');
    if (cropResults) {
      cropResults.classList.remove('has-crop');
      cropResults.textContent = 'Face preview will appear here after preparation.';
    }
    resetResult('deepfakeResult', 'Your image result will appear here.');
    const maxBytes = Number(config.maxImageBytes || 0);
    if (maxBytes && file.size > maxBytes) {
      setLog(`Image loaded. Use Crop Face before checking images over ${formatBytes(maxBytes)}.`);
    } else {
      setLog('Image loaded. You can check it now.');
    }
  });

  qs('#cropButton')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      setLoading(button, true, 'Preparing...');
      await cropImage();
    } catch (error) {
      setLog(error.message);
      const cropResults = qs('#cropResults');
      if (cropResults) cropResults.textContent = error.message;
    } finally {
      setLoading(button, false);
    }
  });

  qs('#deepfakeForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = qs('#deepfakeSubmit');
    try {
      resetResult('deepfakeResult', '');
      renderLoadingResult('deepfakeResult', 'Checking image', 'Please wait while VeriTrust reviews the image.');
      setLoading(button, true, 'Checking...');
      await analyzeDeepfake();
    } catch (error) {
      renderResult('deepfakeResult', {
        type: 'deepfake',
        model: { name: 'VeriTrust' },
        result: { label: 'Error', confidence: 0, risk_level: 'Low', fake_score: 0, explanation: error.message },
      });
      setLog(error.message);
    } finally {
      setLoading(button, false);
    }
  });

  qs('#phishingForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = qs('#phishingSubmit');
    try {
      resetResult('phishingResult', '');
      renderLoadingResult('phishingResult', 'Checking message', 'Please wait while VeriTrust reviews the content.');
      setLoading(button, true, 'Checking...');
      await analyzePhishing();
    } catch (error) {
      renderResult('phishingResult', {
        type: 'phishing',
        model: { name: 'VeriTrust' },
        result: { label: 'Error', confidence: 0, risk_level: 'Low', phishing_score: 0, explanation: error.message },
      });
      setLog(error.message);
    } finally {
      setLoading(button, false);
    }
  });
});
