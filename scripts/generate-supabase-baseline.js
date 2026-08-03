const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const snapshotPath = process.argv[2];
const outputRoot = path.resolve(process.argv[3] || path.join(__dirname, '..', 'supabase'));

if (!snapshotPath) {
  console.error('Usage: node scripts/generate-supabase-baseline.js <snapshot.json> [output-directory]');
  process.exit(1);
}

const source = fs.readFileSync(path.resolve(snapshotPath), 'utf8');
const snapshot = JSON.parse(source);
const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
const generatedAt = snapshot.snapshot_metadata?.generated_at || 'unknown';
const ownedSchemas = new Set(['public', 'veritrust_private']);
const migrationsDir = path.join(outputRoot, 'migrations');

function fail(message) {
  throw new Error(`Unsafe or incomplete schema snapshot: ${message}`);
}

if (snapshot.snapshot_metadata?.read_only !== true) fail('read_only must be true');
if (snapshot.snapshot_metadata?.contains_auth_users !== false) fail('auth users must be excluded');
if (snapshot.snapshot_metadata?.contains_table_rows !== false) fail('table rows must be excluded');
if (snapshot.snapshot_metadata?.contains_vault_secret_values !== false) fail('Vault values must be excluded');
if (!Array.isArray(snapshot.columns) || !Array.isArray(snapshot.constraints)) fail('columns or constraints are missing');

const credentialSignals = [
  /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/u,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/u,
  /\bhf_[A-Za-z0-9]{24,}\b/u,
  /\bsbp_[A-Za-z0-9]{24,}\b/u,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/u,
  /\bwhsec_[A-Za-z0-9]{16,}\b/u,
  /\bnpm_[A-Za-z0-9]{30,}\b/u,
  /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u,
];
if (credentialSignals.some((pattern) => pattern.test(source))) fail('a credential-shaped value was detected');

fs.mkdirSync(migrationsDir, { recursive: true });

const qi = (value) => `"${String(value).replaceAll('"', '""')}"`;
const ql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const fq = (schema, name) => `${qi(schema)}.${qi(name)}`;
const header = (title) => [
  `-- ${title}`,
  `-- Generated from the read-only VeriTrust schema snapshot (${generatedAt}).`,
  `-- Snapshot SHA-256: ${sourceSha256}`,
  '-- Apply only to a fresh Supabase project. Never apply this baseline over production.',
  '',
  'set check_function_bodies = on;',
  "set search_path = public, extensions, pg_catalog;",
  '',
].join('\n');

const outputs = new Map();
function add(name, title, blocks) {
  const content = `${header(title)}${blocks.filter(Boolean).join('\n\n')}\n`;
  const target = path.join(migrationsDir, name);
  fs.writeFileSync(target, content);
  outputs.set(path.relative(outputRoot, target).replaceAll('\\', '/'), content);
}

const extensionStatements = [
  'create schema if not exists extensions;',
  'create schema if not exists pgmq;',
  'create schema if not exists vault;',
  'create schema if not exists veritrust_private;',
  '',
  'create extension if not exists pgcrypto with schema extensions;',
  'create extension if not exists "uuid-ossp" with schema extensions;',
  'create extension if not exists pgmq with schema pgmq;',
  'create extension if not exists pg_net;',
  'create extension if not exists pg_cron;',
  'create extension if not exists supabase_vault with schema vault;',
  'create extension if not exists pg_stat_statements with schema extensions;',
].join('\n');
add('20260803102851_prerequisites.sql', 'VeriTrust platform prerequisites', [extensionStatements]);

const enums = snapshot.enum_types
  .filter((item) => item.schema === 'public')
  .sort((a, b) => a.name.localeCompare(b.name));
const enumSql = enums.map((item) => {
  const labels = item.labels.map(ql).join(', ');
  const comment = item.comment ? `\ncomment on type ${fq(item.schema, item.name)} is ${ql(item.comment)};` : '';
  return `create type ${fq(item.schema, item.name)} as enum (${labels});${comment}`;
});
add('20260803102852_types.sql', 'VeriTrust application enum types', enumSql);

const publicTables = snapshot.relations
  .filter((item) => item.schema === 'public' && item.kind === 'table')
  .sort((a, b) => a.name.localeCompare(b.name));
const columnsByTable = new Map();
for (const column of snapshot.columns.filter((item) => item.schema === 'public')) {
  const list = columnsByTable.get(column.relation) || [];
  list.push(column);
  columnsByTable.set(column.relation, list);
}

