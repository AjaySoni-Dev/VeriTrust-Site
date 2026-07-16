-- VeriTrust production dashboard consolidation migration
-- Generated from the live Supabase diagnostic captured 2026-07-12.
-- Run the complete script in Supabase SQL Editor as a role that owns public objects.
-- The first transaction commits the enum value before the second transaction uses it.

begin;
alter type public.scan_type add value if not exists 'link';
commit;

begin;

-- ---------------------------------------------------------------------------
-- 1. Forward-compatible profile and usage schema
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists username text,
  add column if not exists avatar_updated_at timestamptz;

alter table public.user_usage_daily
  add column if not exists link_count integer not null default 0;

alter table public.usage_monthly
  add column if not exists web_link_count integer not null default 0,
  add column if not exists api_link_count integer not null default 0;

alter table public.plans
  add column if not exists updated_at timestamptz not null default now();

alter table public.model_catalog
  add column if not exists updated_at timestamptz not null default now();

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_username_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_username_format_check
      check (username is null or username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$')
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_usage_daily'::regclass
      and conname = 'user_usage_daily_nonnegative_check'
  ) then
    alter table public.user_usage_daily
      add constraint user_usage_daily_nonnegative_check
      check (
        deepfake_count >= 0 and phishing_count >= 0
        and link_count >= 0 and api_count >= 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.usage_monthly'::regclass
      and conname = 'usage_monthly_nonnegative_check'
  ) then
    alter table public.usage_monthly
      add constraint usage_monthly_nonnegative_check
      check (
        web_deepfake_count >= 0 and web_phishing_count >= 0
        and web_link_count >= 0 and api_deepfake_count >= 0
        and api_phishing_count >= 0 and api_link_count >= 0
        and api_usage_count >= 0 and storage_bytes >= 0
        and overage_count >= 0
      ) not valid;
  end if;
end
$migration$;

alter table public.profiles validate constraint profiles_username_format_check;
alter table public.user_usage_daily validate constraint user_usage_daily_nonnegative_check;
alter table public.usage_monthly validate constraint usage_monthly_nonnegative_check;

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null;

-- ---------------------------------------------------------------------------
-- 2. Repair legacy accounts and normalize link history/usage
-- ---------------------------------------------------------------------------

insert into public.plans (code, name, monthly_scan_limit, daily_scan_limit, is_public, sort_order)
values ('free', 'Free', 100, 25, true, 10)
on conflict (code) do nothing;

insert into public.profiles (id, full_name)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email)
from auth.users u
on conflict (id) do nothing;

