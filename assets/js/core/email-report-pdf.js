(function emailReportPdf(global) {
  'use strict';

  const PAGE_WIDTH = 595;
  const PAGE_HEIGHT = 842;
  const MARGIN = 48;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
  const BODY_COLOR = '0.12 0.16 0.22';
  const MUTED_COLOR = '0.31 0.37 0.44';
  const HEADING_COLOR = '0.04 0.13 0.19';
  const TEAL_COLOR = '0.00 0.60 0.62';
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
  const FINDING_LABELS = Object.freeze({
    CREDENTIAL_REQUEST: 'Requests a password, code, or other credential',
    PAYMENT_REQUEST: 'Requests money or payment',
    URGENCY_OR_COERCION: 'Uses urgency or pressure',
    OUT_OF_BAND_CONTACT: 'Asks the reader to switch contact methods',
    ATTACHMENT_LURE: 'Pushes the reader to open an attachment',
    QR_OR_LINK_LURE: 'Pushes the reader to follow a link or QR code',
    IMPERSONATION_CLAIM: 'Claims to represent a trusted person or team',
    VISIBLE_URL_DIFFERS_FROM_HREF: 'Visible link and actual destination differ',
    OBFUSCATED_LINK_TEXT: 'Link text appears intentionally disguised',
    HTML_HIDDEN_CONTENT: 'Contains hidden email content',
    HTML_META_REFRESH: 'Attempts an automatic redirect',
    LINK_DOMAIN_UNRELATED_TO_AUTHOR: 'Link domain does not match the sender',
    MESSAGE_ID_DOMAIN_DIFFERS: 'Message identifier domain differs from sender',
    REPLY_TO_DOMAIN_DIFFERS: 'Reply address domain differs from sender',
    RETURN_PATH_DOMAIN_DIFFERS: 'Return address domain differs from sender',
  });
  const LIMITATION_LABELS = Object.freeze({
    SPF_UNAVAILABLE_WITHOUT_TRUSTED_RECEIVER_FACTS: 'SPF could not be recreated from the saved email alone.',
    AUTHENTICATION_TIMEOUT: 'A sender-verification check took too long to finish.',
    AUTHENTICATION_EVALUATION_FAILED: 'A sender-verification check could not be completed.',
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
  const list = (value) => Array.isArray(value) ? value : [];
  const displayValue = (value, fallback = 'Not available') => value === undefined || value === null || value === '' ? fallback : String(value);
  const shortenId = (value) => {
    const text = ascii(value || 'Unavailable');
    return text.length > 25 ? `${text.slice(0, 10)}...${text.slice(-10)}` : text;
  };

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

  function compactTechnicalLines(value, indent = 0) {
    const pad = ' '.repeat(indent);
    if (value === null || typeof value !== 'object') return [`${pad}${JSON.stringify(value) ?? 'null'}`];
    if (Array.isArray(value)) {
      if (!value.length) return [`${pad}[]`];
      if (value.every((item) => item === null || typeof item !== 'object')) {
        return [`${pad}[${value.map((item) => JSON.stringify(item)).join(', ')}]`];
      }
      const lines = [`${pad}[`];
      value.forEach((item, index) => {
        lines.push(`${' '.repeat(indent + 1)}# ${index + 1}`);
        lines.push(...compactTechnicalLines(item, indent + 1));
      });
      lines.push(`${pad}]`);
      return lines;
    }
    const entries = Object.entries(value);
    if (!entries.length) return [`${pad}{}`];
    const lines = [`${pad}{`];
    entries.forEach(([key, item]) => {
      if (item !== null && typeof item === 'object') {
        lines.push(`${' '.repeat(indent + 1)}${JSON.stringify(key)}:`);
        lines.push(...compactTechnicalLines(item, indent + 2));
      } else {
        lines.push(`${' '.repeat(indent + 1)}${JSON.stringify(key)}: ${JSON.stringify(item) ?? 'null'}`);
      }
    });
    lines.push(`${pad}}`);
    return lines;
  }

  function wrapCodeLines(lines, limit = 112) {
    const wrapped = [];
    lines.forEach((source) => {
      const line = ascii(source);
      if (line.length <= limit) { wrapped.push(line); return; }
      const indent = `${line.match(/^\s*/u)?.[0] || ''}  `;
      let remaining = line;
      while (remaining.length > limit) {
        let splitAt = remaining.lastIndexOf(' ', limit);
        if (splitAt < Math.floor(limit * 0.55)) splitAt = limit;
        wrapped.push(remaining.slice(0, splitAt));
        remaining = `${indent}${remaining.slice(splitAt).trimStart()}`;
      }
      wrapped.push(remaining);
    });
    return wrapped;
  }

  class PdfDocument {
    constructor(reportId, logo = null) {
      this.reportId = ascii(reportId || 'Unavailable');
      this.logo = logo;
      this.pages = [];
      this.page = null;
      this.runningSection = '';
      this.cursor = 0;
      this.newPage();
    }

    newPage() {
      this.page = [];
      this.pages.push(this.page);
      this.cursor = 78;
      this.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, '0.985 0.989 0.992');
      this.rect(0, 0, PAGE_WIDTH, 7, TEAL_COLOR);
      if (this.logo) this.image('Logo', MARGIN, 18, 113, 20);
      else this.text('VERITRUST LAB', MARGIN, 25, 10, true, '0.02 0.43 0.46');
      this.text('EMAIL FORENSIC REPORT', this.logo ? 172 : 139, 26, 7.5, true, '0.20 0.34 0.39');
      this.text(shortenId(this.reportId), PAGE_WIDTH - MARGIN, 26, 7.5, false, MUTED_COLOR, 'right');
      if (this.runningSection) this.text(this.runningSection, MARGIN, 54, 7.5, true, MUTED_COLOR);
    }

    ensure(height) {
      if (this.cursor + height > 790) this.newPage();
    }

    rect(x, top, width, height, color, stroke = null) {
      const y = PAGE_HEIGHT - top - height;
      this.page.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
      if (stroke) this.page.push(`${stroke} RG 0.7 w ${x} ${y} ${width} ${height} re S`);
    }

    image(name, x, top, width, height) {
      const y = PAGE_HEIGHT - top - height;
      this.page.push(`q ${width} 0 0 ${height} ${x} ${y} cm /${name} Do Q`);
    }

    text(value, x, top, size = 10, bold = false, color = BODY_COLOR, align = 'left', font = null) {
      const safe = escapePdf(value);
      const fontName = font || (bold ? 'F2' : 'F1');
      const factor = fontName === 'F3' ? 0.6 : 0.52;
      const estimatedWidth = ascii(value).length * size * factor;
      const drawX = align === 'right' ? x - estimatedWidth : x;
      const y = PAGE_HEIGHT - top - size;
      this.page.push(`BT /${fontName} ${size} Tf ${color} rg 1 0 0 1 ${drawX.toFixed(2)} ${y.toFixed(2)} Tm (${safe}) Tj ET`);
    }

    lines(value, options = {}) {
      const size = options.size || 10;
      const lineHeight = options.lineHeight || size * 1.45;
      const x = options.x || MARGIN;
      const width = options.width || CONTENT_WIDTH;
      const wrapped = wrapText(value, size, width);
      this.ensure((wrapped.length * lineHeight) + 4);
      wrapped.forEach((line) => {
        this.text(line, x, this.cursor, size, Boolean(options.bold), options.color || BODY_COLOR);
        this.cursor += lineHeight;
      });
      return wrapped.length;
    }

    sectionTitle(value, eyebrow = '') {
      this.ensure(58);
      this.cursor += 12;
      if (eyebrow) {
        this.text(eyebrow.toUpperCase(), MARGIN, this.cursor, 7.5, true, TEAL_COLOR);
        this.cursor += 15;
      }
      this.text(value, MARGIN, this.cursor, 16, true, HEADING_COLOR);
      this.cursor += 27;
      this.rect(MARGIN, this.cursor, 44, 2, TEAL_COLOR);
      this.cursor += 14;
    }

    keyValue(label, value) {
      const textValue = displayValue(value);
      const stacked = ascii(label).length > 23;
      const valueWidth = stacked ? CONTENT_WIDTH - 22 : CONTENT_WIDTH - 154;
      const valueLines = wrapText(textValue, 9.4, valueWidth);
      const height = stacked ? Math.max(45, 26 + (valueLines.length * 13)) : Math.max(29, 10 + (valueLines.length * 13));
      this.ensure(height + 5);
      this.rect(MARGIN, this.cursor, CONTENT_WIDTH, height, '0.960 0.969 0.975', '0.84 0.88 0.90');
      this.text(label, MARGIN + 11, this.cursor + 9, 8.3, true, '0.25 0.33 0.40');
      const valueX = stacked ? MARGIN + 11 : MARGIN + 144;
      const valueTop = stacked ? this.cursor + 25 : this.cursor + 8;
      valueLines.forEach((line, index) => this.text(line, valueX, valueTop + (index * 13), 9.4));
      this.cursor += height + 5;
    }

    finding(title, detail, tag = '') {
      const detailLines = wrapText(detail, 9.1, CONTENT_WIDTH - 28);
      const height = 34 + (detailLines.length * 13) + (tag ? 14 : 0);
      this.ensure(height + 6);
      this.rect(MARGIN, this.cursor, CONTENT_WIDTH, height, '1 1 1', '0.84 0.88 0.90');
      this.rect(MARGIN, this.cursor, 3, height, TEAL_COLOR);
      this.text(title, MARGIN + 15, this.cursor + 11, 9.5, true, HEADING_COLOR);
      let top = this.cursor + 29;
      detailLines.forEach((line) => { this.text(line, MARGIN + 15, top, 9.1, false, MUTED_COLOR); top += 13; });
      if (tag) this.text(tag.toUpperCase(), MARGIN + 15, top + 1, 7, true, '0.09 0.48 0.49');
      this.cursor += height + 6;
    }

    codeBlock(sourceLines) {
      const lines = wrapCodeLines(sourceLines);
      const lineHeight = 9.4;
      let index = 0;
      while (index < lines.length) {
        let capacity = Math.floor((790 - this.cursor - 18) / lineHeight);
        if (capacity < 4) { this.newPage(); capacity = Math.floor((790 - this.cursor - 18) / lineHeight); }
        const chunk = lines.slice(index, index + capacity);
        const height = (chunk.length * lineHeight) + 16;
        this.rect(MARGIN, this.cursor, CONTENT_WIDTH, height, '0.947 0.956 0.963', '0.82 0.86 0.89');
        chunk.forEach((line, lineIndex) => this.text(line, MARGIN + 9, this.cursor + 7 + (lineIndex * lineHeight), 7.25, false, '0.16 0.22 0.28', 'left', 'F3'));
        this.cursor += height + 7;
        index += chunk.length;
      }
    }

    finish() {
      this.pages.forEach((page, index) => {
        const footerTop = 809;
        page.push(`0.86 0.89 0.91 RG 0.6 w ${MARGIN} ${PAGE_HEIGHT - footerTop} m ${PAGE_WIDTH - MARGIN} ${PAGE_HEIGHT - footerTop} l S`);
        const footerY = PAGE_HEIGHT - 825 - 8;
        page.push(`BT /F1 8 Tf 0.36 0.41 0.47 rg 1 0 0 1 ${MARGIN} ${footerY} Tm (Supports human review - not a safety certificate) Tj ET`);
        const pageText = `Page ${index + 1} of ${this.pages.length}`;
        const rightX = PAGE_WIDTH - MARGIN - (pageText.length * 8 * 0.52);
        page.push(`BT /F1 8 Tf 0.36 0.41 0.47 rg 1 0 0 1 ${rightX.toFixed(2)} ${footerY} Tm (${pageText}) Tj ET`);
      });
      return buildPdfBytes(this.pages, this.logo);
    }
  }

  function buildPdfBytes(pages, logo = null) {
    const objects = [];
    const logoId = logo ? 6 : null;
    const firstPageId = logo ? 7 : 6;
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const pageObjectIds = pages.map((_, index) => firstPageId + (index * 2));
    objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';
    if (logo) {
      const imageStream = `${logo.hex}>`;
      objects[logoId] = `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${imageStream.length} >>\nstream\n${imageStream}\nendstream`;
    }
    pages.forEach((commands, index) => {
      const pageId = pageObjectIds[index];
      const contentId = pageId + 1;
      const stream = `${commands.join('\n')}\n`;
      const xObject = logo ? ' /XObject << /Logo 6 0 R >>' : '';
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xObject} >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    });
    let output = '%PDF-1.4\n%VT02\n';
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

  function renderForensicSections(document, evidence, decision) {
    const observations = list(evidence.observations);
    const authentication = observations.filter((item) => item?.protocol);
    const findings = observations.filter((item) => item?.code);
    const relationships = list(evidence.relationships);
    const children = list(evidence.children);
    const infrastructure = list(evidence.infrastructure);
    const models = list(evidence.model_evidence);
    const limitations = list(evidence.limitations);

    document.runningSection = 'FORENSIC FINDINGS';
    document.newPage();
    document.sectionTitle('Evidence reviewed', 'Review summary');
    document.lines('The sections below translate the returned evidence into reviewer-friendly language. Exact machine values remain available in the complete response appendix.', { size: 9.8, lineHeight: 14.5, color: MUTED_COLOR });
    document.cursor += 9;

    document.sectionTitle('Message tactics and decision signals');
    const decisionCodes = list(decision.reason_codes);
    if (!findings.length && !decisionCodes.length) document.finding('No specific tactic recorded', 'No rule-based tactic or policy signal was returned. This is not proof that the email is safe.');
    const seen = new Set();
    [...findings.map((item) => item.code), ...decisionCodes].filter(Boolean).forEach((code) => {
      if (seen.has(code)) return;
      seen.add(code);
      document.finding(FINDING_LABELS[code] || titleCase(code), `Recorded technical code: ${code}`, 'Decision evidence');
    });

    document.sectionTitle('Sender verification');
    if (!authentication.length) document.finding('No sender-verification result', 'The submitted evidence did not contain enough trusted information for a recorded authentication result.');
    authentication.forEach((item) => {
      const result = titleCase(item.result || item.status || 'Unknown');
      const domain = item.domain ? ` for ${item.domain}` : '';
      const detail = `${result}${domain}.${item.failure_reason ? ` Limitation: ${titleCase(item.failure_reason)}.` : ''}`;
      document.finding(String(item.protocol || 'Sender check').replaceAll('_', ' '), detail, 'Authentication');
    });

    document.sectionTitle('Sender consistency');
    if (!relationships.length) document.finding('No sender comparison available', 'There were not enough sender details to compare.');
    relationships.forEach((item, index) => {
      const target = item.target_value || item.target || item.domain || 'No target value recorded';
      const detail = `${titleCase(item.source_type || 'sender')} to ${titleCase(item.target_type || 'related identity')}: ${target}.`;
      document.finding(FINDING_LABELS[item.reason_code] || titleCase(item.edge_type || `Relationship ${index + 1}`), detail, item.reason_code || 'Identity evidence');
    });

    document.sectionTitle('Links and attachments');
    if (!children.length) document.finding('No linked or attached item recorded', 'The available email evidence contained no extracted link or attachment.');
    children.forEach((item, index) => {
      const metadata = item.metadata || {};
      const title = item.type === 'attachment'
        ? metadata.original_filename_untrusted || `Attachment ${index + 1}`
        : metadata.hostname || metadata.url || `Link ${index + 1}`;
      const details = [
        `Type: ${titleCase(item.type || 'item')}`,
        `Status: ${titleCase(item.state || item.status || 'unknown')}`,
        metadata.scheme ? `Scheme: ${metadata.scheme}` : '',
        metadata.path ? `Path: ${metadata.path}` : '',
      ].filter(Boolean).join('. ');
      document.finding(title, `${details}.`, item.reason_code || 'Extracted evidence');
    });

    document.sectionTitle('Delivery infrastructure');
    if (!infrastructure.length) document.finding('No public delivery step available', 'No eligible public mail-server step was returned. A missing route is not proof that the email is safe.');
    infrastructure.forEach((item, index) => {
      const location = [item.city, item.region, item.country].filter(Boolean).join(', ');
      const detail = [item.host, item.ip_address, item.asn_org, location].filter(Boolean).join(' | ') || 'No network detail recorded';
      document.finding(`Mail-server step ${Number(item.hop_index ?? index) + 1}`, detail, 'Infrastructure - approximate');
    });

    document.sectionTitle('AI content assessment');
    if (!models.length) document.finding('No AI model evidence returned', 'The absence of an AI result was not converted into a safe result.');
    models.forEach((item, index) => {
      const likelihood = Number.isFinite(Number(item.p_phish)) ? `${Math.round(Number(item.p_phish) * 100)}% phishing likelihood` : 'No likelihood recorded';
      const detail = `${titleCase(item.state || item.verdict || item.status || 'Unknown')} - ${likelihood}. Model version: ${displayValue(item.model_version || item.version, 'not recorded')}.`;
      document.finding(`Content model ${index + 1}`, detail, 'Supporting signal');
    });

    document.sectionTitle('Limitations and review boundary');
    if (!limitations.length) document.finding('No additional limitation recorded', 'All checks supported by the submitted evidence completed without an additional recorded limitation.');
    limitations.forEach((item) => document.finding(LIMITATION_LABELS[item] || titleCase(item), `Recorded technical code: ${item}`, 'Evidence gap'));
    document.finding('Human review remains required', 'This report supports investigation and triage. It is not a certificate that the email is safe or malicious.', 'Review boundary');
  }

  function buildEmailReportPdf(payload, options = {}) {
    const report = payload || {};
    const evidence = report.evidence || {};
    const decision = report.gateway_decision || {};
    const reportId = report.scan_id || report.report_id || 'Unavailable';
    const document = new PdfDocument(reportId, options.logo || null);
    const riskNumber = Number(decision.risk);
    const risk = Number.isFinite(riskNumber) ? `${Math.round(riskNumber * 100)}%` : 'Not available';
    const state = STATE_LABELS[evidence.state] || titleCase(evidence.state || 'Unknown');
    const recommendation = ACTION_LABELS[decision.recommendation] || titleCase(decision.recommendation || 'Review manually');
    const generatedAt = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/u, ' UTC');
    const severity = titleCase(decision.severity || decision.verdict || evidence.state || 'Unknown');

    document.text('EMAIL INVESTIGATION', MARGIN, 84, 8, true, TEAL_COLOR);
    document.text(state, MARGIN, 104, 25, true, HEADING_COLOR);
    document.cursor = 145;
    document.lines('Evidence-backed email review from the VeriTrust Unified Gateway, prepared for clear human decision-making.', { size: 10.8, lineHeight: 16, color: MUTED_COLOR });
    document.cursor += 15;

    const cardTop = document.cursor;
    const cardWidth = (CONTENT_WIDTH - 10) / 2;
    document.rect(MARGIN, cardTop, cardWidth, 74, '0.925 0.977 0.976', '0.73 0.88 0.87');
    document.text('RISK SCORE', MARGIN + 14, cardTop + 13, 7.5, true, '0.08 0.44 0.45');
    document.text(risk, MARGIN + 14, cardTop + 31, 22, true, HEADING_COLOR);
    document.text(severity, MARGIN + 14, cardTop + 58, 8, false, MUTED_COLOR);
    document.rect(MARGIN + cardWidth + 10, cardTop, cardWidth, 74, '0.956 0.968 0.979', '0.80 0.85 0.89');
    document.text('RECOMMENDED NEXT STEP', MARGIN + cardWidth + 24, cardTop + 13, 7.5, true, '0.25 0.37 0.46');
    wrapText(recommendation, 13, cardWidth - 28).slice(0, 2).forEach((line, index) => document.text(line, MARGIN + cardWidth + 24, cardTop + 32 + (index * 17), 13, true, HEADING_COLOR));
    document.cursor += 91;

    document.sectionTitle('Investigation summary');
    document.keyValue('Report ID', reportId);
    document.keyValue('Generated', generatedAt);
    document.keyValue('Input type', titleCase(evidence.input_mode || report.input_type || 'Not recorded'));
    document.keyValue('Processing status', titleCase(report.status || evidence.status || 'Completed'));
    document.keyValue('Evidence coverage', decision.degraded ? 'Some checks were unavailable. Review the evidence gaps before taking action.' : 'All checks supported by the submitted evidence were considered.');
    const limitations = list(evidence.limitations);
    document.keyValue('Important limitations', limitations.length ? limitations.map((item) => LIMITATION_LABELS[item] || titleCase(item)).join(' ') : 'No additional limitation was recorded for the checks that ran.');
    document.lines('Recommended response: do not click links, open attachments, reply, or share information until the sender is independently verified.', { size: 9.4, lineHeight: 14, bold: true, color: '0.40 0.20 0.08' });

    renderForensicSections(document, evidence, decision);

    document.runningSection = 'COMPLETE RESPONSE DATA - CONTINUED';
    document.newPage();
    document.sectionTitle('Complete response data', 'Technical appendix');
    document.lines('Every field returned by the Unified Gateway is preserved below in a compact nested format. Indentation shows which values belong together; arrays are numbered or kept on one line when possible.', { size: 9.4, lineHeight: 14, color: MUTED_COLOR });
    document.cursor += 10;
    document.codeBlock(compactTechnicalLines(report));

    document.runningSection = 'GLOSSARY / TERMS AND MEANINGS';
    document.newPage();
    document.sectionTitle('Glossary: terms and meanings', 'Reference');
    document.lines('Use this final section to understand the specialist words used in the report. Meanings are intentionally brief and written for non-technical readers.', { size: 10, lineHeight: 15, color: MUTED_COLOR });
    document.cursor += 11;
    GLOSSARY.forEach(([term, meaning]) => document.keyValue(term, meaning));
    return document.finish();
  }

  let logoPromise = null;
  async function loadBrandLogo() {
    if (!global.document || typeof global.fetch !== 'function' || typeof global.createImageBitmap !== 'function') return null;
    if (logoPromise) return logoPromise;
    logoPromise = (async () => {
      const response = await global.fetch('/assets/images/brand.png', { cache: 'force-cache' });
      if (!response.ok) throw new Error('VeriTrust report logo could not be loaded.');
      const bitmap = await global.createImageBitmap(await response.blob());
      const canvas = global.document.createElement('canvas');
      canvas.width = 452;
      canvas.height = 80;
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#fbfcfd';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const binary = global.atob(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
      let hex = '';
      for (let index = 0; index < binary.length; index += 1) hex += binary.charCodeAt(index).toString(16).padStart(2, '0');
      return { hex, width: canvas.width, height: canvas.height };
    })().catch(() => null);
    return logoPromise;
  }

  async function downloadEmailReportPdf(payload, filename) {
    const logo = await loadBrandLogo();
    const bytes = buildEmailReportPdf(payload, { logo });
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