const tableSql = publicTables.map((table) => {
  const columns = (columnsByTable.get(table.name) || []).sort((a, b) => a.ordinal - b.ordinal);
  if (!columns.length) fail(`public.${table.name} has no columns`);
  const definitions = columns.map((column) => {
    const parts = [`  ${qi(column.column)} ${column.data_type}`];
    if (column.collation && column.collation !== 'pg_catalog.default') parts.push(`collate ${column.collation}`);
    if (column.generated) parts.push(`generated always as (${column.generated}) stored`);
    else if (column.identity) parts.push(`generated ${column.identity} as identity`);
    else if (column.default_expression !== null) parts.push(`default ${column.default_expression}`);
    if (column.not_null) parts.push('not null');
    return parts.join(' ');
  });
  const comments = [];
  if (table.comment) comments.push(`comment on table ${fq('public', table.name)} is ${ql(table.comment)};`);
  for (const column of columns.filter((item) => item.comment)) {
    comments.push(`comment on column ${fq('public', table.name)}.${qi(column.column)} is ${ql(column.comment)};`);
  }
  return `create table ${fq('public', table.name)} (\n${definitions.join(',\n')}\n);${comments.length ? `\n${comments.join('\n')}` : ''}`;
});
add('20260803102853_tables.sql', 'VeriTrust application tables', tableSql);

const constraintOrder = new Map([['primary_key', 0], ['unique', 1], ['check', 2], ['exclusion', 3], ['foreign_key', 4]]);
const constraints = snapshot.constraints
  .filter((item) => item.schema === 'public' && item.relation)
  .sort((a, b) => (constraintOrder.get(a.type) ?? 9) - (constraintOrder.get(b.type) ?? 9)
    || a.relation.localeCompare(b.relation) || a.name.localeCompare(b.name));
const constraintSql = constraints.map((item) => {
  const validation = item.validated === false && item.type !== 'primary_key' && item.type !== 'unique' ? ' not valid' : '';
  return `alter table ${fq('public', item.relation)} add constraint ${qi(item.name)} ${item.definition}${validation};`;
});
add('20260803102854_constraints.sql', 'VeriTrust table constraints', constraintSql);

const constraintIndexes = new Set(constraints
  .filter((item) => ['primary_key', 'unique', 'exclusion'].includes(item.type))
  .map((item) => item.name));
const indexes = snapshot.indexes
  .filter((item) => item.schema === 'public' && item.live && item.valid && item.ready && !constraintIndexes.has(item.index))
  .sort((a, b) => a.index.localeCompare(b.index));
const indexSql = indexes.map((item) => `${item.definition.replace(/;\s*$/u, '')};`);
add('20260803102855_indexes.sql', 'VeriTrust supporting indexes', indexSql);

const bucketSql = (snapshot.storage_buckets_without_owner_ids || [])
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((bucket) => `insert into storage.buckets (id, name, type, public, file_size_limit, allowed_mime_types, avif_autodetection)\nvalues (${ql(bucket.id)}, ${ql(bucket.name)}, ${ql(bucket.type)}, ${bucket.public}, ${bucket.file_size_limit ?? 'null'}, ${bucket.allowed_mime_types ? `array[${bucket.allowed_mime_types.map(ql).join(', ')}]::text[]` : 'null'}, ${bucket.avif_autodetection ?? false})\non conflict (id) do update set\n  name = excluded.name,\n  type = excluded.type,\n  public = excluded.public,\n  file_size_limit = excluded.file_size_limit,\n  allowed_mime_types = excluded.allowed_mime_types,\n  avif_autodetection = excluded.avif_autodetection;`);
const queueNames = [...new Set(snapshot.relations
  .filter((item) => item.schema === 'pgmq' && item.kind === 'table' && /^q_gateway_[a-z_]+$/u.test(item.name))
  .map((item) => item.name.slice(2)))].sort();
const queueSql = queueNames.map((queue) => `select pgmq.create(${ql(queue)})\nwhere not exists (select 1 from pgmq.meta where queue_name = ${ql(queue)});`);
add('20260803102856_storage_and_queues.sql', 'VeriTrust private Storage buckets and PGMQ queues', [...bucketSql, ...queueSql]);

const routines = snapshot.routines_and_rpcs
  .filter((item) => ownedSchemas.has(item.schema))
  .sort((a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name));
const routineNames = new Map(routines.map((item) => [`${item.schema}.${item.name}`, item]));
const remaining = new Map(routineNames);
const orderedRoutines = [];
while (remaining.size) {
  const ready = [...remaining.entries()].filter(([, routine]) => {
    const dependencies = [...remaining.keys()].filter((key) => key !== `${routine.schema}.${routine.name}`
      && new RegExp(`\\b${key.replace('.', '\\.') }\\s*\\(`, 'u').test(routine.definition));
    return dependencies.length === 0;
  });
  const batch = ready.length ? ready : [[...remaining.entries()][0]];
  for (const [key, routine] of batch) {
    orderedRoutines.push(routine);
    remaining.delete(key);
  }
}
const routineSql = orderedRoutines.map((item) => {
  const definition = item.definition.replace(/;?\s*$/u, ';');
  return item.comment
    ? `${definition}\ncomment on function ${fq(item.schema, item.name)}(${item.identity_arguments}) is ${ql(item.comment)};`
    : definition;
});
add('20260803102857_routines.sql', 'VeriTrust functions and RPCs', routineSql);

