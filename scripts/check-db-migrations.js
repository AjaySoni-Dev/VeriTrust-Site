const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dbRoot = path.join(root, 'supabase');
const migrationsDir = path.join(dbRoot, 'migrations');
const manifestPath = path.join(dbRoot, 'schema-manifest.json');
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

check(fs.existsSync(manifestPath), 'db/schema-manifest.json is missing');
if (!fs.existsSync(manifestPath)) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const migrations = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const trackedMigrations = Object.keys(manifest.files).filter((name) => name.startsWith('migrations/')).sort();

check(manifest.format === 1, 'unsupported schema manifest format');
check(/^[a-f0-9]{64}$/u.test(manifest.snapshot_sha256), 'snapshot hash is invalid');
check(manifest.source_safety?.read_only === true, 'snapshot must be read-only');
check(manifest.source_safety?.auth_users_included === false, 'auth users must not be included');
check(manifest.source_safety?.table_rows_included === false, 'table rows must not be included');
check(manifest.source_safety?.vault_values_included === false, 'Vault values must not be included');
check(migrations.length === 10, `expected 10 migrations, found ${migrations.length}`);
check(JSON.stringify(migrations.map((name) => `migrations/${name}`)) === JSON.stringify(trackedMigrations), 'migration files do not match the manifest');
const migrationVersions = migrations.map((name) => name.split('_', 1)[0]);
check(migrationVersions.every((version) => /^\d{14}$/u.test(version)), 'every migration must start with a 14-digit timestamp');
check(new Set(migrationVersions).size === migrations.length, 'migration timestamps must be unique');
check(JSON.stringify([...migrationVersions].sort()) === JSON.stringify(migrationVersions), 'migration timestamps must increase in filename order');

for (const [relative, expected] of Object.entries(manifest.files)) {
  const absolute = path.join(dbRoot, relative);
  check(fs.existsSync(absolute), `${relative} is missing`);
  if (!fs.existsSync(absolute)) continue;
  const content = fs.readFileSync(absolute);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  check(hash === expected.sha256, `${relative} hash does not match the manifest`);
  check(content.length === expected.bytes, `${relative} byte count does not match the manifest`);
}

const sql = migrations.map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8')).join('\n');
const count = (pattern) => [...sql.matchAll(pattern)].length;
const expected = manifest.counts;

check(count(/^create table "public"\./gmu) === expected.public_tables, 'public table count differs from the snapshot');
check(count(/^create type "public"\./gmu) === expected.public_enums, 'enum count differs from the snapshot');
check(count(/^alter table "public"\..+ add constraint /gmu) === expected.public_constraints, 'constraint count differs from the snapshot');
check(count(/^create or replace function\s+(?:public|veritrust_private)\./gimu) === expected.owned_routines, 'routine count differs from the snapshot');
check(count(/^create view "public"\./gmu) === expected.public_views, 'view count differs from the snapshot');
check(count(/^CREATE TRIGGER /gmu) === expected.public_triggers, 'trigger count differs from the snapshot');
check(count(/^create policy /gmu) === expected.public_and_storage_policies, 'policy count differs from the snapshot');
check(count(/^insert into storage\.buckets /gmu) === expected.storage_buckets, 'Storage bucket count differs from the snapshot');
check(count(/^select pgmq\.create\(/gmu) === expected.pgmq_queues, 'PGMQ queue count differs from the snapshot');
check(count(/^alter table "public"\..+ enable row level security;/gmu) === expected.public_tables, 'every public table must enable RLS');

check(!/^create table "(?:auth|storage|vault|net|cron|pgmq)"\./mu.test(sql), 'baseline attempts to own a Supabase-managed table');
check(!/\bdrop\s+(?:table|schema|database)\b/iu.test(sql), 'destructive DROP statement found');
check(!/^\s*truncate\s+/imu.test(sql), 'TRUNCATE statement found');
check(!/\bdelete\s+from\b/iu.test(sql), 'DELETE statement found');
check(sql.includes('create event trigger "veritrust_enable_public_rls"'), 'future-table RLS event trigger is missing');
check(sql.includes('revoke create on schema public'), 'public schema CREATE revocation is missing');

if (errors.length) {
  console.error('Database baseline validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Database baseline validated: ${migrations.length} migrations, ${expected.public_tables} tables, ${expected.owned_routines} routines, ${expected.public_and_storage_policies} policies.`);
