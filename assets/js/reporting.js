(function initVeriTrustReporting(global) {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function formatPercent(value) {
    return `${Math.round(clamp01(value) * 100)}%`;
  }

  function titleCase(value) {
    const text = String(value || '').trim();
    if (!text) return 'Unknown';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  function asList(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }

  function normalizeReportData(data = {}) {
    const result = data.result || {};
    const report = data.report || {};
    const scanType = data.scan_type || data.type || report.scan_type || 'scan';
    const model = data.model || report.model || {};
    return {
      title: report.title || data.title || 'VeriTrust Scan Report',
      scan_id: data.scan_id || data.scan?.id || report.scan_id || null,
      scan_type: scanType,
      created_at: data.created_at || report.created_at || new Date().toISOString(),
      model: {
        key: model.key || '',
        name: model.name || titleCase(model.key || 'VeriTrust'),
        fallback_used: Boolean(model.fallback_used || model.fallback_from),
        fallback_from: model.fallback_from || null,
      },
      result: {
        ...result,
        risk_level: titleCase(result.risk_level || 'Low'),
        confidence_band: result.confidence_band || 'N/A',
        summary: result.summary || result.explanation || 'AI-assisted assessment completed.',
        disclaimer: result.disclaimer || report.disclaimer || 'AI-assisted result. Not legal, forensic, cybersecurity, or final proof.',
      },
      scores: data.scores || report.scores || [],
      report: {
        title: report.title || data.title || 'VeriTrust Scan Report',
        disclaimer: report.disclaimer || result.disclaimer || 'AI-assisted result. Not legal, forensic, cybersecurity, or final proof.',
        exportable: report.exportable !== false,
      },
    };
  }

  function riskClass(level) {
    const normalized = String(level || 'low').toLowerCase();
    if (normalized === 'critical') return 'critical';
    if (normalized === 'high') return 'high';
    if (normalized === 'medium') return 'medium';
    return 'low';
  }

  function visibleVisualUrl(url) {
    return String(url || '').trim();
  }

  function sanitizeVisualsForJson(visuals = {}) {
    const normalUrl = (url) => {
      const value = String(url || '').trim();
      return value && !value.startsWith('data:') ? value : '';
    };
    return {
      available: Boolean(visuals.available),
      selected_face_index: Number.isFinite(Number(visuals.selected_face_index))
        ? Number(visuals.selected_face_index)
        : null,
      cropped_image_url: normalUrl(visuals.cropped_image_url),
      annotated_image_url: normalUrl(visuals.annotated_image_url),
    };
  }

  function truncate(value, maxLength = 110) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
  }

  function evidenceItems(result) {
    return asList(result.evidence || result.indicators).slice(0, 5).map((item) => {
      if (typeof item === 'string') {
        return { title: item, severity: 'Medium' };
      }
      return {
        title: item?.title || item?.type || 'Signal',
        severity: item?.severity || 'Medium',
      };
    });
  }

  function extractedGroups(result) {
    const extracted = result.extracted || {};
    return ['urls', 'domains', 'emails', 'phones']
      .map((key) => [key, asList(extracted[key]).slice(0, 3)])
      .filter(([, values]) => values.length);
  }

  function renderVisualCard(title, url, fallback) {
    const src = visibleVisualUrl(url);
    return `
      <div class="visual-card">
        <div class="mini-label">${escapeHtml(title)}</div>
        ${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}">` : `<div class="visual-fallback">${escapeHtml(fallback)}</div>`}
      </div>
    `;
  }

  function renderDeepfakeVisuals(visuals = {}) {
    const faceNumber = Number.isFinite(Number(visuals.selected_face_index))
      ? Number(visuals.selected_face_index) + 1
      : null;
    return `
      <section class="report-section visual-section">
        <div class="section-heading">
          <h2>Visual Evidence</h2>
          ${faceNumber ? `<span>Selected face ${faceNumber}</span>` : '<span>Face crop optional</span>'}
        </div>
        <div class="visual-grid">
          ${renderVisualCard('Annotated image', visuals.annotated_image_url, 'Annotated image not available.')}
          ${renderVisualCard('Selected cropped face', visuals.cropped_image_url, 'Cropped face not available.')}
        </div>
      </section>
    `;
  }

  function renderExtractedEntities(result) {
    const groups = extractedGroups(result);
    if (!groups.length) {
      return `
        <section class="report-section">
          <div class="section-heading"><h2>Extracted Entities</h2></div>
          <p class="muted compact">No URLs, domains, emails, or phone numbers were extracted.</p>
        </section>
      `;
    }
    return `
      <section class="report-section">
        <div class="section-heading"><h2>Extracted Entities</h2></div>
        <div class="entity-list">
          ${groups.map(([key, values]) => `
            <div class="entity-row">
              <span>${escapeHtml(key)}</span>
              <strong class="truncate">${escapeHtml(values.join(', '))}</strong>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function reportHtml(data, options = {}) {
    const report = normalizeReportData(data);
    const result = report.result || {};
    const isDeepfake = String(report.scan_type).toLowerCase() === 'deepfake';
    const risk = riskClass(result.risk_level);
    const evidence = evidenceItems(result);
    const visuals = options.visuals || {};
    const created = new Date(report.created_at);
    const createdLabel = Number.isNaN(created.getTime()) ? String(report.created_at || '') : created.toLocaleString();

    return `
      <!doctype html>
      <html>
      <head>
        <title>${escapeHtml(report.title)}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }

          html,
          body {
            width: 210mm;
            min-height: 297mm;
            margin: 0;
            background: #151515;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          * {
            box-sizing: border-box;
          }

          body {
            color: #f8fafc;
            font-family: Inter, Arial, sans-serif;
            line-height: 1.35;
          }

          .report-sheet {
            width: 210mm;
            height: 297mm;
            overflow: hidden;
            padding: 10mm;
            background: #151515;
          }

          .report-frame {
            height: 100%;
            display: grid;
            grid-template-rows: auto auto auto minmax(0, 1fr) auto;
            gap: 7mm;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            padding: 8mm;
            background: #1f1f1f;
          }

          .report-header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 12px;
            align-items: start;
          }

          .brand {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .brand-mark {
            width: 26px;
            height: 26px;
            border-radius: 8px;
            display: grid;
            place-items: center;
            background: #2563eb;
            color: #fff;
            font-weight: 800;
            font-size: 12px;
          }

          h1 {
            margin: 0;
            font-size: 22px;
            line-height: 1.05;
          }

          .subtitle,
          .muted {
            color: #a1a1aa;
          }

          .subtitle {
            margin: 3px 0 0;
            font-size: 10px;
          }

          .scan-meta {
            display: grid;
            gap: 3px;
            min-width: 56mm;
            color: #a1a1aa;
            font-size: 9px;
            text-align: right;
          }

          .truncate {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .hero-result {
            display: grid;
            grid-template-columns: 1.1fr repeat(3, 0.7fr);
            gap: 8px;
          }

          .metric-card,
          .model-card,
          .visual-card,
          .summary-card,
          .evidence-card,
          .entity-row,
          .disclaimer {
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 12px;
            background: #242424;
          }

          .metric-card,
          .model-card,
          .summary-card,
          .evidence-card,
          .entity-row {
            padding: 8px;
          }

          .mini-label {
            margin-bottom: 4px;
            color: #a1a1aa;
            font-size: 8.5px;
            font-weight: 700;
            letter-spacing: 0.02em;
            text-transform: uppercase;
          }

          .metric-card strong {
            display: block;
            font-size: 17px;
            line-height: 1.1;
          }

          .risk-pill {
            width: fit-content;
            min-height: 24px;
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            padding: 0 10px;
            font-size: 13px;
            font-weight: 800;
          }

          .risk-low {
            color: #bbf7d0;
            background: rgba(34, 197, 94, 0.18);
            border: 1px solid rgba(34, 197, 94, 0.42);
          }

          .risk-medium {
            color: #fde68a;
            background: rgba(245, 158, 11, 0.18);
            border: 1px solid rgba(245, 158, 11, 0.42);
          }

          .risk-high,
          .risk-critical {
            color: #fecaca;
            background: rgba(239, 68, 68, 0.18);
            border: 1px solid rgba(239, 68, 68, 0.5);
          }

          .model-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }

          .model-card strong,
          .entity-row strong {
            display: block;
            color: #f8fafc;
            font-size: 11px;
          }

          .model-card span,
          .entity-row span {
            display: block;
            color: #a1a1aa;
            font-size: 8.5px;
            font-weight: 700;
            text-transform: uppercase;
          }

          .report-main {
            min-height: 0;
            display: grid;
            gap: 6mm;
          }

          .report-section {
            min-width: 0;
          }

          .section-heading {
            min-height: 18px;
            display: flex;
            justify-content: space-between;
            gap: 8px;
            align-items: center;
            margin-bottom: 5px;
          }

          h2 {
            margin: 0;
            font-size: 13px;
          }

          .section-heading span {
            color: #a1a1aa;
            font-size: 9px;
          }

          .visual-grid {
            display: grid;
            grid-template-columns: 1.4fr 1fr;
            gap: 10px;
          }

          .visual-card {
            min-height: 62mm;
            padding: 8px;
          }

          .visual-card img {
            width: 100%;
            height: 54mm;
            object-fit: contain;
            border-radius: 8px;
            background: #111;
          }

          .visual-fallback {
            height: 54mm;
            display: grid;
            place-items: center;
            border: 1px dashed rgba(255, 255, 255, 0.16);
            border-radius: 8px;
            color: #a1a1aa;
            font-size: 10px;
            text-align: center;
            background: #191919;
          }

          .summary-card p,
          .compact {
            margin: 0;
            font-size: 10.5px;
          }

          .summary-card p {
            display: -webkit-box;
            overflow: hidden;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
          }

          .evidence-list {
            display: grid;
            gap: 6px;
          }

          .evidence-card {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
          }

          .evidence-card strong {
            font-size: 10.5px;
          }

          .severity {
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 999px;
            padding: 2px 7px;
            color: #f8fafc;
            font-size: 8.5px;
            font-weight: 800;
          }

          .entity-list {
            display: grid;
            gap: 5px;
          }

          .entity-row {
            display: grid;
            grid-template-columns: 24mm minmax(0, 1fr);
            gap: 8px;
            align-items: center;
          }

          .disclaimer {
            padding: 8px 10px;
            color: #a1a1aa;
            font-size: 9.5px;
          }

          @media print {
            html,
            body {
              background: #151515 !important;
            }

            .report-sheet {
              page-break-after: avoid;
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <main class="report-sheet">
          <div class="report-frame">
            <header class="report-header">
              <div>
                <div class="brand">
                  <div class="brand-mark">VT</div>
                  <div>
                    <h1>${escapeHtml(report.title)}</h1>
                    <p class="subtitle">AI-assisted risk analysis report</p>
                  </div>
                </div>
              </div>
              <div class="scan-meta">
                <span class="truncate">Type: ${escapeHtml(titleCase(report.scan_type))}</span>
                <span class="truncate">Date: ${escapeHtml(createdLabel)}</span>
                <span class="truncate">Scan ID: ${escapeHtml(report.scan_id || 'Not available')}</span>
              </div>
            </header>

            <section class="hero-result">
              <div class="metric-card">
                <div class="mini-label">Verdict</div>
                <strong class="truncate">${escapeHtml(result.label || 'Unknown')}</strong>
              </div>
              <div class="metric-card">
                <div class="mini-label">Risk</div>
                <span class="risk-pill risk-${risk}">${escapeHtml(result.risk_level || 'Low')}</span>
              </div>
              <div class="metric-card">
                <div class="mini-label">Confidence</div>
                <strong>${escapeHtml(formatPercent(result.confidence))}</strong>
              </div>
              <div class="metric-card">
                <div class="mini-label">Band</div>
                <strong class="truncate">${escapeHtml(result.confidence_band || 'N/A')}</strong>
              </div>
            </section>

            <section class="model-grid">
              <div class="model-card"><span>Model name</span><strong class="truncate">${escapeHtml(report.model.name)}</strong></div>
              <div class="model-card"><span>Model key</span><strong class="truncate">${escapeHtml(report.model.key || 'N/A')}</strong></div>
              <div class="model-card"><span>Fallback</span><strong>${report.model.fallback_used ? 'Used' : 'Not used'}</strong></div>
            </section>

            <div class="report-main">
              ${isDeepfake ? renderDeepfakeVisuals(visuals) : renderExtractedEntities(result)}

              <section class="report-section">
                <div class="section-heading"><h2>Summary</h2></div>
                <div class="summary-card">
                  <p>${escapeHtml(truncate(result.summary || result.explanation || 'No summary available.', 260))}</p>
                </div>
              </section>

              <section class="report-section">
                <div class="section-heading">
                  <h2>${isDeepfake ? 'Evidence' : 'Indicators'}</h2>
                  <span>Top ${Math.min(5, evidence.length)} shown</span>
                </div>
                ${evidence.length ? `
                  <div class="evidence-list">
                    ${evidence.map((item) => `
                      <div class="evidence-card">
                        <strong class="truncate">${escapeHtml(item.title)}</strong>
                        <span class="severity">${escapeHtml(item.severity)}</span>
                      </div>
                    `).join('')}
                  </div>
                ` : '<p class="muted compact">No additional evidence or indicators were returned.</p>'}
              </section>
            </div>

            <footer class="disclaimer">
              ${escapeHtml(result.disclaimer || report.report.disclaimer || 'AI-assisted result. Not legal, forensic, cybersecurity, or final proof.')}
            </footer>
          </div>
        </main>
      </body>
      </html>
    `;
  }

  function waitForReportImages(printWindow, timeoutMs = 2500) {
    const images = Array.from(printWindow.document.images || []);
    if (!images.length) return Promise.resolve();

    const imagePromises = images.map((image) => new Promise((resolve) => {
      if (image.complete) {
        resolve();
        return;
      }
      const done = () => resolve();
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    }));

    return Promise.race([
      Promise.all(imagePromises),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  async function printReport(data, options = {}) {
    const printWindow = global.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      global.print();
      return;
    }

    printWindow.document.open();
    printWindow.document.write(reportHtml(data, options));
    printWindow.document.close();
    printWindow.focus();
    await waitForReportImages(printWindow, options.timeoutMs || 2500);
    printWindow.print();
  }

  global.VeriTrustReporting = {
    normalizeReportData,
    printReport,
    reportHtml,
    sanitizeVisualsForJson,
    waitForReportImages,
  };
})(window);
