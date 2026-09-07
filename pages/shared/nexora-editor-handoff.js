(function initNexoraEditorHandoff(global) {
  'use strict';

  const DB_NAME = 'nexora-editor-handoff';
  const DB_VERSION = 1;
  const STORE_NAME = 'handoffs';
  const RECORD_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_RECORDS = 12;

  function randomId() {
    return `nxh_${global.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  }

  function checksum(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}:${text.length}`;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB is unavailable.'));
      const request = global.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAtMs', 'createdAtMs', { unique: false });
          store.createIndex('expiresAtMs', 'expiresAtMs', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked.'));
    });
  }

  async function withStore(mode, callback) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let result;
        try { result = callback(store, tx, resolve, reject); }
        catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
      });
    } finally {
      db.close();
    }
  }

  function cleanupStore(store, now = Date.now()) {
    try {
      const expiryIndex = store.index('expiresAtMs');
      const expired = expiryIndex.openCursor(IDBKeyRange.upperBound(now));
      expired.onsuccess = () => {
        const cursor = expired.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      const createdIndex = store.index('createdAtMs');
      const all = createdIndex.openCursor(null, 'prev');
      let seen = 0;
      all.onsuccess = () => {
        const cursor = all.result;
        if (!cursor) return;
        seen += 1;
        if (seen > MAX_RECORDS) cursor.delete();
        cursor.continue();
      };
    } catch {}
  }

  async function save(payload, options = {}) {
    if (!payload || typeof payload !== 'object') throw new Error('Editor handoff payload must be an object.');
    const serialized = JSON.stringify(payload);
    const now = Date.now();
    const id = String(options.id || randomId());
    const record = {
      id,
      schema: 'nexora.editor-handoff-record',
      version: '1.0.0',
      payload,
      checksum: checksum(serialized),
      createdAtMs: now,
      expiresAtMs: now + Math.max(60_000, Number(options.ttlMs || RECORD_TTL_MS)),
      byteLength: new TextEncoder().encode(serialized).byteLength
    };
    await withStore('readwrite', store => {
      cleanupStore(store, now);
      store.put(record);
    });
    return { id, checksum: record.checksum, byteLength: record.byteLength, transport: 'indexeddb' };
  }

  async function read(id, options = {}) {
    if (!id) return null;
    const record = await withStore('readonly', (store, tx, resolve, reject) => {
      const request = store.get(String(id));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Editor handoff read failed.'));
    });
    if (!record) return null;
    if (Number(record.expiresAtMs || 0) <= Date.now()) {
      await remove(id).catch(() => {});
      return null;
    }
    const serialized = JSON.stringify(record.payload);
    if (record.checksum && checksum(serialized) !== record.checksum) {
      throw new Error('Editor handoff integrity check failed.');
    }
    if (options.consume) await remove(id).catch(() => {});
    return record.payload || null;
  }

  async function remove(id) {
    if (!id) return;
    await withStore('readwrite', store => { store.delete(String(id)); });
  }

  async function cleanup() {
    await withStore('readwrite', store => cleanupStore(store, Date.now()));
  }

  global.NexoraEditorHandoff = Object.freeze({ save, read, remove, cleanup, checksum, DB_NAME, STORE_NAME });
})(window);
