'use strict';

const crypto = require('node:crypto');
const { HttpError } = require('../veritrust-api');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUBLIC_CODE_RE = /^VT-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/;
const EVENT_TYPES = new Set(['lesson_started', 'lesson_completed', 'block_completed', 'bookmark_added', 'bookmark_removed', 'lab_completed']);

function requiredUuid(value, field = 'id') {
  const normalized = String(value || '').trim();
  if (!UUID_RE.test(normalized)) {
    throw new HttpError(400, `${field} must be a valid identifier.`, { code: 'INVALID_INPUT' });
  }
  return normalized;
}

function optionalUuid(value, field = 'id') {
  return value === null || value === undefined || value === '' ? null : requiredUuid(value, field);
}

function requiredSlug(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.length < 2 || normalized.length > 120 || !SLUG_RE.test(normalized)) {
    throw new HttpError(400, 'Course slug is invalid.', { code: 'INVALID_INPUT' });
  }
  return normalized;
}

function publicCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!PUBLIC_CODE_RE.test(normalized)) {
    throw new HttpError(404, 'Credential was not found.', { code: 'NOT_FOUND' });
  }
  return normalized;
}

function idempotencyKey(req) {
  const value = String(req.headers['idempotency-key'] || '').trim();
  if (value.length < 16 || value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new HttpError(400, 'A valid Idempotency-Key header is required.', { code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
  return value;
}

function cursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.created_at || !UUID_RE.test(String(parsed.id || ''))) throw new Error();
    return parsed;
  } catch {
    throw new HttpError(400, 'Pagination cursor is invalid.', { code: 'INVALID_CURSOR' });
  }
}

function encodeCursor(row) {
  if (!row?.created_at || !row?.id) return null;
  return Buffer.from(JSON.stringify({ created_at: row.created_at, id: row.id }), 'utf8').toString('base64url');
}

function boundedText(value, field, max, options = {}) {
  const normalized = String(value || '').trim();
  if ((!options.optional && !normalized) || normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) {
    throw new HttpError(400, `${field} is invalid.`, { code: 'INVALID_INPUT' });
  }
  return normalized || null;
}

function eventPayload(body) {
  const type = String(body?.event_type || '').trim().toLowerCase();
  if (!EVENT_TYPES.has(type)) throw new HttpError(400, 'Learning event type is invalid.', { code: 'INVALID_INPUT' });
  const payload = body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, 'utf8') > 8192) throw new HttpError(413, 'Learning event payload is too large.', { code: 'PAYLOAD_TOO_LARGE' });
  return {
    enrollment_id: requiredUuid(body?.enrollment_id, 'enrollment_id'),
    lesson_id: optionalUuid(body?.lesson_id, 'lesson_id'),
    event_type: type,
    occurred_at: body?.occurred_at ? boundedText(body.occurred_at, 'occurred_at', 40) : null,
    payload,
  };
}

function responsePayload(body) {
  const answer = body?.answer;
  if (answer === undefined || answer === null || typeof answer !== 'object' || Array.isArray(answer)) {
    throw new HttpError(400, 'answer must be a JSON object.', { code: 'INVALID_INPUT' });
  }
  if (Buffer.byteLength(JSON.stringify(answer), 'utf8') > 16384) {
    throw new HttpError(413, 'Assessment response is too large.', { code: 'PAYLOAD_TOO_LARGE' });
  }
  return {
    attempt_item_id: requiredUuid(body?.attempt_item_id, 'attempt_item_id'),
    answer,
  };
}

function requestId(req) {
  const supplied = String(req.headers['x-request-id'] || '').trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

module.exports = {
  boundedText,
  cursor,
  encodeCursor,
  eventPayload,
  idempotencyKey,
  optionalUuid,
  publicCode,
  requestId,
  requiredSlug,
  requiredUuid,
  responsePayload,
};
