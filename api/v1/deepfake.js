const {
  externalApiError,
  recordApiUsage,
  requestId,
  requireApiKey,
} = require('../../lib/api-keys');
const { applyEntitlementHeaders } = require('../../lib/entitlements');
const { externalModelKey, runDeepfakeDetection } = require('../../lib/detection-service');
const {
  DEEPFAKE_MODELS,
  handleOptions,
  parseMultipart,
  requireMethod,
  sendJson,
} = require('../../lib/veritrust-api');
const {
  validateImageUpload,
  validateModelKey,
} = require('../../lib/validators');

const CROP_API_URL = 'https://ajaysoni-dev-deepfakefusion.hf.space/api/crop-image';
const CROP_OUTPUT_BASE_URL = 'https://ajaysoni-dev-deepfakefusion.hf.space';

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function absoluteCropUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || String(url).startsWith('data:')) return url;
  return `${CROP_OUTPUT_BASE_URL}${String(url).startsWith('/') ? '' : '/'}${url}`;
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return null;
  return {
    buffer,
    mimeType: match[1].toLowerCase(),
  };
}

function cropOptions(fields) {
  return {
    requested: isTruthy(fields.crop) || isTruthy(fields.auto_crop) || isTruthy(fields.crop_face),
    faceIndex: Math.max(0, Number.parseInt(fields.face_index || '0', 10) || 0),
    processingSize: String(fields.processing_size || '768').trim(),
    cropSize: String(fields.crop_size || '256').trim(),
    margin: String(fields.margin || '0.15').trim(),
  };
}

async function downloadCropUrl(url) {
  const response = await fetch(absoluteCropUrl(url));
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = String(response.headers.get('content-type') || 'image/jpeg').split(';')[0].toLowerCase();
  return buffer.length ? { buffer, mimeType } : null;
}

async function prepareCroppedUpload(upload, fields) {
  const options = cropOptions(fields);
  const base = {
    requested: options.requested,
    used: false,
    face_count: 0,
    selected_face_index: null,
    annotated_image_url: '',
    status: options.requested ? 'not_used' : 'not_requested',
  };

  if (!options.requested) {
    return { upload, crop: base };
  }

  try {
    const form = new FormData();
    form.append('image', new Blob([upload.buffer], { type: upload.mimeType }), upload.filename || 'uploaded-image');
    form.append('processing_size', options.processingSize);
    form.append('crop_size', options.cropSize);
    form.append('margin', options.margin);
    form.append('include_crops', '1');

    const response = await fetch(CROP_API_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      return { upload, crop: { ...base, status: 'crop_service_failed' } };
    }

    const data = await response.json();
    const faces = Array.isArray(data.faces) ? data.faces : [];
    const faceCount = Number(data.face_count || faces.length || 0);
    const selectedIndex = Math.min(options.faceIndex, Math.max(0, faces.length - 1));
    const face = faces[selectedIndex] || null;
    const crop = {
      ...base,
      face_count: faceCount,
      annotated_image_url: absoluteCropUrl(data.annotated_url || ''),
    };

    if (!face) {
      return { upload, crop: { ...crop, status: 'no_face_found' } };
    }

    const cropImage = face.data_url
      ? decodeDataUrl(face.data_url)
      : await downloadCropUrl(face.crop_url);

    if (!cropImage) {
      return { upload, crop: { ...crop, status: 'crop_image_unavailable' } };
    }

    const croppedUpload = validateImageUpload({
      buffer: cropImage.buffer,
      filename: face.crop_filename || `veritrust-face-${selectedIndex + 1}.jpg`,
      mimeType: cropImage.mimeType,
      size: cropImage.buffer.length,
    });

    return {
      upload: croppedUpload,
      crop: {
        ...crop,
        used: true,
        selected_face_index: selectedIndex,
        status: 'used',
      },
    };
  } catch (error) {
    return {
      upload,
      crop: {
        ...base,
        status: error.name === 'TimeoutError' ? 'crop_service_timeout' : 'crop_service_error',
      },
    };
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const request_id = requestId();
  const started = Date.now();
  let auth = null;

  try {
    requireMethod(req, 'POST');
    auth = await requireApiKey(req, 'deepfake:scan');
    applyEntitlementHeaders(res, auth.entitlement);
    const { fields, files } = await parseMultipart(req);
    const modelKey = validateModelKey(externalModelKey('deepfake', fields.model), DEEPFAKE_MODELS, 'deepfake');
    const originalUpload = validateImageUpload(files.image);
    const prepared = await prepareCroppedUpload(originalUpload, fields);
    const upload = prepared.upload;
    const crop = prepared.crop;
    const createdAt = new Date().toISOString();
    const { payload } = await runDeepfakeDetection({
      upload,
      modelKey,
      createdAt,
      metadata: {
        filename: upload.filename,
        mime_type: upload.mimeType,
        size_bytes: upload.size,
        original_filename: originalUpload.filename,
        original_mime_type: originalUpload.mimeType,
        original_size_bytes: originalUpload.size,
        crop_requested: crop.requested,
        crop_used: crop.used,
        crop_status: crop.status,
        face_count: crop.face_count,
        selected_face_index: crop.selected_face_index,
      },
    });
    const usage = await recordApiUsage(auth, {
      endpoint: '/api/v1/deepfake',
      scan_type: 'deepfake',
      status: 'success',
      request_id,
      latency_ms: Date.now() - started,
    });

    sendJson(res, 200, {
      ok: true,
      request_id,
      scan_type: 'deepfake',
      created_at: createdAt,
      model: payload.model,
      result: payload.result,
      scores: payload.scores || [],
      preprocessing: {
        face_crop: crop,
      },
      usage: usage || auth.usage,
    });
  } catch (error) {
    if (auth) {
      await recordApiUsage(auth, {
        endpoint: '/api/v1/deepfake',
        scan_type: 'deepfake',
        status: 'error',
        request_id,
        latency_ms: Date.now() - started,
        error_code: error.code || error.extra?.code || 'INTERNAL_ERROR',
      });
    }
    externalApiError(res, error, 'Deepfake analysis failed.', request_id);
  }
};
