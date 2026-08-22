(function emailInvestigationPage(global) {
  'use strict';

  const MAX_EML_BYTES = 10 * 1024 * 1024;
  const CONFIGURATION_FAILURE_CODES = new Set(['GATEWAY_POLICY_INVALID', 'GATEWAY_POLICY_UNAVAILABLE', 'SERVER_CONFIG_ERROR']);
  const STATE_LABELS = Object.freeze({
    LIKELY_PHISHING: 'Likely phishing',
    LIKELY_BENIGN: 'Likely benign',
    UNCERTAIN: 'Uncertain',
    UNSUPPORTED: 'Unsupported',
    FAILED: 'Analysis failed',
  });
  const state = { mode: 'text', file: null, busy: false, lastScanId: null };
  const one = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const titleCase = (value) => String(value || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  function endpoint(name, fallback) {
    const runtime = global.VeriTrust_CONFIG || global['VERI' + 'TRUST_CONFIG'] || {};
    return runtime.api?.[name] || fallback;
  }

  function setStatus(message) {
    const target = one('#activityLog');
    if (target) target.textContent = message;
  }

  function setError(message) {
    const target = one('#emailInputError');
    if (!target) return;
    target.textContent = message || '';
    target.hidden = !message;
    if (message) target.focus();
  }

  function failureGuidance(error) {
    if (CONFIGURATION_FAILURE_CODES.has(error?.code)) {
      return {
        summary: 'The investigation service needs an administrator configuration correction. Your message is not the cause.',
        detail: 'Your message was accepted, but the investigation service needs an administrator configuration correction. Retry after the deployment is updated.',
      };
    }
    return {
      summary: error?.message || 'The investigation could not be completed.',
      detail: 'Check the input and retry. If the failure continues, give support the error code below.',
    };
  }

  function setBusy(busy) {
    state.busy = busy;
    const button = one('#phishingSubmit');
    if (!button) return;
    button.disabled = busy || state.mode === 'receiver';
    button.textContent = busy ? 'Investigating…' : state.mode === 'eml' ? 'Analyze .eml' : 'Run investigation';
    button.toggleAttribute('aria-busy', busy);
  }

  function setMode(mode, focusPanel = false) {
    state.mode = mode;
    const tabs = all('[data-email-mode]');
    tabs.forEach((tab) => {
      const selected = tab.dataset.emailMode === mode;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    all('[data-email-panel]').forEach((panel) => { panel.hidden = panel.dataset.emailPanel !== mode; });
    const rawEvidence = mode !== 'text';
    const auth = one('[data-preview-auth]');
    const identity = one('[data-preview-identity]');
    const infra = one('[data-preview-infra]');
    if (auth) auth.textContent = mode === 'receiver' ? 'SMTP + header evidence' : rawEvidence ? 'Header evidence; SPF unavailable' : 'Unavailable in paste mode';
    if (identity) identity.textContent = rawEvidence ? 'Header-derived relationships' : 'Limited';
    if (infra) infra.textContent = rawEvidence ? 'Approximate, when routable IPs exist' : 'Unavailable in paste mode';
    setError('');
    setBusy(false);
    if (focusPanel) {
      const focusTarget = mode === 'text' ? one('#emailSubject') : mode === 'eml' ? one('.email-dropzone') : one('#emailPanelReceiver a');
      focusTarget?.focus();
    }
  }

  function validateFile(file) {
    if (!file) throw new Error('Choose a raw .eml file to investigate.');
    if (!file.size) throw new Error('The selected file is empty.');
    if (file.size > MAX_EML_BYTES) throw new Error('The selected email exceeds the 10 MiB limit.');
    const extensionOk = /\.eml$/iu.test(file.name || '');
    const typeOk = !file.type || ['message/rfc822', 'application/octet-stream', 'text/plain'].includes(file.type);
    if (!extensionOk && !typeOk) throw new Error('Choose an .eml or message/rfc822 file.');
    return file;
  }

  function chooseFile(file) {
    state.file = validateFile(file);
    const label = one('#emailFileLabel');
    if (label) label.textContent = `${state.file.name} · ${(state.file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KiB`;
  }

  async function parseResponse(response) {
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || !payload?.ok) {
      const error = payload?.error || {};
      const message = error.message || payload?.message || `The investigation could not be completed (status ${response.status}).`;
      const failure = new Error(message);
      failure.code = error.code || 'EMAIL_REQUEST_FAILED';
      failure.meta = error.meta || null;
      throw failure;
    }
    return payload;
  }

  async function requestInvestigation() {
    if (!global.VeriTrustSupabase?.isConfigured()) throw new Error('Account access is temporarily unavailable.');
    const context = await global.VeriTrustSupabase.getSessionContext();
    if (!context?.organization?.id) throw new Error('Sign in and select a workspace before starting an investigation.');
    const idempotencyKey = global.crypto?.randomUUID?.() || `email-web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (state.mode === 'eml') {
      const file = validateFile(state.file || one('#emailEmlFile')?.files?.[0]);
      return parseResponse(await fetch(endpoint('emailAnalyzeEml', '/api/v2/phishing/analyze-eml'), {
        method: 'POST',
        headers: { 'Content-Type': 'message/rfc822', 'Idempotency-Key': idempotencyKey, 'X-Retention-Policy': 'ephemeral_24h' },
        body: file,
      }));
    }
    if (state.mode === 'receiver') throw new Error('Trusted receiver events are sent by configured server integrations, not from the browser.');
    const subject = one('#emailSubject')?.value.trim() || '';
    const body = one('#phishingText')?.value.trim() || '';
    if (!subject && !body) throw new Error('Provide an email subject or message body.');
    if (body.length > 12000) throw new Error('Keep the message body at or below 12,000 characters.');
    return parseResponse(await fetch(endpoint('emailAnalyzeText', '/api/v2/phishing/analyze-text'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ subject, body, channel: 'email', retention_policy: 'metadata_only', org_id: context.organization.id }),
    }));
  }

  function coverageData(evidence) {
    const capabilities = evidence.capabilities || {};
    const observations = Array.isArray(evidence.observations) ? evidence.observations : [];
    const authentication = observations.filter((item) => item.protocol);
    const children = Array.isArray(evidence.children) ? evidence.children : [];
    const model = Array.isArray(evidence.model_evidence) ? evidence.model_evidence[0] : null;
    const infrastructure = Array.isArray(evidence.infrastructure) ? evidence.infrastructure : [];
    const relationships = Array.isArray(evidence.relationships) ? evidence.relationships : [];
    const urls = children.filter((item) => item.type === 'url');
    const attachments = children.filter((item) => item.type === 'attachment');
    const availableAuth = authentication.filter((item) => item.result !== 'UNAVAILABLE');
    return [
      ['Content', 'observed', `${observations.filter((item) => item.code).length} deterministic observation(s)`],
      ['Authentication', capabilities.headers ? (availableAuth.length ? 'observed' : 'partial') : 'unavailable', capabilities.headers ? `${availableAuth.length} protocol result(s); SPF requires receiver facts` : 'No headers or SMTP facts'],
      ['Identity', relationships.length ? 'observed' : capabilities.headers ? 'partial' : 'unavailable', relationships.length ? `${relationships.length} relationship(s)` : 'No comparable identities'],
      ['URL intelligence', urls.length ? (urls.some((item) => item.state !== 'completed') ? 'partial' : 'observed') : 'unavailable', urls.length ? `${urls.length} extracted URL artifact(s)` : 'No URL observed'],
      ['Infrastructure', infrastructure.length ? 'observed' : capabilities.infrastructure_geo ? 'partial' : 'unavailable', infrastructure.length ? `${infrastructure.length} conservative hop(s)` : 'No eligible routing hop'],
      ['Attachments', attachments.length ? 'partial' : capabilities.attachments ? 'observed' : 'unavailable', attachments.length ? `${attachments.length} metadata-only artifact(s)` : capabilities.attachments ? 'No attachment observed' : 'Not available in this mode'],
      ['Content model', model?.status === 'completed' ? 'observed' : model?.status === 'failed' ? 'failed' : 'partial', model?.status === 'completed' ? 'Qualified registry version used' : 'No authoritative model result'],
      ['Media authenticity', 'unavailable', 'Deepfake module disabled for email'],
    ];
  }

  function renderCoverage(items) {
    return `<div class="email-coverage-results" aria-label="Observed evidence coverage">${items.map(([name, status, detail]) => `
      <article class="email-coverage-item" data-coverage="${escapeHtml(status)}">
        <span>${escapeHtml(name)}</span><strong>${escapeHtml(titleCase(status))}</strong><small>${escapeHtml(detail)}</small>
      </article>`).join('')}</div>`;
  }

  function evidenceList(items, emptyMessage, mapper) {
    if (!items.length) return `<p class="email-evidence-empty">${escapeHtml(emptyMessage)}</p>`;
    return `<ul class="email-evidence-list">${items.map((item) => {
      const [label, detail] = mapper(item);
      return `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></li>`;
    }).join('')}</ul>`;
  }

  function renderResult(payload) {
    const evidence = payload.evidence || {};
    const decision = payload.gateway_decision || {};
    const specialistState = STATE_LABELS[evidence.state] ? evidence.state : 'UNCERTAIN';
    const observations = Array.isArray(evidence.observations) ? evidence.observations : [];
    const authentication = observations.filter((item) => item.protocol);
    const deterministic = observations.filter((item) => item.code);
    const relationships = Array.isArray(evidence.relationships) ? evidence.relationships : [];
    const infrastructure = Array.isArray(evidence.infrastructure) ? evidence.infrastructure : [];
    const children = Array.isArray(evidence.children) ? evidence.children : [];
    const urls = children.filter((item) => item.type === 'url');
    const attachments = children.filter((item) => item.type === 'attachment');
    const model = Array.isArray(evidence.model_evidence) ? evidence.model_evidence[0] : null;
    const limitations = Array.isArray(evidence.limitations) ? evidence.limitations : [];
    const risk = Number.isFinite(Number(decision.risk)) ? `${Math.round(Number(decision.risk) * 100)}% policy risk` : 'No policy risk score';
    const stateCopy = {
      LIKELY_PHISHING: 'Available specialist evidence indicates phishing-like content. Review the independent observations and recommended action.',
      LIKELY_BENIGN: 'The qualified content model found lower phishing likelihood in the available content. Evidence gaps remain material.',
      UNCERTAIN: 'Available evidence does not support a reliable specialist conclusion. Use the coverage and limitations below before acting.',
      UNSUPPORTED: 'The input exceeded a bounded parser or capability limit, so no specialist conclusion was produced.',
      FAILED: 'A required analysis stage failed. The partial evidence below is retained without converting failure into a benign result.',
    }[specialistState];
    const degraded = decision.degraded ? 'Degraded decision · required evidence unavailable' : 'Final decision from available evidence';
    const target = one('#phishingResult');
    const shell = one('#emailInvestigationResult');
    if (!target || !shell) return;
    target.innerHTML = `
      <article class="email-result-hero" data-state="${specialistState}">
        <div>
          <p class="email-result-kicker">MailGraph specialist state</p>
          <h2 id="emailResultTitle">${escapeHtml(STATE_LABELS[specialistState])}</h2>
          <p>${escapeHtml(stateCopy)}</p>
          <div class="email-result-actions">
            <a class="btn btn-primary" href="gateway.html?scan_id=${encodeURIComponent(payload.scan_id || '')}">Open Gateway report</a>
            ${['manual_review', 'hold', 'quarantine', 'block'].includes(decision.recommendation) ? '<a class="btn btn-secondary" href="cases.html">Open case queue</a>' : ''}
            <button class="btn btn-secondary" type="button" data-copy-scan>Copy report ID</button>
          </div>
        </div>
        <div class="email-result-state"><span>Gateway action</span><strong>${escapeHtml(titleCase(decision.recommendation || 'manual_review'))}</strong><small>${escapeHtml(risk)} · ${escapeHtml(degraded)}</small></div>
      </article>
      ${renderCoverage(coverageData(evidence))}
      <div class="email-evidence-grid">
        <article class="email-evidence-card"><header><h3>Content observations</h3><span>${deterministic.length} observed</span></header>${evidenceList(deterministic, 'No deterministic content indicator was observed. Absence is not proof of safety.', (item) => [item.code, item.category || item.source || 'Observed signal'])}</article>
        <article class="email-evidence-card"><header><h3>Authentication</h3><span>${escapeHtml(evidence.input_mode || 'unknown mode')}</span></header>${evidenceList(authentication, 'Authentication evidence is unavailable in this input mode.', (item) => [item.protocol, `${item.result || 'UNAVAILABLE'}${item.domain ? ` · ${item.domain}` : ''}${item.failure_reason ? ` · ${item.failure_reason}` : ''}`])}</article>
        <article class="email-evidence-card"><header><h3>Identity relationships</h3><span>${relationships.length} edges</span></header>${evidenceList(relationships, 'No comparable sender, reply, return-path, authentication, or link-domain relationship was observed.', (item) => [item.reason_code || item.type, `${item.source_type || 'source'} ${item.type || item.edge_type || 'relates to'} ${item.target_value || item.target_type || 'target'}`])}</article>
        <article class="email-evidence-card"><header><h3>URLs and attachments</h3><span>${urls.length + attachments.length} children</span></header>${evidenceList(children, 'No URL or attachment artifact was extracted.', (item) => [item.type === 'url' ? (item.metadata?.hostname || 'URL artifact') : (item.metadata?.original_filename_untrusted || 'Attachment'), `${item.state || 'UNKNOWN'}${item.type === 'attachment' ? ' · metadata only; content not executed' : ''}`])}</article>
        <article class="email-evidence-card"><header><h3>Sending infrastructure</h3><span>Approximate only</span></header>${evidenceList(infrastructure, 'No eligible public sending-infrastructure hop was available. This does not imply the sender had no route.', (item) => [`Hop ${item.hop_index ?? '?'}`, `${item.host || item.ip_address || 'Unknown host'} · ${item.ip_classification || 'unclassified'}${item.asn_org ? ` · ${item.asn_org}` : ''}${item.country ? ` · ${item.country}` : ''}`])}<p class="email-retention-note">Location describes network infrastructure, not a person or the sender's physical location.</p></article>
        <article class="email-evidence-card"><header><h3>Model evidence</h3><span>Registry bound</span></header>${model ? evidenceList([model], 'No model evidence is available.', (item) => [item.state || 'UNCERTAIN', `${item.status || 'unknown'}${Number.isFinite(Number(item.p_phish)) ? ` · p(phish) ${Math.round(Number(item.p_phish) * 100)}%` : ''} · ${Array.isArray(item.reason_codes) ? item.reason_codes.join(', ') : 'no reason code'}`]) : '<p class="email-evidence-empty">No qualified model result was produced. This is not converted into a benign outcome.</p>'}</article>
        <article class="email-evidence-card is-wide"><header><h3>Limitations and provenance</h3><span>${escapeHtml(evidence.schema_version || 'schema unavailable')}</span></header>${limitations.length ? `<ul class="email-limitation-list">${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="email-evidence-empty">No additional pipeline limitation was recorded.</p>'}<p class="email-retention-note">Report ${escapeHtml(payload.scan_id || 'unavailable')} · Correlation ${escapeHtml(decision.correlation_version || 'unavailable')} · This report is evidence for review, not a safety certificate.</p></article>
      </div>`;
    shell.hidden = false;
    state.lastScanId = payload.scan_id || null;
    one('[data-copy-scan]', target)?.addEventListener('click', async (event) => {
      if (!state.lastScanId) return;
      await global.navigator.clipboard.writeText(state.lastScanId);
      event.currentTarget.textContent = 'Report ID copied';
    });
    shell.scrollIntoView({ behavior: global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function renderFailure(error) {
    const shell = one('#emailInvestigationResult');
    const target = one('#phishingResult');
    if (!shell || !target) return;
    const guidance = failureGuidance(error);
    target.innerHTML = `<article class="email-result-hero" data-state="FAILED"><div><p class="email-result-kicker">Investigation state</p><h2 id="emailResultTitle">Analysis failed</h2><p>${escapeHtml(error.message)} No failure was converted into a benign result. ${escapeHtml(guidance.detail)}</p></div><div class="email-result-state"><span>Error code</span><strong>${escapeHtml(error.code || 'EMAIL_ANALYSIS_FAILED')}</strong><small>Evidence may be incomplete</small></div></article>`;
    shell.hidden = false;
  }

  function bindTabs() {
    const tabs = all('[data-email-mode]');
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => setMode(tab.dataset.emailMode, true));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].focus();
        setMode(tabs[next].dataset.emailMode);
      });
    });
  }

  function init() {
    const form = one('#phishingForm[data-email-workbench]');
    if (!form) return;
    bindTabs();
    const text = one('#phishingText');
    text?.addEventListener('input', () => { const output = one('#emailCharacterCount'); if (output) output.textContent = `${text.value.length.toLocaleString()} / 12,000`; });
    const fileInput = one('#emailEmlFile');
    fileInput?.addEventListener('change', () => { try { chooseFile(fileInput.files?.[0]); setError(''); } catch (error) { state.file = null; setError(error.message); } });
    const dropzone = one('.email-dropzone');
    ['dragenter', 'dragover'].forEach((name) => dropzone?.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('is-dragging'); }));
    ['dragleave', 'drop'].forEach((name) => dropzone?.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('is-dragging'); }));
    dropzone?.addEventListener('drop', (event) => { try { chooseFile(event.dataTransfer?.files?.[0]); setError(''); } catch (error) { state.file = null; setError(error.message); } });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.busy) return;
      setError('');
      setBusy(true);
      setStatus('Building a bounded evidence graph…');
      try {
        const payload = await requestInvestigation();
        renderResult(payload);
        setStatus('Investigation complete. Review coverage and limitations.');
      } catch (error) {
        renderFailure(error);
        setError(failureGuidance(error).summary);
        setStatus('Investigation failed. No benign conclusion was inferred.');
      } finally {
        setBusy(false);
      }
    });
    setMode('text');
  }

  document.addEventListener('DOMContentLoaded', init);
}(window));
