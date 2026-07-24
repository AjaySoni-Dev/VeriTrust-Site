-- VeriTrust production Supabase security hardening
-- Snapshot target: the deployed schema exported in July 2026.
--
-- Run this entire file once in the Supabase SQL Editor as the postgres role.
-- It is transactional and idempotent. If a precondition or verification fails,
-- PostgreSQL rolls the whole transaction back.
--
-- Scope:
--   * application-owned objects in public and veritrust_private
--   * application-owned RLS policies on storage.objects
--   * no changes to Supabase-managed auth, realtime, vault, cron, net, pgmq,
--     graphql, extensions, or Storage table definitions

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';
set local check_function_bodies = on;

-- Prevent two operators or deployment jobs from applying this migration at
-- the same time.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('veritrust:supabase-security-hardening:2026-07', 0)
);

-- ---------------------------------------------------------------------------
-- 1. Preflight: refuse to mutate a different or incomplete schema.
-- ---------------------------------------------------------------------------

do $preflight$
declare
  missing_relations text[];
  missing_routines text[];
  missing_buckets text[];
begin
  select pg_catalog.array_agg(required_name order by required_name)
  into missing_relations
  from pg_catalog.unnest(array[
    'public.api_keys',
    'public.api_rate_limits',
    'public.api_usage_events',
    'public.gateway_artifacts',
    'public.gateway_decisions',
    'public.gateway_evidence',
    'public.gateway_integrations',
    'public.gateway_jobs',
    'public.gateway_model_health',
    'public.gateway_model_runs',
    'public.gateway_model_versions',
    'public.gateway_policies',
    'public.gateway_policy_versions',
    'public.gateway_scans',
    'public.gateway_uploads',
    'public.gateway_webhook_endpoints',
    'public.gateway_webhook_secrets',
    'public.model_catalog',
    'public.organization_members',
    'public.organizations',
    'public.plans',
    'public.profiles',
    'public.scan_inputs',
    'public.scan_model_runs',
    'public.scan_results',
    'public.scans',
    'public.user_usage_daily',
    'storage.objects',
    'storage.buckets'
  ]::text[]) as required(required_name)
  where pg_catalog.to_regclass(required_name) is null;

  if missing_relations is not null then
    raise exception
      using
        errcode = '55000',
        message = 'VeriTrust hardening preflight failed: required relations are missing.',
        detail = pg_catalog.array_to_string(missing_relations, ', ');
  end if;

  select pg_catalog.array_agg(required_name order by required_name)
  into missing_routines
  from pg_catalog.unnest(array[
    'public.is_org_member(uuid)',
    'public.has_org_role(uuid,public.app_role[])',
    'public.can_access_scan(uuid)',
    'public.can_write_scan(uuid)',
    'public.create_scan_record(uuid,public.scan_type,public.input_kind,text,uuid,text,text,jsonb)',
    'public.get_dashboard(uuid,integer,integer)',
    'public.update_my_profile(jsonb)'
  ]::text[]) as required(required_name)
  where pg_catalog.to_regprocedure(required_name) is null;

  if missing_routines is not null then
    raise exception
      using
        errcode = '55000',
        message = 'VeriTrust hardening preflight failed: required routines are missing.',
        detail = pg_catalog.array_to_string(missing_routines, ', ');
  end if;

  select pg_catalog.array_agg(required_name order by required_name)
  into missing_buckets
  from pg_catalog.unnest(array[
    'avatars',
    'exports',
    'gateway-uploads',
    'scan-crops',
    'scan-uploads'
  ]::text[]) as required(required_name)
  where not exists (
    select 1
    from storage.buckets b
    where b.id = required_name
  );

  if missing_buckets is not null then
    raise exception
      using
        errcode = '55000',
        message = 'VeriTrust hardening preflight failed: required Storage buckets are missing.',
        detail = pg_catalog.array_to_string(missing_buckets, ', ');
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. Schema boundaries and future-safe defaults.
-- ---------------------------------------------------------------------------

revoke create on schema public from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

revoke all privileges on schema veritrust_private
  from public, anon, authenticated;
revoke all privileges on all tables in schema veritrust_private
  from public, anon, authenticated;
revoke all privileges on all sequences in schema veritrust_private
  from public, anon, authenticated;
revoke execute on all functions in schema veritrust_private
  from public, anon, authenticated;

-- Objects deployed by VeriTrust are owned by postgres in the supplied catalog.
-- New objects therefore start closed to client roles and open to service_role.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

alter default privileges for role postgres in schema veritrust_private
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema veritrust_private
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema veritrust_private
  revoke execute on functions from public, anon, authenticated;

