const { HttpError } = require('../veritrust-api');

const EMAIL_EVIDENCE_SCHEMA = 'phishing-evidence-3';
const EMAIL_PIPELINE_VERSION = 'mailgraph-pipeline-2';
const EMAIL_PARSER_VERSION = 'mailparser-3.9.15+veritrust-1';
const EMAIL_AUTH_VERSION = 'mailauth-5.0.2+veritrust-1';
const EMAIL_IDENTITY_VERSION = 'mailgraph-identity-1';
const EMAIL_INFRASTRUCTURE_VERSION = 'mailgraph-infrastructure-1';

const INPUT_MODES = Object.freeze(['plain_text', 'raw_eml', 'trusted_receiver_event']);
const SPECIALIST_STATES = Object.freeze(['LIKELY_BENIGN', 'LIKELY_PHISHING', 'UNCERTAIN', 'UNSUPPORTED', 'FAILED']);
const MAX_RAW_EML_BYTES = 10 * 1024 * 1024;
const MAX_HEADER_BYTES = 256 * 1024;
const MAX_MIME_DEPTH = 10;
const MAX_MIME_PARTS = 100;
const MAX_DECODED_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_NORMALIZED_HTML_BYTES = 1024 * 1024;
const PARSER_TIMEOUT_MS = 5000;

const CAPABILITIES = Object.freeze({
  plain_text: Object.freeze({
    mime: false,
    headers: false,
    spf: false,
    dkim: false,
    dmarc: false,
    arc: false,
    links: true,
    attachments: false,
    infrastructure_geo: false,
    media_authenticity: false,
  }),
  raw_eml: Object.freeze({
    mime: true,
    headers: true,
    spf: false,
    dkim: true,
    dmarc: true,
    arc: true,
    links: true,
    attachments: true,
    infrastructure_geo: true,
    media_authenticity: false,
  }),
  trusted_receiver_event: Object.freeze({
    mime: true,
    headers: true,
    spf: true,
    dkim: true,
    dmarc: true,
    arc: true,
    links: true,
    attachments: true,
    infrastructure_geo: true,
    media_authenticity: false,
  }),
});

function contractError(status, code, message) {
  throw new HttpError(status, message, { code });
}

function validatePlainTextInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) contractError(400, 'EMAIL_TEXT_SCHEMA_INVALID', 'The request body must be a JSON object.');
  const unknown = Object.keys(value).filter((key) => !['subject', 'body', 'channel', 'locale_hint', 'retention_policy', 'org_id', 'integration_id'].includes(key));
  if (unknown.length) contractError(400, 'EMAIL_TEXT_SCHEMA_UNKNOWN_FIELD', `Unsupported fields: ${unknown.sort().join(', ')}.`);
  const subject = typeof value.subject === 'string' ? value.subject.trim() : '';
  const body = typeof value.body === 'string' ? value.body.trim() : '';
  if (!subject && !body) contractError(400, 'EMAIL_TEXT_REQUIRED', 'Provide a subject or message body.');
  if (subject.length > 998) contractError(413, 'EMAIL_SUBJECT_TOO_LARGE', 'subject must be 998 characters or shorter.');
  if (body.length > 12000) contractError(413, 'EMAIL_TEXT_TOO_LARGE', 'body must be 12,000 characters or shorter.');
  const channel = String(value.channel || 'email').toLowerCase();
  if (!['email', 'sms'].includes(channel)) contractError(400, 'EMAIL_CHANNEL_INVALID', 'channel must be email or sms.');
  return {
    subject,
    body,
    channel,
    locale_hint: typeof value.locale_hint === 'string' ? value.locale_hint.trim().slice(0, 32) : null,
    retention_policy: normalizeRetention(value.retention_policy),
    org_id: value.org_id || null,
    integration_id: value.integration_id || null,
  };
}

function normalizeRetention(value) {
  const retention = String(value || 'temporary_file').toLowerCase();
  if (!['none', 'metadata_only', 'temporary_file', 'retained_file'].includes(retention)) {
    contractError(400, 'EMAIL_RETENTION_INVALID', 'retention_policy is not supported.');
  }
  return retention;
}

function validateReceiverEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) contractError(400, 'RECEIVER_EVENT_SCHEMA_INVALID', 'The receiver event must be a JSON object.');
  const allowed = ['org_id', 'integration_id', 'raw_eml_ref', 'client_ip', 'mail_from', 'helo', 'receiver_id', 'authserv_id', 'received_at'];
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) contractError(400, 'RECEIVER_EVENT_SCHEMA_UNKNOWN_FIELD', `Unsupported fields: ${unknown.sort().join(', ')}.`);
  for (const field of allowed) {
    if (!value[field] || typeof value[field] !== 'string') contractError(400, 'RECEIVER_EVENT_FIELD_REQUIRED', `${field} is required.`);
  }
  const receivedAt = new Date(value.received_at);
  if (Number.isNaN(receivedAt.getTime())) contractError(400, 'RECEIVER_EVENT_TIME_INVALID', 'received_at must be an ISO-8601 timestamp.');
  return {
    ...Object.fromEntries(allowed.map((field) => [field, String(value[field]).trim()])),
    received_at: receivedAt.toISOString(),
  };
}

module.exports = {
  CAPABILITIES,
  EMAIL_AUTH_VERSION,
  EMAIL_EVIDENCE_SCHEMA,
  EMAIL_IDENTITY_VERSION,
  EMAIL_INFRASTRUCTURE_VERSION,
  EMAIL_PARSER_VERSION,
  EMAIL_PIPELINE_VERSION,
  INPUT_MODES,
  MAX_ATTACHMENT_BYTES,
  MAX_DECODED_BYTES,
  MAX_HEADER_BYTES,
  MAX_MIME_DEPTH,
  MAX_MIME_PARTS,
  MAX_NORMALIZED_HTML_BYTES,
  MAX_RAW_EML_BYTES,
  PARSER_TIMEOUT_MS,
  SPECIALIST_STATES,
  normalizeRetention,
  validatePlainTextInput,
  validateReceiverEvent,
};
