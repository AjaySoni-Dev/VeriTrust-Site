const crypto = require('crypto');
const { HttpError } = require('./veritrust-api');
const { eq, supabaseFetch } = require('./supabase-server');

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function requestHash(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : stableStringify(value)).digest('hex');
}

function idempotencyKey(req) {
  const key = String(req.headers['idempotency-key'] || '').trim();
  if (!key) throw new HttpError(400, 'Idempotency-Key is required for scan requests.', { code: 'IDEMPOTENCY_KEY_REQUIRED' });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)) throw new HttpError(400, 'Idempotency-Key is invalid.', { code: 'IDEMPOTENCY_KEY_INVALID' });
  return key;
}

async function beginIdempotentRequest(req, auth, endpoint, hash) {
  const key = idempotencyKey(req);
  const rows = await supabaseFetch('/rest/v1/idempotency_keys?on_conflict=org_id,api_key_id,endpoint,idempotency_key&select=id', {
    method: 'POST', service: true,
    body: { org_id: auth.row.org_id, api_key_id: auth.row.id, endpoint, idempotency_key: key, request_hash: hash },
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
  });
  if (rows?.[0]) return { id: rows[0].id, replay: null };
  const existingRows = await supabaseFetch(`/rest/v1/idempotency_keys?org_id=eq.${eq(auth.row.org_id)}&api_key_id=eq.${eq(auth.row.id)}&endpoint=eq.${eq(endpoint)}&idempotency_key=eq.${eq(key)}&select=id,request_hash,response_status,response_body,expires_at&limit=1`, { service: true });
  const existing = existingRows?.[0];
  if (!existing || new Date(existing.expires_at) <= new Date()) throw new HttpError(409, 'Idempotency state expired; use a new key.', { code: 'IDEMPOTENCY_KEY_EXPIRED' });
  if (existing.request_hash !== hash) throw new HttpError(409, 'Idempotency-Key was already used with a different request.', { code: 'IDEMPOTENCY_KEY_REUSED' });
  if (existing.response_status == null || !existing.response_body) throw new HttpError(409, 'An identical request is already processing.', { code: 'IDEMPOTENCY_IN_PROGRESS', meta: { retry_after: 2 } });
  return { id: existing.id, replay: { status: existing.response_status, body: existing.response_body } };
}

async function completeIdempotentRequest(id, status, body) {
  await supabaseFetch(`/rest/v1/idempotency_keys?id=eq.${eq(id)}&response_status=is.null`, {
    method: 'PATCH', service: true, body: { response_status: status, response_body: body },
  });
}

async function abandonIdempotentRequest(id) {
  if (!id) return;
  await supabaseFetch(`/rest/v1/idempotency_keys?id=eq.${eq(id)}&response_status=is.null`, { method: 'DELETE', service: true }).catch(() => null);
}

module.exports = { abandonIdempotentRequest, beginIdempotentRequest, completeIdempotentRequest, idempotencyKey, requestHash, stableStringify };