-- Supabase recommends RLS on every table in an exposed schema. This covers the
-- current schema without modifying Supabase-managed schemas.
do $enable_current_rls$
declare
  target record;
begin
  for target in
    select c.oid::pg_catalog.regclass as relation_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute pg_catalog.format(
      'alter table %s enable row level security',
      target.relation_name
    );
  end loop;
end
$enable_current_rls$;

-- Automatically protect tables created later in public, including CREATE TABLE
-- AS and SELECT INTO. This trigger does not touch any other schema.
create or replace function veritrust_private.enable_rls_on_new_public_tables()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  command record;
begin
  for command in
    select *
    from pg_catalog.pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  loop
    if command.schema_name = 'public'
       and command.object_type in ('table', 'partitioned table') then
      execute pg_catalog.format(
        'alter table %s enable row level security',
        command.objid::pg_catalog.regclass
      );
    end if;
  end loop;
end
$function$;

revoke execute
  on function veritrust_private.enable_rls_on_new_public_tables()
  from public, anon, authenticated;

drop event trigger if exists veritrust_enable_public_rls;
create event trigger veritrust_enable_public_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function veritrust_private.enable_rls_on_new_public_tables();

-- ---------------------------------------------------------------------------
-- 3. Minimize the PostgREST table surface to what this codebase actually uses.
-- ---------------------------------------------------------------------------

-- Start from a closed client surface. service_role grants are intentionally not
-- revoked; Vercel and the durable gateway worker use that role server-side.
revoke all privileges on all tables in schema public
  from public, anon, authenticated;
revoke all privileges on all sequences in schema public
  from public, anon, authenticated;

-- Public pricing/plan discovery.
grant select on table public.plans to anon, authenticated;

-- Signed-in session resolution. RLS still limits each query by user/org.
grant select on table public.profiles to authenticated;
grant select on table public.organizations to authenticated;
grant select (org_id, user_id, role, status)
  on table public.organization_members to authenticated;

-- Minimal columns required by api/_session.js workspace counters.
grant select (id, org_id, status)
  on table public.api_keys to authenticated;
grant select (
  org_id,
  user_id,
  usage_date,
  deepfake_count,
  phishing_count,
  link_count,
  api_count
)
  on table public.user_usage_daily to authenticated;

-- Minimal columns required by api/_scans.js. In particular, this withholds
-- scans.request_ip, scans.user_agent, scan_model_runs.provider_model,
-- scan_model_runs.request_metadata, and scan_model_runs.response_metadata.
grant select (
  id,
  org_id,
  scan_type,
  status,
  selected_model_key,
  final_label,
  confidence,
  risk_level,
  metadata,
  created_at,
  completed_at,
  error_message
)
  on table public.scans to authenticated;

grant select (
  scan_id,
  input_kind,
  text_preview,
  metadata
)
  on table public.scan_inputs to authenticated;

grant select (
  scan_id,
  label,
  confidence,
  risk_level,
  primary_score,
  secondary_score,
  explanation,
  indicators,
  raw_scores
)
  on table public.scan_results to authenticated;

grant select (
  scan_id,
  model_key,
  provider,
  status,
  latency_ms,
  error_message,
  created_at
)
  on table public.scan_model_runs to authenticated;

-- model_catalog contains provider_model. Gateway tables contain storage paths,
-- HMACs, policy documents, model versions, operational metrics, evidence, and
-- webhook configuration. They remain service-only and are returned to users
-- only through tenant-authorizing Vercel handlers.

-- ---------------------------------------------------------------------------
-- 4. Make RLS role targets explicit and remove unused browser mutations.
-- ---------------------------------------------------------------------------

-- Policies created without TO apply to PUBLIC. Client-facing VeriTrust policies
-- other than the public-plan policy are authenticated-only.
do $narrow_public_policies$
declare
  target record;
begin
  for target in
    select
      n.nspname as schema_name,
      c.relname as relation_name,
      p.polname as policy_name
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and 0 = any(p.polroles)
  loop
    execute pg_catalog.format(
      'alter policy %I on %I.%I to authenticated',
      target.policy_name,
      target.schema_name,
      target.relation_name
    );
  end loop;
end
$narrow_public_policies$;

-- Separate anonymous public-plan reads from signed-in tenant plan reads.
drop policy if exists plans_select_public_or_member on public.plans;
drop policy if exists plans_select_anon_public on public.plans;
drop policy if exists plans_select_authenticated on public.plans;

create policy plans_select_anon_public
  on public.plans
  for select
  to anon
  using (is_public);

create policy plans_select_authenticated
  on public.plans
  for select
  to authenticated
  using (
    is_public
    or exists (
      select 1
      from public.organizations o
      where o.plan_id = plans.id
        and public.is_org_member(o.id)
    )
  );

