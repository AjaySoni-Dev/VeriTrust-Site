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
    session: '/api/session',
    scans: '/api/scans',
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
let scanContextPromise = null;

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

function setHistoryState(value) {
  qsa('.history-state').forEach((node) => {
    node.textContent = value;
  });
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
    const errorPayload = data.error || {};
    const details = data.details || data.raw || errorPayload || '';
    const detailText = typeof details === 'string'
      ? details
      : details?.error || details?.message || '';
    const message = errorPayload.message || detailText || 'Request failed.';
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

async function getScanContext() {
  if (!window.VeriTrustSupabase?.isConfigured()) {
    throw new Error('Account access is temporarily unavailable.');
  }

  if (!scanContextPromise) {
    scanContextPromise = window.VeriTrustSupabase.getSessionContext();
  }

  try {
    return await scanContextPromise;
  } catch (error) {
    scanContextPromise = null;
    throw new Error('Sign in to run and save this review.');
  }
}

async function authHeaders() {
  const token = await window.VeriTrustSupabase?.getAccessToken();
  if (!token) throw new Error('Sign in before running a saved VeriTrust scan.');
  return { Authorization: `Bearer ${token}` };
}

async function updateWorkspaceUi() {
  const card = qs('.tool-workspace-card');
  if (!card || !window.VeriTrustSupabase?.isConfigured()) return;

  try {
    const context = await getScanContext();
    const strong = qs('strong', card);
    const text = qs('p', card);
    if (strong) strong.textContent = context.organization?.name || 'Workspace';
    if (text) text.textContent = `Signed in as ${context.user?.email || 'authenticated user'}. Completed scans will be saved.`;
    card.classList.add('ready');
    setHistoryState('Will save');
  } catch {
    const strong = qs('strong', card);
    const text = qs('p', card);
    if (strong) strong.textContent = 'Sign in required';
    if (text) text.textContent = 'Sign in to save scans and review history.';
    setHistoryState('Sign in');
  }
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function formatPercent(value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
}

function normalizeReportData(data) {
  const result = data.result || {};
  return {
    title: data.report?.title || 'VeriTrust Scan Report',
    scan_id: data.scan_id || data.scan?.id || null,
    scan_type: data.scan_type || data.type || 'scan',
    created_at: data.created_at || new Date().toISOString(),
    model: {
      key: data.model?.key || '',
      name: data.model?.name || 'VeriTrust',
      fallback_used: Boolean(data.model?.fallback_used || data.model?.fallback_from),
      fallback_from: data.model?.fallback_from || null,
    },
    result,
    scores: data.scores || [],
    report: data.report || {
      title: 'VeriTrust Scan Report',
      disclaimer: result.disclaimer || 'AI-assisted result. Manual review is recommended.',
      exportable: true,
    },
  };
}

function reportFilename(data) {
  const report = normalizeReportData(data);
  const type = String(report.scan_type || 'scan').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const id = report.scan_id ? String(report.scan_id).slice(0, 8) : Date.now();
  return `veritrust-${type}-report-${id}.json`;
}

function downloadJsonReport(data) {
  const report = normalizeReportData(data);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFilename(data);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resultSummaryText(data) {
  const report = normalizeReportData(data);
  const result = report.result || {};
  return [
    report.title,
    `Type: ${report.scan_type}`,
    `Verdict: ${result.label || 'Unknown'}`,
    `Risk: ${result.risk_level || 'Low'}`,
    `Confidence: ${formatPercent(result.confidence)}`,
    result.confidence_band ? `Confidence band: ${result.confidence_band}` : '',
    `Model: ${report.model.name}`,
    report.model.fallback_used ? `Fallback used: ${report.model.fallback_from || 'yes'}` : '',
    report.scan_id ? `Scan ID: ${report.scan_id}` : '',
    result.summary || result.explanation || '',
    result.disclaimer || report.report?.disclaimer || '',
  ].filter(Boolean).join('\n');
}

async function copyResultSummary(data) {
  const text = resultSummaryText(data);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function printReport(data) {
  const report = normalizeReportData(data);
  const result = report.result || {};
  const evidence = result.evidence || result.indicators || [];
  const extracted = result.extracted || {};
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
    <head>
      <title>${escapeHtml(report.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111827; margin: 32px; line-height: 1.5; }
        h1 { margin: 0 0 8px; font-size: 24px; }
        h2 { margin: 24px 0 8px; font-size: 16px; }
        .meta, .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
        .label { color: #6b7280; font-size: 12px; text-transform: uppercase; }
        ul { padding-left: 18px; }
        .disclaimer { margin-top: 24px; color: #4b5563; font-size: 13px; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(report.title)}</h1>
      <p>${escapeHtml(new Date(report.created_at).toLocaleString())}</p>
      <div class="meta">
        <div class="box"><div class="label">Scan type</div>${escapeHtml(report.scan_type)}</div>
        <div class="box"><div class="label">Scan ID</div>${escapeHtml(report.scan_id || 'Not available')}</div>
        <div class="box"><div class="label">Model</div>${escapeHtml(report.model.name)}</div>
        <div class="box"><div class="label">Fallback</div>${report.model.fallback_used ? 'Used' : 'Not used'}</div>
      </div>
      <h2>Result</h2>
      <div class="metrics">
        <div class="box"><div class="label">Verdict</div>${escapeHtml(result.label || 'Unknown')}</div>
        <div class="box"><div class="label">Risk</div>${escapeHtml(result.risk_level || 'Low')}</div>
        <div class="box"><div class="label">Confidence</div>${escapeHtml(formatPercent(result.confidence))}</div>
        <div class="box"><div class="label">Confidence band</div>${escapeHtml(result.confidence_band || 'Not available')}</div>
      </div>
      <h2>Summary</h2>
      <p>${escapeHtml(result.summary || result.explanation || 'No summary available.')}</p>
      ${evidence.length ? `
        <h2>Evidence and Indicators</h2>
        <ul>${evidence.map((item) => `<li><strong>${escapeHtml(item.title || item.type || 'Signal')}</strong>: ${escapeHtml(item.description || item)}</li>`).join('')}</ul>
      ` : ''}
      ${Object.values(extracted).some((items) => Array.isArray(items) && items.length) ? `
        <h2>Extracted Entities</h2>
        ${Object.entries(extracted).map(([key, values]) => Array.isArray(values) && values.length ? `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(values.join(', '))}</p>` : '').join('')}
      ` : ''}
      <p class="disclaimer">${escapeHtml(result.disclaimer || report.report?.disclaimer || 'AI-assisted result. Manual review is recommended.')}</p>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
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
  if (level === 'critical') return 'risk-critical';
  if (level === 'high') return 'risk-high';
  if (level === 'medium') return 'risk-medium';
  if (level === 'low') return 'risk-low';
  return '';
}

function riskBadgeClass(level) {
  return `risk-badge risk-badge-${String(level || 'low').toLowerCase()}`;
}

function renderSignalList(items, emptyLabel) {
  if (!Array.isArray(items) || !items.length) {
    return `<p class="result-muted">${escapeHtml(emptyLabel || 'No additional signals were returned.')}</p>`;
  }
  return `
    <div class="signal-list">
      ${items.map((item) => {
    const signal = typeof item === 'string'
      ? { title: 'Signal', description: item, severity: 'Medium' }
      : item || {};
    return `
        <div class="signal-item">
          <div>
            <strong>${escapeHtml(signal.title || signal.type || 'Signal')}</strong>
            <p>${escapeHtml(signal.description || '')}</p>
          </div>
          <span class="${riskBadgeClass(signal.severity || 'Medium')}">${escapeHtml(signal.severity || 'Medium')}</span>
        </div>
      `;
  }).join('')}
    </div>
  `;
}

function renderExtractedEntities(extracted) {
  const groups = Object.entries(extracted || {}).filter(([, values]) => Array.isArray(values) && values.length);
  if (!groups.length) return '';
  return `
    <div class="result-section">
      <h3>Extracted</h3>
      <div class="entity-grid">
        ${groups.map(([key, values]) => `
          <div class="entity-group">
            <span>${escapeHtml(key)}</span>
            <strong>${escapeHtml(values.slice(0, 4).join(', '))}${values.length > 4 ? '...' : ''}</strong>
          </div>
        `).join('')}
      </div>
    </div>
  `;
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
  const confidence = formatPercent(result.confidence);
  const primaryScore = data.type === 'deepfake'
    ? formatPercent(result.fake_score)
    : formatPercent(result.phishing_score);

  const modelLabel = data.model?.name || (data.type === 'deepfake' ? 'VeriTrust Pixel' : 'VeriTrust MailGuard');
  let explanation = result.summary || result.explanation || 'Check complete.';
  if (labelLower === 'fake') {
    explanation = result.summary || 'The image is likely synthetic based on the selected model score.';
  } else if (labelLower === 'real') {
    explanation = result.summary || 'The image is lower-risk based on the selected model score.';
  } else if (labelLower === 'phishing') {
    explanation = result.summary || 'This message has risk signals commonly seen in scams or phishing.';
  } else if (labelLower === 'legitimate') {
    explanation = result.summary || 'No strong phishing indicators were found from the available signals.';
  } else if (isError) {
    explanation = result.explanation || 'The check could not be completed. Please try again.';
  }
  const signals = data.type === 'deepfake'
    ? (result.evidence || result.indicators || [])
    : (result.indicators || []);
  const confidenceWidth = Math.max(2, Number.parseInt(confidence, 10) || 0);

  target.innerHTML = `
    <div class="result-summary">
      <div>
        <span class="result-kicker">Verdict</span>
        <span class="final-label ${isBad ? 'bad' : 'good'}">${escapeHtml(result.label || 'Unknown')}</span>
      </div>
      <span class="status-pill">${escapeHtml(modelLabel)}</span>
    </div>
    <div class="score-meter"><span class="${riskClass(result)}" style="width:${confidenceWidth}%"></span></div>
    <div class="result-metrics">
      <div class="metric"><span>Confidence</span><strong>${confidence}</strong></div>
      <div class="metric"><span>${data.type === 'deepfake' ? 'Fake score' : 'Phishing score'}</span><strong>${primaryScore}</strong></div>
      <div class="metric"><span>Risk</span><strong class="${riskBadgeClass(result.risk_level || 'Low')}">${escapeHtml(result.risk_level || 'Low')}</strong></div>
      <div class="metric"><span>Band</span><strong>${escapeHtml(result.confidence_band || 'N/A')}</strong></div>
    </div>
    <p class="result-note">${escapeHtml(explanation)}</p>
    ${data.model?.fallback_used || data.model?.fallback_from ? '<p class="fallback-notice">Backup model used because the selected model was unavailable.</p>' : ''}
    <div class="result-section">
      <h3>${data.type === 'deepfake' ? 'Evidence' : 'Indicators'}</h3>
      ${renderSignalList(signals, data.type === 'deepfake' ? 'No additional evidence was returned.' : 'No strong phishing indicators were found.')}
    </div>
    ${renderExtractedEntities(result.extracted)}
    <div class="result-meta">
      <span>Model: ${escapeHtml(modelLabel)}</span>
      ${data.scan_id || data.scan?.id ? `<span>Scan ID: ${escapeHtml(data.scan_id || data.scan.id)}</span>` : ''}
    </div>
    <p class="result-disclaimer">${escapeHtml(result.disclaimer || data.report?.disclaimer || 'AI-assisted result. Manual review is recommended.')}</p>
    ${!isError ? `
      <div class="report-actions">
        <button class="btn btn-secondary" type="button" data-report-action="download">Download JSON</button>
        <button class="btn btn-secondary" type="button" data-report-action="print">Print / Save PDF</button>
        <button class="btn btn-secondary" type="button" data-report-action="copy">Copy Summary</button>
      </div>
    ` : ''}
  `;

  qs('[data-report-action="download"]', target)?.addEventListener('click', () => downloadJsonReport(data));
  qs('[data-report-action="print"]', target)?.addEventListener('click', () => printReport(data));
  qs('[data-report-action="copy"]', target)?.addEventListener('click', async () => {
    try {
      await copyResultSummary(data);
      setLog('Result summary copied.');
    } catch {
      setLog('Unable to copy summary.');
    }
  });
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
  const context = await getScanContext();
  const headers = await authHeaders();
  form.append('org_id', context.organization.id);

  setLog('Checking image...');
  const data = await requestJson(
    apiConfig.deepfake || '/api/deepfake',
    { method: 'POST', body: form, headers },
    'Unable to reach image analysis. Please check your connection and try again.'
  );
  renderResult('deepfakeResult', data);
  setHistoryState(data.scan?.persisted ? 'Saved' : 'Not saved');
  setLog('Image check complete.');
}

async function analyzePhishing() {
  const text = qs('#phishingText')?.value.trim() || '';
  if (!text) throw new Error('Paste a message to check.');
  if (text.length > MAX_PHISHING_CHARS) {
    throw new Error(`Message is too long. Keep it under ${MAX_PHISHING_CHARS.toLocaleString()} characters.`);
  }

  setLog('Checking message...');
  const context = await getScanContext();
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
  };
  const data = await requestJson(
    apiConfig.phishing || '/api/phishing',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        model: qs('#phishingModel')?.value || 'mailguard',
        org_id: context.organization.id,
      }),
    },
    'Unable to reach message analysis. Please check your connection and try again.'
  );
  renderResult('phishingResult', data);
  setHistoryState(data.scan?.persisted ? 'Saved' : 'Not saved');
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
      const ready = data.status === 'operational';
      status.classList.toggle('ready', ready);
      status.classList.toggle('warn', !ready);
      status.querySelector('span:last-child').textContent = ready ? 'Ready' : 'Setup needed';
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
  updateWorkspaceUi();

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
