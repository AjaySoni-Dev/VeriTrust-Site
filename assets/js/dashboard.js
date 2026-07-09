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
  let cachedApiKeys = [];
  let visibleScanLimit = 5;
  const SCAN_BATCH_SIZE = 5;

  const riskBadgeClass = (level) => `risk-badge risk-badge-${String(level || 'low').toLowerCase()}`;

  const formatPercent = (value) => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;

  const formatDateTime = (value) => {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
  };

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

  const printReport = async (scan) => {
    const report = reportFromScan(scan);
    if (window.VeriTrustReporting?.printReport) {
      await window.VeriTrustReporting.printReport(report);
      return;
    }
    window.print();
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
        visibleScanLimit = SCAN_BATCH_SIZE;
        renderScans(cachedScans);
      });
    });
  };

  const summarizeScans = (scans) => {
    const total = scans.length;
    const highRisk = scans.filter((scan) => ['high', 'critical'].includes(String(scan.risk_level || scanResult(scan).risk_level || '').toLowerCase())).length;
    const deepfake = scans.filter((scan) => scan.scan_type === 'deepfake').length;
    const phishing = scans.filter((scan) => scan.scan_type === 'phishing').length;
    return { deepfake, highRisk, phishing, total };
  };

  const usageFromKeys = (keys) => {
    const active = keys.filter((key) => key.status === 'active');
    const usage = active.reduce((acc, key) => {
      const item = key.usage || {};
      acc.used += Number(item.used_today || 0);
      acc.limit += Number(item.limit_daily || key.usage_limit_daily || 0);
      acc.remaining += Number(item.remaining_today || 0);
      if (key.last_used_at && (!acc.lastUsed || new Date(key.last_used_at) > new Date(acc.lastUsed))) {
        acc.lastUsed = key.last_used_at;
      }
      return acc;
    }, { lastUsed: null, limit: 0, remaining: 0, used: 0 });
    return usage;
  };

  const setApiUsage = (keys) => {
    const usage = usageFromKeys(keys || []);
    setText('[data-api-usage-used]', String(usage.used));
    setText('[data-api-usage-limit]', String(usage.limit || 100));
    setText('[data-api-usage-remaining]', String(usage.remaining || Math.max(0, (usage.limit || 100) - usage.used)));
    setText('[data-api-last-used]', formatDateTime(usage.lastUsed));
    setText('[data-usage-api-today]', String(usage.used));
  };

  const apiKeyStatusClass = (status) => String(status || '').toLowerCase() === 'active' ? 'status-pill ready' : 'status-pill warn';

  const renderApiKeys = (keys) => {
    cachedApiKeys = keys || [];
    const wrap = document.querySelector('[data-api-keys-list]');
    if (!wrap) return;
    setText('[data-usage-api-keys]', String(cachedApiKeys.filter((key) => key.status === 'active').length));
    setApiUsage(cachedApiKeys);

    if (!cachedApiKeys.length) {
      wrap.innerHTML = `
        <div class="empty-state-table">
          <strong>No API keys yet</strong>
          <p>Create a key to call VeriTrust from your own backend or notebooks.</p>
        </div>
      `;
      return;
    }

    wrap.innerHTML = `
      <div class="api-key-list">
        ${cachedApiKeys.map((key) => `
          <div class="api-key-row">
            <div class="api-key-main">
              <strong>${escapeHtml(key.name || 'API Key')}</strong>
              <code>${escapeHtml(key.masked_key || key.key_prefix || '')}</code>
            </div>
            <div class="api-key-meta">
              <span><small>Created</small><strong>${escapeHtml(formatDateTime(key.created_at))}</strong></span>
              <span><small>Last used</small><strong>${escapeHtml(formatDateTime(key.last_used_at))}</strong></span>
              <span><small>Usage today</small><strong>${escapeHtml((key.usage?.used_today || 0))} of ${escapeHtml((key.usage?.limit_daily || key.usage_limit_daily || 100))} used</strong></span>
            </div>
            <div class="api-key-controls">
              <span class="${apiKeyStatusClass(key.status)} api-key-status">${escapeHtml(titleCase(key.status || 'active'))}</span>
              ${key.status === 'active' ? `<button class="btn btn-secondary" type="button" data-revoke-api-key="${escapeHtml(key.id)}">Revoke</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    wrap.querySelectorAll('[data-revoke-api-key]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.revokeApiKey;
        if (!id) return;
        button.disabled = true;
        button.textContent = 'Revoking...';
        try {
          await window.VeriTrustSupabase.callAppApi(`/api/api-keys?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            cache: 'no-store',
          });
          await loadApiKeys();
        } catch (error) {
          button.disabled = false;
          button.textContent = 'Revoke';
          setText('[data-dashboard-status-text]', error.message || 'Unable to revoke API key.');
        }
      });
    });
  };

  async function loadApiKeys() {
    if (!window.VeriTrustSupabase?.callAppApi) return;
    const payload = await window.VeriTrustSupabase.callAppApi('/api/api-keys', { cache: 'no-store' });
    renderApiKeys(payload.api_keys || []);
  }

  const bindApiKeyForm = () => {
    const form = document.querySelector('[data-api-key-form]');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const created = document.querySelector('[data-api-key-created]');
      const formData = new FormData(form);
      const name = String(formData.get('name') || '').trim() || 'Jupyter Test';
      if (button) {
        button.disabled = true;
        button.textContent = 'Creating...';
      }
      try {
        const payload = await window.VeriTrustSupabase.callAppApi('/api/api-keys', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const key = payload.api_key || {};
        if (created) {
          created.hidden = false;
          created.innerHTML = `
            <strong>Copy this key now. It will not be shown again.</strong>
            <div class="api-key-secret">
              <code>${escapeHtml(key.key || '')}</code>
              <button class="btn btn-secondary" type="button" data-copy-created-key>Copy</button>
            </div>
          `;
          created.querySelector('[data-copy-created-key]')?.addEventListener('click', async () => {
            await navigator.clipboard?.writeText(key.key || '');
          });
        }
        form.reset();
        await loadApiKeys();
      } catch (error) {
        setText('[data-dashboard-status-text]', error.message || 'Unable to create API key.');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = 'Create API Key';
        }
      }
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
    setLoadingText('[data-usage-total-scans]', 'number');
    setLoadingText('[data-usage-high-risk]', 'number');
    setLoadingText('[data-usage-api-today]', 'number');
    setLoadingText('[data-api-usage-used]', 'number');
    setLoadingText('[data-api-usage-limit]', 'number');
    setLoadingText('[data-api-usage-remaining]', 'number');
    setLoadingText('[data-api-last-used]');
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
    setText('[data-usage-total-scans]', '0');
    setText('[data-usage-high-risk]', '0');
    setText('[data-usage-api-today]', '0');
    setText('[data-api-usage-used]', '0');
    setText('[data-api-usage-limit]', '100');
    setText('[data-api-usage-remaining]', '100');
    setText('[data-api-last-used]', 'Never');
    renderApiKeys([]);
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
    const nextScans = scans || [];
    if (nextScans !== cachedScans) visibleScanLimit = SCAN_BATCH_SIZE;
    cachedScans = nextScans;
    renderFilters();
    const matchingScans = filteredScans();
    const visibleScans = matchingScans.slice(0, visibleScanLimit);
    const hasMoreScans = visibleScans.length < matchingScans.length;

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

    if (!matchingScans.length) {
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
              <button type="button" data-scan-action="download" data-scan-index="${index}">JSON Report</button>
              <button type="button" data-scan-action="print" data-scan-index="${index}">Save PDF Report</button>
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
      ${matchingScans.length > SCAN_BATCH_SIZE ? `
        <div class="scan-pagination">
          <p>Showing ${visibleScans.length} of ${matchingScans.length} scans</p>
          ${hasMoreScans ? '<button class="btn btn-secondary" type="button" data-load-more-scans>Load more</button>' : ''}
        </div>
      ` : ''}
    `;

    table.querySelectorAll('[data-scan-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const scan = visibleScans[Number(button.dataset.scanIndex || 0)];
        if (!scan) return;
        if (button.dataset.scanAction === 'download') downloadReport(scan);
        if (button.dataset.scanAction === 'print') printReport(scan);
      });
    });

    table.querySelector('[data-load-more-scans]')?.addEventListener('click', () => {
      visibleScanLimit += SCAN_BATCH_SIZE;
      renderScans(cachedScans);
    });
  }

  setDashboardLoading(true);
  bindApiKeyForm();

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
    setText('[data-usage-api-today]', String(usage.api_count || 0));

    if (org?.id) {
      const scansPayload = await window.VeriTrustSupabase.getRecentScans(org.id, 100);
      const scans = scansPayload.scans || [];
      const summary = summarizeScans(scans);
      setText('[data-usage-total-scans]', String(summary.total));
      setText('[data-usage-high-risk]', String(summary.highRisk));
      if (!usage.deepfake_count) setText('[data-usage-images]', String(summary.deepfake));
      if (!usage.phishing_count) setText('[data-usage-messages]', String(summary.phishing));
      renderScans(scans);
    }
    await loadApiKeys();
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
