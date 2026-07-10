const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIN_PHISHING_TEXT_CHARS = 8;
const MAX_PHISHING_TEXT_CHARS = 12000;
const MAX_IMAGE_PIXELS = 40_000_000;

function validationError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validateImageUpload(upload, options = {}) {
  const maxBytes = Number(options.maxBytes || MAX_IMAGE_BYTES);
  const allowedTypes = options.allowedTypes || ALLOWED_IMAGE_TYPES;

  if (!upload) {
    throw validationError(400, 'IMAGE_REQUIRED', 'Upload an image using the image field.');
  }
  if (!upload.buffer || !Buffer.isBuffer(upload.buffer) || upload.buffer.length === 0) {
    throw validationError(400, 'IMAGE_EMPTY', 'Uploaded image is empty.');
  }
  if (upload.buffer.length > maxBytes || Number(upload.size || 0) > maxBytes) {
    throw validationError(413, 'IMAGE_TOO_LARGE', 'Image must be 4 MB or smaller for Vercel inference.');
  }

  const mimeType = String(upload.mimeType || '').toLowerCase();
  if (!mimeType || !allowedTypes.has(mimeType)) {
    throw validationError(400, 'IMAGE_TYPE_UNSUPPORTED', 'Unsupported image type. Use JPG, PNG, or WEBP.');
  }

  const detectedType = detectImageType(upload.buffer);
  if (!detectedType) {
    throw validationError(400, 'IMAGE_SIGNATURE_INVALID', 'Image signature is invalid or unsupported.');
  }
  if (detectedType !== mimeType || !allowedTypes.has(detectedType)) {
    throw validationError(400, 'IMAGE_SIGNATURE_MISMATCH', 'Declared image type does not match the file signature.');
  }

  const dimensions = detectImageDimensions(upload.buffer, detectedType);
  if (dimensions && (dimensions.width <= 0 || dimensions.height <= 0
      || dimensions.width * dimensions.height > Number(options.maxPixels || MAX_IMAGE_PIXELS))) {
    throw validationError(413, 'IMAGE_DIMENSIONS_TOO_LARGE', 'Decoded image dimensions exceed the safe pixel limit.');
  }

  return {
    ...upload,
    mimeType: detectedType,
    filename: `upload-${Date.now()}.${detectedType === 'image/jpeg' ? 'jpg' : detectedType.split('/')[1]}`,
    originalFilename: undefined,
    dimensions: dimensions || null,
  };
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function detectJpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const size = buffer.readUInt16BE(offset + 2);
    if (size < 2 || offset + 2 + size > buffer.length) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += size + 2;
  }
  return null;
}

function detectImageDimensions(buffer, mimeType = detectImageType(buffer)) {
  if (mimeType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === 'image/jpeg') return detectJpegDimensions(buffer);
  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 12, 16) === 'VP8X') {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  return null;
}

function hasExtremeCharacterRun(text) {
  return /(.)\1{80,}/u.test(text);
}

function hasLowVarietySpam(text) {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 80) return false;
  return new Set(compact.toLowerCase()).size <= 3;
}

function validatePhishingText(text) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    throw validationError(400, 'TEXT_REQUIRED', 'Paste an email, SMS, URL, or message to analyze.');
  }
  if (normalized.length < MIN_PHISHING_TEXT_CHARS) {
    throw validationError(400, 'TEXT_TOO_SHORT', 'Message is too short to analyze reliably.');
  }
  if (normalized.length > MAX_PHISHING_TEXT_CHARS) {
    throw validationError(400, 'TEXT_TOO_LONG', 'Text payload is too long. Keep it under 12,000 characters.');
  }
  if (hasExtremeCharacterRun(normalized) || hasLowVarietySpam(normalized)) {
    throw validationError(400, 'TEXT_SPAM_PAYLOAD', 'Message payload appears malformed. Paste meaningful text to analyze.');
  }
  return normalized;
}

function validateModelKey(modelKey, models, label) {
  const normalized = String(modelKey || '').trim().toLowerCase();
  if (!normalized || !Object.prototype.hasOwnProperty.call(models, normalized)) {
    throw validationError(400, 'MODEL_UNKNOWN', `Unknown ${label} model.`);
  }
  return normalized;
}

function validateJsonContentType(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw validationError(415, 'CONTENT_TYPE_UNSUPPORTED', 'Use application/json for this endpoint.');
  }
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_BYTES,
  MAX_PHISHING_TEXT_CHARS,
  detectImageDimensions,
  detectImageType,
  validateImageUpload,
  validateJsonContentType,
  validateModelKey,
  validatePhishingText,
};
