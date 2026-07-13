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
  get allowedOrigins() {
    return parseAllowedOrigins();
  },
};

const allowedOrigins = parseAllowedOrigins();

module.exports = {
  ConfigError,
  allowedOrigins,
  getOptionalEnv,
  getRequiredEnv,
  parseAllowedOrigins,
  serverConfig,
};
