-- VeriTrust production Supabase security audit (read-only).
-- Run in the Supabase SQL Editor after every schema migration.

-- 1. Every API-exposed table should have RLS enabled.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname in ('public', 'storage')
  and not c.relrowsecurity
order by 1, 2;

-- 2. Review policies granted to anonymous users or written as unconditional access.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname in ('public', 'storage')
  and (
    roles && array['public', 'anon']::name[]
    or coalesce(qual, '') in ('true', '(true)')
    or coalesce(with_check, '') in ('true', '(true)')
  )
order by 1, 2, 3;

-- 3. SECURITY DEFINER functions require a fixed search_path and manual review.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1
    from unnest(coalesce(p.proconfig, '{}'::text[])) as setting
    where replace(setting, '"', '') = 'search_path='
  )
order by 1, 2, 3;

-- 4. No public function should remain executable by PUBLIC or anon.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('public', p.oid, 'execute') as public_can_execute,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    has_function_privilege('public', p.oid, 'execute')
    or has_function_privilege('anon', p.oid, 'execute')
  )
order by 1, 2, 3;

-- 5. Views in exposed schemas should use security_invoker where supported.
select
  n.nspname as schema_name,
  c.relname as view_name,
  c.reloptions
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v', 'm')
  and n.nspname = 'public'
  and not coalesce(c.reloptions, '{}'::text[]) && array['security_invoker=true']::text[]
order by 1, 2;

-- 6. Server-owned tables must not be directly writable from browser roles.
select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and (
    table_name like 'gateway_%'
    or table_name in (
      'api_keys',
      'api_rate_limits',
      'api_usage_events',
      'billing_customers',
      'billing_events',
      'organization_subscriptions'
    )
  )
group by 1, 2, 3
order by 1, 2, 3;

-- 7. All VeriTrust content buckets should remain private.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('scan-uploads', 'scan-crops', 'avatars', 'exports')
  and public;
