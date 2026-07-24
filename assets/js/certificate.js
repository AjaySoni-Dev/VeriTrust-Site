(function initCertificatePage(global) {
  'use strict';

  const api = global.VeriTrustLearningApi;
  const $ = (selector) => document.querySelector(selector);

  function row(term, value) {
    const wrap = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = value || '—';
    wrap.append(dt, dd);
    return wrap;
  }

  function render(record) {
    $('#credential-title').textContent = record.certification_title || record.learning_certification_versions?.title || 'VeriTrust credential';
    $('#credential-name').textContent = record.display_name || 'Credential holder';
    $('#credential-status').textContent = String(record.status || '').toUpperCase();
    const details = $('#credential-details');
    details.replaceChildren(
      row('Credential ID', record.public_code),
      row('Issuer', record.issuer_name || 'VeriTrust'),
      row('Issued', record.issued_at ? new Date(record.issued_at).toLocaleDateString() : ''),
      row('Expires', record.expires_at ? new Date(record.expires_at).toLocaleDateString() : 'No expiry'),
      row('Version', record.certification_version || record.learning_certification_versions?.version),
      row('Outcome', record.outcome || record.status),
    );
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await global.VeriTrustPageAccess;
    const code = decodeURIComponent(global.location.pathname.match(/\/certificates\/([^/]+)/i)?.[1] || '');
    const message = $('#credential-message');
    try {
      if (code) {
        const response = await api.verify(code);
        render(response.data);
        $('#credential-card').hidden = false;
      } else {
        const response = await api.credentials();
        const records = response.data || [];
        if (records[0]) render(records[0]);
        $('#credential-card').hidden = !records.length;
        if (!records.length) message.textContent = 'No credentials have been issued to this account yet.';
      }
      if (!message.textContent) message.hidden = true;
    } catch (error) {
      message.textContent = error.message;
      message.dataset.tone = 'error';
    }
  });
})(window);
