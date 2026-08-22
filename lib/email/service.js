const crypto = require('crypto');
const { getOptionalEnv, serverConfig } = require('../config');
const { contentHmac, safeUrlMetadata } = require('../gateway/extractor');
const { correlate } = require('../gateway/correlation');
const { compilePolicy } = require('../gateway/policy');
const {
  claimScan,
  completeArtifacts,
  createArtifacts,
  enqueueJob,
  failScan,
  getPolicyVersion,
  prepareModelRun,
  publishDecision,
  recordEvidence,
  resolveIntegration,
  scanReport,
  storeIdempotentResponse,
  submitScan,
} = require('../gateway/persistence');
const { uploadObject } = require('../gateway/storage');
const phishingAdapter = require('../models/phishing-text');
const linkAdapter = require('../models/malicious-url');
const { evaluateRawAuthentication } = require('./auth');
const {
  CAPABILITIES,
  EMAIL_AUTH_VERSION,
  EMAIL_EVIDENCE_SCHEMA,
  EMAIL_IDENTITY_VERSION,
  EMAIL_PIPELINE_VERSION,
} = require('./contracts');
const { deterministicObservations, extractUrls, sha256 } = require('./content');
const { buildIdentityGraph } = require('./identity');
const { enrichInfrastructure, extractInfrastructure } = require('./infrastructure');
const { parseEml } = require('./parser');
const {
  createChildArtifacts,
  emailRecordsForScan,
  persistAuthObservations,
  persistEmailDetails,
  persistIdentityEdges,
  persistInfrastructure,
  updateEmailArtifactStorage,
} = require('./persistence');

function now() { return new Date().toISOString(); }

function normalizeEmailObservation(item, observedAt = now()) {
  return {
    ...item,
    code: item.code || item.protocol || 'EMAIL_OBSERVATION',
    source: item.source || item.source_type || 'email_pipeline',
    producer_version: item.producer_version || EMAIL_PIPELINE_VERSION,
    observed_at: item.observed_at || item.dns_observed_at || observedAt,
    quality: item.quality || 'unknown',
    provenance: item.provenance || {},
    failure_reason: item.failure_reason || null,
  };
}

function requestHash(mode, digest, metadata = {}) {
  return crypto.createHash('sha256').update(JSON.stringify({ mode, digest, metadata, pipeline: EMAIL_PIPELINE_VERSION })).digest('hex');
}

function unavailableAuthObservations() {
  return ['SPF', 'DKIM', 'DMARC', 'ARC'].map((protocol) => ({
    protocol,
    result: 'UNAVAILABLE',
    identity: null,
    domain: null,
    selector: null,
    algorithm: null,
    source_type: 'capability_contract',
    provenance: { input_mode: 'plain_text', protocol_claimed: false },
    dns_observed_at: null,
    dns_response_hash: null,
    failure_reason: 'INPUT_MODE_LACKS_HEADER_OR_SMTP_EVIDENCE',
    quality: 'unavailable',
    producer_version: EMAIL_AUTH_VERSION,
  }));
}

function plainTextParsed(input) {
  const text = [input.subject ? `Subject: ${input.subject}` : '', input.body].filter(Boolean).join('\n\n');
  const digest = sha256(text);
  return {
    rawSha256: digest,
    rawBytes: Buffer.byteLength(text, 'utf8'),
    parserVersion: 'plain-text-contract-1',
    parseState: 'COMPLETED',
    headerBytes: 0,
    decodedBytes: Buffer.byteLength(text, 'utf8'),
    mimePartCount: 0,
    mimeDepthEstimate: 0,
    attachments: [],
    headers: new Map(),
    headerLines: [],
    addresses: { from: [], replyTo: [], returnPath: [], sender: [] },
    subject: input.subject,
    messageId: null,
    date: null,
    text,
    html: '',
    bodyTextHash: sha256(text),
    bodyHtmlHash: null,
    subjectHash: sha256(input.subject),
    limitations: ['PLAIN_TEXT_NO_HEADER_AUTH_OR_MIME_EVIDENCE'],
    malformed: [],
  };
}