-- Browser writes are performed through validated RPCs or tenant-authorizing
-- Vercel handlers. Remove stale policies that could become dangerous if a broad
-- table grant were accidentally restored later.
drop policy if exists api_keys_manage_admin
  on public.api_keys;
drop policy if exists organization_members_manage_admin
  on public.organization_members;
drop policy if exists organizations_insert_owner
  on public.organizations;
drop policy if exists organizations_update_admin
  on public.organizations;
drop policy if exists profiles_update_own
  on public.profiles;
drop policy if exists scan_inputs_write_analyst
  on public.scan_inputs;
drop policy if exists scan_projects_write_analyst
  on public.scan_projects;
drop policy if exists scans_insert_analyst
  on public.scans;
drop policy if exists scans_update_analyst
  on public.scans;
drop policy if exists stored_files_write_analyst
  on public.stored_files;
drop policy if exists webhook_endpoints_manage_admin
  on public.webhook_endpoints;

-- These relations are intentionally service-only in this repository. Remove
-- their client read policies as defense in depth as well as removing grants.
drop policy if exists api_usage_events_select_owner
  on public.api_usage_events;
drop policy if exists model_catalog_read_all_authenticated
  on public.model_catalog;
drop policy if exists gateway_artifacts_member_read
  on public.gateway_artifacts;
drop policy if exists gateway_decisions_member_read
  on public.gateway_decisions;
drop policy if exists gateway_evidence_member_read
  on public.gateway_evidence;
drop policy if exists gateway_integrations_admin_read
  on public.gateway_integrations;
drop policy if exists gateway_model_health_admin_read
  on public.gateway_model_health;
drop policy if exists gateway_model_runs_member_read
  on public.gateway_model_runs;
drop policy if exists gateway_model_versions_member_read
  on public.gateway_model_versions;
drop policy if exists gateway_policies_member_read
  on public.gateway_policies;
drop policy if exists gateway_policy_activations_member_read
  on public.gateway_policy_activations;
drop policy if exists gateway_policy_versions_member_read
  on public.gateway_policy_versions;
drop policy if exists gateway_retention_receipts_admin_read
  on public.gateway_retention_receipts;
drop policy if exists gateway_review_cases_member_read
  on public.gateway_review_cases;
drop policy if exists gateway_scans_member_read
  on public.gateway_scans;
drop policy if exists gateway_usage_daily_admin_read
  on public.gateway_usage_daily;
drop policy if exists gateway_webhook_attempts_admin_read
  on public.gateway_webhook_attempts;
drop policy if exists gateway_webhook_endpoints_admin_read
  on public.gateway_webhook_endpoints;
drop policy if exists gateway_webhook_events_admin_read
  on public.gateway_webhook_events;

-- Storage policies are application-owned, but Storage tables/functions remain
-- Supabase-owned. Signed gateway uploads need no gateway-uploads client policy.
do $narrow_storage_policies$
declare
  policy_name text;
begin
  foreach policy_name in array array[
    'storage_org_admin_delete_scan_uploads',
    'storage_org_admin_update_scan_uploads',
    'storage_org_analyst_insert_scan_uploads',
    'storage_org_member_read_scan_uploads'
  ]::text[]
  loop
    if exists (
      select 1
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage'
        and c.relname = 'objects'
        and p.polname = policy_name
    ) then
      execute pg_catalog.format(
        'alter policy %I on storage.objects to authenticated',
        policy_name
      );
    end if;
  end loop;
end
$narrow_storage_policies$;

-- ---------------------------------------------------------------------------
-- 5. RPC and helper-function hardening.
-- ---------------------------------------------------------------------------

-- Both routines validate auth.uid() and tenant membership/field allowlists.
-- SECURITY DEFINER lets us revoke broad base-table reads/writes while retaining
-- the intended RPC behavior.
alter function public.get_dashboard(uuid, integer, integer)
  security definer;
alter function public.get_dashboard(uuid, integer, integer)
  set search_path = pg_catalog, public;

alter function public.update_my_profile(jsonb)
  security definer;
alter function public.update_my_profile(jsonb)
  set search_path = pg_catalog, public;

-- Reassert fixed search paths for every browser-callable definer function.
alter function public.is_org_member(uuid)
  set search_path = pg_catalog, public;
alter function public.has_org_role(uuid, public.app_role[])
  set search_path = pg_catalog, public;
alter function public.can_access_scan(uuid)
  set search_path = pg_catalog, public;
alter function public.can_write_scan(uuid)
  set search_path = pg_catalog, public;
alter function public.create_scan_record(
  uuid,
  public.scan_type,
  public.input_kind,
  text,
  uuid,
  text,
  text,
  jsonb
)
  set search_path = pg_catalog, public;

