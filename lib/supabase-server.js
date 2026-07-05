const crypto = require('crypto');

const DEFAULT_SUPABASE_URL = 'https://dkibhlcgilkshlumwrao.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRraWJobGNnaWxrc2hsdW13cmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNTgyMzUsImV4cCI6MjA5ODczNDIzNX0.qiRHkURAOZ7uaBf12uguD3Jc9kj2dKEN-pxZT_Q4EI8';

class SupabaseError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function anonKey() {
  return process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function isSupabaseConfigured() {
  return Boolean(supabaseUrl() && anonKey());
}

function isServiceRoleConfigured() {
  return Boolean(serviceRoleKey());
}

function requireServiceRole() {
  if (!isServiceRoleConfigured()) {
    throw new SupabaseError(500, 'SUPABASE_SERVICE_ROLE_KEY is required to persist completed scan results.');
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function readResponse(response) {
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const message = data?.message || data?.msg || data?.error_description || data?.error || `Supabase request failed with status ${response.status}.`;
    throw new SupabaseError(response.status, message, data);
  }

  return data;
}

async function supabaseFetch(path, options = {}) {
  const key = options.service ? serviceRoleKey() : anonKey();
  if (options.service) requireServiceRole();

  const headers = {
    apikey: key,
    Authorization: `Bearer ${options.accessToken || key}`,
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${supabaseUrl()}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return readResponse(response);
}

async function getUserFromRequest(req) {
  const token = bearerToken(req);
  if (!token) {
    throw new SupabaseError(401, 'Sign in to use VeriTrust scans.');
  }

  const user = await supabaseFetch('/auth/v1/user', {
    accessToken: token,
  });

  return { token, user };
}

function eq(value) {
  return encodeURIComponent(String(value));
}

function slugForUser(userId) {
  return `org-${String(userId || '').replace(/-/g, '')}`;
}

function fallbackWorkspaceName(user) {
  const metadata = user?.user_metadata || user?.raw_user_meta_data || {};
  const workspaceName = String(metadata.workspace_name || '').trim();
  if (workspaceName) return workspaceName;

  const emailPrefix = String(user?.email || 'workspace').split('@')[0] || 'workspace';
  return `${emailPrefix}'s Workspace`;
}

function fallbackProfileName(user) {
  const metadata = user?.user_metadata || user?.raw_user_meta_data || {};
  return String(metadata.full_name || '').trim() || user?.email || null;
}

async function serviceSelect(path) {
  if (!isServiceRoleConfigured()) return null;
  return supabaseFetch(path, { service: true });
}

async function ensureProfile(user) {
  if (!isServiceRoleConfigured()) return null;

  const rows = await supabaseFetch('/rest/v1/profiles?on_conflict=id&select=*', {
    method: 'POST',
    service: true,
    body: {
      id: user.id,
      full_name: fallbackProfileName(user),
    },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  });

  return rows?.[0] || null;
}

async function ensureDefaultWorkspace(user, profile) {
  if (!isServiceRoleConfigured()) return null;

  const preferredOrgId = profile?.default_org_id;
  if (preferredOrgId) {
    const rows = await serviceSelect(`/rest/v1/organization_members?org_id=eq.${eq(preferredOrgId)}&user_id=eq.${eq(user.id)}&status=eq.active&select=role,organizations(*)`);
    if (rows?.[0]?.organizations) {
      return {
        organization: rows[0].organizations,
        role: rows[0].role,
      };
    }
  }

  const existingMembershipRows = await serviceSelect(`/rest/v1/organization_members?user_id=eq.${eq(user.id)}&status=eq.active&select=role,organizations(*)&limit=1`);
  const existingMembership = existingMembershipRows?.[0] || null;
  if (existingMembership?.organizations) {
    await supabaseFetch(`/rest/v1/profiles?id=eq.${eq(user.id)}`, {
      method: 'PATCH',
      service: true,
      body: { default_org_id: existingMembership.organizations.id },
    });
    return {
      organization: existingMembership.organizations,
      role: existingMembership.role,
    };
  }

  const planRows = await serviceSelect('/rest/v1/plans?code=eq.free&select=id&limit=1');
  const freePlanId = planRows?.[0]?.id;
  if (!freePlanId) {
    throw new SupabaseError(500, 'The free plan is missing from Supabase. Run the production schema seed.');
  }

  const orgRows = await supabaseFetch('/rest/v1/organizations?on_conflict=slug&select=*', {
    method: 'POST',
    service: true,
    body: {
      plan_id: freePlanId,
      name: fallbackWorkspaceName(user),
      slug: slugForUser(user.id),
      created_by: user.id,
    },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  });
  const organization = orgRows?.[0] || null;
  if (!organization) {
    throw new SupabaseError(500, 'Unable to create a VeriTrust workspace for this user.');
  }

  await supabaseFetch('/rest/v1/organization_members?on_conflict=org_id,user_id', {
    method: 'POST',
    service: true,
    body: {
      org_id: organization.id,
      user_id: user.id,
      role: 'owner',
      status: 'active',
    },
    headers: {
      Prefer: 'resolution=merge-duplicates',
    },
  });

  await supabaseFetch(`/rest/v1/profiles?id=eq.${eq(user.id)}`, {
    method: 'PATCH',
    service: true,
    body: { default_org_id: organization.id },
  });

  return {
    organization,
    role: 'owner',
  };
}

async function getProfileContext(req, preferredOrgId = null) {
  const auth = await getUserFromRequest(req);
  const profileRows = await supabaseFetch(`/rest/v1/profiles?id=eq.${eq(auth.user.id)}&select=*`, {
    accessToken: auth.token,
  });
  let profile = profileRows?.[0] || null;
  if (!profile && isServiceRoleConfigured()) {
    profile = await ensureProfile(auth.user);
  }

  const orgId = preferredOrgId || profile?.default_org_id;

  if (!orgId) {
    const repaired = await ensureDefaultWorkspace(auth.user, profile);
    if (!repaired) {
      throw new SupabaseError(403, 'No VeriTrust workspace is available for this user. Configure SUPABASE_SERVICE_ROLE_KEY or run the auth user bootstrap trigger.');
    }
    const repairedProfileRows = await supabaseFetch(`/rest/v1/profiles?id=eq.${eq(auth.user.id)}&select=*`, {
      accessToken: auth.token,
    });
    return {
      token: auth.token,
      user: auth.user,
      profile: repairedProfileRows?.[0] || profile,
      organization: repaired.organization,
      role: repaired.role,
    };
  }

  const memberRows = await supabaseFetch(`/rest/v1/organization_members?org_id=eq.${eq(orgId)}&user_id=eq.${eq(auth.user.id)}&status=eq.active&select=role,organizations(*)`, {
    accessToken: auth.token,
  });
  const membership = memberRows?.[0] || null;
  const organization = membership?.organizations || null;

  if (!membership || !organization) {
    if (!preferredOrgId && isServiceRoleConfigured()) {
      const repaired = await ensureDefaultWorkspace(auth.user, profile);
      if (repaired) {
        const repairedProfileRows = await supabaseFetch(`/rest/v1/profiles?id=eq.${eq(auth.user.id)}&select=*`, {
          accessToken: auth.token,
        });
        return {
          token: auth.token,
          user: auth.user,
          profile: repairedProfileRows?.[0] || profile,
          organization: repaired.organization,
          role: repaired.role,
        };
      }
    }
    throw new SupabaseError(403, 'You do not have access to this VeriTrust workspace.');
  }

  return {
    token: auth.token,
    user: auth.user,
    profile,
    organization,
    role: membership.role,
  };
}

async function rpc(functionName, body, options = {}) {
  return supabaseFetch(`/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    body,
    accessToken: options.accessToken,
    service: options.service,
    headers: {
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
}

function textHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function riskLevel(value) {
  const normalized = String(value || '').toLowerCase();
  if (['low', 'medium', 'high'].includes(normalized)) return normalized;
  return 'unknown';
}

function primaryScoreForPayload(payload) {
  const result = payload?.result || {};
  if (payload?.type === 'deepfake') return Number(result.fake_score || 0);
  return Number(result.phishing_score || 0);
}

function secondaryScoreForPayload(payload) {
  const result = payload?.result || {};
  if (payload?.type === 'deepfake') return Number(result.real_score || 0);
  return Number(result.legitimate_score || 0);
}

async function createScanRecord(context, options) {
  return rpc('create_scan_record', {
    target_org_id: context.organization.id,
    target_scan_type: options.scanType,
    target_input_kind: options.inputKind,
    target_selected_model_key: options.modelKey,
    target_project_id: options.projectId || null,
    target_text_preview: options.textPreview || null,
    target_text_hash: options.textHash || null,
    target_metadata: options.metadata || {},
  }, {
    accessToken: context.token,
  });
}

async function completeScanRecord(scanId, payload, modelRuns = []) {
  return rpc('complete_scan_record', {
    target_scan_id: scanId,
    result_label: payload.result?.label || 'Unknown',
    result_confidence: Number(payload.result?.confidence || 0),
    result_risk_level: riskLevel(payload.result?.risk_level),
    result_primary_score: primaryScoreForPayload(payload),
    result_secondary_score: secondaryScoreForPayload(payload),
    result_explanation: payload.result?.explanation || '',
    result_indicators: payload.result?.indicators || [],
    result_raw_scores: payload.scores || [],
    model_runs: modelRuns,
  }, {
    service: true,
  });
}

async function failScanRecord(scanId, message) {
  return rpc('fail_scan_record', {
    target_scan_id: scanId,
    failure_message: message,
  }, {
    service: true,
  });
}

async function recentScans(context, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return supabaseFetch(`/rest/v1/scans?org_id=eq.${eq(context.organization.id)}&select=id,scan_type,status,selected_model_key,final_label,confidence,risk_level,created_at,completed_at,error_message&order=created_at.desc&limit=${safeLimit}`, {
    accessToken: context.token,
  });
}

async function countRows(path, accessToken) {
  const rows = await supabaseFetch(path, {
    accessToken,
    headers: {
      Prefer: 'count=exact',
    },
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function workspaceStats(context) {
  const orgId = context.organization.id;
  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    member_count: null,
    api_key_count: null,
    usage_today: {
      deepfake_count: 0,
      phishing_count: 0,
      api_count: 0,
    },
  };

  try {
    stats.member_count = await countRows(`/rest/v1/organization_members?org_id=eq.${eq(orgId)}&status=eq.active&select=user_id`, context.token);
  } catch {
    stats.member_count = null;
  }

  try {
    stats.api_key_count = await countRows(`/rest/v1/api_keys?org_id=eq.${eq(orgId)}&status=eq.active&select=id`, context.token);
  } catch {
    stats.api_key_count = null;
  }

  try {
    const usageRows = await supabaseFetch(`/rest/v1/user_usage_daily?org_id=eq.${eq(orgId)}&user_id=eq.${eq(context.user.id)}&usage_date=eq.${today}&select=deepfake_count,phishing_count,api_count`, {
      accessToken: context.token,
    });
    if (usageRows?.[0]) {
      stats.usage_today = {
        deepfake_count: Number(usageRows[0].deepfake_count || 0),
        phishing_count: Number(usageRows[0].phishing_count || 0),
        api_count: Number(usageRows[0].api_count || 0),
      };
    }
  } catch {
    stats.usage_today = {
      deepfake_count: 0,
      phishing_count: 0,
      api_count: 0,
    };
  }

  return stats;
}

module.exports = {
  SupabaseError,
  completeScanRecord,
  createScanRecord,
  failScanRecord,
  getProfileContext,
  isServiceRoleConfigured,
  isSupabaseConfigured,
  recentScans,
  requireServiceRole,
  riskLevel,
  serviceRoleKey,
  supabaseFetch,
  textHash,
  workspaceStats,
};