function failedModelEvidence(kind, modelKey, artifactId, error, required = true) {
  const unavailableCode = kind === 'link' ? 'LINK_MODEL_UNAVAILABLE' : (kind === 'parser' ? 'EMAIL_PARSER_FAILED' : 'PHISHING_MODEL_UNAVAILABLE');
  return {
    artifactId,
    kind,
    modelKey,
    status: error?.code === 'AUTH_TIMEOUT' ? 'timed_out' : 'failed',
    score: null,
    verdict: 'unknown',
    confidence: 'unknown',
    confidenceValue: null,
    indicators: [],
    reasonCodes: [unavailableCode, String(error?.code || 'MODEL_ERROR')],
    degraded: true,
    required,
    errorCode: error?.code || 'MODEL_ERROR',
    rawResponseRedacted: { error_code: error?.code || 'MODEL_ERROR' },
  };
}

async function runPreparedAdapter(orgId, scanId, artifact, modelKey, adapter, policy, required = true) {
  let prepared;
  try {
    prepared = await prepareModelRun(orgId, scanId, artifact, modelKey);
  } catch (error) {
    return failedModelEvidence(modelKey === 'mailguard' ? 'phishing' : 'link', modelKey, artifact.id, error, required);
  }
  const result = await adapter.execute(artifact, {
    modelKey,
    required,
    timeoutMs: Math.min(policy.timeouts?.per_model_ms || 5000, serverConfig.gatewaySynchronousBudgetMs),
    allowProviderFallback: false,
    modelContract: prepared.configuration,
  });
  return recordEvidence(orgId, scanId, artifact, result.evidence, prepared);
}

function gatewayObservationEvidence(authObservations, edges, contentObservations, artifactId) {
  const reasonCodes = [];
  for (const item of authObservations) {
    if (['FAIL', 'TEMPERROR', 'PERMERROR'].includes(item.result)) reasonCodes.push(`${item.protocol}_${item.result}`);
  }
  reasonCodes.push(...edges.map((edge) => edge.reason_code).filter(Boolean));
  reasonCodes.push(...contentObservations.map((item) => item.code));
  return {
    artifactId,
    kind: 'email_forensics',
    modelKey: 'email.forensics',
    status: 'completed',
    score: null,
    verdict: 'unknown',
    confidence: 'unknown',
    reasonCodes: [...new Set(reasonCodes)],
    required: false,
  };
}

function specialistState(parseState, modelEvidence) {
  if (parseState === 'UNSUPPORTED_LIMIT') return 'UNSUPPORTED';
  if (['FAILED', 'FAILED_TIMEOUT', 'MALFORMED_LIMIT'].includes(parseState)) return 'FAILED';
  if (modelEvidence?.status === 'completed') {
    const state = modelEvidence.rawResponseRedacted?.state;
    if (['LIKELY_BENIGN', 'LIKELY_PHISHING', 'UNCERTAIN'].includes(state)) return state;
  }
  return 'UNCERTAIN';
}

function evidenceBundle(input) {
  return {
    schema_version: EMAIL_EVIDENCE_SCHEMA,
    artifact_id: input.artifact.id,
    input_mode: input.mode,
    state: input.state,
    capabilities: CAPABILITIES[input.mode],
    observations: input.observations,
    model_evidence: input.modelEvidence ? [{
      model_version_id: input.modelEvidence.modelVersionId || null,
      state: input.modelEvidence.rawResponseRedacted?.state || (input.modelEvidence.status === 'failed' ? 'FAILED' : 'UNCERTAIN'),
      p_phish: input.modelEvidence.score,
      status: input.modelEvidence.status,
      reason_codes: input.modelEvidence.reasonCodes,
    }] : [],
    relationships: input.edges.map((edge) => ({
      type: edge.edge_type,
      source_type: edge.source_type,
      target_type: edge.target_type,
      target_value: edge.target_value,
      reason_code: edge.reason_code,
      quality: 'observed',
      producer_version: edge.producer_version,
    })),
    infrastructure: input.infrastructure.map((hop) => ({
      hop_index: hop.hop_index,
      host: hop.host,
      ip_address: hop.ip_address,
      ip_classification: hop.ip_classification,
      asn: hop.asn,
      asn_org: hop.asn_org,
      country: hop.country,
      region: hop.region,
      city: hop.city,
      latitude: hop.latitude,
      longitude: hop.longitude,
      geo_provider: hop.geo_provider,
      trust_level: hop.trust_level,
      wording: 'Sending Infrastructure - approximate infrastructure geolocation only',
    })),
    children: input.children.map((child) => ({
      artifact_id: child.id,
      parent_artifact_id: child.parent_artifact_id,
      type: child.artifact_type || child.type,
      ordinal: child.ordinal,
      state: input.childEvidence.get(child.id)?.status || (child.artifact_type === 'attachment' ? 'METADATA_ONLY' : 'PENDING'),
      reason_codes: input.childEvidence.get(child.id)?.reasonCodes || [],
      metadata: child.metadata,
    })),
    limitations: [...new Set(input.limitations)],
    started_at: input.startedAt,
    completed_at: input.completedAt,
  };
}