-- PostgreSQL functions are executable by PUBLIC by default. Close the schema,
-- give server code its required surface, then allow only the exact signed-in
-- RPC/helper contract used by this repository.
revoke execute on all functions in schema public
  from public, anon, authenticated;
grant execute on all functions in schema public
  to service_role;

grant execute on function public.is_org_member(uuid)
  to authenticated;
grant execute on function public.has_org_role(uuid, public.app_role[])
  to authenticated;
grant execute on function public.can_access_scan(uuid)
  to authenticated;
grant execute on function public.can_write_scan(uuid)
  to authenticated;
grant execute on function public.create_scan_record(
  uuid,
  public.scan_type,
  public.input_kind,
  text,
  uuid,
  text,
  text,
  jsonb
)
  to authenticated;
grant execute on function public.get_dashboard(uuid, integer, integer)
  to authenticated;
grant execute on function public.update_my_profile(jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Postconditions: fail closed and roll back if the result is not exact.
-- ---------------------------------------------------------------------------

do $verify$
declare
  failed_items text[];
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ) then
    raise exception
      using
        errcode = '55000',
        message = 'Verification failed: at least one public table does not have RLS enabled.';
  end if;

  select pg_catalog.array_agg(
    pg_catalog.format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid))
    order by n.nspname, p.proname
  )
  into failed_items
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'veritrust_private')
    and p.prosecdef
    and not exists (
      select 1
      from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) setting
      where setting like 'search_path=%'
    );

  if failed_items is not null then
    raise exception
      using
        errcode = '55000',
        message = 'Verification failed: SECURITY DEFINER routines lack a fixed search_path.',
        detail = pg_catalog.array_to_string(failed_items, ', ');
  end if;

  if pg_catalog.has_schema_privilege('anon', 'veritrust_private', 'USAGE')
     or pg_catalog.has_schema_privilege('authenticated', 'veritrust_private', 'USAGE') then
    raise exception
      using
        errcode = '55000',
        message = 'Verification failed: a client role can use veritrust_private.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'veritrust_private')
      and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception
      using
        errcode = '55000',
        message = 'Verification failed: anon can execute an application routine.';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.model_catalog', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.gateway_evidence', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.gateway_model_health', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.gateway_webhook_endpoints', 'SELECT') then
    raise exception
      using
        errcode = '55000',
        message = 'Verification failed: an internal model/gateway table remains directly readable.';
  end if;

  if pg_catalog.has_column_privilege(
       'authenticated',
       'public.scan_model_runs',
       'provider_model',
       'SELECT'
     )
     or pg_catalog.has_column_privilege(
       'authenticated',
       'public.scan_model_runs',
       'request_metadata',
       'SELECT'
     )
     or pg_catalog.has_column_privilege(
       'authenticated',
       'public.scan_model_runs',
       'response_metadata',
       'SELECT'
     )
     or pg_catalog.has_column_privilege(
       'authenticated',
       'public.scans',
       'request_ip',
       'SELECT'
     )
     or pg_catalog.has_column_privilege(
       'authenticated',
       'public.scans',
       'user_agent',
       'SELECT'
     ) then
    raise exception
      using
        errcode = '55000',
        message = 'Verification failed: a sensitive scan column remains directly readable.';
  end if;

  if exists (
    select 1
    from storage.buckets b
    where b.id in (
      'avatars',
      'exports',
      'gateway-uploads',
      'scan-crops',
      'scan-uploads'
    )
      and b.public
  ) then
    raise exception
      using
        errcode = '55000',
        message = 'Verification failed: a VeriTrust Storage bucket is public.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_event_trigger
    where evtname = 'veritrust_enable_public_rls'
      and evtenabled <> 'D'
  ) then
    raise exception
      using
        errcode = '55000',
        message = 'Verification failed: future-table RLS enforcement is not active.';
  end if;
end
$verify$;

commit;

-- A successful run returns one compact receipt. No secrets or row data are
-- included.
select pg_catalog.jsonb_build_object(
  'ok', true,
  'migration', 'veritrust_supabase_security_hardening_2026_07',
  'public_tables_with_rls', (
    select pg_catalog.count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  ),
  'public_buckets', (
    select pg_catalog.count(*)
    from storage.buckets b
    where b.id in (
      'avatars',
      'exports',
      'gateway-uploads',
      'scan-crops',
      'scan-uploads'
    )
      and b.public
  ),
  'future_public_table_rls_trigger', (
    select evtenabled <> 'D'
    from pg_catalog.pg_event_trigger
    where evtname = 'veritrust_enable_public_rls'
  )
) as veritrust_security_hardening_receipt;
