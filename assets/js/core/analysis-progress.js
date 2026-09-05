(function analysisProgressModule(global) {
  'use strict';

  function checkedPayload(payload, status = 200) {
    if (!payload || payload.ok === false || status >= 400) {
      const error = new Error(payload?.error?.message || 'The analysis request could not be completed.');
      error.code = payload?.error?.code || 'ANALYSIS_REQUEST_FAILED';
      error.status = status;
      throw error;
    }
    return payload;
  }

  async function readResponse(response, onEvent = () => {}) {
    if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
      let payload;
      try { payload = await response.json(); } catch { throw new Error('The server returned an unreadable response. No result is available.'); }
      return checkedPayload(payload, response.status);
    }
    if (!response.body) throw new Error('Live updates are unavailable in this browser.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let bytes = 0;
    let final = null;
    let sequence = 0;
    function consume(line) {
      if (!line.trim()) return;
      let event;
      try { event = JSON.parse(line); } catch { throw new Error('A server update was unreadable. Check scan history before retrying.'); }
      if (!Number.isInteger(event.sequence) || event.sequence <= sequence) throw new Error('The server update sequence was invalid.');
      sequence = event.sequence;
      if (event.type === 'result') { final = event; return; }
      if (event.type !== 'progress' || !['running', 'completed', 'failed', 'skipped'].includes(event.state) || typeof event.stage !== 'string' || typeof event.message !== 'string') throw new Error('The server returned an unsupported progress update.');
      onEvent(event);
    }
    try {
      while (!final) {
        const { value, done } = await reader.read();
        if (done) { buffer += decoder.decode(); if (buffer.trim()) consume(buffer); break; }
        bytes += value.byteLength;
        if (bytes > 4 * 1024 * 1024) throw new Error('The server response exceeded the report size limit.');
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while (!final && (boundary = buffer.indexOf('\n')) !== -1) {
          consume(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 1);
        }
      }
      if (!final) throw new Error('The connection ended before a final report arrived. Check scan history before retrying.');
      return checkedPayload(final.payload, final.status);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }

  function create() {
    const panel = global.document?.getElementById('analysisProgress');
    const heading = global.document?.getElementById('analysisProgressTitle');
    const current = global.document?.getElementById('analysisProgressMessage');
    const list = global.document?.getElementById('analysisProgressEvents');
    const entries = new Map();
    let active = false;
    function begin(message = 'Checking input and workspace access.') {
      active = true;
      entries.clear(); list?.replaceChildren();
      if (panel) { panel.hidden = false; panel.dataset.state = 'running'; }
      const idle = global.document?.getElementById('analysisIdle');
      if (idle) idle.hidden = true;
      const details = panel?.querySelector('details');
      if (details) details.open = true;
      if (heading) heading.textContent = 'Analysis in progress';
      if (current) current.textContent = message;
    }
    function update(event) {
      if (!active) return;
      if (current) current.textContent = event.message;
      if (!list) return;
      let row = entries.get(event.stage);
      if (!row) {
        row = global.document.createElement('li');
        row.append(global.document.createElement('span'), global.document.createElement('p'));
        entries.set(event.stage, row); list.append(row);
      }
      row.dataset.state = event.state;
      row.children[0].textContent = { running: 'In progress', completed: 'Done', failed: 'Unavailable', skipped: 'Not applicable' }[event.state];
      row.children[1].textContent = event.message;
    }
    function finish(error = null, { pending = false } = {}) {
      active = false;
      if (panel) panel.dataset.state = error ? 'failed' : 'completed';
      if (heading) heading.textContent = error ? 'Analysis interrupted' : pending ? 'Scan still processing' : 'Report received';
      if (current) current.textContent = error ? error.message : pending ? 'The server confirmed that this scan is already running. Open its saved status to follow it.' : 'Review the result and any evidence limitations below.';
      for (const row of entries.values()) {
        if (row.dataset.state === 'running') {
          row.dataset.state = 'interrupted'; row.children[0].textContent = 'No final update';
        }
      }
      const details = panel?.querySelector('details');
      if (details) details.open = Boolean(error);
    }
    async function request(url, options = {}) {
      if (current) current.textContent = 'Sending the request. Waiting for the server to confirm processing.';
      return global.VeriTrustAnalysisResult.withDeadline(async (signal) => {
        let response;
        try {
          response = await global.fetch(url, { ...options, signal, credentials: 'same-origin', headers: { ...options.headers, Accept: 'application/x-ndjson' } });
        } catch (error) {
          if (signal.aborted) throw error;
          throw new Error('The connection failed. Check scan history before submitting again.');
        }
        if (!response.headers.get('content-type')?.includes('application/x-ndjson') && current) current.textContent = 'Reading the server response. This deployment did not provide live processing updates.';
        return readResponse(response, update);
      });
    }
    return { begin, update, finish, request };
  }

  const api = { create, readResponse };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.VeriTrustAnalysisProgress = api;
}(typeof window === 'object' ? window : globalThis));