async function analyzeEmail(input) {
  const startedAt = now();
  const { auth, mode, idempotencyKey, requestId, traceId } = input;
  const integration = await resolveIntegration(auth, input.integrationId || null, 'gateway:scan');
  const parsedSeed = mode === 'plain_text' ? plainTextParsed(input.text) : null;
  const rawDigest = parsedSeed?.rawSha256 || crypto.createHash('sha256').update(input.raw).digest('hex');
  const submitted = await submitScan({
    orgId: auth.organization.id,
    integrationId: integration.id,
    idempotencyKey,
    requestHash: requestHash(mode, rawDigest, { channel: input.text?.channel || 'email' }),
    apiKeyId: auth.apiKeyId,
    submittedBy: auth.user?.id || null,
    processingMode: mode === 'plain_text' ? 'synchronous' : 'hybrid',
    source: mode === 'trusted_receiver_event' ? 'trusted-receiver-v2' : 'phishing-v2',
    externalEventId: input.receiver?.receiver_id || null,
    requestId,
    traceId,
    policyVersionId: null,
    deadlineAt: new Date(Date.now() + 120000).toISOString(),
    metadata: { input_mode: mode, evidence_schema: EMAIL_EVIDENCE_SCHEMA, pipeline_version: EMAIL_PIPELINE_VERSION },
  });
  if (submitted.replayed && submitted.response_body) return { status: Number(submitted.response_status || 200), body: submitted.response_body, replayed: true };
  const scanId = submitted.scan_id;
  const claimed = await claimScan(auth.organization.id, scanId);
  if (!claimed) return { status: 202, body: { ok: true, replayed: true, scan_id: scanId, status: 'processing' }, replayed: true };

  try {
    const policy = compilePolicy((await getPolicyVersion(claimed.policy_version_id, auth.organization.id)).compiled_policy);
    const retentionHours = Math.max(1, Math.min(24, Number(policy.retention?.maximum_hours || 24)));
    const retentionUntil = mode === 'plain_text' ? null : new Date(Date.now() + retentionHours * 3600000).toISOString();
    const [artifact] = await createArtifacts(auth.organization.id, scanId, [{
      ordinal: 0,
      type: 'email',
      content: null,
      content_hmac: contentHmac(serverConfig.gatewayContentHmacKey, auth.organization.id, 'email', rawDigest),
      size_bytes: mode === 'plain_text' ? parsedSeed.rawBytes : input.raw.length,
      mime_type: mode === 'plain_text' ? 'text/plain' : 'message/rfc822',
      retention: mode === 'plain_text' ? 'metadata_only' : 'temporary_file',
      retention_until: retentionUntil,
      metadata: { input_mode: mode, raw_sha256: rawDigest, pipeline_version: EMAIL_PIPELINE_VERSION },
    }]);

    if (mode !== 'plain_text') {
      // The deployed gateway_artifacts constraint requires org/scan prefixes. This
      // compatibility path is the inventory-safe form of the blueprint object key.
      const storagePath = `${auth.organization.id}/${scanId}/email/${artifact.id}/original.eml`;
      await uploadObject('gateway-uploads', storagePath, input.raw, 'message/rfc822', { upsert: false });
      await updateEmailArtifactStorage(auth.organization.id, scanId, artifact.id, {
        storage_bucket: 'gateway-uploads', storage_path: storagePath, status: 'processing',
      });
      artifact.storage_bucket = 'gateway-uploads';
      artifact.storage_path = storagePath;
      artifact.status = 'processing';
      await enqueueJob({
        orgId: auth.organization.id,
        scanId,
        artifactId: artifact.id,
        jobType: 'retention',
        dedupeKey: `retention:${artifact.id}`,
        payload: { artifact_id: artifact.id },
        availableAt: retentionUntil,
        maxAttempts: 8,
      });
    }

    let parsed = parsedSeed;
    let parserFailure = null;
    if (!parsed) {
      try {
        parsed = await parseEml(input.raw);
      } catch (error) {
        parserFailure = error;
        parsed = {
          ...plainTextParsed({ subject: '', body: '' }),
          rawSha256: rawDigest,
          rawBytes: input.raw.length,
          parserVersion: 'mailparser-3.9.15+veritrust-1',
          parseState: ['UNSUPPORTED_LIMIT', 'MALFORMED_LIMIT', 'FAILED_TIMEOUT'].includes(error.code) ? error.code : 'FAILED',
          limitations: [String(error.code || 'PARSER_FAILED')],
        };
      }
    }

    const content = deterministicObservations(parsed.text, parsed.html);
    const extracted = extractUrls(parsed.text, parsed.html);
    const authResult = mode === 'plain_text'
      ? { observations: unavailableAuthObservations(), limitations: ['AUTHENTICATION_UNAVAILABLE_FOR_PLAIN_TEXT'] }
      : await evaluateRawAuthentication(input.raw, parsed.headerLines, {
        mode,
        clientIp: input.receiver?.client_ip,
        helo: input.receiver?.helo,
        mailFrom: input.receiver?.mail_from,
        receiverId: input.receiver?.receiver_id,
        authservId: input.receiver?.authserv_id,
        trustedAuthservIds: getOptionalEnv('VERITRUST_TRUSTED_AUTHSERV_IDS', '').split(',').map((value) => value.trim()).filter(Boolean),
      });
    const identity = buildIdentityGraph(parsed, authResult.observations, extracted.urls);
    const infrastructureBase = mode === 'plain_text' ? { hops: [], limitations: ['INFRASTRUCTURE_UNAVAILABLE_FOR_PLAIN_TEXT'] } : extractInfrastructure(parsed.headerLines, { trustedReceiver: mode === 'trusted_receiver_event' });
    const infrastructureResult = await enrichInfrastructure(infrastructureBase.hops, input.geoProvider || null);
    const infrastructure = infrastructureResult.hops;
    for (const hop of infrastructure) {
      const targetValue = hop.host || hop.ip_address;
      if (!targetValue) continue;
      identity.edges.push({
        edge_type: 'sent_via',
        source_type: 'email_artifact',
        source_value: parsed.rawSha256,
        target_type: hop.host ? 'infrastructure_host' : 'infrastructure_ip',
        target_value: targetValue,
        evidence_source: 'received_header',
        confidence: hop.trust_level === 'trusted_receiver' ? 1 : null,
        reason_code: 'SENDING_INFRASTRUCTURE_OBSERVED',
        provenance: { hop_index: hop.hop_index, trust_level: hop.trust_level, ip_classification: hop.ip_classification },
        producer_version: EMAIL_IDENTITY_VERSION,
      });
    }
    const contentAndIdentityObservations = [...content, ...extracted.observations, ...identity.observations].map((item) => normalizeEmailObservation(item));
    const allObservations = [...contentAndIdentityObservations, ...authResult.observations.map((item) => normalizeEmailObservation(item))];

    const childDefinitions = [];
    for (const record of extracted.urls) {
      childDefinitions.push({
        ordinal: childDefinitions.length + 1,
        type: 'url',
        content: record.url,
        content_hmac: contentHmac(serverConfig.gatewayContentHmacKey, auth.organization.id, 'url', record.url),
        size_bytes: Buffer.byteLength(record.url, 'utf8'),
        mime_type: 'text/uri-list',
        metadata: { ...safeUrlMetadata(record.url), sources: record.sources, visible_href_evidence: record.metadata },
      });
    }
    for (const attachment of parsed.attachments) {
      childDefinitions.push({
        ordinal: childDefinitions.length + 1,
        type: 'attachment',
        content: null,
        content_hmac: attachment.sha256 ? contentHmac(serverConfig.gatewayContentHmacKey, auth.organization.id, 'attachment', attachment.sha256) : null,
        size_bytes: attachment.decoded_size,
        mime_type: attachment.declared_mime_type,
        metadata: {
          original_filename_untrusted: attachment.filename,
          declared_mime_type: attachment.declared_mime_type,
          disposition: attachment.disposition,
          mime_part_index: attachment.part_index,
          sha256: attachment.sha256,
          media_authenticity: 'UNAVAILABLE_MODULE_DISABLED',
          executable_content_processed: false,
        },
      });
    }
    const childRows = await createChildArtifacts(auth.organization.id, scanId, artifact.id, childDefinitions);
    const childByOrdinal = new Map(childDefinitions.map((item) => [item.ordinal, item]));
    const hydratedChildren = childRows.map((row) => ({ ...row, type: row.artifact_type, content: childByOrdinal.get(Number(row.ordinal))?.content || null }));

    await Promise.all([
      persistEmailDetails(auth.organization.id, scanId, artifact.id, parsed, identity, extracted.urls.length, {
        content_observations: contentAndIdentityObservations,
        attachment_metadata_only: true,
        media_authenticity_analyzed: false,
      }),
      persistAuthObservations(auth.organization.id, scanId, artifact.id, authResult.observations),
      persistIdentityEdges(auth.organization.id, scanId, artifact.id, identity.edges),
      persistInfrastructure(auth.organization.id, scanId, artifact.id, infrastructure),
    ]);

    const parentView = { ...artifact, type: 'email', content: parsed.text };
    const modelEvidence = parserFailure ? failedModelEvidence('phishing', 'mailguard', artifact.id, parserFailure, true)
      : await runPreparedAdapter(auth.organization.id, scanId, parentView, 'mailguard', phishingAdapter, policy, true);
    const childEvidence = new Map();
    await Promise.all(hydratedChildren.filter((child) => child.type === 'url').map(async (child) => {
      const evidence = await runPreparedAdapter(auth.organization.id, scanId, child, 'swift', linkAdapter, policy, true);
      childEvidence.set(child.id, evidence);
    }));

    const observationEvidence = gatewayObservationEvidence(authResult.observations, identity.edges, contentAndIdentityObservations, artifact.id);
    const correlationInputs = [modelEvidence, ...childEvidence.values(), observationEvidence];
    if (parserFailure) correlationInputs.push({ ...failedModelEvidence('parser', 'email.parser', artifact.id, parserFailure, true), kind: 'email_parser' });
    const decision = correlate(correlationInputs, policy);
    decision.decision_state = 'final';
    await publishDecision(scanId, decision, auth.user?.id || null);
    await completeArtifacts(auth.organization.id, scanId);

    const limitations = [
      ...parsed.limitations,
      ...authResult.limitations,
      ...identity.limitations,
      ...infrastructureBase.limitations,
      ...(parsed.attachments.length ? ['ATTACHMENTS_METADATA_ONLY_NO_MALWARE_EXECUTION'] : []),
      ...(parsed.attachments.some((item) => String(item.declared_mime_type).startsWith('image/')) ? ['MEDIA_AUTHENTICITY_UNAVAILABLE_DEEPFAKE_DISABLED'] : []),
      ...(modelEvidence.status === 'failed' ? ['CONTENT_MODEL_FAILED'] : []),
      ...[...childEvidence.values()].filter((item) => item.status !== 'completed').map(() => 'LINK_INTELLIGENCE_PARTIAL_FAILURE'),
    ];
    const completedAt = now();
    const bundle = evidenceBundle({
      artifact,
      mode,
      state: specialistState(parsed.parseState, modelEvidence),
      observations: allObservations,
      modelEvidence,
      edges: identity.edges,
      infrastructure,
      children: hydratedChildren,
      childEvidence,
      limitations,
      startedAt,
      completedAt,
    });
    const body = {
      ok: true,
      request_id: requestId,
      scan_id: scanId,
      status: 'completed',
      gateway_decision: {
        risk: decision.risk,
        severity: decision.severity,
        verdict: decision.verdict,
        recommendation: decision.recommendation,
        degraded: decision.degraded,
        reason_codes: decision.reason_codes,
        correlation_version: decision.correlation_version,
      },
      evidence: bundle,
    };
    await storeIdempotentResponse(scanId, 200, body);
    return { status: 200, body, replayed: false };
  } catch (error) {
    await failScan(auth.organization.id, scanId, error).catch(() => null);
    throw error;
  }
}

