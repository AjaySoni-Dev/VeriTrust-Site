const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationDir = path.resolve(__dirname, '..', 'supabase', 'migrations');
const read = (name) => fs.readFileSync(path.join(migrationDir, name), 'utf8');

test('VT-002 clean baseline has one quota function and a valid locked model seed', () => {
  const sql = read('202607100001_baseline.sql');
  assert.equal((sql.match(/function public\.check_scan_quota\(/g) || []).length, 1);
  assert.match(sql, /'sentinel'.*'locked'.*'local-rules-disabled'/);
  assert.doesNotMatch(sql, /commit;[\s\S]+alter table/i);
});

test('VT-001 remediation revokes old keys and removes secret prefixes', () => {
  const sql = read('202607100002_security_backend_remediation.sql');
  assert.match(sql, /status = 'revoked'[\s\S]+key_prefix = null/i);
  assert.match(sql, /api_keys_public_id_unique/);
  assert.match(sql, /revoke all on public\.api_keys/);
});

test('VT-059 storage path and privileged functions fail closed', () => {
  const sql = read('202607100002_security_backend_remediation.sql');
  assert.match(sql, /function public\.safe_uuid/);
  assert.match(sql, /revoke execute on function public\.check_entitlement_quota/);
  assert.match(sql, /quota_reservations_active_idx/);
});

test('VT-029 scan lifecycle enforces processing to terminal transition', () => {
  const sql = read('202607100003_scan_lifecycle.sql');
  assert.match(sql, /where id=target_scan_id and status='processing'/);
  assert.match(sql, /report_snapshot/);
  assert.match(sql, /outbox_events/);
});

