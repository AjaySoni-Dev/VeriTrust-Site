const Busboy = require('busboy');

const DEEPFAKE_MODELS = {
  pixel: {
    display_name: 'VeriTrust Pixel',
    hf_model: 'Wvolf/ViT_Deepfake_Detection',
    provider: 'hf-inference',
  },
  prism: {
    display_name: 'VeriTrust Prism',
    hf_model: 'dima806/deepfake_vs_real_image_detection',
    provider: 'hf-inference',
  },
};

const PHISHING_MODELS = {
  mailguard: {
    display_name: 'VeriTrust MailGuard',
    hf_model: 'cybersectony/phishing-email-detection-distilbert_v2.4.1',
    provider: 'hf-inference',
  },
  cortex: {
    display_name: 'VeriTrust Cortex',
    hf_model: 'odedovadia/Llama-3.2-1B-Instruct-phishing-detection',
    provider: 'featherless-ai',
  },
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp']);

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
}

function handleOptions(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function requireMethod(req, method) {
  if (req.method !== method) {
    throw new HttpError(405, `Use ${method} for this endpoint.`);
  }
}

function handleApiError(res, error, fallback = 'Request failed.') {
  const status = Number(error.status || 500);
  const rawMessage = String(error.message || fallback);
  const message = rawMessage.includes('timed out')
    ? 'The analysis service took too long to respond. Please try again.'
    : rawMessage;
  sendJson(res, status, {
    ok: false,
    error: message,
    ...(error.extra || {}),
  });
}

function findHfToken() {
  const token = process.env.HF_ACCESS_TOKEN || process.env.HF_TOKEN;
  return token && token.trim() ? token.trim() : null;
}

function readHfToken() {
  const token = findHfToken();
  if (!token) {
    throw new HttpError(500, 'Hugging Face API token is not configured on Vercel.');
  }
  return token;
}

function contains(haystack, needle) {
  return String(haystack).includes(needle);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function scoreItem(label, score) {
  return { label, score: clamp01(score) };
}

function encodeModelId(modelId) {
  return modelId.split('/').map(encodeURIComponent).join('/');
}

function hfModelUrls(provider, modelId) {
  const encodedModel = encodeModelId(modelId);
  const urls = [`https://router.huggingface.co/${provider}/models/${encodedModel}`];
  if (provider === 'hf-inference') {
    urls.push(`https://api-inference.huggingface.co/models/${encodedModel}`);
  }
  return urls;
}

async function hfRequest(url, headers, body, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    const raw = await response.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      raw,
      json,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      raw: '',
      json: null,
      error: error.name === 'AbortError' ? 'Hugging Face request timed out.' : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function hfBinaryInference(provider, modelId, buffer, mimeType) {
  const token = readHfToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': mimeType,
    'X-Wait-For-Model': 'true',
  };

  let last = null;
  for (const url of hfModelUrls(provider, modelId)) {
    const result = await hfRequest(url, headers, buffer, 120000);
    if (result.ok) return result;
    last = result;
  }
  return last || { ok: false, status: 0, json: null, raw: '', error: 'No endpoint attempted.' };
}

async function hfJsonInference(provider, modelId, payload, timeoutMs = 120000) {
  const token = readHfToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Wait-For-Model': 'true',
  };
  const body = JSON.stringify(payload);

  let last = null;
  for (const url of hfModelUrls(provider, modelId)) {
    const result = await hfRequest(url, headers, body, timeoutMs);
    if (result.ok) return result;
    last = result;
  }
  return last || { ok: false, status: 0, json: null, raw: '', error: 'No endpoint attempted.' };
}

async function hfChatCompletion(modelId, messages) {
  const token = readHfToken();
  return hfRequest(
    'https://router.huggingface.co/featherless-ai/v1/chat/completions',
    {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    JSON.stringify({
      model: modelId,
      messages,
      temperature: 0,
      max_tokens: 256,
    }),
    150000
  );
}

function flattenScores(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (raw.error) return [];
  if (Array.isArray(raw) && Array.isArray(raw[0]) && raw[0][0] && typeof raw[0][0] === 'object') {
    return raw[0];
  }
  if (Array.isArray(raw) && raw[0] && Object.prototype.hasOwnProperty.call(raw[0], 'label')) {
    return raw;
  }
  return [];
}

function readRawBody(req, maxBytes = 64000) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new HttpError(413, 'Request payload is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function parseJsonBody(req, maxBytes = 64000) {
  const body = await readRawBody(req, maxBytes);
  if (!body) return {};
  if (typeof body === 'object') return body;

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(body));
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function parseMultipart(req, options = {}) {
  const {
    fileField = 'image',
    maxFileBytes = MAX_IMAGE_BYTES,
    allowedTypes = ALLOWED_IMAGE_TYPES,
  } = options;

  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          fields: 20,
          fileSize: maxFileBytes,
          files: 1,
        },
      });
    } catch {
      reject(new HttpError(400, 'Request must be multipart/form-data.'));
      return;
    }

    const fields = {};
    const files = {};
    let fileTooLarge = false;
    let parseFailed = false;

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (name, file, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      let size = 0;

      if (name !== fileField) {
        file.resume();
        return;
      }

      if (!allowedTypes.has(mimeType)) {
        parseFailed = true;
        file.resume();
        reject(new HttpError(400, 'Unsupported image type. Use JPG, PNG, WEBP, or BMP.'));
        return;
      }

      file.on('data', (chunk) => {
        size += chunk.length;
        chunks.push(chunk);
      });
      file.on('limit', () => {
        fileTooLarge = true;
        file.resume();
      });
      file.on('end', () => {
        if (!fileTooLarge && !parseFailed) {
          files[name] = {
            buffer: Buffer.concat(chunks),
            filename: filename || 'uploaded-image',
            mimeType,
            size,
          };
        }
      });
    });

    busboy.on('finish', () => {
      if (parseFailed) return;
      if (fileTooLarge) {
        reject(new HttpError(413, 'Image must be 4 MB or smaller for Vercel inference.'));
        return;
      }
      resolve({ fields, files });
    });

    busboy.on('error', (error) => reject(new HttpError(400, error.message)));
    req.pipe(busboy);
  });
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  DEEPFAKE_MODELS,
  MAX_IMAGE_BYTES,
  PHISHING_MODELS,
  HttpError,
  clamp01,
  contains,
  findHfToken,
  flattenScores,
  handleApiError,
  handleOptions,
  hfBinaryInference,
  hfChatCompletion,
  hfJsonInference,
  parseJsonBody,
  parseMultipart,
  requireMethod,
  scoreItem,
  sendJson,
};
