document.addEventListener('DOMContentLoaded', async () => {
  const setText = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) {
      node.classList.remove('dashboard-shimmer', 'dashboard-shimmer-text', 'dashboard-shimmer-number');
      node.removeAttribute('aria-hidden');
      node.style.removeProperty('--dashboard-shimmer-width');
      node.style.removeProperty('--dashboard-shimmer-height');
      node.textContent = value;
    }
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));

  const scanTypeLabel = (scanType) => {
    const normalized = String(scanType || '').toLowerCase();
    if (normalized === 'deepfake') return 'Deepfake Detection';
    if (normalized === 'phishing') return 'Phishing Detection';
    return scanType || 'Detection';
  };

  const titleCase = (value) => {
    const text = String(value || 'unknown').trim();
    if (!text) return 'Unknown';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  };

  const verdictTone = (label) => {
    const normalized = String(label || '').toLowerCase();
    if (['phishing', 'deepfake', 'fake', 'suspicious', 'malicious'].includes(normalized)) {
      return 'danger';
    }
    if (['legitimate', 'real', 'safe', 'clean'].includes(normalized)) {
      return 'safe';
    }
    return 'neutral';
  };

  let activeScanFilter = 'all';
  let cachedScans = [];

  const riskBadgeClass = (level) => `risk-badge risk-badge-${String(level || 'low').toLowerCase()}`;

  const formatPercent = (value) => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;

  const scanResult = (scan) => {
    const result = scan.scan_results;
    if (Array.isArray(result)) return result[0] || {};
    return result || {};
  };

  const modelRuns = (scan) => {
    if (Array.isArray(scan.scan_model_runs)) return scan.scan_model_runs;
    return [];
  };

  const modelLabel = (scan) => {
    const completed = modelRuns(scan).find((run) => run.status === 'completed') || null;
    return completed?.model_key || scan.selected_model_key || 'unknown';
  };

  const fallbackUsed = (scan) => {
    const completed = modelRuns(scan).filter((run) => run.status === 'completed');
    return completed.length > 0 && completed[0].model_key !== scan.selected_model_key;
  };

  const reportFromScan = (scan) => {
    const resultRow = scanResult(scan);
    const risk = titleCase(resultRow.risk_level || scan.risk_level || 'low');
    const confidence = Number(resultRow.confidence || scan.confidence || 0);
    const primaryScore = Number(resultRow.primary_score || 0);
    const secondaryScore = Number(resultRow.secondary_score || 0);
    const type = scan.scan_type || 'scan';
    const isDeepfake = type === 'deepfake';
    return {
      title: 'VeriTrust Scan Report',
      scan_id: scan.id,
      scan_type: type,
      created_at: scan.created_at,
      model: {
        key: modelLabel(scan),
        name: titleCase(modelLabel(scan)),
        fallback_used: fallbackUsed(scan),
      },
      result: {
        label: resultRow.label || scan.final_label || scan.status || 'Unknown',
        confidence,
        risk_level: risk,
        confidence_band: confidence >= 0.85 ? 'Strong' : confidence >= 0.65 ? 'Moderate' : 'Weak',
        summary: resultRow.explanation || 'Saved scan result.',
        indicators: resultRow.indicators || [],
        fake_score: isDeepfake ? primaryScore : undefined,
        real_score: isDeepfake ? secondaryScore : undefined,
        phishing_score: isDeepfake ? undefined : primaryScore,
        legitimate_score: isDeepfake ? undefined : secondaryScore,
        disclaimer: isDeepfake
          ? 'AI-assisted result. This is not legal, forensic, or final proof.'
          : 'AI-assisted result. Verify suspicious messages through official channels before taking action.',
      },
      scores: resultRow.raw_scores || [],
      report: {
        title: 'VeriTrust Scan Report',
        disclaimer: 'AI-assisted result. Manual review is recommended.',
        exportable: true,
      },
    };
  };

  const downloadReport = (scan) => {
    const report = reportFromScan(scan);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `veritrust-${report.scan_type}-report-${String(report.scan_id).slice(0, 8)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const printReport = (scan) => {
    const report = reportFromScan(scan);
    const result = report.result;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>${escapeHtml(report.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; line-height: 1.5; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          h2 { margin: 24px 0 8px; font-size: 16px; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
          .label { color: #6b7280; font-size: 12px; text-transform: uppercase; }
          ul { padding-left: 18px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(report.title)}</h1>
        <p>${escapeHtml(new Date(report.created_at).toLocaleString())}</p>
        <div class="grid">
          <div class="box"><div class="label">Type</div>${escapeHtml(report.scan_type)}</div>
          <div class="box"><div class="label">Scan ID</div>${escapeHtml(report.scan_id)}</div>
          <div class="box"><div class="label">Verdict</div>${escapeHtml(result.label)}</div>
          <div class="box"><div class="label">Risk</div>${escapeHtml(result.risk_level)}</div>
          <div class="box"><div class="label">Confidence</div>${escapeHtml(formatPercent(result.confidence))}</div>
          <div class="box"><div class="label">Model</div>${escapeHtml(report.model.name)}</div>
        </div>
        <h2>Summary</h2>
        <p>${escapeHtml(result.summary)}</p>
        ${Array.isArray(result.indicators) && result.indicators.length ? `<h2>Indicators</h2><ul>${result.indicators.map((item) => `<li>${escapeHtml(item.title || item.description || item)}</li>`).join('')}</ul>` : ''}
        <p>${escapeHtml(result.disclaimer)}</p>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const filteredScans = () => cachedScans.filter((scan) => {
    if (activeScanFilter === 'deepfake') return scan.scan_type === 'deepfake';
    if (activeScanFilter === 'phishing') return scan.scan_type === 'phishing';
    if (activeScanFilter === 'high') return ['high', 'critical'].includes(String(scan.risk_level || scanResult(scan).risk_level || '').toLowerCase());
    return true;
  });

  const renderFilters = () => {
    const filters = document.querySelector('[data-scan-filters]');
    if (!filters) return;
    const options = [
      ['all', 'All'],
      ['deepfake', 'Deepfake'],
      ['phishing', 'Phishing'],
      ['high', 'High Risk'],
    ];
    filters.innerHTML = options.map(([value, label]) => `
      <button class="${activeScanFilter === value ? 'active' : ''}" type="button" data-scan-filter="${value}">${label}</button>
    `).join('');
    filters.querySelectorAll('[data-scan-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        activeScanFilter = button.dataset.scanFilter || 'all';
        renderScans(cachedScans);
      });
    });
  };

  const setSessionPill = (signedIn) => {
    const pill = document.querySelector('[data-session-pill]');
    const dot = pill?.querySelector('.status-dot');
    setText('[data-session-label]', signedIn ? 'Signed in' : 'Signed out');
    if (pill) pill.classList.toggle('warn', !signedIn);
    if (dot) dot.classList.toggle('pending', !signedIn);
  };

  const setPrimaryAction = (signedIn) => {
    const action = document.querySelector('[data-account-primary-action]');
    if (!action) return;
    action.textContent = signedIn ? 'New Scan' : 'Sign In';
    action.href = signedIn ? 'detection.html' : 'auth.html';
  };

  const setLoadingText = (selector, kind = 'text') => {
    const node = document.querySelector(selector);
    if (!node) return;

    const computed = window.getComputedStyle(node);
    const range = document.createRange();
    range.selectNodeContents(node);
    const textRect = range.getBoundingClientRect();
    range.detach();

    const elementRect = node.getBoundingClientRect();
    const fontSize = Number.parseFloat(computed.fontSize) || 12;
    const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.25;
    const fallbackWidth = Math.max(fontSize * 1.2, String(node.textContent || '').trim().length * fontSize * 0.52);
    const measuredWidth = Math.ceil(textRect.width || elementRect.width || fallbackWidth);
    const measuredHeight = Math.ceil(textRect.height || elementRect.height || lineHeight);

    node.style.setProperty('--dashboard-shimmer-width', `${Math.max(10, measuredWidth)}px`);
    node.style.setProperty('--dashboard-shimmer-height', `${Math.max(8, measuredHeight)}px`);
    node.textContent = '\u00a0';
    node.setAttribute('aria-hidden', 'true');
    node.classList.add('dashboard-shimmer', kind === 'number' ? 'dashboard-shimmer-number' : 'dashboard-shimmer-text');
  };

  const renderScansLoading = () => {
    const table = document.querySelector('[data-recent-scans]');
    if (!table) return;
    table.setAttribute('aria-busy', 'true');
    table.innerHTML = `
      <div class="scan-table dashboard-skeleton-table" aria-hidden="true">
        <div class="scan-row scan-head">
          <span class="dashboard-shimmer"></span>
          <span class="dashboard-shimmer"></span>
          <span class="dashboard-shimmer"></span>
          <span class="dashboard-shimmer"></span>
        </div>
        ${Array.from({ length: 4 }).map(() => `
          <div class="scan-row">
            <span class="dashboard-shimmer"></span>
            <span class="dashboard-shimmer"></span>
            <span class="dashboard-shimmer"></span>
            <span class="dashboard-shimmer"></span>
          </div>
        `).join('')}
      </div>
    `;
  };

  const setDashboardLoading = (loading) => {
    document.body.classList.toggle('dashboard-is-loading', loading);
    document.querySelector('.dashboard-shell')?.setAttribute('aria-busy', String(loading));
    if (!loading) {
      document.querySelector('[data-recent-scans]')?.removeAttribute('aria-busy');
      return;
    }

    setLoadingText('[data-dashboard-status-title]');
    setLoadingText('[data-session-label]');
    setLoadingText('[data-account-name]');
    setLoadingText('[data-account-detail]');
    setLoadingText('[data-workspace-name]');
    setLoadingText('[data-workspace-role]');
    setLoadingText('[data-workspace-members]');
    setLoadingText('[data-usage-images]', 'number');
    setLoadingText('[data-usage-messages]', 'number');
    setLoadingText('[data-usage-api-keys]', 'number');
    renderScansLoading();
  };

  const setSignedOut = () => {
    setDashboardLoading(false);
    setSessionPill(false);
    setPrimaryAction(false);
    setText('[data-dashboard-status-title]', 'Sign in to continue');
    setText('[data-dashboard-status-text]', 'Monitor scans, usage, and workspace activity from one place.');
    setText('[data-account-name]', 'No active session');
    setText('[data-account-detail]', 'Sign in to view workspace activity.');
    setText('[data-workspace-name]', 'Not connected');
    setText('[data-workspace-role]', 'Sign in');
    setText('[data-workspace-members]', '0');
    setText('[data-usage-images]', '0');
    setText('[data-usage-messages]', '0');
    setText('[data-usage-api-keys]', '0');
    const table = document.querySelector('[data-recent-scans]');
    if (table) {
      table.innerHTML = `
        <div class="empty-state-table">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <strong>Sign in to load scans</strong>
          <p>Saved reviews will appear here after you sign in.</p>
        </div>
      `;
    }
  };

  function renderScans(scans) {
    const table = document.querySelector('[data-recent-scans]');
    if (!table) return;
    table.removeAttribute('aria-busy');
    cachedScans = scans || [];
    renderFilters();
    const visibleScans = filteredScans();

    if (!cachedScans.length) {
      table.innerHTML = `
        <div class="empty-state-table">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <strong>No scans yet.</strong>
          <p>Run your first scan to see reports here.</p>
        </div>
      `;
      return;
    }

    if (!visibleScans.length) {
      table.innerHTML = `
        <div class="empty-state-table">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </div>
          <strong>No scans match this filter.</strong>
          <p>Change the filter or run another scan to see more reports.</p>
        </div>
      `;
      return;
    }

    table.innerHTML = `
      <div class="scan-table" role="table" aria-label="Recent scans">
        <div class="scan-row scan-head" role="row">
          <span>Type</span><span>Verdict</span><span>Risk</span><span>Confidence</span><span>Model</span><span>Created</span><span>Actions</span>
        </div>
        ${visibleScans.map((scan, index) => {
    const result = scanResult(scan);
    const label = result.label || scan.final_label || scan.status;
    const risk = titleCase(result.risk_level || scan.risk_level || 'unknown');
    const confidence = Number(result.confidence || scan.confidence || 0);
    const indicators = Array.isArray(result.indicators) ? result.indicators : [];
    return `
          <div class="scan-row scan-row-rich" role="row">
            <span>${escapeHtml(scanTypeLabel(scan.scan_type))}</span>
            <span class="scan-verdict scan-verdict-${verdictTone(label)}">${escapeHtml(titleCase(label))}</span>
            <span><strong class="${riskBadgeClass(risk)}">${escapeHtml(risk)}</strong></span>
            <span>${escapeHtml(formatPercent(confidence))}</span>
            <span>${escapeHtml(titleCase(modelLabel(scan)))}${fallbackUsed(scan) ? ' (fallback)' : ''}</span>
            <span>${escapeHtml(new Date(scan.created_at).toLocaleDateString())}</span>
            <span class="scan-actions">
              <button type="button" data-scan-action="download" data-scan-index="${index}">JSON</button>
              <button type="button" data-scan-action="print" data-scan-index="${index}">Print</button>
            </span>
          </div>
          <details class="scan-detail-row">
            <summary>View details</summary>
            <p>${escapeHtml(result.explanation || 'Saved scan result.')}</p>
            ${indicators.length ? `<div class="scan-detail-signals">${indicators.slice(0, 5).map((item) => `<span>${escapeHtml(item.title || item.description || item)}</span>`).join('')}</div>` : ''}
            <p class="scan-detail-id">Scan ID: ${escapeHtml(scan.id)}</p>
          </details>
        `;
  }).join('')}
      </div>
    `;

    table.querySelectorAll('[data-scan-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const scan = visibleScans[Number(button.dataset.scanIndex || 0)];
        if (!scan) return;
        if (button.dataset.scanAction === 'download') downloadReport(scan);
        if (button.dataset.scanAction === 'print') printReport(scan);
      });
    });
  }

  setDashboardLoading(true);

  try {
    if (!window.VeriTrustSupabase?.isConfigured()) {
      setSignedOut();
      return;
    }

    const session = await window.VeriTrustSupabase.getSession();
    if (!session) {
      setSignedOut();
      return;
    }

    const context = await window.VeriTrustSupabase.getSessionContext();
    const org = context.organization;
    const profile = context.profile || {};
    const user = context.user || {};
    const stats = context.stats || {};
    const usage = stats.usage_today || {};

    setSessionPill(true);
    setPrimaryAction(true);
    setText('[data-dashboard-status-title]', org?.name || 'Workspace');
    setText('[data-dashboard-status-text]', 'Monitor scans, usage, and workspace activity from one place.');
    setText('[data-account-name]', profile.full_name || user.email || 'Signed-in user');
    setText('[data-account-detail]', `${user.email || 'Authenticated'} - ${context.role || 'member'} in ${org?.name || 'workspace'}`);
    setText('[data-workspace-name]', org?.name || 'Workspace');
    setText('[data-workspace-role]', context.role || 'member');
    setText('[data-workspace-members]', stats.member_count == null ? 'Available' : String(stats.member_count));
    setText('[data-usage-images]', String(usage.deepfake_count || 0));
    setText('[data-usage-messages]', String(usage.phishing_count || 0));
    setText('[data-usage-api-keys]', stats.api_key_count == null ? 'N/A' : String(stats.api_key_count));

    if (org?.id) {
      const scansPayload = await window.VeriTrustSupabase.getRecentScans(org.id, 20);
      const scans = scansPayload.scans || [];
      renderScans(scans);
    }
    setDashboardLoading(false);
  } catch (error) {
    setSignedOut();
    setText('[data-dashboard-status-title]', 'Dashboard unavailable');
    setText('[data-dashboard-status-text]', error.message || 'Unable to load scan history. Please try again.');
    const table = document.querySelector('[data-recent-scans]');
    if (table) {
      table.innerHTML = `
        <div class="empty-state-table">
          <strong>Unable to load scan history.</strong>
          <p>Please try again.</p>
        </div>
      `;
    }
  }
});
