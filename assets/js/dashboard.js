document.addEventListener('DOMContentLoaded', async () => {
  const setText = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));

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

  const setSignedOut = () => {
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

    if (!scans.length) {
      table.innerHTML = `
        <div class="empty-state-table">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <strong>No saved scans yet</strong>
          <p>Run a deepfake or phishing check while signed in, and the completed result will appear here.</p>
        </div>
      `;
      return;
    }

    table.innerHTML = `
      <div class="scan-table" role="table" aria-label="Recent scans">
        <div class="scan-row scan-head" role="row">
          <span>Type</span><span>Verdict</span><span>Risk</span><span>Created</span>
        </div>
        ${scans.map((scan) => `
          <div class="scan-row" role="row">
            <span>${escapeHtml(scan.scan_type)}</span>
            <span>${escapeHtml(scan.final_label || scan.status)}</span>
            <span>${escapeHtml(scan.risk_level || 'unknown')}</span>
            <span>${escapeHtml(new Date(scan.created_at).toLocaleDateString())}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

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
  } catch (error) {
    setSignedOut();
    setText('[data-dashboard-status-title]', 'Dashboard unavailable');
    setText('[data-dashboard-status-text]', error.message || 'Please try again shortly.');
  }
});
