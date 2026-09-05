(function emailReportPdf(global) {
  'use strict';

  const PAGE_WIDTH = 595;
  const PAGE_HEIGHT = 842;
  const MARGIN = 48;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
  const STATE_LABELS = Object.freeze({
    LIKELY_PHISHING: 'Likely phishing',
    LIKELY_BENIGN: 'No strong phishing signs found',
    UNCERTAIN: 'Needs a closer look',
    UNSUPPORTED: 'Could not fully check this email',
    FAILED: 'Check could not be completed',
  });
  const ACTION_LABELS = Object.freeze({
    allow: 'No immediate action',
    warn: 'Show a warning',
    manual_review: 'Review manually',
    quarantine: 'Move to quarantine',
    block: 'Block the message',
    hold: 'Hold for review',
  });
  const GLOSSARY = Object.freeze([
    ['.eml file', 'A saved original email that preserves message headers, body content, delivery records, and attachment details.'],
    ['Phishing', 'A deceptive message designed to make someone reveal information, send money, install software, or take another unsafe action.'],
    ['Risk score', 'The Gateway\'s combined estimate of concern based on the evidence that was available. It is not a guarantee of safety or harm.'],
    ['Evidence coverage', 'A summary of which checks had enough information to run and which checks were limited or unavailable.'],
    ['SPF', 'Sender Policy Framework checks whether a sending mail server was authorized by the domain it claims to use.'],
    ['DKIM', 'DomainKeys Identified Mail checks a cryptographic signature to detect changes to signed parts of a message.'],
    ['DMARC', 'Domain-based Message Authentication, Reporting and Conformance checks whether the visible sender aligns with successful SPF or DKIM results.'],
    ['ARC', 'Authenticated Received Chain records how trusted mail systems evaluated a message while it was forwarded.'],
    ['Authentication-Results', 'A header written by a receiving mail server that records email authentication outcomes. Copied values are not automatically trusted.'],
    ['Sender consistency', 'A comparison of the visible sender with reply, return-path, signing, and linked domains to identify unexpected mismatches.'],
    ['URL or link intelligence', 'A safety check of web addresses found in the email without requiring the user to open them.'],
    ['Delivery route', 'The chain of eligible mail servers recorded while an email traveled to the recipient.'],
    ['IP address', 'A numeric address used by a device or server on a network. In this report it normally describes mail infrastructure, not a person.'],
    ['GeoIP', 'An approximate country or region inferred from an IP address. It does not prove a sender\'s physical location.'],
    ['ASN', 'Autonomous System Number, which identifies the network organization responsible for a block of internet addresses.'],
    ['MIME', 'The email format that describes message parts, character encoding, and attachments.'],
    ['Metadata', 'Descriptive information about the investigation, such as identifiers, timestamps, file properties, and processing states.'],
    ['Provenance', 'A record of where evidence came from and how it was collected or transformed.'],
    ['AI model', 'A statistical system that estimates phishing likelihood from available content. It provides supporting evidence, not a final safety guarantee.'],
    ['Phishing likelihood', 'The AI model\'s probability estimate for phishing-like content, considered alongside rules and sender evidence.'],
    ['Degraded result', 'A result produced when one or more expected checks were unavailable, timed out, or lacked enough evidence.'],
    ['Idempotency key', 'A unique request value that prevents an accidental retry from creating a duplicate investigation.'],
    ['Retention policy', 'The rule that determines what submitted data is kept and for how long.'],
    ['Quarantine', 'Moving a suspicious message into an isolated area so it cannot be used normally until reviewed.'],
    ['Manual review', 'A person examines the evidence and source context before making a consequential decision.'],
  ]);

  const ascii = (value) => String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[\u2010-\u2015]/gu, '-')
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/[^\x20-\x7E\n]/gu, '?');
  const escapePdf = (value) => ascii(value).replace(/\\/gu, '\\\\').replace(/\(/gu, '\\(').replace(/\)/gu, '\\)');
  const titleCase = (value) => String(value || '').toLowerCase().replace(/_/gu, ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());

  function wrapText(value, size, width = CONTENT_WIDTH) {
    const limit = Math.max(12, Math.floor(width / (size * 0.53)));
    const paragraphs = ascii(value).split(/\r?\n/gu);
    const lines = [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const words = paragraph.trim().split(/\s+/gu).filter(Boolean);
      if (!words.length) lines.push('');
      let line = '';
      words.forEach((word) => {
        if (word.length > limit) {
          if (line) { lines.push(line); line = ''; }
          for (let index = 0; index < word.length; index += limit) lines.push(word.slice(index, index + limit));
          return;
        }
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > limit) { lines.push(line); line = word; } else line = candidate;
      });
      if (line) lines.push(line);
      if (paragraphIndex < paragraphs.length - 1) lines.push('');
    });
    return lines.length ? lines : [''];
  }

  function flatten(value, path = 'report', rows = []) {
    if (Array.isArray(value)) {
      if (!value.length) rows.push([path, '[]']);
      value.forEach((item, index) => flatten(item, `${path}[${index}]`, rows));
      return rows;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length) rows.push([path, '{}']);
      entries.forEach(([key, item]) => flatten(item, `${path}.${key}`, rows));
      return rows;
    }
    rows.push([path, value === null ? 'null' : String(value)]);
    return rows;
  }

  class PdfDocument {
    constructor(reportId) {
      this.reportId = ascii(reportId || 'Unavailable');
      this.pages = [];
      this.page = null;
      this.runningSection = '';
      this.cursor = 0;
      this.newPage();
    }

    newPage() {
      this.page = [];
      this.pages.push(this.page);
      this.cursor = 72;
      this.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, '0.985 0.989 0.992');
      this.rect(0, 0, PAGE_WIDTH, 8, '0.02 0.62 0.62');
      this.text('VERITRUST  /  EMAIL FORENSIC REPORT', MARGIN, 31, 8, true, '0.08 0.42 0.44');
      this.text(`Report ${this.reportId}`, PAGE_WIDTH - MARGIN, 31, 8, false, '0.34 0.39 0.45', 'right');
      if (this.runningSection) this.text(this.runningSection, MARGIN, 50, 8, true, '0.34 0.39 0.45');
    }

    ensure(height) {
      if (this.cursor + height > 785) this.newPage();
    }

    rect(x, top, width, height, color, stroke = null) {
      const y = PAGE_HEIGHT - top - height;
      this.page.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
      if (stroke) this.page.push(`${stroke} RG 0.7 w ${x} ${y} ${width} ${height} re S`);
    }

    text(value, x, top, size = 10, bold = false, color = '0.12 0.16 0.22', align = 'left') {
      const safe = escapePdf(value);
      const estimatedWidth = ascii(value).length * size * 0.52;
      const drawX = align === 'right' ? x - estimatedWidth : x;
      const y = PAGE_HEIGHT - top - size;
      this.page.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg 1 0 0 1 ${drawX.toFixed(2)} ${y.toFixed(2)} Tm (${safe}) Tj ET`);
    }

    lines(value, options = {}) {
      const size = options.size || 10;
      const lineHeight = options.lineHeight || size * 1.45;
      const x = options.x || MARGIN;
      const width = options.width || CONTENT_WIDTH;
      const wrapped = wrapText(value, size, width);
      this.ensure((wrapped.length * lineHeight) + 4);
      wrapped.forEach((line) => {
        this.text(line, x, this.cursor, size, Boolean(options.bold), options.color || '0.12 0.16 0.22');
        this.cursor += lineHeight;
      });
      return wrapped.length;
    }

    heading(value) {
      this.ensure(42);
      this.cursor += 9;
      this.text(value, MARGIN, this.cursor, 15, true, '0.06 0.18 0.24');
      this.cursor += 26;
      this.rect(MARGIN, this.cursor, 42, 2, '0.02 0.62 0.62');
      this.cursor += 13;
    }

    keyValue(label, value) {
      const textValue = value === undefined || value === null || value === '' ? 'Not available' : String(value);
      const lines = wrapText(textValue, 9.5, CONTENT_WIDTH - 152);
      const height = Math.max(25, (lines.length * 13) + 8);
      this.ensure(height + 4);
      this.rect(MARGIN, this.cursor, CONTENT_WIDTH, height, '0.965 0.973 0.978', '0.86 0.89 0.91');
      this.text(label, MARGIN + 11, this.cursor + 9, 8.5, true, '0.27 0.34 0.40');
      lines.forEach((line, index) => this.text(line, MARGIN + 142, this.cursor + 8 + (index * 13), 9.5));
      this.cursor += height + 5;
    }

    finish() {
      this.pages.forEach((page, index) => {
        const footerTop = 808;
        page.push(`0.86 0.89 0.91 RG 0.6 w ${MARGIN} ${PAGE_HEIGHT - footerTop} m ${PAGE_WIDTH - MARGIN} ${PAGE_HEIGHT - footerTop} l S`);
        const footerY = PAGE_HEIGHT - 823 - 8;
        page.push(`BT /F1 8 Tf 0.36 0.41 0.47 rg 1 0 0 1 ${MARGIN} ${footerY} Tm (Supports human review - not a safety certificate) Tj ET`);
        const pageText = `Page ${index + 1} of ${this.pages.length}`;
        const rightX = PAGE_WIDTH - MARGIN - (pageText.length * 8 * 0.52);
        page.push(`BT /F1 8 Tf 0.36 0.41 0.47 rg 1 0 0 1 ${rightX.toFixed(2)} ${footerY} Tm (${pageText}) Tj ET`);
      });
      return buildPdfBytes(this.pages);
    }
  }

  function buildPdfBytes(pages) {
    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const pageObjectIds = pages.map((_, index) => 5 + (index * 2));
    objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    pages.forEach((commands, index) => {
      const pageId = pageObjectIds[index];
      const contentId = pageId + 1;
      const stream = `${commands.join('\n')}\n`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    });
    let output = '%PDF-1.4\n%VT01\n';
    const offsets = [0];
    for (let index = 1; index < objects.length; index += 1) {
      offsets[index] = output.length;
      output += `${index} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xref = output.length;
    output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let index = 1; index < objects.length; index += 1) output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return typeof TextEncoder === 'function' ? new TextEncoder().encode(output) : Buffer.from(output, 'ascii');
  }

  function buildEmailReportPdf(payload) {
    const report = payload || {};
    const evidence = report.evidence || {};
    const decision = report.gateway_decision || {};
    const reportId = report.scan_id || report.report_id || 'Unavailable';
    const document = new PdfDocument(reportId);
    const risk = Number.isFinite(Number(decision.risk)) ? `${Math.round(Number(decision.risk) * 100)}%` : 'Not available';
    const state = STATE_LABELS[evidence.state] || titleCase(evidence.state || 'Unknown');
    const recommendation = ACTION_LABELS[decision.recommendation] || titleCase(decision.recommendation || 'Review manually');
    const generatedAt = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/u, ' UTC');

    document.text('EMAIL INVESTIGATION', MARGIN, 79, 9, true, '0.02 0.62 0.62');
    document.text(state, MARGIN, 99, 25, true, '0.04 0.13 0.19');
    document.cursor = 139;
    document.lines('A clear, evidence-backed summary of the submitted email and every result returned by the VeriTrust Unified Gateway.', { size: 11, lineHeight: 16, color: '0.30 0.36 0.42' });
    document.cursor += 12;
    document.keyValue('Recommended next step', recommendation);
    document.keyValue('Risk score', risk);
    document.keyValue('Report ID', reportId);
    document.keyValue('Generated', generatedAt);
    document.keyValue('Input type', titleCase(evidence.input_mode || report.input_type || 'Not recorded'));
    document.keyValue('Evidence coverage', decision.degraded ? 'Some checks were unavailable; read the limitations below.' : 'All checks supported by the submitted evidence were considered.');

    document.heading('Plain-language findings');
    const observations = Array.isArray(evidence.observations) ? evidence.observations : [];
    const limitations = Array.isArray(evidence.limitations) ? evidence.limitations : [];
    const children = Array.isArray(evidence.children) ? evidence.children : [];
    const infrastructure = Array.isArray(evidence.infrastructure) ? evidence.infrastructure : [];
    const relationships = Array.isArray(evidence.relationships) ? evidence.relationships : [];
    const model = Array.isArray(evidence.model_evidence) ? evidence.model_evidence : [];
    document.keyValue('Message and sender findings', observations.length ? `${observations.length} observation(s) were recorded. See the complete evidence appendix for every code and value.` : 'No specific observation was recorded. This does not prove that the email is safe.');
    document.keyValue('Sender consistency', relationships.length ? `${relationships.length} sender relationship(s) were compared.` : 'There was not enough sender information to record a relationship comparison.');
    document.keyValue('Links and attachments', children.length ? `${children.length} linked or attached item(s) were identified.` : 'No linked or attached item was recorded in the available evidence.');
    document.keyValue('Delivery route', infrastructure.length ? `${infrastructure.length} eligible public mail-server step(s) were recorded.` : 'No eligible public mail-server step was available.');
    document.keyValue('AI content check', model.length ? `${model.length} model evidence record(s) were returned.` : 'No AI model evidence was returned.');
    document.keyValue('Important limitations', limitations.length ? limitations.join('; ') : 'No additional limitation was recorded for the checks that ran.');

    document.heading('Complete technical evidence appendix');
    document.runningSection = 'COMPLETE TECHNICAL EVIDENCE APPENDIX - CONTINUED';
    document.lines('The following list preserves every field and value returned in this investigation. Dotted names show where each value appeared in the response.', { size: 9.5, lineHeight: 14, color: '0.32 0.38 0.44' });
    document.cursor += 8;
    flatten(report).forEach(([key, value]) => document.keyValue(key, value));

    document.runningSection = 'GLOSSARY / TERMS AND MEANINGS';
    document.newPage();
    document.text('REFERENCE', MARGIN, 79, 9, true, '0.02 0.62 0.62');
    document.text('Glossary: terms and meanings', MARGIN, 99, 22, true, '0.04 0.13 0.19');
    document.cursor = 139;
    document.lines('Use this final section to understand the specialist words used in the report. Meanings are intentionally brief and written for non-technical readers.', { size: 10.5, lineHeight: 15, color: '0.30 0.36 0.42' });
    document.cursor += 11;
    GLOSSARY.forEach(([term, meaning]) => document.keyValue(term, meaning));
    return document.finish();
  }

  function downloadEmailReportPdf(payload, filename) {
    const bytes = buildEmailReportPdf(payload);
    if (!global.document || !global.URL || typeof global.Blob !== 'function') return bytes;
    const reportId = ascii(payload?.scan_id || 'report').replace(/[^A-Za-z0-9_-]/gu, '-');
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = global.URL.createObjectURL(blob);
    const anchor = global.document.createElement('a');
    anchor.href = url;
    anchor.download = filename || `VeriTrust-email-report-${reportId}.pdf`;
    anchor.hidden = true;
    global.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    global.setTimeout(() => global.URL.revokeObjectURL(url), 1000);
    return bytes;
  }

  const api = Object.freeze({ buildEmailReportPdf, downloadEmailReportPdf, glossary: GLOSSARY });
  global.VeriTrustEmailPdf = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof window === 'object' ? window : globalThis));
