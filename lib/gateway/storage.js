const { serverConfig } = require('../config');
const { HttpError } = require('../veritrust-api');

async function storageRequest(path, options = {}) {
  const key = serverConfig.supabaseServiceRoleKey;
  const response = await fetch(`${serverConfig.supabaseUrl}/storage/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  if (options.raw && response.ok) return response;
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new HttpError(response.status, 'Supabase Storage request failed.', { code: 'STORAGE_REQUEST_FAILED', provider_status: response.status });
  return data;
}

function encodedPath(bucket, path) {
  return `${encodeURIComponent(bucket)}/${String(path).split('/').map(encodeURIComponent).join('/')}`;
}

async function createSignedUpload(bucket, path) {
  return storageRequest(`/object/upload/sign/${encodedPath(bucket, path)}`, { method: 'POST', body: {} });
}

async function objectInfo(bucket, path) {
  return storageRequest(`/object/info/${encodedPath(bucket, path)}`);
}

async function downloadObject(bucket, path) {
  const response = await storageRequest(`/object/${encodedPath(bucket, path)}`, { raw: true, timeoutMs: 120000 });
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: String(response.headers.get('content-type') || 'application/octet-stream').split(';')[0].toLowerCase(),
  };
}

async function moveObject(bucket, sourcePath, destinationPath) {
  return storageRequest('/object/move', {
    method: 'POST',
    body: { bucketId: bucket, sourceKey: sourcePath, destinationKey: destinationPath },
    timeoutMs: 60000,
  });
}

async function deleteObject(bucket, path) {
  return storageRequest(`/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    body: { prefixes: [path] },
    timeoutMs: 60000,
  });
}

async function deleteObjects(bucket, paths) {
  const prefixes = [...new Set((paths || []).filter(Boolean))];
  if (!prefixes.length) return [];
  return storageRequest(`/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE', body: { prefixes }, timeoutMs: 60000,
  });
}

module.exports = {
  createSignedUpload,
  deleteObject,
  deleteObjects,
  downloadObject,
  moveObject,
  objectInfo,
};
