(function analysisProgressModule(global) {
  'use strict';

  function checkedPayload(payload, status = 200) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.ok !== true || status >= 400) {
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
    const closeButton = global.document?.getElementById('analysisProgressClose');
    const entries = new Map();
    const isDialog = panel?.tagName === 'DIALOG';
    let active = false;
    let autoCloseTimer = null;

    function showPanel() {
      if (!panel) return;
      panel.hidden = false;
      if (isDialog && !panel.open) {
        try { panel.showModal(); } catch { panel.setAttribute('open', ''); }
      }
    }

    function dismiss() {
      active = false;
      if (autoCloseTimer) global.clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
      if (!panel) return;
      if (isDialog && panel.open) {
        try { panel.close(); } catch { panel.removeAttribute('open'); }
      }
      panel.hidden = true;
      const idle = global.document?.getElementById('analysisIdle');
      if (idle) idle.hidden = false;
    }

    closeButton?.addEventListener('click', dismiss);
    panel?.addEventListener?.('cancel', (event) => {
      if (active) event.preventDefault();
    });

    function begin(message = 'Validating the investigation request.') {
      active = true;
      if (autoCloseTimer) global.clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
      entries.clear();
      list?.replaceChildren();
      showPanel();
      if (panel) panel.dataset.state = 'running';
      const idle = global.document?.getElementById('analysisIdle');
      if (idle) idle.hidden = true;
      if (heading) heading.textContent = 'Analysis in progress';
      if (current) current.textContent = message;
      if (closeButton) closeButton.hidden = true;
    }

    function update(event) {
      if (!active) return;
      if (current) current.textContent = event.message;
      if (!list) return;
      let row = entries.get(event.stage);
      if (!row) {
        row = global.document.createElement('li');
        const status = global.document.createElement('span');
        const copy = global.document.createElement('p');
        row.append(status, copy);
        entries.set(event.stage, row);
        list.append(row);
      }
      row.dataset.state = event.state;
      row.children[0].textContent = { running: 'In progress', completed: 'Completed', failed: 'Unavailable', skipped: 'Not applicable' }[event.state];
      row.children[1].textContent = event.message;
      row.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }

    function finish(error = null, { pending = false, title, message } = {}) {
      active = false;
      if (panel) panel.dataset.state = error ? 'failed' : pending ? 'pending' : 'completed';
      if (heading) heading.textContent = error ? 'Analysis interrupted' : pending ? 'Analysis is still running' : 'Analysis complete';
      if (current) current.textContent = error
        ? `${error.message}${error.code ? ` Reference: ${error.code}.` : ''}`
        : pending
          ? 'This investigation is still being processed. Open the saved report to continue.'
          : 'The forensic report is ready.';
      if (!error && title && heading) heading.textContent = title;
      if (!error && message && current) current.textContent = message;
      for (const row of entries.values()) {
        if (row.dataset.state === 'running') {
          row.dataset.state = 'interrupted';
          row.children[0].textContent = 'No final update';
        }
      }
      if (closeButton) closeButton.hidden = !(error || pending);
      if (isDialog && !error && !pending) {
        autoCloseTimer = global.setTimeout(dismiss, 420);
      }
    }

    async function request(url, options = {}) {
      if (current) current.textContent = 'Submitting evidence securely and starting analysis.';
      return global.VeriTrustAnalysisResult.withDeadline(async (signal) => {
        let response;
        try {
          response = await global.fetch(url, { ...options, signal, credentials: 'same-origin', headers: { ...options.headers, Accept: 'application/x-ndjson' } });
        } catch (error) {
          if (signal.aborted) throw error;
          throw new Error('The connection failed. Check scan history before submitting again.');
        }
        if (!response.headers.get('content-type')?.includes('application/x-ndjson') && current) current.textContent = 'The server is completing the investigation without live stage updates.';
        return readResponse(response, update);
      });
    }

    return { begin, update, finish, dismiss, request };
  }

  const api = { create, readResponse };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.VeriTrustAnalysisProgress = api;
}(typeof window === 'object' ? window : globalThis));