insert into public.organizations (plan_id, name, slug, created_by)
select
  p.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'workspace_name', ''),
    split_part(coalesce(u.email, 'workspace'), '@', 1) || '''s Workspace'
  ),
  'org-' || replace(u.id::text, '-', ''),
  u.id
from auth.users u
cross join lateral (
  select id from public.plans where code = 'free' limit 1
) p
where not exists (
  select 1
  from public.organization_members om
  where om.user_id = u.id
    and om.status = 'active'
)
on conflict (slug) do nothing;

insert into public.organization_members (org_id, user_id, role, status)
select o.id, o.created_by, 'owner', 'active'
from public.organizations o
where o.slug = 'org-' || replace(o.created_by::text, '-', '')
  and not exists (
    select 1
    from public.organization_members om
    where om.org_id = o.id and om.user_id = o.created_by
  )
on conflict (org_id, user_id) do update
set role = 'owner', status = 'active', updated_at = now();

update public.profiles p
set default_org_id = (
  select om.org_id
  from public.organization_members om
  where om.user_id = p.id and om.status = 'active'
  order by
    case om.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    om.created_at
  limit 1
)
where p.default_org_id is null
   or not exists (
     select 1
     from public.organization_members current_membership
     where current_membership.org_id = p.default_org_id
       and current_membership.user_id = p.id
       and current_membership.status = 'active'
   );

-- Move compatibility-tagged link scans into the native enum value.
update public.scans
set scan_type = 'link'::public.scan_type
where scan_type <> 'link'::public.scan_type
  and (
    metadata ->> 'logical_scan_type' = 'link'
    or metadata ->> 'original_scan_type' = 'link'
  );

-- Move legacy daily link usage out of the phishing bucket once only.
with daily_link_scans as (
  select
    s.org_id,
    s.user_id,
    s.created_at::date as usage_date,
    count(*)::integer as link_units
  from public.scans s
  where s.scan_type = 'link'::public.scan_type
    and s.user_id is not null
  group by s.org_id, s.user_id, s.created_at::date
)
update public.user_usage_daily u
set
  link_count = least(u.phishing_count, d.link_units),
  phishing_count = greatest(u.phishing_count - least(u.phishing_count, d.link_units), 0),
  updated_at = now()
from daily_link_scans d
where u.org_id = d.org_id
  and u.user_id = d.user_id
  and u.usage_date = d.usage_date
  and u.link_count = 0
  and u.phishing_count > 0;

-- Prefer immutable usage events for monthly reconciliation; use saved scans
-- only when older deployments did not yet create usage_events.
with event_link_usage as (
  select
    ue.org_id,
    date_trunc('month', ue.created_at)::date as month_start,
    sum(ue.units) filter (where ue.source = 'web')::integer as web_units,
    sum(ue.units) filter (where ue.source = 'api')::integer as api_units
  from public.usage_events ue
  where ue.status = 'success'
    and (
      ue.scan_type::text = 'link'
      or ue.metadata ->> 'logical_scan_type' = 'link'
      or ue.metadata ->> 'original_scan_type' = 'link'
    )
  group by ue.org_id, date_trunc('month', ue.created_at)::date
),
scan_link_usage as (
  select
    s.org_id,
    date_trunc('month', s.created_at)::date as month_start,
    count(*) filter (where s.source = 'web')::integer as web_units,
    count(*) filter (where s.source = 'api')::integer as api_units
  from public.scans s
  where s.scan_type = 'link'::public.scan_type
  group by s.org_id, date_trunc('month', s.created_at)::date
),
resolved_link_usage as (
  select
    coalesce(e.org_id, s.org_id) as org_id,
    coalesce(e.month_start, s.month_start) as month_start,
    coalesce(e.web_units, s.web_units, 0) as web_units,
    coalesce(e.api_units, s.api_units, 0) as api_units
  from event_link_usage e
  full join scan_link_usage s
    on s.org_id = e.org_id and s.month_start = e.month_start
)
update public.usage_monthly u
set
  web_link_count = least(u.web_phishing_count, r.web_units),
  web_phishing_count = greatest(
    u.web_phishing_count - least(u.web_phishing_count, r.web_units), 0
  ),
  api_link_count = least(u.api_phishing_count, r.api_units),
  api_phishing_count = greatest(
    u.api_phishing_count - least(u.api_phishing_count, r.api_units), 0
  ),
  updated_at = now()
from resolved_link_usage r
where u.org_id = r.org_id
  and u.month_start = r.month_start
  and u.web_link_count = 0
  and u.api_link_count = 0;

insert into public.model_catalog (
  key, scan_type, display_name, provider, provider_model,
  is_active, is_default, fallback_key, metadata
)
values (
  'swift', 'link', 'VeriTrust Swift', 'huggingface',
  'VeriTrust/Swift-Link-Intelligence', true, true, null,
  jsonb_build_object('tier', 'fast')
)
on conflict (key) do update set
  scan_type = excluded.scan_type,
  display_name = excluded.display_name,
  is_active = excluded.is_active,
  is_default = excluded.is_default,
  updated_at = now();

insert into public.model_catalog (
  key, scan_type, display_name, provider, provider_model,
  is_active, is_default, fallback_key, metadata
)
values (
  'sentinel', 'link', 'VeriTrust Sentinel', 'huggingface',
  'VeriTrust/Sentinel-Link-Intelligence', false, false, 'swift',
  jsonb_build_object('tier', 'priority', 'coming_soon', true)
)
on conflict (key) do update set
  scan_type = excluded.scan_type,
  display_name = excluded.display_name,
  fallback_key = excluded.fallback_key,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Dashboard and operational indexes
-- ---------------------------------------------------------------------------

-- Redundant with the unique api_keys_key_hash_key index from the live schema.
drop index if exists public.api_keys_key_hash_idx;

create index if not exists organization_subscriptions_org_created_idx
  on public.organization_subscriptions (org_id, created_at desc);

create index if not exists api_keys_dashboard_idx
  on public.api_keys (org_id, created_by, created_at desc)
  include (status, last_used_at, usage_limit_daily, masked_key);

create index if not exists usage_events_org_month_idx
  on public.usage_events (org_id, created_at desc)
  include (source, scan_type, status, units);

create unique index if not exists usage_events_org_request_key
  on public.usage_events (org_id, request_id)
  where request_id is not null;

create index if not exists feedback_scan_created_idx
  on public.feedback (scan_id, created_at desc);

create index if not exists system_events_org_created_idx
  on public.system_events (org_id, created_at desc);

create index if not exists entitlement_snapshots_org_effective_idx
  on public.entitlement_snapshots (org_id, effective_from desc);

create index if not exists webhook_endpoints_org_active_idx
  on public.webhook_endpoints (org_id, is_active);

-- ---------------------------------------------------------------------------
-- 4. Consistent timestamps
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at = statement_timestamp();
  return new;
end
$function$;

alter function public.handle_new_user()
  set search_path = pg_catalog, public;
alter function public.record_audit_event(uuid, text, text, uuid, jsonb)
  set search_path = pg_catalog, public;
alter function public.create_scan_record(
  uuid, public.scan_type, public.input_kind, text, uuid, text, text, jsonb
) set search_path = pg_catalog, public;
alter function public.complete_scan_record(
  uuid, text, numeric, public.risk_level, numeric, numeric, text, jsonb, jsonb, jsonb
) set search_path = pg_catalog, public;
alter function public.fail_scan_record(uuid, text)
  set search_path = pg_catalog, public;
alter function public.consume_api_rate_limit(text, text, text, integer, jsonb)
  set search_path = pg_catalog, public;

do $triggers$
declare
  target_table text;
begin
  foreach target_table in array array[
    'plans', 'profiles', 'organizations', 'organization_members',
    'scan_projects', 'model_catalog', 'billing_customers',
    'organization_subscriptions', 'usage_monthly', 'user_usage_daily'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      target_table || '_touch_updated_at', target_table
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      target_table || '_touch_updated_at', target_table
    );
  end loop;
end
$triggers$;

-- ---------------------------------------------------------------------------
-- 5. Hardened membership helpers used by RLS
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.organization_members om
    where om.org_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$function$;

create or replace function public.has_org_role(
  target_org_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.organization_members om
    where om.org_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = any(allowed_roles)
  );
$function$;

create or replace function public.can_access_scan(target_scan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.scans s
    where s.id = target_scan_id
      and public.is_org_member(s.org_id)
  );
$function$;

create or replace function public.can_write_scan(target_scan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.scans s
    where s.id = target_scan_id
      and public.has_org_role(
        s.org_id,
        array['owner','admin','analyst']::public.app_role[]
      )
  );
$function$;

-- ---------------------------------------------------------------------------
-- 6. Native link-aware quotas and usage accounting
-- ---------------------------------------------------------------------------

create or replace function public.check_scan_quota(
  target_org_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select coalesce((
    select (
      coalesce(u.deepfake_count, 0)
      + coalesce(u.phishing_count, 0)
      + coalesce(u.link_count, 0)
      + coalesce(u.api_count, 0)
    ) < coalesce(p.daily_scan_limit, 25)
    from public.organizations o
    join public.plans p on p.id = o.plan_id
    left join public.user_usage_daily u
      on u.org_id = o.id
     and u.user_id = target_user_id
     and u.usage_date = current_date
    where o.id = target_org_id
  ), false);
$function$;

create or replace function public.increment_usage(
  target_org_id uuid,
  target_user_id uuid,
  target_scan_type public.scan_type,
  from_api boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if target_org_id is null or target_user_id is null or target_scan_type is null then
    raise exception using errcode = '22023', message = 'Usage identity and scan type are required.';
  end if;

  insert into public.user_usage_daily (
    org_id, user_id, usage_date,
    deepfake_count, phishing_count, link_count, api_count
  )
  values (
    target_org_id,
    target_user_id,
    current_date,
    case when target_scan_type = 'deepfake' then 1 else 0 end,
    case when target_scan_type = 'phishing' then 1 else 0 end,
    case when target_scan_type = 'link' then 1 else 0 end,
    case when from_api then 1 else 0 end
  )
  on conflict (org_id, user_id, usage_date) do update set
    deepfake_count = public.user_usage_daily.deepfake_count + excluded.deepfake_count,
    phishing_count = public.user_usage_daily.phishing_count + excluded.phishing_count,
    link_count = public.user_usage_daily.link_count + excluded.link_count,
    api_count = public.user_usage_daily.api_count + excluded.api_count,
    updated_at = now();
end
$function$;

create or replace function public.check_entitlement_quota(
  target_org_id uuid,
  target_user_id uuid default null,
  target_action text default 'web_scan',
  target_source text default 'web',
  target_scan_type public.scan_type default null,
  target_units integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  plan_row public.plans%rowtype;
  subscription_row public.organization_subscriptions%rowtype;
  usage_row public.usage_monthly%rowtype;
  api_keys_used integer := 0;
  web_used integer := 0;
  api_used integer := 0;
  total_used integer := 0;
  monthly_web_limit integer;
  monthly_api_limit integer;
  monthly_total_limit integer;
  max_keys integer;
  current_month date := date_trunc('month', now())::date;
begin
  if target_units < 0 then
    raise exception using errcode = '22023', message = 'Usage units cannot be negative.';
  end if;

  select p.* into plan_row
  from public.organizations o
  join public.plans p on p.id = o.plan_id
  where o.id = target_org_id;

  if not found then
    return jsonb_build_object(
      'allowed', false, 'status', 404, 'code', 'PLAN_NOT_FOUND',
      'message', 'Workspace plan was not found.'
    );
  end if;

  select os.* into subscription_row
  from public.organization_subscriptions os
  where os.org_id = target_org_id
  order by os.created_at desc
  limit 1;

  if plan_row.code <> 'free'
     and subscription_row.id is not null
     and subscription_row.status not in (
       'active', 'trialing', 'manual', 'enterprise', 'past_due_grace'
     ) then
    return jsonb_build_object(
      'allowed', false, 'status', 402, 'code', 'SUBSCRIPTION_INACTIVE',
      'message', 'Your subscription is not active.'
    );
  end if;

  select um.* into usage_row
  from public.usage_monthly um
  where um.org_id = target_org_id and um.month_start = current_month;

  web_used := coalesce(usage_row.web_deepfake_count, 0)
    + coalesce(usage_row.web_phishing_count, 0)
    + coalesce(usage_row.web_link_count, 0);
  api_used := coalesce(usage_row.api_deepfake_count, 0)
    + coalesce(usage_row.api_phishing_count, 0)
    + coalesce(usage_row.api_link_count, 0)
    + coalesce(usage_row.api_usage_count, 0);
  total_used := web_used + api_used;

  select count(*)::integer into api_keys_used
  from public.api_keys k
  where k.org_id = target_org_id and k.status = 'active';

  monthly_web_limit := coalesce(
    plan_row.monthly_web_scan_limit, plan_row.monthly_scan_limit, 100
  );
  monthly_api_limit := coalesce(plan_row.monthly_api_limit, 100);
  monthly_total_limit := coalesce(
    plan_row.monthly_total_limit,
    monthly_web_limit + monthly_api_limit
  );
  max_keys := coalesce(plan_row.max_api_keys, 0);

  if target_action in ('api_scan', 'api_usage_read', 'api_key_create')
     and not coalesce(plan_row.allow_api_access, false) then
    return jsonb_build_object(
      'allowed', false, 'status', 403, 'code', 'API_NOT_INCLUDED',
      'message', 'API access is not included in this plan.'
    );
  end if;

  if target_action = 'api_key_create' and api_keys_used + target_units > max_keys then
    return jsonb_build_object(
      'allowed', false, 'status', 403, 'code', 'API_KEY_LIMIT_REACHED',
      'message', 'Active API key limit reached.'
    );
  end if;

  if target_action = 'api_scan' and api_used + target_units > monthly_api_limit then
    return jsonb_build_object(
      'allowed', false, 'status', 429, 'code', 'MONTHLY_API_LIMIT_REACHED',
      'message', 'Monthly API limit reached.'
    );
  end if;

  if target_action = 'web_scan' and web_used + target_units > monthly_web_limit then
    return jsonb_build_object(
      'allowed', false, 'status', 429, 'code', 'MONTHLY_SCAN_LIMIT_REACHED',
      'message', 'Monthly web scan limit reached.'
    );
  end if;

  if target_action in ('web_scan', 'api_scan')
     and total_used + target_units > monthly_total_limit then
    return jsonb_build_object(
      'allowed', false, 'status', 429, 'code', 'MONTHLY_TOTAL_LIMIT_REACHED',
      'message', 'Monthly total usage limit reached.'
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'status', 200,
    'code', 'ALLOWED',
    'plan', jsonb_build_object(
      'id', plan_row.id, 'code', plan_row.code, 'name', plan_row.name
    ),
    'usage', jsonb_build_object(
      'web_used', web_used,
      'api_used', api_used,
      'total_used', total_used,
      'api_keys_used', api_keys_used
    ),
    'limits', jsonb_build_object(
      'monthly_web_scan_limit', monthly_web_limit,
      'monthly_api_limit', monthly_api_limit,
      'monthly_total_limit', monthly_total_limit,
      'daily_api_limit', coalesce(plan_row.daily_api_limit, 10),
      'max_api_keys', max_keys,
      'max_members', coalesce(plan_row.max_members, 1)
    ),
    'features', jsonb_build_object(
      'allow_api_access', coalesce(plan_row.allow_api_access, false),
      'allow_pdf_export', coalesce(plan_row.allow_pdf_export, true),
      'allow_batch_scans', coalesce(plan_row.allow_batch_scans, false),
      'allow_webhooks', coalesce(plan_row.allow_webhooks, false),
      'allow_priority_models', coalesce(plan_row.allow_priority_models, false)
    )
  );
end
$function$;

create or replace function public.record_billable_usage(
  target_org_id uuid,
  target_user_id uuid default null,
  target_source text default 'web',
  target_scan_type public.scan_type default null,
  target_endpoint text default null,
  target_status text default 'success',
  target_units integer default 1,
  target_request_id text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  current_month date := date_trunc('month', now())::date;
  web_deepfake integer := 0;
  web_phishing integer := 0;
  web_link integer := 0;
  api_deepfake integer := 0;
  api_phishing integer := 0;
  api_link integer := 0;
  api_usage integer := 0;
begin
  if target_source not in ('web', 'api') then
    raise exception using errcode = '22023', message = 'Invalid usage source.';
  end if;
  if target_units < 1 then
    raise exception using errcode = '22023', message = 'Usage units must be positive.';
  end if;

  if target_request_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(target_org_id::text || ':' || target_request_id, 0)
    );
    if exists (
      select 1 from public.usage_events ue
      where ue.org_id = target_org_id and ue.request_id = target_request_id
    ) then
      return public.check_entitlement_quota(
        target_org_id, target_user_id,
        case when target_source = 'api' then 'api_scan' else 'web_scan' end,
        target_source, target_scan_type, 0
      ) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  if target_status = 'success' then
    web_deepfake := case when target_source = 'web' and target_scan_type = 'deepfake' then target_units else 0 end;
    web_phishing := case when target_source = 'web' and target_scan_type = 'phishing' then target_units else 0 end;
    web_link := case when target_source = 'web' and target_scan_type = 'link' then target_units else 0 end;
    api_deepfake := case when target_source = 'api' and target_scan_type = 'deepfake' then target_units else 0 end;
    api_phishing := case when target_source = 'api' and target_scan_type = 'phishing' then target_units else 0 end;
    api_link := case when target_source = 'api' and target_scan_type = 'link' then target_units else 0 end;
    api_usage := case when target_source = 'api' and target_scan_type is null then target_units else 0 end;
  end if;

  insert into public.usage_events (
    org_id, user_id, source, scan_type, endpoint,
    status, units, request_id, metadata
  ) values (
    target_org_id, target_user_id, target_source, target_scan_type,
    target_endpoint, target_status, target_units, target_request_id,
    coalesce(target_metadata, '{}'::jsonb)
  );

  insert into public.usage_monthly (
    org_id, month_start,
    web_deepfake_count, web_phishing_count, web_link_count,
    api_deepfake_count, api_phishing_count, api_link_count,
    api_usage_count
  ) values (
    target_org_id, current_month,
    web_deepfake, web_phishing, web_link,
    api_deepfake, api_phishing, api_link,
    api_usage
  )
  on conflict (org_id, month_start) do update set
    web_deepfake_count = public.usage_monthly.web_deepfake_count + excluded.web_deepfake_count,
    web_phishing_count = public.usage_monthly.web_phishing_count + excluded.web_phishing_count,
    web_link_count = public.usage_monthly.web_link_count + excluded.web_link_count,
    api_deepfake_count = public.usage_monthly.api_deepfake_count + excluded.api_deepfake_count,
    api_phishing_count = public.usage_monthly.api_phishing_count + excluded.api_phishing_count,
    api_link_count = public.usage_monthly.api_link_count + excluded.api_link_count,
    api_usage_count = public.usage_monthly.api_usage_count + excluded.api_usage_count,
    updated_at = now();

  return public.check_entitlement_quota(
    target_org_id,
    target_user_id,
    case when target_source = 'api' then 'api_scan' else 'web_scan' end,
    target_source,
    target_scan_type,
    0
  ) || jsonb_build_object('duplicate', false);
end
$function$;

-- ---------------------------------------------------------------------------
-- 7. Validated self-service profile RPC (SECURITY INVOKER)
-- ---------------------------------------------------------------------------

drop function if exists public.update_my_profile(jsonb);

create function public.update_my_profile(profile_patch jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
declare
  caller uuid := auth.uid();
  normalized_name text;
  normalized_username text;
  normalized_avatar text;
  requested_org uuid;
  updated_profile public.profiles%rowtype;
begin
  if caller is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if profile_patch is null or jsonb_typeof(profile_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Profile patch must be a JSON object.';
  end if;
  if profile_patch - array['full_name','username','avatar_url','preferences','default_org_id'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Profile patch contains unsupported fields.';
  end if;

  if profile_patch ? 'full_name' then
    normalized_name := btrim(profile_patch ->> 'full_name');
    if normalized_name is null or char_length(normalized_name) not between 1 and 120 then
      raise exception using errcode = '22023', message = 'Full name must contain 1 to 120 characters.';
    end if;
  end if;

  if profile_patch ? 'username' and jsonb_typeof(profile_patch -> 'username') <> 'null' then
    normalized_username := lower(btrim(profile_patch ->> 'username'));
    if normalized_username !~ '^[a-z0-9][a-z0-9_.-]{2,31}$' then
      raise exception using errcode = '22023', message = 'Username must contain 3 to 32 lowercase letters, numbers, dots, underscores, or hyphens.';
    end if;
  end if;

  if profile_patch ? 'avatar_url' and jsonb_typeof(profile_patch -> 'avatar_url') <> 'null' then
    normalized_avatar := btrim(profile_patch ->> 'avatar_url');
    if char_length(normalized_avatar) > 512
       or normalized_avatar like '%..%'
       or normalized_avatar !~ ('^' || caller::text || '/[A-Za-z0-9_./-]+$') then
      raise exception using errcode = '22023', message = 'Avatar must be an object path inside your avatars folder.';
    end if;
  end if;

  if profile_patch ? 'preferences'
     and jsonb_typeof(profile_patch -> 'preferences') not in ('object', 'null') then
    raise exception using errcode = '22023', message = 'Preferences must be a JSON object or null.';
  end if;
  if profile_patch ? 'preferences'
     and octet_length(coalesce((profile_patch -> 'preferences')::text, '')) > 16384 then
    raise exception using errcode = '22023', message = 'Preferences exceed the 16 KB limit.';
  end if;

  if profile_patch ? 'default_org_id' then
    requested_org := nullif(profile_patch ->> 'default_org_id', '')::uuid;
    if requested_org is null or not public.is_org_member(requested_org) then
      raise exception using errcode = '42501', message = 'You cannot select that workspace.';
    end if;
  end if;

  update public.profiles p
  set
    full_name = case when profile_patch ? 'full_name' then normalized_name else p.full_name end,
    username = case
      when not (profile_patch ? 'username') then p.username
      when jsonb_typeof(profile_patch -> 'username') = 'null' then null
      else normalized_username
    end,
    avatar_url = case
      when not (profile_patch ? 'avatar_url') then p.avatar_url
      when jsonb_typeof(profile_patch -> 'avatar_url') = 'null' then null
      else normalized_avatar
    end,
    avatar_updated_at = case
      when profile_patch ? 'avatar_url' then now()
      else p.avatar_updated_at
    end,
    preferences = case
      when not (profile_patch ? 'preferences') then p.preferences
      when jsonb_typeof(profile_patch -> 'preferences') = 'null' then '{}'::jsonb
      else p.preferences || (profile_patch -> 'preferences')
    end,
    default_org_id = case
      when profile_patch ? 'default_org_id' then requested_org
      else p.default_org_id
    end
  where p.id = caller
  returning p.* into updated_profile;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found.';
  end if;

  return jsonb_build_object(
    'id', updated_profile.id,
    'full_name', updated_profile.full_name,
    'username', updated_profile.username,
    'avatar_url', updated_profile.avatar_url,
    'avatar_updated_at', updated_profile.avatar_updated_at,
    'default_org_id', updated_profile.default_org_id,
    'preferences', updated_profile.preferences,
    'updated_at', updated_profile.updated_at
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'That username is already in use.';
end
$function$;

-- ---------------------------------------------------------------------------
-- 8. One bounded dashboard RPC (SECURITY INVOKER)
-- ---------------------------------------------------------------------------

drop function if exists public.get_dashboard(uuid, integer, integer);

create function public.get_dashboard(
  target_org_id uuid default null,
  recent_limit integer default 20,
  recent_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $function$
declare
  caller uuid := auth.uid();
  selected_org_id uuid;
  bounded_limit integer := least(greatest(coalesce(recent_limit, 20), 1), 100);
  bounded_offset integer := least(greatest(coalesce(recent_offset, 0), 0), 10000);
  profile_row public.profiles%rowtype;
  organization_row public.organizations%rowtype;
  plan_row public.plans%rowtype;
  subscription_row public.organization_subscriptions%rowtype;
  usage_row public.usage_monthly%rowtype;
  daily_row public.user_usage_daily%rowtype;
  member_role public.app_role;
  member_count integer := 0;
  active_api_key_count integer := 0;
  total_scan_count bigint := 0;
  recent_scans_json jsonb := '[]'::jsonb;
  api_keys_json jsonb := '[]'::jsonb;
  current_month date := date_trunc('month', now())::date;
begin
  if caller is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select p.* into profile_row
  from public.profiles p
  where p.id = caller;

  selected_org_id := coalesce(target_org_id, profile_row.default_org_id);

  if target_org_id is null and (
    selected_org_id is null
    or not public.is_org_member(selected_org_id)
  ) then
    select om.org_id into selected_org_id
    from public.organization_members om
    where om.user_id = caller and om.status = 'active'
    order by
      case om.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      om.created_at
    limit 1;
  end if;

  if selected_org_id is null or not public.is_org_member(selected_org_id) then
    raise exception using errcode = '42501', message = 'No accessible workspace was found.';
  end if;

  select o.* into organization_row
  from public.organizations o
  join public.organization_members om
    on om.org_id = o.id
   and om.user_id = caller
   and om.status = 'active'
  where o.id = selected_org_id;

  if not found then
    raise exception using errcode = '42501', message = 'Workspace access denied.';
  end if;

  select om.role into member_role
  from public.organization_members om
  where om.org_id = selected_org_id
    and om.user_id = caller
    and om.status = 'active';

  select p.* into plan_row from public.plans p where p.id = organization_row.plan_id;

  select os.* into subscription_row
  from public.organization_subscriptions os
  where os.org_id = selected_org_id
  order by os.created_at desc
  limit 1;

  select um.* into usage_row
  from public.usage_monthly um
  where um.org_id = selected_org_id and um.month_start = current_month;

  select ud.* into daily_row
  from public.user_usage_daily ud
  where ud.org_id = selected_org_id
    and ud.user_id = caller
    and ud.usage_date = current_date;

  select count(*)::integer into member_count
  from public.organization_members om
  where om.org_id = selected_org_id and om.status = 'active';

  if member_role in ('owner', 'admin') then
    select count(*)::integer into active_api_key_count
    from public.api_keys k
    where k.org_id = selected_org_id and k.status = 'active';
  end if;

  select count(*) into total_scan_count
  from public.scans s
  where s.org_id = selected_org_id;

  with selected_scans as materialized (
    select s.*
    from public.scans s
    where s.org_id = selected_org_id
    order by s.created_at desc, s.id desc
    limit bounded_limit offset bounded_offset
  ),
  input_rows as (
    select
      si.scan_id,
      jsonb_build_object(
        'input_kind', si.input_kind,
        'text_preview', si.text_preview,
        'mime_type', si.mime_type,
        'size_bytes', si.size_bytes,
        'metadata', si.metadata
      ) as payload
    from public.scan_inputs si
    join selected_scans s on s.id = si.scan_id
  ),
  result_rows as (
    select
      sr.scan_id,
      jsonb_build_object(
        'label', sr.label,
        'confidence', sr.confidence,
        'risk_level', sr.risk_level,
        'primary_score', sr.primary_score,
        'secondary_score', sr.secondary_score,
        'explanation', sr.explanation,
        'indicators', sr.indicators,
        'raw_scores', sr.raw_scores
      ) as payload
    from public.scan_results sr
    join selected_scans s on s.id = sr.scan_id
  ),
  run_rows as (
    select
      smr.scan_id,
      jsonb_agg(
        jsonb_build_object(
          'model_key', smr.model_key,
          'provider', smr.provider,
          'provider_model', smr.provider_model,
          'status', smr.status,
          'latency_ms', smr.latency_ms,
          'error_message', smr.error_message,
          'created_at', smr.created_at
        ) order by smr.created_at, smr.id
      ) as payload
    from public.scan_model_runs smr
    join selected_scans s on s.id = smr.scan_id
    group by smr.scan_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'scan_type', case
          when s.metadata ->> 'logical_scan_type' = 'link' then 'link'
          else s.scan_type::text
        end,
        'status', s.status,
        'selected_model_key', s.selected_model_key,
        'fallback_model_key', s.fallback_model_key,
        'final_label', s.final_label,
        'confidence', s.confidence,
        'risk_level', s.risk_level,
        'metadata', s.metadata,
        'created_at', s.created_at,
        'completed_at', s.completed_at,
        'error_message', s.error_message,
        'scan_inputs', i.payload,
        'scan_results', r.payload,
        'scan_model_runs', coalesce(m.payload, '[]'::jsonb)
      ) order by s.created_at desc, s.id desc
    ),
    '[]'::jsonb
  ) into recent_scans_json
  from selected_scans s
  left join input_rows i on i.scan_id = s.id
  left join result_rows r on r.scan_id = s.id
  left join run_rows m on m.scan_id = s.id;

  if member_role in ('owner', 'admin') then
    with owned_keys as materialized (
      select k.*
      from public.api_keys k
      where k.org_id = selected_org_id and k.created_by = caller
      order by k.created_at desc
      limit 100
    ),
    key_usage as (
      select
        e.api_key_id,
        count(*) filter (where e.status = 'success')::integer as used_today
      from public.api_usage_events e
      join owned_keys k on k.id = e.api_key_id
      where e.created_at >= date_trunc('day', now())
      group by e.api_key_id
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', k.id,
          'name', k.name,
          'key_prefix', k.key_prefix,
          'masked_key', k.masked_key,
          'scopes', k.scopes,
          'status', k.status,
          'usage_limit_daily', k.usage_limit_daily,
          'created_at', k.created_at,
          'last_used_at', k.last_used_at,
          'revoked_at', k.revoked_at,
          'usage', jsonb_build_object(
            'used_today', coalesce(u.used_today, 0),
            'limit_daily', k.usage_limit_daily,
            'remaining_today', greatest(k.usage_limit_daily - coalesce(u.used_today, 0), 0)
          )
        ) order by k.created_at desc
      ),
      '[]'::jsonb
    ) into api_keys_json
    from owned_keys k
    left join key_usage u on u.api_key_id = k.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'generated_at', statement_timestamp(),
    'user', jsonb_build_object(
      'id', caller,
      'email', auth.jwt() ->> 'email'
    ),
    'profile', jsonb_build_object(
      'id', profile_row.id,
      'full_name', profile_row.full_name,
      'username', profile_row.username,
      'avatar_url', profile_row.avatar_url,
      'avatar_updated_at', profile_row.avatar_updated_at,
      'default_org_id', profile_row.default_org_id,
      'preferences', profile_row.preferences,
      'created_at', profile_row.created_at,
      'updated_at', profile_row.updated_at
    ),
    'organization', jsonb_build_object(
      'id', organization_row.id,
      'plan_id', organization_row.plan_id,
      'name', organization_row.name,
      'slug', organization_row.slug,
      'created_at', organization_row.created_at,
      'updated_at', organization_row.updated_at
    ),
    'role', member_role,
    'stats', jsonb_build_object(
      'member_count', member_count,
      'api_key_count', active_api_key_count,
      'usage_today', jsonb_build_object(
        'deepfake_count', coalesce(daily_row.deepfake_count, 0),
        'phishing_count', coalesce(daily_row.phishing_count, 0),
        'link_count', coalesce(daily_row.link_count, 0),
        'api_count', coalesce(daily_row.api_count, 0)
      )
    ),
    'billing', jsonb_build_object(
      'current_month', current_month,
      'plan', jsonb_build_object(
        'id', plan_row.id,
        'code', plan_row.code,
        'name', plan_row.name,
        'currency', plan_row.currency
      ),
      'subscription', case when subscription_row.id is null then null else jsonb_build_object(
        'id', subscription_row.id,
        'status', subscription_row.status,
        'current_period_start', subscription_row.current_period_start,
        'current_period_end', subscription_row.current_period_end,
        'cancel_at_period_end', subscription_row.cancel_at_period_end,
        'trial_end', subscription_row.trial_end
      ) end,
      'usage', jsonb_build_object(
        'web_used', coalesce(usage_row.web_deepfake_count, 0)
          + coalesce(usage_row.web_phishing_count, 0)
          + coalesce(usage_row.web_link_count, 0),
        'api_used', coalesce(usage_row.api_deepfake_count, 0)
          + coalesce(usage_row.api_phishing_count, 0)
          + coalesce(usage_row.api_link_count, 0)
          + coalesce(usage_row.api_usage_count, 0),
        'api_keys_used', active_api_key_count,
        'web_by_type', jsonb_build_object(
          'deepfake', coalesce(usage_row.web_deepfake_count, 0),
          'phishing', coalesce(usage_row.web_phishing_count, 0),
          'link', coalesce(usage_row.web_link_count, 0)
        ),
        'raw', jsonb_build_object(
          'web_deepfake_count', coalesce(usage_row.web_deepfake_count, 0),
          'web_phishing_count', coalesce(usage_row.web_phishing_count, 0),
          'web_link_count', coalesce(usage_row.web_link_count, 0),
          'api_deepfake_count', coalesce(usage_row.api_deepfake_count, 0),
          'api_phishing_count', coalesce(usage_row.api_phishing_count, 0),
          'api_link_count', coalesce(usage_row.api_link_count, 0),
          'api_usage_count', coalesce(usage_row.api_usage_count, 0)
        )
      ),
      'limits', jsonb_build_object(
        'monthly_web_scan_limit', coalesce(plan_row.monthly_web_scan_limit, plan_row.monthly_scan_limit, 100),
        'monthly_api_limit', coalesce(plan_row.monthly_api_limit, 100),
        'monthly_total_limit', coalesce(
          plan_row.monthly_total_limit,
          coalesce(plan_row.monthly_web_scan_limit, plan_row.monthly_scan_limit, 100)
            + coalesce(plan_row.monthly_api_limit, 100)
        ),
        'daily_api_limit', coalesce(plan_row.daily_api_limit, 10),
        'max_api_keys', coalesce(plan_row.max_api_keys, 0),
        'max_members', coalesce(plan_row.max_members, 1),
        'retention_days', coalesce(plan_row.retention_days, plan_row.file_retention_days, 0)
      ),
      'features', jsonb_build_object(
        'allow_api_access', coalesce(plan_row.allow_api_access, false),
        'allow_pdf_export', coalesce(plan_row.allow_pdf_export, true),
        'allow_batch_scans', coalesce(plan_row.allow_batch_scans, false),
        'allow_webhooks', coalesce(plan_row.allow_webhooks, false),
        'allow_priority_models', coalesce(plan_row.allow_priority_models, false)
      )
    ),
    'scans', recent_scans_json,
    'scan_pagination', jsonb_build_object(
      'limit', bounded_limit,
      'offset', bounded_offset,
      'total', total_scan_count,
      'has_more', bounded_offset + bounded_limit < total_scan_count
    ),
    'api_keys', api_keys_json
  );
end
$function$;

comment on function public.get_dashboard(uuid, integer, integer) is
  'Returns the authenticated user dashboard in one bounded JSONB response. SECURITY INVOKER; RLS remains enforced.';
comment on function public.update_my_profile(jsonb) is
  'Safely updates the authenticated user display name, username, avatar object path, preferences, or default workspace.';

-- ---------------------------------------------------------------------------
-- 9. RLS and storage hardening
-- ---------------------------------------------------------------------------

alter table public.plans enable row level security;

drop policy if exists plans_select_public_or_member on public.plans;
create policy plans_select_public_or_member
on public.plans
for select
to anon, authenticated
using (
  is_public
  or exists (
    select 1
    from public.organizations o
    where o.plan_id = plans.id and public.is_org_member(o.id)
  )
);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Avatar object names are strictly: <auth.uid()>/<file-name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', false, 2097152,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_avatar_owner_read on storage.objects;
create policy storage_avatar_owner_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists storage_avatar_owner_write on storage.objects;
create policy storage_avatar_owner_write
on storage.objects
for all
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- 10. Least-privilege grants
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.plans to anon;

grant select on
  public.plans,
  public.profiles,
  public.organizations,
  public.organization_members,
  public.scan_projects,
  public.model_catalog,
  public.scans,
  public.scan_inputs,
  public.scan_results,
  public.scan_model_runs,
  public.stored_files,
  public.feedback,
  public.audit_logs,
  public.api_keys,
  public.api_usage_events,
  public.billing_customers,
  public.organization_subscriptions,
  public.usage_monthly,
  public.usage_events,
  public.entitlement_snapshots,
  public.user_usage_daily,
  public.system_events,
  public.webhook_endpoints,
  public.webhook_events
to authenticated;

grant update (full_name, username, avatar_url, avatar_updated_at, preferences, default_org_id)
on public.profiles to authenticated;
grant insert on public.feedback to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_org_member(uuid) to anon, authenticated;
grant execute on function public.has_org_role(uuid, public.app_role[]) to anon, authenticated;
grant execute on function public.can_access_scan(uuid) to anon, authenticated;
grant execute on function public.can_write_scan(uuid) to anon, authenticated;
grant execute on function public.create_scan_record(
  uuid, public.scan_type, public.input_kind, text, uuid, text, text, jsonb
) to authenticated;
grant execute on function public.get_dashboard(uuid, integer, integer) to authenticated;
grant execute on function public.update_my_profile(jsonb) to authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Keep service-only tables inaccessible through PostgREST user roles.
revoke all on public.api_rate_limits from anon, authenticated;
revoke all on public.billing_events from anon, authenticated;

-- Refresh the stale planner estimates observed in the diagnostic output.
analyze public.profiles;
analyze public.organizations;
analyze public.organization_members;
analyze public.scans;
analyze public.scan_inputs;
analyze public.scan_results;
analyze public.scan_model_runs;
analyze public.api_keys;
analyze public.api_usage_events;
analyze public.organization_subscriptions;
analyze public.usage_monthly;
analyze public.user_usage_daily;

commit;

-- ---------------------------------------------------------------------------
-- POST-DEPLOY VALIDATION (read-only; run after the migration)
-- ---------------------------------------------------------------------------
-- select enum_range(null::public.scan_type);
-- Replace the UUID/email below with a real test user. The transaction rolls
-- back profile changes and emulates the authenticated PostgREST JWT context.
-- begin;
-- set local role authenticated;
-- select set_config(
--   'request.jwt.claims',
--   '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated","email":"test@example.com"}',
--   true
-- );
-- select public.get_dashboard(null, 20, 0);
-- select public.update_my_profile(jsonb_build_object('full_name', 'Test Name'));
-- rollback;
-- explain (analyze, buffers, verbose)
-- select public.get_dashboard(null, 20, 0); -- run in an authenticated API session
-- select schemaname, tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname in ('public','storage')
-- order by schemaname, tablename, policyname;
-- select n.nspname, p.proname, p.prosecdef, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_execute,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
-- order by p.proname;

-- ---------------------------------------------------------------------------
-- ROLLBACK REFERENCE (intentionally commented; review before using)
-- Data written to native link counters should be preserved, so rollback does
-- not remove enum values or columns. It removes only newly introduced RPCs,
-- indexes, username constraint/index, and restores plan read behavior.
-- ---------------------------------------------------------------------------
-- begin;
-- drop function if exists public.get_dashboard(uuid, integer, integer);
-- drop function if exists public.update_my_profile(jsonb);
-- drop index if exists public.api_keys_dashboard_idx;
-- drop index if exists public.usage_events_org_month_idx;
-- drop index if exists public.usage_events_org_request_key;
-- drop index if exists public.feedback_scan_created_idx;
-- drop index if exists public.system_events_org_created_idx;
-- drop index if exists public.entitlement_snapshots_org_effective_idx;
-- drop index if exists public.webhook_endpoints_org_active_idx;
-- drop index if exists public.organization_subscriptions_org_created_idx;
-- drop index if exists public.profiles_username_lower_key;
-- alter table public.profiles drop constraint if exists profiles_username_format_check;
-- drop policy if exists plans_select_public_or_member on public.plans;
-- alter table public.plans disable row level security;
-- commit;
