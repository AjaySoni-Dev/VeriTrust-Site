const {
  confidenceBand,
  normalizeRiskLevel,
  riskFromScore,
} = require('./risk-engine');

const LINK_DISCLAIMER = 'AI-assisted result. Verify suspicious links through official channels before opening or submitting information.';

const LINK_MODELS = {
  swift: {
    key: 'swift',
    name: 'VeriTrust Swift',
    hfModel: 'kmack/malicious-url-detection',
    description: 'Fast malicious URL classification',
    type: 'binary_malicious_url_classifier',
    labels: ['benign', 'malware'],
    provider: 'hf-inference',
  },
  sentinel: {
    key: 'sentinel',
    name: 'VeriTrust Sentinel',
    hfModel: null,
    description: 'Robust suspicious-link analysis',
    type: 'binary_phishing_url_classifier',
    labels: ['safe', 'phishing'],
    provider: null,
    locked: true,
    comingSoon: true,
  },
};

const DEFAULT_LINK_MODEL = 'swift';
const MAX_LINK_INPUT_CHARS = 12000;

const SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'is.gd',
  'cutt.ly',
  'rebrand.ly',
  'shorturl.at',
  'ow.ly',
  'buff.ly',
]);

const SUSPICIOUS_TLDS = new Set([
  'top',
  'xyz',
  'click',
  'work',
  'site',
  'online',
  'live',
  'cfd',
  'icu',
  'loan',
]);

const BRAND_WORDS = [
  'amazon', 'apple', 'axis', 'bob', 'canara', 'dhl', 'facebook', 'fedex',
  'gpay', 'google', 'googlepay', 'hdfc', 'icici', 'instagram', 'microsoft',
  'netflix', 'paypal', 'paytm', 'phonepe', 'pnb', 'sbi', 'whatsapp',
];

const ACTION_TERMS = [
  'account', 'kyc', 'login', 'signin', 'sign-in', 'secure', 'security',
  'update', 'validate', 'verification', 'verify',
];

const PAYMENT_TERMS = [
  'cashback', 'claim', 'payment', 'refund', 'reward',
];

const INDIA_TERMS = [
  'kyc', 'upi', 'paytm', 'phonepe', 'gpay', 'googlepay', 'sbi', 'hdfc',
  'icici', 'axis', 'pnb', 'bob', 'canara', 'pan', 'aadhaar', 'bank',
  'wallet', 'refund', 'cashback', 'reward', 'delivery', 'courier', 'loan',
  'creditcard', 'debitcard', 'netbanking',
];

const CREDENTIAL_TERMS = [
  'credential', 'credentials', 'otp', 'passcode', 'password', 'pin',
];