const views = snapshot.views
  .filter((item) => item.schema === 'public')
  .sort((a, b) => a.view.localeCompare(b.view));
const viewSql = views.map((item) => {
  const options = item.options?.length ? ` with (${item.options.join(', ')})` : '';
  return `create view ${fq(item.schema, item.view)}${options} as\n${item.definition.replace(/;\s*$/u, '')};`;
});
const triggerSql = snapshot.triggers
  .filter((item) => item.schema === 'public')
  .sort((a, b) => a.relation.localeCompare(b.relation) || a.trigger.localeCompare(b.trigger))
  .map((item) => {
    const qualified = item.definition.replace(new RegExp(`\\bON\\s+${item.relation}\\b`, 'u'), `ON ${fq('public', item.relation)}`);
    return `${qualified.replace(/;\s*$/u, '')};`;
  });
const eventTriggerSql = snapshot.event_triggers
  .filter((item) => item.owner === 'postgres' && item.function.startsWith('veritrust_private.'))
  .map((item) => {
    const tags = item.tags?.length ? `\nwhen tag in (${item.tags.map(ql).join(', ')})` : '';
    return `create event trigger ${qi(item.name)}\non ${item.event}${tags}\nexecute function ${item.function};`;
  });
add('20260803102858_views_and_triggers.sql', 'VeriTrust views, row triggers, and DDL guard', [...viewSql, ...triggerSql, ...eventTriggerSql]);

const rlsSql = publicTables.flatMap((table) => {
  const relation = snapshot.relations.find((item) => item.schema === 'public' && item.name === table.name);
  const statements = [];
  statements.push(`alter table ${fq('public', table.name)} ${relation.rls_enabled ? 'enable' : 'disable'} row level security;`);
  if (relation.rls_forced) statements.push(`alter table ${fq('public', table.name)} force row level security;`);
  return statements;
});
const policySql = snapshot.rls_policies
  .filter((item) => ['public', 'storage'].includes(item.schema))
  .sort((a, b) => a.schema.localeCompare(b.schema) || a.table.localeCompare(b.table) || a.policy.localeCompare(b.policy))
  .map((item) => {
    const roles = item.roles.map((role) => role.toLowerCase() === 'public' ? 'public' : qi(role)).join(', ');
    const using = item.using_expression ? `\nusing (${item.using_expression})` : '';
    const check = item.with_check_expression ? `\nwith check (${item.with_check_expression})` : '';
    return `create policy ${qi(item.policy)}\non ${fq(item.schema, item.table)}\nas ${item.permissive}\nfor ${item.command}\nto ${roles}${using}${check};`;
  });
add('20260803102859_rls_policies.sql', 'VeriTrust row-level security and Storage policies', [...rlsSql, ...policySql]);

const schemaGrantSql = [
  'revoke create on schema public from public, anon, authenticated, service_role;',
  'grant usage on schema public to public, anon, authenticated, service_role;',
  'revoke all on schema veritrust_private from public, anon, authenticated, service_role;',
  'revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;',
  'revoke execute on all functions in schema public from public, anon, authenticated, service_role;',
  'revoke execute on all functions in schema veritrust_private from public, anon, authenticated, service_role;',
];
const tableGrants = snapshot.table_grants
  .filter((item) => item.schema === 'public' && !['postgres'].includes(item.grantee))
  .reduce((groups, item) => {
    const key = `${item.table}|${item.grantee}|${item.is_grantable}`;
    const group = groups.get(key) || { ...item, privileges: [] };
    group.privileges.push(item.privilege);
    groups.set(key, group);
    return groups;
  }, new Map());
const tableGrantSql = [...tableGrants.values()]
  .sort((a, b) => a.table.localeCompare(b.table) || a.grantee.localeCompare(b.grantee))
  .map((item) => {
    const privileges = [...new Set(item.privileges)].sort();
    const completeTableSet = ['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'];
    const rendered = JSON.stringify(privileges) === JSON.stringify(completeTableSet)
      ? 'all privileges'
      : privileges.join(', ');
    return `grant ${rendered} on table ${fq('public', item.table)} to ${qi(item.grantee)}${item.is_grantable === 'YES' ? ' with grant option' : ''};`;
  });
