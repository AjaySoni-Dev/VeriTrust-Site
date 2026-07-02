const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  originalImageFile: null,
  selectedDeepfakeFile: null,
  selectedCropIndex: 0,
  cropFaces: [],
  lastCropData: null,
};

const config = window.VERITRUST_CONFIG || {};
const apiConfig = config.api || {};

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
    throw new Error('Server returned a non-JSON response.');
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
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
    wrap.textContent = 'No face detected. Original image will be used.';
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
      <strong>Crop output</strong>
      <div class="crop-preview-actions">
        <a id="downloadCrop" download="veritrust-face-crop.jpg" href="${cropUrl}">Download</a>
        ${annotatedUrl ? `<a target="_blank" rel="noreferrer" href="${annotatedUrl}">Annotated</a>` : ''}
      </div>
    </div>
    <div class="crop-preview-grid${annotatedUrl ? '' : ' single'}">
      <figure>
        <img src="${cropUrl}" alt="Selected cropped face">
        <figcaption>Cropped face</figcaption>
      </figure>
      ${annotatedUrl ? `
        <figure>
          <img src="${annotatedUrl}" alt="Annotated original image">
          <figcaption>Annotated original</figcaption>
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
    wrap.textContent = 'No face detected. Original image will be used.';
    state.selectedDeepfakeFile = state.originalImageFile;
    return;
  }

  await setSelectedCropFile(0, false);
  renderSelectedCropPreview(0);
}

async function setSelectedCropFile(index, updatePreview = true) {
  const face = state.cropFaces[index];
  if (!face) return;
  const filename = face.crop_filename || `veritrust-face-${index + 1}.jpg`;
  state.selectedDeepfakeFile = face.data_url
    ? dataUrlToFile(face.data_url, filename)
    : await urlToFile(face.crop_url, filename);
  state.selectedCropIndex = index;

  const link = qs('#downloadCrop');
  if (link) {
    link.href = cropSource(face);
  }
  if (updatePreview) renderSelectedCropPreview(index);
  setLog(`Selected face crop ${index + 1} for deepfake analysis.`);
}

async function cropImage() {
  if (!state.originalImageFile) throw new Error('Upload an image first.');
  if (!config.cropApiUrl) throw new Error('Crop API URL is missing in assets/js/config.js.');

  const form = new FormData();
  form.append('image', state.originalImageFile);
  form.append('processing_size', qs('#processingSize')?.value || '768');
  form.append('crop_size', qs('#cropSize')?.value || '256');
  form.append('margin', qs('#cropMargin')?.value || '0.15');
  form.append('include_crops', '1');

  setLog('Sending image to the Hugging Face face-crop Space...');
  const response = await fetch(config.cropApiUrl, { method: 'POST', body: form });
  const data = await parseJsonResponse(response);
  await renderCropResults(data);
  setLog(data.face_count ? `Crop complete. ${data.face_count} face crop(s) ready.` : 'Crop complete. No faces detected.');
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
  target.classList.remove('result-empty');
  target.classList.add('result-ready');
  const result = data.result || {};
  const isBad = ['fake', 'phishing'].includes(String(result.label || '').toLowerCase());
  const confidence = Math.round(Number(result.confidence || 0) * 100);
  const primaryScore = data.type === 'deepfake'
    ? Math.round(Number(result.fake_score || 0) * 100)
    : Math.round(Number(result.phishing_score || 0) * 100);

  target.innerHTML = `
    <div class="result-summary">
      <div>
        <span class="result-kicker">Verdict</span>
        <span class="final-label ${isBad ? 'bad' : 'good'}">${result.label || 'Unknown'}</span>
      </div>
      <span class="status-pill">${data.model?.name || 'Model'}</span>
    </div>
    <div class="score-meter"><span class="${riskClass(result)}" style="width:${Math.max(2, confidence)}%"></span></div>
    <div class="result-metrics">
      <div class="metric"><span>Confidence</span><strong>${confidence}%</strong></div>
      <div class="metric"><span>${data.type === 'deepfake' ? 'Fake score' : 'Phishing score'}</span><strong>${primaryScore}%</strong></div>
      <div class="metric"><span>Risk</span><strong>${result.risk_level || 'Low'}</strong></div>
    </div>
    <p class="result-note">${result.explanation || 'Analysis completed.'}</p>
    ${Array.isArray(result.indicators) && result.indicators.length ? `
      <div class="log-box">${result.indicators.map((item) => `- ${String(item)}`).join('<br>')}</div>
    ` : ''}
  `;
}

async function analyzeDeepfake() {
  if (!state.originalImageFile) throw new Error('Upload an image first.');
  const autoCrop = qs('#autoCropToggle')?.checked;

  if (autoCrop && (!state.selectedDeepfakeFile || state.selectedDeepfakeFile === state.originalImageFile)) {
    await cropImage();
  }

  const image = state.selectedDeepfakeFile || state.originalImageFile;
  if (!image) throw new Error('No image is ready for analysis.');

  const form = new FormData();
  form.append('image', image);
  form.append('model', qs('#deepfakeModel')?.value || 'pixel');

  setLog('Sending selected image to the server-side Hugging Face proxy...');
  const response = await fetch(apiConfig.deepfake || '/api/deepfake', { method: 'POST', body: form });
  const data = await parseJsonResponse(response);
  renderResult('deepfakeResult', data);
  setLog('Deepfake analysis complete.');
}

async function analyzePhishing() {
  const text = qs('#phishingText')?.value.trim() || '';
  if (!text) throw new Error('Paste a message to analyze.');

  setLog('Sending text to the server-side Hugging Face proxy...');
  const response = await fetch(apiConfig.phishing || '/api/phishing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model: qs('#phishingModel')?.value || 'mailguard',
    }),
  });
  const data = await parseJsonResponse(response);
  renderResult('phishingResult', data);
  setLog('Phishing analysis complete.');
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

async function checkHealth() {
  try {
    const response = await fetch(apiConfig.health || '/api/health', { cache: 'no-store' });
    const data = await parseJsonResponse(response);
    const status = qs('#proxyStatus');
    if (status) {
      status.classList.toggle('ready', Boolean(data.token_configured));
      status.classList.toggle('warn', !data.token_configured);
      status.querySelector('span:last-child').textContent = data.token_configured ? 'HF token ready' : 'HF token missing';
    }
  } catch (error) {
    const status = qs('#proxyStatus');
    if (status) {
      status.classList.add('warn');
      status.querySelector('span:last-child').textContent = 'Proxy check failed';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindModules();
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
      cropResults.textContent = 'Crop preview will appear here.';
    }
    const maxBytes = Number(config.maxImageBytes || 0);
    if (maxBytes && file.size > maxBytes) {
      setLog(`Image loaded. Crop before analysis because Vercel inference accepts up to ${formatBytes(maxBytes)}.`);
    } else {
      setLog('Image loaded. Analyze directly or crop first.');
    }
  });

  qs('#cropButton')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      setLoading(button, true, 'Cropping...');
      await cropImage();
    } catch (error) {
      setLog(error.message);
    } finally {
      setLoading(button, false);
    }
  });

  qs('#deepfakeForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = qs('#deepfakeSubmit');
    try {
      setLoading(button, true, 'Analyzing...');
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
      setLoading(button, true, 'Analyzing...');
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