async function emailEvidenceReport(orgId, scanId) {
  const [gateway, records] = await Promise.all([scanReport(orgId, scanId), emailRecordsForScan(orgId, scanId)]);
  if (!records.details) return null;
  const mode = gateway.scan.metadata?.input_mode || 'raw_eml';
  const parentArtifactId = records.details.artifact_id;
  const parentModelEvidence = (gateway.evidence || []).find((item) => item.artifact_id === parentArtifactId && item.model_run_id);
  const parentModelRun = parentModelEvidence
    ? (gateway.model_runs || []).find((item) => item.id === parentModelEvidence.model_run_id)
    : null;
  const rawState = parentModelEvidence?.raw_response_redacted?.state;
  const state = ['LIKELY_BENIGN', 'LIKELY_PHISHING', 'UNCERTAIN'].includes(rawState)
    ? rawState
    : (records.details.parse_state === 'UNSUPPORTED_LIMIT' ? 'UNSUPPORTED'
      : (['FAILED', 'FAILED_TIMEOUT', 'MALFORMED_LIMIT'].includes(records.details.parse_state) ? 'FAILED' : 'UNCERTAIN'));
  const children = (gateway.artifacts || []).filter((item) => item.parent_artifact_id === parentArtifactId).map((child) => {
    const childEvidence = (gateway.evidence || []).find((item) => item.artifact_id === child.id);
    return {
      artifact_id: child.id,
      parent_artifact_id: parentArtifactId,
      type: child.artifact_type,
      ordinal: child.ordinal,
      state: childEvidence?.status || (child.artifact_type === 'attachment' ? 'METADATA_ONLY' : 'UNAVAILABLE'),
      reason_codes: childEvidence?.reason_codes || [],
      metadata: child.metadata || {},
    };
  });
  return {
    schema_version: EMAIL_EVIDENCE_SCHEMA,
    scan_id: scanId,
    artifact_id: parentArtifactId,
    input_mode: mode,
    state,
    capabilities: CAPABILITIES[mode],
    observations: [...(records.details.metadata?.content_observations || []), ...(records.auth || [])].map((item) => normalizeEmailObservation(item)),
    model_evidence: parentModelEvidence ? [{
      model_version_id: parentModelRun?.model_version_id || null,
      state: rawState || (parentModelEvidence.status === 'failed' ? 'FAILED' : 'UNCERTAIN'),
      p_phish: parentModelEvidence.score,
      status: parentModelEvidence.status,
      reason_codes: parentModelEvidence.reason_codes || [],
    }] : [],
    authentication: records.auth,
    relationships: records.edges,
    infrastructure: (records.infrastructure || []).map((hop) => ({
      ...hop,
      wording: 'Sending Infrastructure - approximate infrastructure geolocation only',
    })),
    children,
    limitations: records.details.limitations || [],
    gateway_decisions: gateway.decisions,
  };
}

module.exports = { analyzeEmail, emailEvidenceReport, evidenceBundle, normalizeEmailObservation, requestHash, specialistState };
