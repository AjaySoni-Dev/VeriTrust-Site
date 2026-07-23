const test = require('node:test');
const assert = require('node:assert/strict');

const {
  gatewayRiskLevel,
  mergeScanHistories,
  normalizeGatewayScan,
  selectDecision,
} = require('../../lib/gateway/dashboard-history');

const gatewayScan = {
  id: '11111111-1111-4111-8111-111111111111',
  display_id: 'VTG-2026-ABC123',
  org_id: '22222222-2222-4222-8222-222222222222',
  submitted_by: null,
  status: 'completed',
  source: 'powershell',
  processing_mode: 'synchronous',
  degraded: false,
  metadata: { client: 'windows-powershell' },
  policy_version_id: '33333333-3333-4333-8333-333333333333',
  correlation_version: 'gateway-correlation-v1',
  preliminary_decision_id: '44444444-4444-4444-8444-444444444444',
  final_decision_id: '55555555-5555-4555-8555-555555555555',
  created_at: '2026-07-21T08:00:00.000Z',
  completed_at: '2026-07-21T08:00:02.000Z',
};

const preliminary = {
  id: gatewayScan.preliminary_decision_id,
  scan_id: gatewayScan.id,
  sequence: 1,
  decision_kind: 'preliminary',
  risk_score: 0.4,
  verdict: 'low',
  recommendation: 'warn',
  reason_codes: [],
};

const finalDecision = {
  id: gatewayScan.final_decision_id,
  scan_id: gatewayScan.id,
  sequence: 2,
  decision_kind: 'final',
  risk_score: 0.82,
  verdict: 'high',
  recommendation: 'quarantine',
  reason_codes: ['MALICIOUS_URL'],
  policy_version_id: gatewayScan.policy_version_id,
  correlation_version: gatewayScan.correlation_version,
};

test('selectDecision prefers the scan final decision', () => {
  assert.equal(selectDecision(gatewayScan, [preliminary, finalDecision]).id, finalDecision.id);
});

test('PowerShell gateway results normalize into dashboard scan records', () => {
  const normalized = normalizeGatewayScan(gatewayScan, [preliminary, finalDecision], [{
    scan_id: gatewayScan.id,
    model_key: 'swift',
    model_version: '1.2.3',
    status: 'completed',
    score: 0.82,
    verdict: 'malicious',
    confidence: 'strong',
    confidence_value: 0.94,
    indicators: ['Suspicious credential path'],
    reason_codes: ['MALICIOUS_URL'],
  }]);

  assert.equal(normalized.scan_type, 'gateway');
  assert.equal(normalized.source, 'powershell');
  assert.equal(normalized.selected_model_key, 'gateway');
  assert.equal(normalized.final_label, 'high');
  assert.equal(normalized.risk_level, 'high');
  assert.equal(normalized.confidence, 0.94);
  assert.equal(normalized.metadata.record_kind, 'gateway');
  assert.equal(normalized.metadata.gateway.display_id, gatewayScan.display_id);
  assert.equal(normalized.metadata.gateway.recommendation, 'quarantine');
  assert.deepEqual(normalized.scan_results[0].indicators, ['MALICIOUS URL', 'Suspicious credential path']);
  assert.equal(normalized.scan_results[0].primary_score, 0.82);
});

test('pending gateway scans remain visible without manufacturing a decision', () => {
  const normalized = normalizeGatewayScan({
    ...gatewayScan,
    status: 'processing',
    final_decision_id: null,
    preliminary_decision_id: null,
    completed_at: null,
  });
  assert.equal(normalized.status, 'processing');
  assert.equal(normalized.risk_level, 'unknown');
  assert.deepEqual(normalized.scan_results, []);
});

test('merged dashboard history is chronological and limit bounded', () => {
  const regular = [{ id: 'regular', created_at: '2026-07-21T07:00:00.000Z', metadata: {} }];
  const gateway = [{ id: gatewayScan.id, created_at: gatewayScan.created_at, metadata: { record_kind: 'gateway' } }];
  const merged = mergeScanHistories(regular, gateway, 2);
  assert.deepEqual(merged.map((scan) => scan.id), [gatewayScan.id, 'regular']);
  assert.equal(mergeScanHistories(regular, gateway, 1).length, 1);
});

test('gateway risk levels use the gateway correlation thresholds', () => {
  assert.equal(gatewayRiskLevel(0.44), 'low');
  assert.equal(gatewayRiskLevel(0.45), 'medium');
  assert.equal(gatewayRiskLevel(0.75), 'high');
  assert.equal(gatewayRiskLevel(0.9), 'critical');
});
