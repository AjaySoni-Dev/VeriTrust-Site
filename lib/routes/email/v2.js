const crypto = require('crypto');
const { serverConfig } = require('../../config');
const { validatePlainTextInput, validateReceiverEvent, MAX_RAW_EML_BYTES } = require('../../email/contracts');
const { analyzeEmail, emailEvidenceReport } = require('../../email/service');
const { requestIdentifiers, requireIdempotencyKey } = require('../../gateway/idempotency');
const { authenticate } = require('../../gateway/persistence');
const { downloadObject } = require('../../gateway/storage');
const { HttpError, parseJsonBody } = require('../../veritrust-api');
const { validateJsonContentType } = require('../../validators');

function header(req, name) {
  const value = req.headers?.[String(name).toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '');
}

function readRawBuffer(req, maxBytes = MAX_RAW_EML_BYTES) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) throw new HttpError(413, 'Raw email exceeds the 10 MiB endpoint limit.', { code: 'UNSUPPORTED_LIMIT' });
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    const value = Buffer.from(req.body, 'utf8');
    if (value.length > maxBytes) throw new HttpError(413, 'Raw email exceeds the 10 MiB endpoint limit.', { code: 'UNSUPPORTED_LIMIT' });
    return Promise.resolve(value);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      if (rejected) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        rejected = true;
        reject(new HttpError(413, 'Raw email exceeds the 10 MiB endpoint limit.', { code: 'UNSUPPORTED_LIMIT' }));
        req.resume();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks, bytes)); });
    req.on('error', reject);
  });
}

function requireMessageRfc822(req) {
  const contentType = header(req, 'content-type').split(';')[0].trim().toLowerCase();
  if (contentType !== 'message/rfc822') throw new HttpError(415, 'Use Content-Type: message/rfc822 for raw email analysis.', { code: 'EMAIL_CONTENT_TYPE_REQUIRED' });
  const retention = header(req, 'x-retention-policy').trim().toLowerCase();
  if (retention && !['ephemeral_24h', 'temporary_file'].includes(retention)) {
    throw new HttpError(400, 'X-Retention-Policy must be ephemeral_24h or temporary_file.', { code: 'EMAIL_RETENTION_INVALID' });
  }
}

function requireReceiverSecret(req) {
  const supplied = Buffer.from(header(req, 'x-veritrust-receiver-secret'));
  const expected = Buffer.from(serverConfig.emailReceiverSecret);
  if (supplied.length !== expected.length || supplied.length < 32 || !crypto.timingSafeEqual(supplied, expected)) {
    throw new HttpError(401, 'Trusted receiver authorization failed.', { code: 'RECEIVER_UNAUTHORIZED' });
  }
}

function parseRawReference(value, orgId) {
  const raw = String(value || '').trim();
  const prefix = 'gateway-uploads:';
  if (!raw.startsWith(prefix)) throw new HttpError(400, 'raw_eml_ref must reference gateway-uploads.', { code: 'RAW_EML_REF_INVALID' });
  const path = raw.slice(prefix.length).replace(/^\/+/, '');
  if (!path.startsWith(`${orgId}/`)) throw new HttpError(403, 'raw_eml_ref is outside the authenticated organization.', { code: 'RAW_EML_REF_TENANT_MISMATCH' });
  if (path.includes('..') || path.includes('\\')) throw new HttpError(400, 'raw_eml_ref contains an invalid path.', { code: 'RAW_EML_REF_INVALID' });
  return path;
}

async function analyzeText(req) {
  const ids = requestIdentifiers(req);
  const auth = await authenticate(req, 'gateway:scan');
  const idempotencyKey = requireIdempotencyKey(req);
  validateJsonContentType(req);
  const text = validatePlainTextInput(await parseJsonBody(req, 32768));
  if (text.org_id && text.org_id !== auth.organization.id) throw new HttpError(403, 'org_id does not match the authenticated organization.', { code: 'ORG_MISMATCH' });
  return analyzeEmail({ auth, mode: 'plain_text', text, integrationId: text.integration_id, idempotencyKey, requestId: ids.requestId, traceId: ids.traceId });
}

async function analyzeEml(req) {
  const ids = requestIdentifiers(req);
  const auth = await authenticate(req, 'gateway:scan');
  const idempotencyKey = requireIdempotencyKey(req);
  requireMessageRfc822(req);
  const raw = await readRawBuffer(req);
  return analyzeEmail({ auth, mode: 'raw_eml', raw, idempotencyKey, requestId: ids.requestId, traceId: ids.traceId });
}

async function receiverEvent(req) {
  const ids = requestIdentifiers(req);
  requireReceiverSecret(req);
  const auth = await authenticate(req, 'gateway:scan');
  const idempotencyKey = requireIdempotencyKey(req);
  validateJsonContentType(req);
  const receiver = validateReceiverEvent(await parseJsonBody(req, 32768));
  if (receiver.org_id !== auth.organization.id) throw new HttpError(403, 'Receiver event organization does not match authentication.', { code: 'ORG_MISMATCH' });
  const path = parseRawReference(receiver.raw_eml_ref, auth.organization.id);
  const object = await downloadObject('gateway-uploads', path);
  if (object.buffer.length > MAX_RAW_EML_BYTES) throw new HttpError(413, 'Raw email exceeds the 10 MiB endpoint limit.', { code: 'UNSUPPORTED_LIMIT' });
  return analyzeEmail({ auth, mode: 'trusted_receiver_event', raw: object.buffer, receiver, integrationId: receiver.integration_id, idempotencyKey, requestId: ids.requestId, traceId: ids.traceId });
}

async function evidence(req, scanId) {
  const auth = await authenticate(req, 'gateway:read');
  const report = await emailEvidenceReport(auth.organization.id, scanId);
  if (!report) throw new HttpError(404, 'Email evidence was not found.', { code: 'EMAIL_EVIDENCE_NOT_FOUND' });
  return { status: 200, body: { ok: true, evidence: report }, replayed: false };
}

module.exports = { analyzeEml, analyzeText, evidence, readRawBuffer, receiverEvent };
