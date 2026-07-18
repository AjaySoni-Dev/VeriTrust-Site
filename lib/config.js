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

function getOptionalInteger(name, fallback, options = {}) {
  const raw = getOptionalEnv(name, '');
  if (!raw) return fallback;
  const value = Number(raw);
  const minimum = options.minimum ?? Number.MIN_SAFE_INTEGER;
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    const error = new Error(`Server configuration variable ${name} must be an integer between ${minimum} and ${maximum}.`);
    error.name = 'ConfigError';
    error.status = 500;
    error.code = 'CONFIG_INVALID';
    throw error;
  }
  return value;
}

function parseAllowedOrigins(value = process.env.VERITRUST_ALLOWED_ORIGINS) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
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
  get adminSecret() {
    return getOptionalEnv('VERITRUST_ADMIN_SECRET', '');
  },
  get gatewayContentHmacKey() {
    return getRequiredEnv('VERITRUST_CONTENT_HMAC_KEY');
  },
  get gatewaySynchronousBudgetMs() {
    return getOptionalInteger('VERITRUST_GATEWAY_SYNC_BUDGET_MS', 12000, { minimum: 1000, maximum: 55000 });
  },
  get gatewayWorkerId() {
    return getOptionalEnv('VERITRUST_GATEWAY_WORKER_ID', 'veritrust-worker-1');
  },
  get gatewayDispatchSecret() {
    return getRequiredEnv('VERITRUST_GATEWAY_DISPATCH_SECRET');
  },
  get gatewayServerlessBatch() {
    return getOptionalInteger('VERITRUST_GATEWAY_SERVERLESS_BATCH', 1, { minimum: 1, maximum: 3 });
  },
  get gatewayWebhookEncryptionKey() {
    return getRequiredEnv('VERITRUST_WEBHOOK_ENCRYPTION_KEY');
  },
  get allowedOrigins() {
    return parseAllowedOrigins();
  },
};

const allowedOrigins = parseAllowedOrigins();

module.exports = {
  ConfigError,
  allowedOrigins,
  getOptionalEnv,
  getOptionalInteger,
  getRequiredEnv,
  parseAllowedOrigins,
  serverConfig,
};