const grantsByRoutine = new Map();
for (const grant of snapshot.routine_grants.filter((item) => ownedSchemas.has(item.schema) && item.grantee !== 'postgres')) {
  grantsByRoutine.set(`${grant.schema}.${grant.routine}|${grant.grantee}`, grant);
}
const routineGrantSql = [];
for (const [key, grant] of [...grantsByRoutine.entries()].sort()) {
  const [routineKey] = key.split('|');
  const routine = routineNames.get(routineKey);
  if (!routine) fail(`grant references missing routine ${routineKey}`);
  const grantee = grant.grantee.toUpperCase() === 'PUBLIC' ? 'public' : qi(grant.grantee);
  routineGrantSql.push(`grant execute on function ${fq(routine.schema, routine.name)}(${routine.identity_arguments}) to ${grantee}${grant.is_grantable === 'YES' ? ' with grant option' : ''};`);
}
const defaultPrivilegeSql = [
  'alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;',
  'alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;',
  'alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;',
  'alter default privileges for role postgres in schema public grant all on tables to service_role;',
  'alter default privileges for role postgres in schema public grant usage, select, update on sequences to service_role;',
  'alter default privileges for role postgres in schema public grant execute on functions to service_role;',
  'alter default privileges for role postgres in schema veritrust_private revoke all on tables from public, anon, authenticated;',
  'alter default privileges for role postgres in schema veritrust_private revoke all on sequences from public, anon, authenticated;',
  'alter default privileges for role postgres in schema veritrust_private revoke execute on functions from public, anon, authenticated;',
];
add('20260803102900_grants.sql', 'VeriTrust least-privilege grants and safe defaults', [...schemaGrantSql, ...tableGrantSql, ...routineGrantSql, ...defaultPrivilegeSql]);

const seed = `-- Deterministic, non-production seed data for local and staging smoke tests.\n-- No user, billing, provider credential, or production configuration data is included.\n\ninsert into public.plans (id, code, name, monthly_scan_limit, daily_scan_limit)\nvalues ('00000000-0000-4000-8000-000000000001', 'development', 'Development', 100, 25)\non conflict (code) do nothing;\n\n-- Runtime provider paths remain server-only environment configuration. These\n-- rows provide stable application keys and foreign-key targets only.\ninsert into public.model_catalog (key, scan_type, display_name, provider, provider_model, is_active, is_default, metadata)\nvalues\n  ('pixel', 'deepfake', 'VeriTrust Pixel', 'hf-inference', 'deepfake_pixel', true, true, '{\"runtime_configured\":true}'::jsonb),\n  ('prism', 'deepfake', 'VeriTrust Prism', 'hf-inference', 'deepfake_prism', true, false, '{\"runtime_configured\":true}'::jsonb),\n  ('mailguard', 'phishing', 'VeriTrust MailGuard', 'hf-inference', 'phishing_mailguard', true, true, '{\"runtime_configured\":true}'::jsonb),\n  ('cortex', 'phishing', 'VeriTrust Cortex', 'featherless-ai', 'phishing_cortex', true, false, '{\"runtime_configured\":true}'::jsonb),\n  ('swift', 'link', 'VeriTrust Swift', 'hf-inference', 'link_swift', true, true, '{\"runtime_configured\":true}'::jsonb)\non conflict (key) do update set\n  scan_type = excluded.scan_type,\n  display_name = excluded.display_name,\n  provider = excluded.provider,\n  provider_model = excluded.provider_model,\n  is_active = excluded.is_active,\n  is_default = excluded.is_default,\n  metadata = excluded.metadata;\n`;
const seedPath = path.join(outputRoot, 'seed.sql');
fs.writeFileSync(seedPath, seed);
outputs.set(path.relative(outputRoot, seedPath).replaceAll('\\', '/'), seed);

const manifest = {
  format: 1,
  generated_at: generatedAt,
  snapshot_sha256: sourceSha256,
  source_safety: {
    read_only: true,
    auth_users_included: false,
    table_rows_included: false,
    vault_values_included: false,
  },
  owned_schemas: [...ownedSchemas],
  prerequisites: ['auth', 'storage', 'vault', 'net', 'pgmq', 'cron', 'extensions'],
  counts: {
    public_tables: publicTables.length,
    public_columns: snapshot.columns.filter((item) => item.schema === 'public').length,
    public_enums: enums.length,
    public_constraints: constraints.length,
    public_indexes: indexes.length,
    owned_routines: routines.length,
    public_views: views.length,
    public_triggers: triggerSql.length,
    public_and_storage_policies: policySql.length,
    storage_buckets: bucketSql.length,
    pgmq_queues: queueNames.length,
  },
  runtime_configuration_required: [
    'Vault secret veritrust_gateway_worker_url',
    'Vault secret veritrust_gateway_dispatch_secret',
    'Cron job veritrust-gateway-recovery command body',
  ],
  files: Object.fromEntries([...outputs.entries()].map(([name, content]) => [name, {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: Buffer.byteLength(content),
  }])),
};
fs.writeFileSync(path.join(outputRoot, 'schema-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${outputs.size} baseline files in ${outputRoot}`);
console.log(JSON.stringify(manifest.counts));
