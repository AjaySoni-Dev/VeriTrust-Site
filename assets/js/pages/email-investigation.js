(function emailInvestigationPage(global) {
  'use strict';

  const MAX_EML_BYTES = 10 * 1024 * 1024;
  const CONFIGURATION_FAILURE_CODES = new Set(['GATEWAY_POLICY_INVALID', 'GATEWAY_POLICY_UNAVAILABLE', 'SERVER_CONFIG_ERROR']);
  const STATE_LABELS = Object.freeze({
    LIKELY_PHISHING: 'Likely phishing',
    LIKELY_BENIGN: 'No strong phishing signs found',
    UNCERTAIN: 'Needs a closer look',
    UNSUPPORTED: 'Could not fully check this email',
    FAILED: 'Check could not be completed',
  });
  const HELP = Object.freeze({
    authentication: 'Sender verification checks whether the email was authorized by the domain it claims to come from. Original email data is required for most of these checks.',
    spf: 'SPF checks whether the sending mail server was allowed to send for the claimed domain. A saved .eml file alone cannot reliably recreate this historical check.',
    dkim: 'DKIM checks the email\'s cryptographic signature to see whether signed parts of the message changed after the sender sent it.',
    dmarc: 'DMARC checks whether the visible sender domain aligns with successful SPF or DKIM results and follows the domain owner\'s policy.',
    arc: 'ARC records how earlier trusted mail systems evaluated the message while it was forwarded. It adds context but does not prove that content is safe.',
    authResults: 'Authentication-Results is a header written by a mail server. VeriTrust treats a copied value as untrusted unless it comes directly from a configured receiver.',
    identity: 'Sender consistency compares the visible From address with reply, return-path, signing, and linked domains to reveal unexpected mismatches.',
    infrastructure: 'The delivery route is built from eligible public mail-server hops. It describes network infrastructure, not the sender\'s physical location.',
    model: 'The AI content check estimates phishing likelihood from the available subject and message wording. It is one piece of evidence, not a safety guarantee.',
    risk: 'The risk score is the Gateway\'s combined estimate from available evidence. Missing checks can reduce certainty, so always read the limitations.',
    coverage: 'Coverage shows which checks had enough information to run. "Limited" or "not available" is an evidence gap, not a safe result.',
    technicalCode: 'A technical code is the exact machine-readable name of a finding. It is kept in the report so another analyst or system can reproduce the decision.',
  });
  const PROTOCOL_HELP = Object.freeze({ SPF: HELP.spf, DKIM: HELP.dkim, DMARC: HELP.dmarc, ARC: HELP.arc, AUTHENTICATION_RESULTS: HELP.authResults });
  const DECISION_LABELS = Object.freeze({
    allow: 'No immediate action', warn: 'Show a warning', manual_review: 'Review manually', quarantine: 'Move to quarantine', block: 'Block the message', hold: 'Hold for review',
  });
  const OBSERVATION_LABELS = Object.freeze({
    CREDENTIAL_REQUEST: 'Asks for passwords or security codes',
    PAYMENT_REQUEST: 'Asks for money or payment',
    URGENCY_OR_COERCION: 'Uses urgency or pressure',
    OUT_OF_BAND_CONTACT: 'Asks to move to another contact method',
    ATTACHMENT_LURE: 'Pushes the reader to open an attachment',
    QR_OR_LINK_LURE: 'Pushes the reader to follow a link or QR code',
    IMPERSONATION_CLAIM: 'Claims to represent a trusted person or team',
    VISIBLE_URL_DIFFERS_FROM_HREF: 'Visible link and actual destination do not match',
    OBFUSCATED_LINK_TEXT: 'Link text appears intentionally disguised',
    HTML_HIDDEN_CONTENT: 'Email contains hidden content',
    HTML_META_REFRESH: 'Email attempts an automatic redirect',
    AI_INPUT_INSTRUCTION_OVERRIDE: 'Message contains instructions aimed at an AI system',
    AI_INPUT_OBFUSCATION: 'Message contains hidden or unusual control characters',
    UNICODE_DIRECTIONAL_CONTROL: 'Text direction controls may disguise what is shown',
    IDENTITY_ADDRESS_MALFORMED: 'A sender address is malformed',
    IDENTITY_DOMAIN_MIXED_SCRIPTS: 'A sender domain mixes writing systems',
    IDENTITY_DOMAIN_CONFUSABLE: 'A sender domain may imitate another domain',
    URL_EXTRACTION_LIMIT_REACHED: 'Too many links to check completely',
    DOMAIN_REGISTERED_WITHIN_30_DAYS: 'A related domain was registered within the last 30 days',
    DOMAIN_REGISTERED_WITHIN_90_DAYS: 'A related domain was registered within the last 90 days',
    INFRASTRUCTURE_IP_HIGH_ABUSE_REPUTATION: 'A delivery IP has high recent abuse reputation',
    INFRASTRUCTURE_IP_ELEVATED_ABUSE_REPUTATION: 'A delivery IP has elevated recent abuse reputation',
  });
  const LIMITATION_LABELS = Object.freeze({
    SPF_UNAVAILABLE_WITHOUT_TRUSTED_RECEIVER_FACTS: 'SPF could not be recreated from the saved email alone.',
    AUTHENTICATION_TIMEOUT: 'A sender-verification check took too long to finish.',
    AUTHENTICATION_EVALUATION_FAILED: 'A sender-verification check could not be completed.',
    AUTHOR_IDENTITY_UNAVAILABLE: 'The original sender address was not available.',
    AMBIGUOUS_MULTIPLE_FROM: 'The email lists more than one From address.',
    AUTHOR_DOMAIN_MALFORMED_OR_UNAVAILABLE: 'The sender domain was missing or malformed.',
    AMBIGUOUS_MULTIPLE_REPLY_TO: 'The email lists more than one reply address.',
    AMBIGUOUS_MULTIPLE_RETURN_PATH: 'The email lists more than one return address.',
    AMBIGUOUS_MULTIPLE_SENDER: 'The email lists more than one sender address.',
    IP_REPUTATION_NOT_CONFIGURED: 'IP reputation is not configured in this deployment.',
    RDAP_LOOKUP_DISABLED: 'Domain-registration intelligence is disabled in this deployment.',
    CAMPAIGN_MEMORY_SCHEMA_NOT_APPLIED: 'Campaign Memory needs the forensic-intelligence database migration.',
    EVIDENCE_PASSPORT_SCHEMA_NOT_APPLIED: 'Evidence Passport persistence needs the forensic-intelligence database migration.',
  });
  const state = { mode: 'text', file: null, busy: false, lastScanId: null, parentScanId: null };
  const analysisProgress = global.VeriTrustAnalysisProgress.create();
  const one = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const titleCase = (value) => String(value || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  function helpLabel(label, help) {
    return `<span class="email-help-term" data-email-term="${escapeHtml(label)}" data-email-help="${escapeHtml(help)}">${escapeHtml(label)}</span>`;
  }

  function friendlyCode(value) {
    return OBSERVATION_LABELS[value] || 'A suspicious pattern was found';
  }

  function friendlyLimitation(value) {
    return LIMITATION_LABELS[value] || 'One technical check had insufficient evidence to finish.';
  }

  function friendlyStatus(value) {
    const labels = { PASS: 'Passed', FAIL: 'Failed', SOFTFAIL: 'Soft fail', NEUTRAL: 'Neutral', NONE: 'No result', TEMPERROR: 'Temporary error', PERMERROR: 'Permanent error', UNKNOWN: 'Unknown', UNAVAILABLE: 'Not available', completed: 'Completed', failed: 'Failed', pending: 'Pending', accepted: 'Accepted', processing: 'Processing' };
    return labels[value] || titleCase(value || 'Unknown');
  }

  function endpoint(name, fallback) {
    const runtime = global.VeriTrust_CONFIG || global['VERI' + 'TRUST_CONFIG'] || {};
    return runtime.api?.[name] || fallback;
  }


  function queryParameter(name) {
    const target = String(name || '');
    const search = String(global.location?.search || '').replace(/^\?/, '');
    for (const pair of search.split('&')) {
      if (!pair) continue;
      const [rawKey, ...rawValue] = pair.split('=');
      let key = rawKey;
      let value = rawValue.join('=');
      try { key = decodeURIComponent(rawKey.replace(/\+/g, ' ')); value = decodeURIComponent(value.replace(/\+/g, ' ')); } catch { /* ignore malformed query pairs */ }
      if (key === target) return value;
    }
    return null;
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
    all('[data-email-mode], #emailSubject, #phishingText, #emailEmlFile').forEach((input) => { input.disabled = busy; });
    const button = one('#phishingSubmit');
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? 'Checking email...' : state.mode === 'eml' ? 'Check original email' : 'Check email text';
    button.toggleAttribute('aria-busy', busy);
  }

  function setMode(mode, focusPanel = false) {
    if (state.busy) return;
    state.mode = mode;
    const tabs = all('[data-email-mode]');
    tabs.forEach((tab) => {
      const selected = tab.dataset.emailMode === mode;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    all('[data-email-panel]').forEach((panel) => { panel.hidden = panel.dataset.emailPanel !== mode; });
    const rawEvidence = mode === 'eml';
    const auth = one('[data-preview-auth]');
    const identity = one('[data-preview-identity]');
    const infra = one('[data-preview-infra]');
    const attachments = one('[data-preview-attachments]');
    if (auth) {
      auth.textContent = rawEvidence ? 'Available (SPF limited)' : 'Needs original email';
      auth.dataset.status = rawEvidence ? 'available' : 'needed';
    }
    if (identity) {
      identity.textContent = rawEvidence ? 'Available' : 'Limited with pasted text';
      identity.dataset.status = rawEvidence ? 'available' : 'limited';
    }
    if (infra) {
      infra.textContent = rawEvidence ? 'Available when recorded' : 'Needs original email';
      infra.dataset.status = rawEvidence ? 'available' : 'needed';
    }
    if (attachments) {
      attachments.textContent = rawEvidence ? 'Available' : 'Needs original email';
      attachments.dataset.status = rawEvidence ? 'available' : 'needed';
    }
    setError('');
    setBusy(false);
    if (focusPanel) {
      const focusTarget = mode === 'text' ? one('#emailSubject') : one('.email-dropzone');
      focusTarget?.focus();
    }
  }

  function validateFile(file) {
    if (!file) throw new Error('Choose a raw .eml file to investigate.');
    if (!file.size) throw new Error('The selected file is empty.');
    if (file.size > MAX_EML_BYTES) throw new Error('The selected email exceeds the 10 MiB limit.');
    const extensionOk = /\.eml$/iu.test(file.name || '');
    const typeOk = !file.type || ['message/rfc822', 'application/octet-stream', 'text/plain'].includes(file.type);
    if (!extensionOk || !typeOk) throw new Error('Choose an original .eml file with a supported email content type.');
    return file;
  }

  function chooseFile(file) {
    if (state.busy) return;
    state.file = validateFile(file);
    const label = one('#emailFileLabel');
    if (label) label.textContent = `${state.file.name} · ${state.file.size < 1024 ? `${state.file.size} bytes` : `${(state.file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`}`;
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

  async function requestInvestigation(signal) {
    if (!global.VeriTrustSupabase?.isConfigured()) throw new Error('Account access is temporarily unavailable.');
    const context = await global.VeriTrustSupabase.getSessionContext();
    if (!context?.organization?.id) throw new Error('Sign in and select a workspace before starting an investigation.');
    const idempotencyKey = global.crypto?.randomUUID?.() || `email-web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (state.mode === 'eml') {
      const file = validateFile(state.file || one('#emailEmlFile')?.files?.[0]);
      return analysisProgress.request(endpoint('emailAnalyzeEml', '/api/v1/gateway/email/analyze-eml'), {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'message/rfc822', 'Idempotency-Key': idempotencyKey, 'X-Retention-Policy': 'ephemeral_24h', ...(state.parentScanId ? { 'X-VeriTrust-Parent-Scan-Id': state.parentScanId } : {}) },
        body: file,
      });
    }
    const subject = one('#emailSubject')?.value.trim() || '';
    const body = one('#phishingText')?.value.trim() || '';
    if (!subject && !body) throw new Error('Provide an email subject or message body.');
    if (body.length > 12000) throw new Error('Keep the message body at or below 12,000 characters.');
    return analysisProgress.request(endpoint('emailAnalyzeText', '/api/v1/gateway/email/analyze-text'), {
      signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ subject, body, channel: 'email', retention_policy: 'metadata_only', org_id: context.organization.id, ...(state.parentScanId ? { parent_scan_id: state.parentScanId } : {}) }),
    });
  }


  async function loadSavedInvestigation(scanId) {
    const id = String(scanId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) return;
    setStatus('Loading the saved forensic investigation...');
    try {
      const response = await global.fetch(`/api/v2/phishing/evidence/${encodeURIComponent(id)}`, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const payload = await parseResponse(response);
      if (!payload.evidence || !payload.gateway_decision) throw new Error('The saved scan does not contain a complete email decision.');
      renderResult(payload);
      setStatus('Saved forensic investigation loaded.');
    } catch (error) {
      renderFailure(error);
      setStatus('The saved forensic investigation could not be loaded.');
    }
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
    const parsed = ['plain_text', 'raw_eml', 'trusted_receiver_event'].includes(evidence.input_mode) && !['FAILED', 'UNSUPPORTED'].includes(evidence.state);
    return [
      ['Message wording', parsed ? 'checked' : 'not available', parsed ? `${observations.filter((item) => item.code).length} notable pattern(s) found` : 'Message parsing was not confirmed', null],
      ['Sender verification', capabilities.headers ? (availableAuth.length ? 'checked' : 'limited') : 'not available', capabilities.headers ? `${availableAuth.length} sender check(s) completed; SPF needs live server data` : 'Upload the original email to enable this', HELP.authentication],
      ['Sender consistency', relationships.length ? 'checked' : capabilities.headers ? 'limited' : 'not available', relationships.length ? `${relationships.length} sender relationship(s) compared` : 'No sender details were available to compare', HELP.identity],
      ['Links', urls.length ? (urls.some((item) => item.state !== 'completed') ? 'limited' : 'checked') : 'not present', urls.length ? `${urls.length} link(s) found in the email` : 'No link was found'],
      ['Delivery route', infrastructure.length ? 'checked' : capabilities.infrastructure_geo ? 'limited' : 'not available', infrastructure.length ? `${infrastructure.length} public mail-server step(s) found` : 'No eligible public mail-server step was found', HELP.infrastructure],
      ['Attachments', capabilities.attachments ? 'checked' : 'not available', attachments.length ? `${attachments.length} attachment(s) identified; never executed` : capabilities.attachments ? 'No attachment was found' : 'Upload the original email to enable this'],
      ['Threat intelligence', evidence.threat_intelligence?.state === 'COMPLETED' ? 'checked' : evidence.threat_intelligence?.state === 'PARTIAL' ? 'limited' : 'not available', evidence.threat_intelligence?.state === 'COMPLETED' ? 'Domain registration and configured IP reputation checks completed' : evidence.threat_intelligence?.state === 'PARTIAL' ? 'Some third-party intelligence was available; limitations are recorded' : 'No external domain/IP intelligence was available'],
      ['AI content check', model?.status === 'completed' ? 'checked' : model?.status === 'failed' ? 'check failed' : 'limited', model?.status === 'completed' ? 'Completed using the approved model version' : 'No reliable AI result was returned', HELP.model],
    ];
  }

  function renderCoverage(items) {
    return `<section class="email-coverage-summary" aria-labelledby="coverageResultTitle"><div class="email-section-heading"><div><p class="email-result-kicker">Evidence used</p><h3 id="coverageResultTitle">Evidence coverage</h3></div>${helpLabel('Coverage', HELP.coverage)}</div><div class="email-coverage-results">${items.map(([name, status, detail, help]) => `
      <article class="email-coverage-item" data-coverage="${escapeHtml(status)}">
        <span>${help ? helpLabel(name, help) : escapeHtml(name)}</span><strong>${escapeHtml(titleCase(status))}</strong><small>${escapeHtml(detail)}</small>
      </article>`).join('')}</div></section>`;
  }

  function evidenceList(items, emptyMessage, mapper) {
    if (!items.length) return `<p class="email-evidence-empty">${escapeHtml(emptyMessage)}</p>`;
    return `<ul class="email-evidence-list">${items.map((item) => {
      const row = mapper(item);
      return `<li><strong>${row.help ? helpLabel(row.label, row.help) : escapeHtml(row.label)}</strong><span>${escapeHtml(row.detail)}</span></li>`;
    }).join('')}</ul>`;
  }



  function evidenceStage(mode) {
    return { plain_text: 0, raw_eml: 1, trusted_receiver_event: 2 }[mode] ?? 0;
  }

  function renderEvidenceLadder(evidence, scanId) {
    const completeness = evidence.evidence_completeness || {};
    const current = evidenceStage(evidence.input_mode);
    const stages = [
      ['Pasted text', 'Content, AI and visible links'],
      ['Original .eml', 'Headers, identity, MIME, attachments and recorded relays'],
      ['Trusted receiver', 'Direct SMTP client IP, HELO, MAIL FROM, timestamp and SPF'],
    ];
    const next = Array.isArray(completeness.next_actions) ? completeness.next_actions[0] : null;
    return `<section class="email-evidence-ladder" aria-labelledby="evidenceLadderTitle">
      <div class="email-section-heading"><div><p class="email-result-kicker">Progressive evidence</p><h3 id="evidenceLadderTitle">Evidence acquisition ladder</h3></div><span class="email-level-badge">${escapeHtml(titleCase(completeness.level || 'limited'))}</span></div>
      <div class="email-ladder-track">${stages.map(([title, detail], index) => `<article data-stage-state="${index < current ? 'complete' : (index === current ? 'current' : 'future')}"><span>${index + 1}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></article>`).join('')}</div>
      <p class="email-ladder-note">Missing evidence is shown as missing; it is never converted into a safe result.</p>
      ${next?.action === 'UPLOAD_ORIGINAL_EML' ? `<button class="btn btn-secondary" type="button" data-upgrade-evidence="eml" data-parent-scan="${escapeHtml(scanId || '')}">Upgrade this investigation with the original .eml</button>` : ''}
      ${next?.action === 'USE_TRUSTED_RECEIVER' ? `<a class="btn btn-secondary" href="/gateway-powershell">Acquire live SMTP evidence with the trusted receiver</a>` : ''}
    </section>`;
  }

  function geoPoint(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { x: ((lon + 180) / 360) * 1000, y: ((90 - lat) / 180) * 500 };
  }

  function renderGeoTrace(infrastructure, summary) {
    const points = infrastructure.map((hop) => ({ hop, point: geoPoint(hop.latitude, hop.longitude) })).filter((item) => item.point);
    const grid = [250, 500, 750].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="500"></line>`).join('')
      + [125, 250, 375].map((y) => `<line x1="0" y1="${y}" x2="1000" y2="${y}"></line>`).join('');
    const basemap = `<g class="email-geotrace-basemap" aria-hidden="true">
      <path d="M45 150L88 112L150 96L206 110L250 142L274 182L246 210L217 212L188 248L151 256L120 226L76 218L48 188Z"></path>
      <path d="M231 258L272 276L302 318L316 362L298 420L264 466L235 438L224 385L204 344L210 300Z"></path>
      <path d="M436 120L477 92L540 100L568 126L550 154L510 164L486 194L446 190L418 157Z"></path>
      <path d="M464 202L514 190L552 220L566 269L542 318L516 374L484 394L456 354L446 302L430 256Z"></path>
      <path d="M548 122L614 92L690 94L750 116L828 118L896 154L916 192L888 222L830 210L786 232L734 214L690 240L648 218L606 228L568 200L536 164Z"></path>
      <path d="M805 330L846 314L890 328L930 360L913 397L866 410L826 390L798 358Z"></path>
      <path d="M962 392L976 385L988 398L978 414L965 410Z"></path>
    </g>`;
    const path = points.length > 1 ? `<polyline points="${points.map((item) => `${item.point.x.toFixed(1)},${item.point.y.toFixed(1)}`).join(' ')}"></polyline>` : '';
    const nodes = points.map(({ hop, point }) => {
      const trusted = hop.trust_level === 'trusted_receiver';
      const label = `Hop ${Number(hop.hop_index || 0) + 1}: ${hop.host || hop.ip_address || 'mail infrastructure'}${hop.country ? `, ${hop.country}` : ''}. ${trusted ? 'Directly observed trusted receiver boundary.' : 'Observed from message headers; sender origin is not proven.'}`;
      return `<g class="email-geotrace-node ${trusted ? 'is-trusted' : 'is-observed'}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})"><circle r="10"></circle><text y="4" text-anchor="middle">${Number(hop.hop_index || 0) + 1}</text><title>${escapeHtml(label)}</title></g>`;
    }).join('');
    return `<div class="email-geotrace">
      <div class="email-geotrace-map" role="img" aria-label="Approximate map of geolocated mail-server infrastructure. It does not identify a person's location.">
        ${points.length ? `<svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${basemap}<g class="email-geotrace-grid">${grid}</g><path class="email-geotrace-equator" d="M0 250H1000"></path><g class="email-geotrace-path">${path}</g>${nodes}</svg>` : '<p>No mail-server hop had usable latitude/longitude data.</p>'}
      </div>
      <div class="email-geotrace-legend"><span data-trust="trusted">Trusted receiver observation</span><span data-trust="observed">Observed relay claim</span></div>
      <p>${escapeHtml(summary?.wording || 'Locations are approximate infrastructure context only; VeriTrust does not claim the physical location of a person.')}</p>
    </div>`;
  }

  function renderThreatIntelligence(intelligence) {
    const domains = Array.isArray(intelligence?.domain_intelligence) ? intelligence.domain_intelligence : [];
    const ips = Array.isArray(intelligence?.ip_reputation) ? intelligence.ip_reputation : [];
    const domainHtml = domains.length ? `<ul class="email-evidence-list">${domains.map((item) => `<li><strong>${escapeHtml(item.domain || 'Domain')}</strong><span>${item.age_days !== null && item.age_days !== undefined ? `${escapeHtml(item.age_days)} day(s) old` : 'Registration date unavailable'}${item.registrar ? ` · ${escapeHtml(item.registrar)}` : ''}${item.very_new_domain ? ' · registered within 30 days' : (item.recently_registered ? ' · registered within 90 days' : '')}</span></li>`).join('')}</ul>` : '<p class="email-evidence-empty">No domain registration record was available for the observed domains.</p>';
    const ipHtml = ips.length ? `<ul class="email-evidence-list">${ips.map((item) => `<li><strong>${escapeHtml(item.ip_address || 'IP')}</strong><span>${escapeHtml(titleCase(item.reputation || 'unknown'))}${Number.isFinite(Number(item.abuse_confidence_score)) ? ` · abuse score ${escapeHtml(item.abuse_confidence_score)}/100` : ''}${item.is_tor ? ' · reported as Tor' : ''}</span></li>`).join('')}</ul>` : '<p class="email-evidence-empty">IP reputation was not configured or no eligible public IP was available.</p>';
    return `${domainHtml}${ipHtml}<p class="email-retention-note">${escapeHtml(intelligence?.provider_notice || 'Threat-intelligence observations are context, not proof of malicious intent.')}</p>`;
  }

  function renderCampaignMemory(campaign) {
    if (!campaign || campaign.state === 'UNAVAILABLE') return '<p class="email-evidence-empty">Campaign Memory is unavailable for this scan. The core email verdict remains independent of this enrichment.</p>';
    if (campaign.state !== 'CORRELATED') return '<p class="email-evidence-empty">No strong prior investigation shared enough durable forensic entities to form a campaign.</p>';
    const related = Array.isArray(campaign.related_scans) ? campaign.related_scans.filter((item) => Number(item.score) >= 6) : [];
    return `<div class="email-campaign-summary"><strong>${escapeHtml(campaign.campaign_id || 'Correlated campaign')}</strong><span>${escapeHtml(campaign.related_scan_count || related.length)} prior investigation(s) linked</span></div>
      <ul class="email-evidence-list">${related.slice(0, 8).map((row) => `<li><strong>Related scan ${escapeHtml(String(row.scan_id || '').slice(0, 12))}</strong><span>Correlation score ${escapeHtml(row.score)} · ${(row.common_entities || []).slice(0, 4).map((entity) => `${escapeHtml(titleCase(entity.entity_type))}: ${escapeHtml(entity.entity_value)}`).join(' · ')}</span></li>`).join('')}</ul>
      <p class="email-retention-note">${escapeHtml(campaign.scoring_notice || 'Correlation uses repeated forensic entities; weak ASN-only overlap is not enough to create a campaign.')}</p>`;
  }

  function renderEvidencePassport(passport, scanId) {
    if (!passport) return '<p class="email-evidence-empty">A signed Evidence Passport was not available for this result.</p>';
    return `<div class="email-passport-card"><div><span>Passport ID</span><strong>${escapeHtml(passport.passport_id || 'Unavailable')}</strong></div><div><span>Signature</span><strong>${escapeHtml(passport.signature_algorithm || 'Unavailable')}</strong></div><div><span>Signing key</span><strong>${escapeHtml(passport.key_id || 'Unavailable')}</strong></div><div><span>Evidence SHA-256</span><code>${escapeHtml(passport.evidence_sha256 || 'Unavailable')}</code></div></div>
      <div class="email-result-actions email-export-actions">
        <a class="btn btn-secondary" href="/api/v2/phishing/export/${encodeURIComponent(scanId || '')}/json">Evidence JSON</a>
        <a class="btn btn-secondary" href="/api/v2/phishing/export/${encodeURIComponent(scanId || '')}/stix">STIX 2.1</a>
        <a class="btn btn-secondary" href="/api/v2/phishing/export/${encodeURIComponent(scanId || '')}/csv">IOC CSV</a>
        <a class="btn btn-secondary" href="/verify-evidence?scan_id=${encodeURIComponent(scanId || '')}">Verify signature</a>
      </div><p class="email-retention-note">The signature verifies evidence integrity and recorded provenance. It is not a legal-admissibility certificate or a guarantee that the message is safe.</p>`;
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
    const completeness = evidence.evidence_completeness || {};
    const manifest = evidence.evidence_manifest || {};
    const infrastructureSummary = evidence.infrastructure_summary || {};
    const threatIntelligence = evidence.threat_intelligence || {};
    const campaignMemory = evidence.campaign_memory || {};
    const passport = evidence.evidence_passport || null;
    const risk = global.VeriTrustAnalysisResult.percent(decision.risk);
    const stateCopy = {
      LIKELY_PHISHING: 'This email shows signs commonly associated with phishing. Do not click links, open attachments, reply, or share information until it is verified through another channel.',
      LIKELY_BENIGN: 'The available checks did not find strong phishing signs. This is not a guarantee of safety, especially where checks were unavailable.',
      UNCERTAIN: 'The available evidence is not strong enough for a reliable conclusion. Verify the sender through a known phone number or official website.',
      UNSUPPORTED: 'Part of this email could not be safely processed within the service limits. Treat the result as incomplete and review it manually.',
      FAILED: 'A required check failed, so VeriTrust did not label the message as safe. Try again or review it manually.',
    }[specialistState];
    const recommendation = DECISION_LABELS[decision.recommendation] || 'Review manually';
    const completenessLabel = completeness.level ? `Evidence completeness: ${titleCase(completeness.level)}` : (decision.degraded ? 'Some checks were unavailable' : 'Based on all available checks');
    const certainty = decision.degraded ? `${completenessLabel} · some checks were unavailable` : completenessLabel;
    const target = one('#phishingResult');
    const shell = one('#emailInvestigationResult');
    if (!target || !shell) return;
    target.innerHTML = `
      <article class="email-result-hero" data-state="${specialistState}">
        <div>
          <p class="email-result-kicker">Overall result</p>
          <h2 id="emailResultTitle">${escapeHtml(STATE_LABELS[specialistState])}</h2>
          <p>${escapeHtml(stateCopy)}</p>
          <div class="email-result-actions">
            <a class="btn btn-primary" href="/phishing?scan_id=${encodeURIComponent(payload.scan_id || '')}">View full report</a>
            <button class="btn btn-secondary email-pdf-download" type="button" data-download-email-pdf>Download PDF</button>
            ${['manual_review', 'hold', 'quarantine', 'block'].includes(decision.recommendation) ? '<a class="btn btn-secondary" href="cases.html">Open cases</a>' : ''}
            <button class="btn btn-secondary" type="button" data-copy-scan>Copy report ID</button>
          </div>
        </div>
        <div class="email-result-state"><span>Recommended next step</span><strong>${escapeHtml(recommendation)}</strong><small>${helpLabel(`Risk score: ${risk}`, HELP.risk)}<br>${escapeHtml(certainty)}</small></div>
      </article>
      ${renderEvidenceLadder(evidence, payload.scan_id)}
      ${renderCoverage(coverageData(evidence))}
      <details class="analysis-evidence-details"><summary>Evidence details and limitations <span>${limitations.length} recorded limitations</span></summary><div class="email-evidence-grid">
        <article class="email-evidence-card"><header><h3>What the message says</h3><span>${deterministic.length} finding${deterministic.length === 1 ? '' : 's'}</span></header>${evidenceList(deterministic, 'No obvious wording or formatting pattern was found. This does not prove the email is safe.', (item) => ({ label: friendlyCode(item.code), detail: 'Found by a rule-based check of the message content.', help: `Technical code: ${item.code}. ${HELP.technicalCode}` }))}</article>
        <article class="email-evidence-card"><header><h3>${helpLabel('Sender verification', HELP.authentication)}</h3><span>${authentication.length} check${authentication.length === 1 ? '' : 's'}</span></header>${evidenceList(authentication, 'Sender verification was not available for this type of input.', (item) => ({ label: String(item.protocol || 'Sender check').replaceAll('_', ' '), detail: `${friendlyStatus(item.result)}${item.domain ? ` for ${item.domain}` : ''}${item.failure_reason ? ' - supporting information was unavailable' : ''}`, help: PROTOCOL_HELP[item.protocol] || HELP.authentication }))}</article>
        <article class="email-evidence-card"><header><h3>${helpLabel('Do sender details match?', HELP.identity)}</h3><span>${relationships.length} comparison${relationships.length === 1 ? '' : 's'}</span></header>${evidenceList(relationships, 'There were not enough sender details to compare.', (item) => ({ label: String(item.type || item.edge_type || 'Compared').replaceAll('_', ' '), detail: `${String(item.target_type || 'related domain').replaceAll('_', ' ')}${item.target_value ? `: ${item.target_value}` : ''}`, help: `Technical code: ${item.reason_code || 'not recorded'}. ${HELP.identity}` }))}</article>
        <article class="email-evidence-card"><header><h3>Links and attachments</h3><span>${urls.length + attachments.length} found</span></header>${evidenceList(children, 'No link or attachment was found in the available content.', (item) => { const forensic = item.metadata?.forensic_metadata || {}; const flags = Array.isArray(forensic.flags) ? forensic.flags : []; return { label: item.type === 'url' ? (item.metadata?.hostname || 'Link') : (item.metadata?.original_filename_untrusted || 'Attachment'), detail: item.type === 'attachment' ? `${friendlyStatus(item.state)} - metadata only, never executed${flags.length ? ` - ${flags.length} metadata risk flag${flags.length === 1 ? '' : 's'}` : ''}` : friendlyStatus(item.state), help: item.type === 'attachment' ? `Attachments are identified and hashed but never executed. ${flags.map((flag) => flag.explanation).filter(Boolean).join(' ')}` : 'Links are extracted from visible text and HTML destinations, then passed to the link-checking service when available.' }; })}</article>
        <article class="email-evidence-card is-wide"><header><h3>${helpLabel('Trust-Boundary GeoTrace', HELP.infrastructure)}</h3><span>${escapeHtml(friendlyStatus(infrastructureSummary.state || 'Approximate'))}</span></header>${renderGeoTrace(infrastructure, infrastructureSummary)}${evidenceList(infrastructure, 'No eligible public mail-server step was available. This does not mean the email had no delivery route.', (item) => ({ label: `Mail server ${Number(item.hop_index ?? 0) + 1}`, detail: `${item.host || item.ip_address || 'Unknown server'}${item.asn_org ? ` - ${item.asn_org}` : ''}${item.country ? ` - ${item.country}` : ''}${item.trust_level ? ` - ${friendlyStatus(item.trust_level)}` : ''}`, help: HELP.infrastructure }))}${infrastructureSummary.earliest_reliable_public_node ? `<p class="email-retention-note"><strong>Earliest defensible public infrastructure observation:</strong> ${escapeHtml(infrastructureSummary.earliest_reliable_public_node.host || infrastructureSummary.earliest_reliable_public_node.ip_address || 'Recorded')}.</p>` : ''}</article>
        <article class="email-evidence-card"><header><h3>Domain &amp; IP intelligence</h3><span>${escapeHtml(friendlyStatus(threatIntelligence.state || 'Unavailable'))}</span></header>${renderThreatIntelligence(threatIntelligence)}</article>
        <article class="email-evidence-card"><header><h3>MailGraph Campaign Memory</h3><span>${escapeHtml(friendlyStatus(campaignMemory.state || 'Unavailable'))}</span></header>${renderCampaignMemory(campaignMemory)}</article>
        <article class="email-evidence-card is-wide"><header><h3>Evidence Passport</h3><span>Cryptographically verifiable</span></header>${renderEvidencePassport(passport, payload.scan_id)}</article>
        <article class="email-evidence-card"><header><h3>${helpLabel('AI content check', HELP.model)}</h3><span>Supporting signal</span></header>${model ? evidenceList([model], 'No AI result is available.', (item) => ({ label: STATE_LABELS[item.state] || friendlyStatus(item.state), detail: `${friendlyStatus(item.status)}${typeof item.p_phish === 'number' && Number.isFinite(item.p_phish) ? ` - ${Math.round(Number(item.p_phish) * 100)}% phishing likelihood` : ''}`, help: HELP.model })) : '<p class="email-evidence-empty">No reliable AI result was returned. VeriTrust did not convert that gap into a safe result.</p>'}</article>
        <article class="email-evidence-card is-wide"><header><h3>Important limitations</h3><span>${helpLabel(`${limitations.length} recorded`, HELP.technicalCode)}</span></header>${limitations.length ? `<ul class="email-limitation-list">${limitations.map((item) => `<li>${escapeHtml(friendlyLimitation(item))}</li>`).join('')}</ul>` : '<p class="email-evidence-empty">No additional limitation was recorded for the checks that ran.</p>'}<details class="email-technical-details"><summary>Technical report details</summary><dl><div><dt>Report ID</dt><dd>${escapeHtml(payload.scan_id || 'Unavailable')}</dd></div><div><dt>Input mode</dt><dd>${escapeHtml(friendlyStatus(evidence.input_mode || 'Unavailable'))}</dd></div><div><dt>Evidence completeness</dt><dd>${escapeHtml(completeness.level ? titleCase(completeness.level) : 'Unavailable')}</dd></div><div><dt>Evidence format</dt><dd>${escapeHtml(evidence.schema_version || 'Unavailable')}</dd></div><div><dt>Pipeline version</dt><dd>${escapeHtml(manifest.pipeline_version || 'Unavailable')}</dd></div><div><dt>Raw evidence SHA-256</dt><dd>${escapeHtml(manifest.raw_sha256 || 'Not retained for this input')}</dd></div><div><dt>Decision method</dt><dd>${escapeHtml(decision.correlation_version || 'Unavailable')}</dd></div></dl></details><p class="email-retention-note">This report supports human review. It is not a safety certificate.</p></article>
      </div></details>`;
    shell.hidden = false;
    enhanceHelpTerms(target);
    state.lastScanId = payload.scan_id || null;
    one('[data-copy-scan]', target)?.addEventListener('click', async (event) => {
      if (!state.lastScanId) return;
      await global.navigator.clipboard.writeText(state.lastScanId);
      event.currentTarget.textContent = 'Report ID copied';
    });
    one('[data-upgrade-evidence]', target)?.addEventListener('click', (event) => {
      state.parentScanId = event.currentTarget.dataset.parentScan || payload.scan_id || null;
      setMode('eml', true);
      one('#phishingForm')?.scrollIntoView({ behavior: global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      setStatus('Evidence upgrade started. Select the original .eml; VeriTrust will link the new scan to this investigation.');
    });
    one('[data-download-email-pdf]', target)?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Preparing PDF...';
      try {
        if (!global.VeriTrustEmailPdf?.downloadEmailReportPdf) throw new Error('The PDF report service did not load.');
        await global.VeriTrustEmailPdf.downloadEmailReportPdf(payload);
        button.textContent = 'PDF downloaded';
        global.setTimeout(() => { button.textContent = originalLabel; button.disabled = false; }, 2200);
      } catch (error) {
        button.textContent = 'PDF could not be created';
        setError(`${error.message} Try again or use View full report.`);
        global.setTimeout(() => { button.textContent = originalLabel; button.disabled = false; }, 3200);
      }
    });
    shell.scrollIntoView({ behavior: global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function renderFailure(error) {
    const shell = one('#emailInvestigationResult');
    const target = one('#phishingResult');
    if (!shell || !target) return;
    const guidance = failureGuidance(error);
    target.innerHTML = `<article class="email-result-hero" data-state="FAILED"><div><p class="email-result-kicker">Overall result</p><h2 id="emailResultTitle">Check could not be completed</h2><p>${escapeHtml(error.message)} VeriTrust did not label the message as safe. ${escapeHtml(guidance.detail)}</p></div><div class="email-result-state"><span>What to do</span><strong>Try again or review manually</strong><small>${helpLabel('Error details available', `Technical code: ${error.code || 'EMAIL_ANALYSIS_FAILED'}. Share this with support if the problem continues.`)}</small></div></article>`;
    shell.hidden = false;
    enhanceHelpTerms(target);
  }

  let activeHelpButton = null;
  let pinnedHelpButton = null;

  function positionHelpTooltip(button) {
    const tooltip = one('#emailHelpTooltip');
    if (!tooltip || !button || tooltip.hidden) return;
    const buttonRect = button.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 12;
    const centeredLeft = buttonRect.left + (buttonRect.width / 2) - (tooltipRect.width / 2);
    const left = Math.max(margin, Math.min(centeredLeft, global.innerWidth - tooltipRect.width - margin));
    const below = buttonRect.bottom + 10;
    const top = below + tooltipRect.height <= global.innerHeight - margin
      ? below
      : Math.max(margin, buttonRect.top - tooltipRect.height - 10);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function openHelp(button, pinned = false) {
    const tooltip = one('#emailHelpTooltip');
    const term = button.closest('[data-email-help]');
    if (!tooltip || !term) return;
    if (activeHelpButton && activeHelpButton !== button) activeHelpButton.setAttribute('aria-expanded', 'false');
    activeHelpButton = button;
    if (pinned) pinnedHelpButton = button;
    tooltip.textContent = term.dataset.emailHelp || '';
    tooltip.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-describedby', tooltip.id);
    global.requestAnimationFrame(() => positionHelpTooltip(button));
  }

  function closeHelp(force = false) {
    if (pinnedHelpButton && !force) return;
    const tooltip = one('#emailHelpTooltip');
    if (activeHelpButton) {
      activeHelpButton.setAttribute('aria-expanded', 'false');
      activeHelpButton.removeAttribute('aria-describedby');
    }
    if (tooltip) tooltip.hidden = true;
    activeHelpButton = null;
    if (force) pinnedHelpButton = null;
  }

  function enhanceHelpTerms(root = document) {
    all('[data-email-help]:not([data-email-help-ready])', root).forEach((term) => {
      term.dataset.emailHelpReady = 'true';
      term.classList.add('email-help-term');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'email-help-button';
      button.setAttribute('aria-label', `Explain ${term.dataset.emailTerm || term.textContent.trim()}`);
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="7"/><path d="M8 11.5v-4"/><circle cx="8" cy="5" r=".75" fill="currentColor"/></svg>';
      term.append(button);
      button.addEventListener('pointerenter', () => openHelp(button));
      button.addEventListener('pointerleave', () => { if (pinnedHelpButton !== button) closeHelp(); });
      button.addEventListener('focus', () => openHelp(button));
      button.addEventListener('blur', () => { if (pinnedHelpButton !== button) closeHelp(); });
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (pinnedHelpButton === button) closeHelp(true);
        else openHelp(button, true);
      });
    });
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
    enhanceHelpTerms();
    document.addEventListener('click', () => closeHelp(true));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeHelp(true); });
    global.addEventListener('resize', () => positionHelpTooltip(activeHelpButton));
    global.addEventListener('scroll', () => positionHelpTooltip(activeHelpButton), { passive: true });
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
      analysisProgress.begin();
      const previousReport = one('#emailInvestigationResult');
      if (previousReport) previousReport.hidden = true;
      setStatus('Checking the message and available sender evidence...');
      try {
        const payload = await requestInvestigation();
        if (!payload.evidence && payload.status === 'processing' && payload.scan_id) {
          const shell = one('#emailInvestigationResult');
          const target = one('#phishingResult');
          if (shell && target) {
            target.innerHTML = `<h2 id="emailResultTitle">This scan is already processing</h2><p>A completed report is not available yet.</p><a class="btn btn-secondary" href="/phishing?scan_id=${encodeURIComponent(payload.scan_id)}">Follow this scan</a>`;
            shell.hidden = false;
          }
          analysisProgress.finish(null, { pending: true });
          setStatus('The server confirmed that the scan is still processing.');
          return;
        }
        if (!payload.evidence || !payload.gateway_decision) throw new Error('The server response did not contain the email evidence and policy decision.');
        renderResult(payload);
        analysisProgress.finish();
        setStatus('Check complete. Review the result and any missing evidence.');
      } catch (error) {
        analysisProgress.finish(error);
        setStatus('');
      } finally {
        setBusy(false);
      }
    });
    setMode('text');
    const savedScanId = queryParameter('scan_id');
    if (savedScanId) void loadSavedInvestigation(savedScanId);
  }

  document.addEventListener('DOMContentLoaded', init);
}(window));