const REDIRECT_PARAMS = new Set([
  'continue', 'dest', 'destination', 'next', 'redirect', 'redirect_uri',
  'return', 'return_to', 'target', 'to', 'url',
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function roundScore(value) {
  return Number(clamp01(value).toFixed(5));
}

function indicator(type, title, description, severity = 'Medium') {
  return {
    type,
    title,
    description,
    severity: normalizeRiskLevel(severity),
  };
}

function linkValidationError(code, message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function cleanUrlCandidate(value) {
  return String(value || '')
    .trim()
    .replace(/^[<("'`]+/, '')
    .replace(/[>)"'`,.;!?]+$/, '');
}

function extractUrlsFromText(text) {
  const source = String(text || '');
  const matches = source.match(/\bhttps?:\/\/[^\s<>"')\]]+/gi) || [];
  const seen = new Set();
  const urls = [];

  for (const match of matches) {
    const cleaned = cleanUrlCandidate(match);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    urls.push(cleaned);
  }

  return urls;
}

function parseUrlInput(input) {
  const raw = cleanUrlCandidate(input);
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (!['http', 'https'].includes(scheme)) return null;
    return {
      input_url: raw,
      normalized_url: parsed.href,
      parsed,
    };
  } catch {
    return null;
  }
}

function validateLinkInput({ url, text, context } = {}) {
  const direct = String(url || '').trim();
  const pasted = String(text || '').trim();
  const surroundingContext = String(context || '').trim();
  const source = direct || pasted;

  if (!source) {
    throw linkValidationError('INVALID_INPUT', 'Please provide a valid URL or text containing a URL.');
  }
  if (source.length > MAX_LINK_INPUT_CHARS || surroundingContext.length > MAX_LINK_INPUT_CHARS) {
    throw linkValidationError('INVALID_INPUT', 'URL or context payload is too long.');
  }

  let urlsFound = direct ? [direct] : extractUrlsFromText(pasted);
  if (direct && !parseUrlInput(direct)) {
    urlsFound = extractUrlsFromText(direct);
  }
  const firstUrl = urlsFound[0] || source;
  const parsed = parseUrlInput(firstUrl);

  if (!parsed) {
    throw linkValidationError('INVALID_INPUT', 'Please provide a valid URL or text containing a URL.');
  }

  const scheme = parsed.parsed.protocol.replace(':', '').toLowerCase();
  if (!['http', 'https'].includes(scheme)) {
    throw linkValidationError('INVALID_INPUT', 'Only http:// and https:// URLs can be analyzed.');
  }

  return {
    url: parsed.normalized_url,
    input_url: parsed.input_url,
    urls_found: urlsFound.map((item) => parseUrlInput(item)?.normalized_url).filter(Boolean),
    context: surroundingContext,
    parsed: parsed.parsed,
  };
}

function baseDomain(hostname) {
  const labels = String(hostname || '').toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  return labels.slice(-2).join('.');
}

function labelText(urlObject, context) {
  const parts = [
    urlObject.hostname,
    urlObject.pathname,
    urlObject.search,
    context,
  ];
  return parts.join(' ').toLowerCase();
}

function hasTerm(text, terms) {
  return terms.some((term) => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(text));
}

function queryContainsEncodedUrl(searchParams) {
  for (const [, value] of searchParams.entries()) {
    const decoded = decodeURIComponent(String(value || ''));
    if (/https?:\/\//i.test(decoded) || /%3a%2f%2f/i.test(value)) return true;
  }
  return false;
}

function excessiveRandomness(hostname, pathname) {
  const compact = `${hostname}${pathname}`.replace(/[^a-z0-9]/gi, '');
  if (compact.length < 28) return false;
  const longToken = compact.match(/[a-z0-9]{24,}/i);
  if (!longToken) return false;
  const token = longToken[0].toLowerCase();
  const uniqueRatio = new Set(token).size / token.length;
  const digitRatio = (token.match(/\d/g) || []).length / token.length;
  return uniqueRatio > 0.42 && digitRatio > 0.2;
}

function analyzeUrlRules(url, context = '') {
  const parsedInput = parseUrlInput(url);
  if (!parsedInput) {
    throw linkValidationError('INVALID_INPUT', 'Please provide a valid URL or text containing a URL.');
  }

  const parsed = parsedInput.parsed;
  const hostname = parsed.hostname.toLowerCase();
  const domain = baseDomain(hostname);
  const labels = hostname.split('.').filter(Boolean);
  const tld = labels[labels.length - 1] || '';
  const pathAndQuery = `${parsed.pathname}${parsed.search}`.toLowerCase();
  const lower = labelText(parsed, context);
  const indicators = [];

  if (SHORTENERS.has(hostname) || SHORTENERS.has(domain)) {
    indicators.push(indicator('url_shortener', 'URL shortener detected', 'The URL uses a shortening service, which can hide the final destination.', 'High'));
  }

  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || /^\[[0-9a-f:]+\]$/i.test(hostname)) {
    indicators.push(indicator('ip_address_url', 'IP-address URL', 'The URL uses an IP address instead of a recognizable domain name.', 'High'));
  }

  if (hostname.includes('xn--')) {
    indicators.push(indicator('punycode_idn', 'Punycode or IDN pattern', 'The domain uses punycode encoding, which can be used in lookalike-domain attacks.', 'High'));
  }

  if (domain.length >= 38) {
    indicators.push(indicator('long_domain', 'Very long domain', 'The registered-domain portion is unusually long for a normal brand URL.', 'Medium'));
  }

  const hyphenCount = (hostname.match(/-/g) || []).length;
  if (hyphenCount >= 4) {
    indicators.push(indicator('too_many_hyphens', 'Many hyphens in domain', 'The hostname contains many hyphens, a pattern often used in deceptive domain construction.', 'Medium'));
  }

  if (labels.length >= 5) {
    indicators.push(indicator('too_many_subdomains', 'Many subdomains', 'The URL has multiple nested subdomains that can obscure the actual registered domain.', 'Medium'));
  }

  if (SUSPICIOUS_TLDS.has(tld)) {
    indicators.push(indicator('suspicious_tld', 'Suspicious top-level domain', 'The URL uses a top-level domain that frequently appears in low-trust link patterns.', 'Medium'));
  }

  if (parsed.protocol !== 'https:') {
    indicators.push(indicator('missing_https', 'Missing HTTPS', 'The URL does not use HTTPS.', 'Medium'));
  }

  if (hasTerm(lower, ACTION_TERMS)) {
    indicators.push(indicator('login_verify_terms', 'Login or verification language', 'The URL or context includes login, verification, security, update, or KYC wording.', 'High'));
  }

  if (hasTerm(lower, PAYMENT_TERMS)) {
    indicators.push(indicator('payment_lure_terms', 'Payment, refund, reward, or claim language', 'The URL or context includes payment, refund, reward, or claim wording.', 'Medium'));
  }

  if (hasTerm(lower, INDIA_TERMS)) {
    indicators.push(indicator('india_scam_terms', 'India-relevant scam terms', 'The URL or context includes banking, UPI, wallet, KYC, delivery, loan, or identity terms often used in scams.', 'Medium'));
  }

  if (hasTerm(lower, CREDENTIAL_TERMS)) {
    indicators.push(indicator('credential_terms', 'Credential or OTP language', 'The URL or context references passwords, OTPs, PINs, or credential submission.', 'High'));
  }

  const brandHits = BRAND_WORDS.filter((brand) => hostname.includes(brand));
  const suspiciousAction = hasTerm(lower, [...ACTION_TERMS, ...PAYMENT_TERMS, ...CREDENTIAL_TERMS]);
  if (brandHits.length && suspiciousAction && !brandHits.some((brand) => domain === `${brand}.com` || domain === `${brand}.in`)) {
    indicators.push(indicator('brand_impersonation', 'Possible brand impersonation', 'The domain contains brand-like terms combined with login, verification, payment, or credential language.', 'High'));
  }

  for (const key of parsed.searchParams.keys()) {
    if (REDIRECT_PARAMS.has(key.toLowerCase())) {
      indicators.push(indicator('redirect_query', 'Suspicious redirect parameter', 'The query string includes a redirect-style parameter that can send users to another destination.', 'Medium'));
      break;
    }
  }

  if (queryContainsEncodedUrl(parsed.searchParams)) {
    indicators.push(indicator('encoded_url_query', 'Encoded URL inside query', 'The query string contains an embedded URL, which can be used to disguise the destination path.', 'High'));
  }

  if (excessiveRandomness(hostname, pathAndQuery)) {
    indicators.push(indicator('random_characters', 'Excessive random characters', 'The URL contains a long random-looking token or hostname segment.', 'Medium'));
  }

  if (brandHits.length && hasTerm(lower, ['official', 'support', 'secure', 'verify', 'kyc', 'refund', 'reward'])) {
    indicators.push(indicator('official_brand_like_terms', 'Official-brand-like wording with risky terms', 'Brand-like wording appears together with official, support, verification, KYC, refund, or reward terms.', 'High'));
  }

  const seen = new Set();
  const deduped = indicators.filter((item) => {
    const key = `${item.type}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    indicators: deduped,
    extracted: {
      input_url: parsedInput.input_url,
      normalized_url: parsedInput.normalized_url,
      scheme: parsed.protocol.replace(':', ''),
      hostname,
      domain,
      path: parsed.pathname || '/',
      query_present: Boolean(parsed.search),
      urls_found: [parsedInput.normalized_url],
    },
  };
}

function scoreUrlRules(indicators) {
  const list = Array.isArray(indicators) ? indicators : [];
  if (!list.length) return 0;

  const severityValues = list.map((item) => {
    const severity = normalizeRiskLevel(item.severity);
    if (severity === 'Critical') return 0.95;
    if (severity === 'High') return 0.78;
    if (severity === 'Medium') return 0.52;
    return 0.25;
  });
  const maxSeverity = Math.max(...severityValues);
  const total = severityValues.reduce((sum, value) => sum + value, 0);
  const densityBonus = Math.min(0.2, Math.max(0, list.length - 2) * 0.035);
  const cumulative = Math.min(0.42, total * 0.1);
  return roundScore(Math.min(0.98, (maxSeverity * 0.52) + cumulative + densityBonus));
}

function scoreItem(label, score) {
  return { label, score: roundScore(score) };
}

function flattenModelOutput(output) {
  if (Array.isArray(output) && Array.isArray(output[0])) return output[0];
  if (Array.isArray(output)) return output;
  if (output && Array.isArray(output.scores)) return output.scores;
  return [];
}

function normalizeSwiftOutput(output) {
  const scores = flattenModelOutput(output).map((item) => scoreItem(item.label || item.name || 'unknown', item.score || item.value || 0));
  let benign = 0;
  let phishing = 0;
  let malware = 0;
  let defacement = 0;

  for (const item of scores) {
    const label = String(item.label || '').toLowerCase();
    if (label.includes('benign') || label.includes('safe') || label === 'label_0') benign = Math.max(benign, item.score);
    if (label.includes('phish') || label === 'label_1') phishing = Math.max(phishing, item.score);
    if (label.includes('malware') || label.includes('malicious') || label === 'label_2') malware = Math.max(malware, item.score);
    if (label.includes('defacement') || label === 'label_3') defacement = Math.max(defacement, item.score);
  }

  if (!scores.length) {
    return { model_score: 0.5, confidence: 0.5, label: 'Unknown', scores: [] };
  }

  const threatScore = Math.max(phishing, malware, defacement);
  const confidence = Math.max(benign, threatScore);
  let label = 'Safe';
  if (malware >= 0.5) label = 'Malicious';
  else if (phishing >= 0.5) label = 'Phishing';
  else if (defacement >= 0.5 || threatScore >= 0.45) label = 'Suspicious';

  return {
    model_score: roundScore(threatScore || (1 - benign)),
    confidence: roundScore(confidence),
    label,
    scores,
  };
}

function normalizeSentinelOutput(output) {
  const scores = flattenModelOutput(output).map((item) => scoreItem(item.label || item.name || 'unknown', item.score || item.value || 0));
  let safe = 0;
  let phishing = 0;

  for (const item of scores) {
    const label = String(item.label || '').toLowerCase();
    if (label.includes('safe') || label.includes('legit') || label === 'label_0') safe = Math.max(safe, item.score);
    if (label.includes('phish') || label.includes('malicious') || label === 'label_1') phishing = Math.max(phishing, item.score);
  }

  if (!scores.length) {
    return { model_score: 0.5, confidence: 0.5, label: 'Unknown', scores: [] };
  }

  if (safe === 0 && phishing === 0) {
    const top = [...scores].sort((a, b) => b.score - a.score)[0];
    const topLabel = String(top.label || '').toLowerCase();
    phishing = topLabel.includes('phish') || topLabel.includes('malicious') ? top.score : 1 - top.score;
    safe = 1 - phishing;
  }

  return {
    model_score: roundScore(phishing),
    confidence: roundScore(Math.max(safe, phishing)),
    label: phishing >= safe ? 'Phishing' : 'Safe',
    scores,
  };
}

function combineLinkScores(modelScore, ruleScore) {
  const model = clamp01(modelScore);
  const rules = clamp01(ruleScore);
  let combined = (model * 0.62) + (rules * 0.38);

  if (model >= 0.75 && rules >= 0.55) combined = Math.max(combined, 0.82);
  if (model < 0.35 && rules >= 0.85) combined = Math.max(combined, 0.78);
  else if (model < 0.35 && rules >= 0.72) combined = Math.max(combined, 0.62);
  if (model < 0.3 && rules < 0.2) combined = Math.min(combined, 0.32);

  return roundScore(combined);
}

function labelFromScore(score, modelLabel, indicators) {
  const normalized = clamp01(score);
  const hasMalware = String(modelLabel || '').toLowerCase() === 'malicious';
  const hasPhishing = String(modelLabel || '').toLowerCase() === 'phishing'
    || (indicators || []).some((item) => ['brand_impersonation', 'credential_terms', 'encoded_url_query'].includes(item.type));

  if (normalized >= 0.9 && hasMalware) return 'Malicious';
  if (normalized >= 0.75 && hasPhishing) return 'Phishing';
  if (normalized >= 0.45) return 'Suspicious';
  if (normalized < 0.45) return 'Safe';
  return 'Unknown';
}

function summaryFor(label, indicators) {
  const count = Array.isArray(indicators) ? indicators.length : 0;
  if (label === 'Malicious') return 'This URL contains severe malicious-link risk patterns and should be verified through official channels.';
  if (label === 'Phishing') return 'This URL shows multiple phishing-style risk signals.';
  if (label === 'Suspicious') return count
    ? 'The URL contains risk patterns commonly seen in phishing links.'
    : 'The URL has limited suspicious signals. Manual verification is recommended.';
  if (label === 'Safe') return count
    ? 'No high-risk URL indicators were found, though some low-level patterns should still be reviewed.'
    : 'No strong URL risk indicators were found.';
  return 'The link could not be classified confidently. Verify the URL through official channels.';
}

function buildLinkResult({ url, context = '', modelKey = DEFAULT_LINK_MODEL, modelOutput, ruleAnalysis, modelMeta } = {}) {
  const rules = ruleAnalysis || analyzeUrlRules(url, context);
  const model = LINK_MODELS[modelKey] || LINK_MODELS[DEFAULT_LINK_MODEL];
  const normalized = model.key === 'sentinel'
    ? normalizeSentinelOutput(modelOutput)
    : normalizeSwiftOutput(modelOutput);
  const ruleScore = scoreUrlRules(rules.indicators);
  const modelScore = normalized.model_score;
  const linkScore = combineLinkScores(modelScore, ruleScore);
  const label = labelFromScore(linkScore, normalized.label, rules.indicators);
  const confidence = roundScore(Math.max(normalized.confidence, linkScore, 1 - linkScore));

  return {
    label,
    confidence,
    link_score: linkScore,
    model_score: roundScore(modelScore),
    rule_score: ruleScore,
    risk_level: riskFromScore(linkScore),
    confidence_band: confidenceBand(confidence),
    summary: summaryFor(label, rules.indicators),
    indicators: rules.indicators,
    extracted: rules.extracted,
    disclaimer: LINK_DISCLAIMER,
    model_meta: modelMeta || null,
  };
}

module.exports = {
  DEFAULT_LINK_MODEL,
  LINK_DISCLAIMER,
  LINK_MODELS,
  analyzeUrlRules,
  buildLinkResult,
  combineLinkScores,
  extractUrlsFromText,
  normalizeSentinelOutput,
  normalizeSwiftOutput,
  parseUrlInput,
  scoreUrlRules,
  validateLinkInput,
};
