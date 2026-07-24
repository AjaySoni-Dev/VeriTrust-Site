const crypto = require('crypto');
const { getOptionalEnv, serverConfig } = require('./config');
const { accessCookie } = require('./browser-session');
const {
  mergeScanHistories,
  normalizeGatewayScan,
} = require('./gateway/dashboard-history');

class SupabaseError extends Error {
  constructor(status, message, details = null, code = null) {
    super(message);
    this.name = 'SupabaseError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

function supabaseUrl() {
  return serverConfig.supabaseUrl;
}

function anonKey() {
  return serverConfig.supabaseAnonKey;
}

function serviceRoleKey() {
  return serverConfig.supabaseServiceRoleKey;
}

function isSupabaseConfigured() {
  return Boolean(getOptionalEnv('SUPABASE_URL') && getOptionalEnv('SUPABASE_ANON_KEY'));
}

function isServiceRoleConfigured() {
  return Boolean(getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

function requireServiceRole() {
  if (!isServiceRoleConfigured()) {
    throw new SupabaseError(500, 'Server persistence is not configured.', null, 'SERVER_CONFIG_ERROR');
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : accessCookie(req);
}

async function readBoundedText(response, maxBytes = 4 * 1024 * 1024) {
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > maxBytes) {
    response.body?.cancel().catch(() => null);
    throw new SupabaseError(502, 'Supabase response exceeded the size limit.', null, 'UPSTREAM_RESPONSE_TOO_LARGE');
  }
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new SupabaseError(502, 'Supabase response exceeded the size limit.', null, 'UPSTREAM_RESPONSE_TOO_LARGE');
    }
    return buffer.toString('utf8');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SupabaseError(502, 'Supabase response exceeded the size limit.', null, 'UPSTREAM_RESPONSE_TOO_LARGE');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

async function readResponse(response, maxBytes) {
  const raw = await readBoundedText(response, maxBytes);
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

  const timeoutMs = Math.max(1000, Math.min(120000, Number(options.timeoutMs || 30000)));
  const response = await fetch(`${supabaseUrl()}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal || AbortSignal.timeout(timeoutMs),
  });

  return readResponse(response, Math.max(1024, Math.min(4 * 1024 * 1024, Number(options.maxResponseBytes || 4 * 1024 * 1024))));
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
    const rows = await serviceSelect(`/rest/v1/organization_members?org_id=eq.${eq(preferredOrgId)}&user_id=eq.${eq(user.id)}&status=eq.active&select=role,organizations(*,plans(code,daily_scan_limit,learning_catalog_access,learning_certificate_access,learning_admin_access,learning_seat_limit,learning_assignment_limit,learning_export_access,learning_proctored_exam_access))`);
    if (rows?.[0]?.organizations) {
      return {
        organization: rows[0].organizations,
        role: rows[0].role,
      };
    }
  }

  const existingMembershipRows = await serviceSelect(`/rest/v1/organization_members?user_id=eq.${eq(user.id)}&status=eq.active&select=role,organizations(*,plans(code,daily_scan_limit,learning_catalog_access,learning_certificate_access,learning_admin_access,learning_seat_limit,learning_assignment_limit,learning_export_access,learning_proctored_exam_access))&limit=1`);
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

  const planRows = await serviceSelect('/rest/v1/plans?code=eq.free&select=id,code,daily_scan_limit&limit=1');
  const freePlan = planRows?.[0] || null;
  const freePlanId = freePlan?.id;
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
    organization: {
      ...organization,
      plans: freePlan ? { code: freePlan.code, daily_scan_limit: freePlan.daily_scan_limit } : undefined,
    },
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
      throw new SupabaseError(403, 'No VeriTrust workspace is available for this user.');
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

  const memberRows = await supabaseFetch(`/rest/v1/organization_members?org_id=eq.${eq(orgId)}&user_id=eq.${eq(auth.user.id)}&status=eq.active&select=role,organizations(*,plans(code,daily_scan_limit,learning_catalog_access,learning_certificate_access,learning_admin_access,learning_seat_limit,learning_assignment_limit,learning_export_access,learning_proctored_exam_access))`, {
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

async function dashboardSnapshot(req, options = {}) {
  const token = bearerToken(req);
  if (!token) {
    throw new SupabaseError(401, 'Sign in to view the dashboard.');
  }
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 100));
  const offset = Math.max(0, Math.min(10000, Number(options.offset) || 0));
  const dashboard = await rpc('get_dashboard', {
    target_org_id: options.orgId || null,
    recent_limit: limit,
    recent_offset: offset,
  }, { accessToken: token });

  if (!dashboard || Array.isArray(dashboard) || offset > 0 || !dashboard.organization?.id || !isServiceRoleConfigured()) {
    return dashboard;
  }

  try {
    const gatewayScans = await recentGatewayScans(dashboard.organization.id, limit);
    return {
      ...dashboard,
      scans: mergeScanHistories(dashboard.scans || [], gatewayScans, limit),
    };
  } catch (error) {
    console.error('VeriTrust gateway dashboard history unavailable', {
      organization_id: dashboard.organization.id,
      message: error.message,
    });
    return dashboard;
  }
}

function textHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function riskLevel(value) {
  const normalized = String(value || '').toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(normalized)) return normalized;
  return 'unknown';
}

function primaryScoreForPayload(payload) {
  const result = payload?.result || {};
  if (payload?.type === 'deepfake') return Number(result.fake_score || 0);
  if (payload?.type === 'link' || payload?.scan_type === 'link') return Number(result.link_score || 0);
  return Number(result.phishing_score || 0);
}

function secondaryScoreForPayload(payload) {
  const result = payload?.result || {};
  if (payload?.type === 'deepfake') return Number(result.real_score || 0);
  if (payload?.type === 'link' || payload?.scan_type === 'link') return Number(result.model_score || 0);
  return Number(result.legitimate_score || 0);
}

function supabaseErrorText(error) {
  return [
    error?.message,
    typeof error?.details === 'string' ? error.details : JSON.stringify(error?.details || ''),
  ].join(' ').toLowerCase();
}

function isLinkSchemaCompatibilityError(error) {
  if (!(error instanceof SupabaseError)) return false;
  const text = supabaseErrorText(error);
  return text.includes('link_count')
    || text.includes('invalid input value for enum')
    || text.includes('model_catalog')
    || text.includes('selected_model_key')
    || text.includes('scan_type')
    || text.includes('input_kind')
    || text.includes('could not find the function')
    || text.includes('pgrst202')
    || text.includes('foreign key constraint');
}

function logicalScanType(scan) {
  const scanMetadata = scan?.metadata || {};
  const inputs = Array.isArray(scan?.scan_inputs) ? scan.scan_inputs : [scan?.scan_inputs].filter(Boolean);
  const isLink = scanMetadata.logical_scan_type === 'link'
    || scanMetadata.original_scan_type === 'link'
    || inputs.some((input) => input?.input_kind === 'url'
      || input?.metadata?.logical_scan_type === 'link'
      || input?.metadata?.original_scan_type === 'link'
      || Boolean(input?.metadata?.normalized_url));
  return isLink ? 'link' : scan?.scan_type;
}

async function createScanRecordDirect(context, options, metadata) {
  const attempts = options.scanType === 'link'
    ? [
      { scanType: 'link', inputKind: options.inputKind, modelKey: options.modelKey },
      { scanType: 'link', inputKind: options.inputKind, modelKey: null },
      { scanType: 'phishing', inputKind: options.inputKind, modelKey: null },
      { scanType: 'phishing', inputKind: 'text', modelKey: null },
    ]
    : [{ scanType: options.scanType, inputKind: options.inputKind, modelKey: options.modelKey }];
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const rows = await supabaseFetch('/rest/v1/scans?select=id', {
        method: 'POST',
        service: true,
        body: {
          org_id: context.organization.id,
          user_id: context.user.id,
          project_id: options.projectId || null,
          scan_type: attempt.scanType,
          status: 'queued',
          selected_model_key: attempt.modelKey,
          source: 'web',
          metadata,
        },
        headers: { Prefer: 'return=representation' },
      });
      const scanId = rows?.[0]?.id;
      if (!scanId) throw new SupabaseError(500, 'Supabase did not return the new scan id.');

      try {
        await supabaseFetch('/rest/v1/scan_inputs', {
          method: 'POST',
          service: true,
          body: {
            scan_id: scanId,
            input_kind: attempt.inputKind,
            text_preview: String(options.textPreview || '').slice(0, 500) || null,
            text_hash: options.textHash || null,
            metadata,
          },
        });
      } catch (inputError) {
        // The scan-level metadata is sufficient for history/type recovery. An
        // older input_kind enum must not make the completed result disappear.
        console.error('VeriTrust scan input compatibility insert failed', {
          scan_id: scanId,
          message: inputError.message,
        });
      }
      return scanId;
    } catch (error) {
      lastError = error;
      if (options.scanType !== 'link' || !isLinkSchemaCompatibilityError(error)) throw error;
    }
  }
  throw lastError;
}

async function createScanRecord(context, options) {
  const isLink = options.scanType === 'link';
  const metadata = isLink ? {
    ...(options.metadata || {}),
    logical_scan_type: 'link',
    original_scan_type: 'link',
    original_input_kind: options.inputKind || 'url',
    selected_model_key: options.modelKey || null,
  } : (options.metadata || {});
  const attempts = [{ scanType: options.scanType, inputKind: options.inputKind, modelKey: options.modelKey }];

  // Older production schemas have no link_count and roll the entire scan RPC
  // back when increment_usage runs. Store a tagged compatibility row so the
  // scan remains visible as Link Intelligence until that migration is applied.
  if (isLink) {
    attempts.push(
      { scanType: 'phishing', inputKind: options.inputKind, modelKey: options.modelKey },
      { scanType: 'phishing', inputKind: 'text', modelKey: null },
    );
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await rpc('create_scan_record', {
        target_org_id: context.organization.id,
        target_scan_type: attempt.scanType,
        target_input_kind: attempt.inputKind,
        target_selected_model_key: attempt.modelKey,
        target_project_id: options.projectId || null,
        target_text_preview: options.textPreview || null,
        target_text_hash: options.textHash || null,
        target_metadata: metadata,
      }, {
        accessToken: context.token,
      });
    } catch (error) {
      lastError = error;
      if (!isLink || !isLinkSchemaCompatibilityError(error)) throw error;
    }
  }
  if (isLink && isServiceRoleConfigured()) {
    return createScanRecordDirect(context, options, metadata);
  }
  throw lastError;
}

async function completeScanRecordDirect(scanId, body) {
  await supabaseFetch(`/rest/v1/scans?id=eq.${eq(scanId)}`, {
    method: 'PATCH',
    service: true,
    body: {
      status: 'completed',
      final_label: body.result_label,
      confidence: body.result_confidence,
      risk_level: body.result_risk_level,
      completed_at: new Date().toISOString(),
      error_message: null,
    },
  });

  await supabaseFetch('/rest/v1/scan_results?on_conflict=scan_id', {
    method: 'POST',
    service: true,
    body: {
      scan_id: scanId,
      label: body.result_label,
      confidence: body.result_confidence,
      risk_level: body.result_risk_level,
      primary_score: body.result_primary_score,
      secondary_score: body.result_secondary_score,
      explanation: body.result_explanation,
      indicators: body.result_indicators,
      raw_scores: body.result_raw_scores,
    },
    headers: { Prefer: 'resolution=merge-duplicates' },
  });

  if (body.model_runs.length) {
    try {
      await supabaseFetch('/rest/v1/scan_model_runs', {
        method: 'POST',
        service: true,
        body: body.model_runs.map((run) => ({
          scan_id: scanId,
          model_key: null,
          provider: run.provider || 'unknown',
          provider_model: run.provider_model || 'unknown',
          status: run.status || 'completed',
          latency_ms: run.latency_ms || null,
          request_metadata: run.request_metadata || {},
          response_metadata: run.response_metadata || {},
          error_message: run.error_message || null,
        })),
      });
    } catch (runError) {
      console.error('VeriTrust model-run compatibility insert failed', {
        scan_id: scanId,
        message: runError.message,
      });
    }
  }
}

async function completeScanRecord(scanId, payload, modelRuns = []) {
  const body = {
    target_scan_id: scanId,
    result_label: payload.result?.label || 'Unknown',
    result_confidence: Number(payload.result?.confidence || 0),
    result_risk_level: riskLevel(payload.result?.risk_level),
    result_primary_score: primaryScoreForPayload(payload),
    result_secondary_score: secondaryScoreForPayload(payload),
    result_explanation: payload.result?.summary || payload.result?.explanation || '',
    result_indicators: payload.result?.indicators || payload.result?.evidence || [],
    result_raw_scores: payload.scores || [],
    model_runs: modelRuns,
  };

  try {
    return await rpc('complete_scan_record', body, {
      service: true,
    });
  } catch (error) {
    const errorText = supabaseErrorText(error);
    const isCriticalEnumFailure = body.result_risk_level === 'critical'
      && error instanceof SupabaseError
      && (errorText.includes('risk_level') || errorText.includes('critical'));
    const hasUnknownModel = error instanceof SupabaseError
      && (errorText.includes('model_catalog') || errorText.includes('model_key') || errorText.includes('foreign key constraint'));
    const isMissingRpc = error instanceof SupabaseError
      && (errorText.includes('could not find the function') || errorText.includes('pgrst202'));
    if (isMissingRpc && isServiceRoleConfigured()) {
      return completeScanRecordDirect(scanId, {
        ...body,
        result_risk_level: body.result_risk_level === 'critical' ? 'high' : body.result_risk_level,
      });
    }
    if (!isCriticalEnumFailure && !hasUnknownModel) throw error;

    const compatibleBody = {
      ...body,
      ...(isCriticalEnumFailure ? { result_risk_level: 'high' } : {}),
      ...(hasUnknownModel ? {
        model_runs: body.model_runs.map((run) => ({ ...run, model_key: null })),
      } : {}),
    };
    try {
      return await rpc('complete_scan_record', compatibleBody, { service: true });
    } catch (retryError) {
      if (isServiceRoleConfigured() && isLinkSchemaCompatibilityError(retryError)) {
        return completeScanRecordDirect(scanId, compatibleBody);
      }
      throw retryError;
    }
  }
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
  const rows = await supabaseFetch(`/rest/v1/scans?org_id=eq.${eq(context.organization.id)}&select=id,scan_type,status,selected_model_key,final_label,confidence,risk_level,metadata,created_at,completed_at,error_message,scan_inputs(input_kind,text_preview,metadata),scan_results(label,confidence,risk_level,primary_score,secondary_score,explanation,indicators,raw_scores),scan_model_runs(model_key,provider,status,latency_ms,error_message,created_at)&order=created_at.desc&limit=${safeLimit}`, {
    accessToken: context.token,
  });
  const regularScans = (rows || []).map((scan) => ({
    ...scan,
    scan_type: logicalScanType(scan),
  }));
  if (!isServiceRoleConfigured()) return regularScans;

  try {
    const gatewayScans = await recentGatewayScans(context.organization.id, safeLimit);
    return mergeScanHistories(regularScans, gatewayScans, safeLimit);
  } catch (error) {
    console.error('VeriTrust gateway scan history unavailable', {
      organization_id: context.organization.id,
      message: error.message,
    });
    return regularScans;
  }
}

async function recentGatewayScans(orgId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const scans = await supabaseFetch(`/rest/v1/gateway_scans?org_id=eq.${eq(orgId)}&select=id,display_id,org_id,submitted_by,status,source,processing_mode,degraded,metadata,created_at,completed_at,failure_code,policy_version_id,correlation_version,preliminary_decision_id,final_decision_id&order=created_at.desc&limit=${safeLimit}`, {
    service: true,
  });
  if (!scans?.length) return [];

  const scanFilter = scans.map((scan) => eq(scan.id)).join(',');
  const [decisions, evidence] = await Promise.all([
    supabaseFetch(`/rest/v1/gateway_decisions?org_id=eq.${eq(orgId)}&scan_id=in.(${scanFilter})&select=id,scan_id,sequence,decision_kind,risk_score,verdict,recommendation,degraded,reason_codes,policy_version_id,correlation_version,created_at&order=sequence.desc`, { service: true }),
    supabaseFetch(`/rest/v1/gateway_evidence?org_id=eq.${eq(orgId)}&scan_id=in.(${scanFilter})&select=id,scan_id,model_key,status,score,verdict,confidence,confidence_value,indicators,reason_codes,model_version,created_at&order=created_at.asc`, { service: true }),
  ]);

  const decisionsByScan = new Map();
  for (const decision of decisions || []) {
    const rows = decisionsByScan.get(decision.scan_id) || [];
    rows.push(decision);
    decisionsByScan.set(decision.scan_id, rows);
  }
  const evidenceByScan = new Map();
  for (const item of evidence || []) {
    const rows = evidenceByScan.get(item.scan_id) || [];
    rows.push(item);
    evidenceByScan.set(item.scan_id, rows);
  }

  return scans.map((scan) => normalizeGatewayScan(
    scan,
    decisionsByScan.get(scan.id) || [],
    evidenceByScan.get(scan.id) || [],
  ));
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
      link_count: 0,
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
    const usageRows = await supabaseFetch(`/rest/v1/user_usage_daily?org_id=eq.${eq(orgId)}&user_id=eq.${eq(context.user.id)}&usage_date=eq.${today}&select=deepfake_count,phishing_count,link_count,api_count`, {
      accessToken: context.token,
    });
    if (usageRows?.[0]) {
      stats.usage_today = {
        deepfake_count: Number(usageRows[0].deepfake_count || 0),
        link_count: Number(usageRows[0].link_count || 0),
        phishing_count: Number(usageRows[0].phishing_count || 0),
        api_count: Number(usageRows[0].api_count || 0),
      };
    }
  } catch {
    stats.usage_today = {
      deepfake_count: 0,
      link_count: 0,
      phishing_count: 0,
      api_count: 0,
    };
  }

  return stats;
}

module.exports = {
  SupabaseError,
  bearerToken,
  completeScanRecord,
  createScanRecord,
  dashboardSnapshot,
  eq,
  failScanRecord,
  getUserFromRequest,
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
