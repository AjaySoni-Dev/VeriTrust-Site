const { normalizeConfiguredOrigin } = require('./security');

class ConfigError extends Error {
  constructor(name) {
    super(`Server configuration is missing required environment variable: ${name}.`);
    this.name = 'ConfigError';
    this.status = 500;
    this.code = 'CONFIG_MISSING';
    this.envName = name;
  }
}

function cleanEnvValue(value) {
  const cleaned = String(value || '').trim();
  return cleaned || null;
}

function getRequiredEnv(name) {
  const value = cleanEnvValue(process.env[name]);
  if (!value) {
    throw new ConfigError(name);
  }
  return value;
}

function getOptionalEnv(name, fallback = '') {
  const value = cleanEnvValue(process.env[name]);
  return value === null ? fallback : value;
}

function parseAllowedOrigins(value = process.env.VERITRUST_ALLOWED_ORIGINS) {
  const allowHttpLocal = process.env.NODE_ENV !== 'production';
  return [...new Set(String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => normalizeConfiguredOrigin(origin, { allowHttpLocal })))];
}

function getBooleanEnv(name, fallback = false) {
  const value = cleanEnvValue(process.env[name]);
  if (value === null) return fallback;
  if (/^(?:1|true|yes|on)$/i.test(value)) return true;
  if (/^(?:0|false|no|off)$/i.test(value)) return false;
  throw new ConfigError(name);
}

function getIntegerEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = cleanEnvValue(process.env[name]);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new ConfigError(name);
  return value;
}

function siteUrl() {
  const raw = getOptionalEnv('VERITRUST_SITE_URL', '');
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new ConfigError('VERITRUST_SITE_URL');
    return 'http://localhost:3000';
  }
  return normalizeConfiguredOrigin(raw, { allowHttpLocal: process.env.NODE_ENV !== 'production' });
}

const serverConfig = {
  get supabaseUrl() {
    return getRequiredEnv('SUPABASE_URL').replace(/\/$/, '');
  },
  get supabaseAnonKey() {
    return getRequiredEnv('SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey() {
    return getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  },
  get hfToken() {
    return getOptionalEnv('HF_TOKEN') || getRequiredEnv('HF_ACCESS_TOKEN');
  },
  get siteUrl() {
    return siteUrl();
  },
  get apiKeyPepper() {
    return getRequiredEnv('VERITRUST_API_KEY_PEPPER');
  },
  get sessionSecret() {
    return getOptionalEnv('VERITRUST_SESSION_SECRET', '') || getRequiredEnv('VERITRUST_API_KEY_PEPPER');
  },
  get apiKeyPepperVersion() {
    return getIntegerEnv('VERITRUST_API_KEY_PEPPER_VERSION', 1, { min: 1, max: 99 });
  },
  get billingEnabled() {
    return getBooleanEnv('VERITRUST_BILLING_ENABLED', false);
  },
  get externalApiEnabled() {
    return getBooleanEnv('VERITRUST_EXTERNAL_API_ENABLED', false);
  },
  get preprocessingUrl() {
    const raw = getOptionalEnv('VERITRUST_PREPROCESSING_URL', '');
    if (!raw) return '';
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new ConfigError('VERITRUST_PREPROCESSING_URL');
    }
    return url.href;
  },
  get stripeWebhookToleranceSeconds() {
    return getIntegerEnv('STRIPE_WEBHOOK_TOLERANCE_SECONDS', 300, { min: 60, max: 900 });
  },
  get trustProxy() {
    return getBooleanEnv('VERITRUST_TRUST_PROXY', process.env.VERCEL === '1');
  },
  get allowedOrigins() {
    return parseAllowedOrigins();
  },
};

const allowedOrigins = parseAllowedOrigins();

module.exports = {
  ConfigError,
  allowedOrigins,
  getBooleanEnv,
  getIntegerEnv,
  getOptionalEnv,
  getRequiredEnv,
  parseAllowedOrigins,
  siteUrl,
  serverConfig,
};
