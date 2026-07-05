-- VeriTrust Supabase Production Schema
-- Run this in the Supabase SQL editor after creating the project.
-- This script creates app tables, functions, triggers, RLS policies, and Storage buckets.

begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('owner', 'admin', 'analyst', 'viewer');
create type public.member_status as enum ('active', 'invited', 'removed');
create type public.scan_type as enum ('deepfake', 'phishing');
create type public.scan_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');
create type public.input_kind as enum ('image', 'text', 'url', 'email', 'sms', 'mixed');
create type public.risk_level as enum ('low', 'medium', 'high', 'unknown');
create type public.retention_policy as enum ('none', 'metadata_only', 'temporary_file', 'retained_file');
create type public.api_key_status as enum ('active', 'revoked');
create type public.webhook_delivery_status as enum ('pending', 'delivered', 'failed');

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  monthly_scan_limit integer not null default 100,
  daily_scan_limit integer not null default 25,
  max_members integer not null default 1,
  max_api_keys integer not null default 0,
  file_retention_days integer not null default 0,
  allow_file_retention boolean not null default false,
  allow_api_access boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.plans
  (code, name, monthly_scan_limit, daily_scan_limit, max_members, max_api_keys, file_retention_days, allow_file_retention, allow_api_access)
values
  ('free', 'Free', 100, 25, 1, 0, 0, false, false),
  ('pro', 'Pro', 5000, 500, 10, 5, 30, true, true),
  ('enterprise', 'Enterprise', 1000000, 100000, 500, 100, 365, true, true)
on conflict (code) do update set
  name = excluded.name,
  monthly_scan_limit = excluded.monthly_scan_limit,
  daily_scan_limit = excluded.daily_scan_limit,
  max_members = excluded.max_members,
  max_api_keys = excluded.max_api_keys,
  file_retention_days = excluded.file_retention_days,
  allow_file_retention = excluded.allow_file_retention,
  allow_api_access = excluded.allow_api_access;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  default_org_id uuid,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_default_org_id_fkey
  foreign key (default_org_id) references public.organizations(id) on delete set null;

create table public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'viewer',
  status public.member_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.scan_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete set null,
  name text not null,
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.model_catalog (
  key text primary key,
  scan_type public.scan_type not null,
  display_name text not null,
  provider text not null,
  provider_model text not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  fallback_key text references public.model_catalog(key),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.model_catalog
  (key, scan_type, display_name, provider, provider_model, is_default, fallback_key)
values
  ('pixel', 'deepfake', 'VeriTrust Pixel', 'hf-inference', 'Wvolf/ViT_Deepfake_Detection', false, 'prism'),
  ('prism', 'deepfake', 'VeriTrust Prism', 'hf-inference', 'dima806/deepfake_vs_real_image_detection', true, 'pixel'),
  ('mailguard', 'phishing', 'VeriTrust MailGuard', 'hf-inference', 'cybersectony/phishing-email-detection-distilbert_v2.4.1', false, 'cortex'),
  ('cortex', 'phishing', 'VeriTrust Cortex', 'featherless-ai', 'odedovadia/Llama-3.2-1B-Instruct-phishing-detection', true, 'mailguard')
on conflict (key) do update set
  display_name = excluded.display_name,
  provider = excluded.provider,
  provider_model = excluded.provider_model,
  is_default = excluded.is_default,
  fallback_key = excluded.fallback_key;

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.scan_projects(id) on delete set null,
  scan_type public.scan_type not null,
  status public.scan_status not null default 'queued',
  selected_model_key text references public.model_catalog(key),
  fallback_model_key text references public.model_catalog(key),
  final_label text,
  confidence numeric(7, 6),
  risk_level public.risk_level not null default 'unknown',
  source text not null default 'web',
  request_ip inet,
  user_agent text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table public.scan_inputs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans(id) on delete cascade,
  input_kind public.input_kind not null,
  retention public.retention_policy not null default 'metadata_only',
  text_preview text,
  text_hash text,
  file_id uuid,
  mime_type text,
  size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.stored_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  scan_id uuid references public.scans(id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  original_name text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

alter table public.scan_inputs
  add constraint scan_inputs_file_id_fkey
  foreign key (file_id) references public.stored_files(id) on delete set null;

create table public.scan_results (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans(id) on delete cascade,
  label text not null,
  confidence numeric(7, 6) not null,
  risk_level public.risk_level not null,
  primary_score numeric(7, 6),
  secondary_score numeric(7, 6),
  explanation text,
  indicators jsonb not null default '[]'::jsonb,
  raw_scores jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.scan_model_runs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  model_key text references public.model_catalog(key),
  provider text not null,
  provider_model text not null,
  status text not null,
  latency_ms integer,
  request_metadata jsonb not null default '{}'::jsonb,
  response_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.user_usage_daily (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  deepfake_count integer not null default 0,
  phishing_count integer not null default 0,
  api_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id, usage_date)
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes jsonb not null default '["scan:create","scan:read"]'::jsonb,
  status public.api_key_status not null default 'active',
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  rating text not null check (rating in ('correct', 'incorrect', 'unclear')),
  note text,
  created_at timestamptz not null default now()
);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  url text not null,
  secret_hash text,
  events text[] not null default array['scan.completed'],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  delivery_status public.webhook_delivery_status not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.system_events (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('debug', 'info', 'warn', 'error')),
  event_type text not null,
  org_id uuid references public.organizations(id) on delete set null,
  scan_id uuid references public.scans(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index organizations_created_by_idx on public.organizations(created_by);
create index organization_members_user_idx on public.organization_members(user_id, status);
create index scan_projects_org_idx on public.scan_projects(org_id, archived_at);
create index scans_org_created_idx on public.scans(org_id, created_at desc);
create index scans_user_created_idx on public.scans(user_id, created_at desc);
create index scans_status_idx on public.scans(status, created_at);
create index scan_model_runs_scan_idx on public.scan_model_runs(scan_id, created_at);
create index stored_files_org_idx on public.stored_files(org_id, created_at desc);
create index audit_logs_org_idx on public.audit_logs(org_id, created_at desc);
create index webhook_events_delivery_idx on public.webhook_events(delivery_status, created_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

create trigger organization_members_touch_updated_at
before update on public.organization_members
for each row execute function public.touch_updated_at();

create trigger scan_projects_touch_updated_at
before update on public.scan_projects
for each row execute function public.touch_updated_at();

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.org_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.org_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = any(allowed_roles)
  );
$$;

create or replace function public.can_access_scan(target_scan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.scans s
    where s.id = target_scan_id
      and public.is_org_member(s.org_id)
  );
$$;

create or replace function public.can_write_scan(target_scan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.scans s
    where s.id = target_scan_id
      and public.has_org_role(s.org_id, array['owner','admin','analyst']::public.app_role[])
  );
$$;

create or replace function public.check_scan_quota(target_org_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (coalesce(u.deepfake_count, 0) + coalesce(u.phishing_count, 0) + coalesce(u.api_count, 0)) < p.daily_scan_limit
    from public.organizations o
    join public.plans p on p.id = o.plan_id
    left join public.user_usage_daily u
      on u.org_id = o.id
     and u.user_id = target_user_id
     and u.usage_date = current_date
    where o.id = target_org_id
  ), false);
$$;

create or replace function public.increment_usage(target_org_id uuid, target_user_id uuid, target_scan_type public.scan_type, from_api boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_usage_daily (org_id, user_id, usage_date, deepfake_count, phishing_count, api_count)
  values (
    target_org_id,
    target_user_id,
    current_date,
    case when target_scan_type = 'deepfake' then 1 else 0 end,
    case when target_scan_type = 'phishing' then 1 else 0 end,
    case when from_api then 1 else 0 end
  )
  on conflict (org_id, user_id, usage_date)
  do update set
    deepfake_count = public.user_usage_daily.deepfake_count + excluded.deepfake_count,
    phishing_count = public.user_usage_daily.phishing_count + excluded.phishing_count,
    api_count = public.user_usage_daily.api_count + excluded.api_count,
    updated_at = now();
end;
$$;

create or replace function public.record_audit_event(
  target_org_id uuid,
  event_action text,
  target_table_name text default null,
  target_record_id uuid default null,
  event_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.audit_logs (org_id, actor_user_id, action, target_table, target_id, metadata)
  values (target_org_id, auth.uid(), event_action, target_table_name, target_record_id, event_metadata)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.create_scan_record(
  target_org_id uuid,
  target_scan_type public.scan_type,
  target_input_kind public.input_kind,
  target_selected_model_key text,
  target_project_id uuid default null,
  target_text_preview text default null,
  target_text_hash text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_scan_id uuid;
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required.';
  end if;

  if not public.has_org_role(target_org_id, array['owner','admin','analyst']::public.app_role[]) then
    raise exception 'You do not have permission to create scans for this workspace.';
  end if;

  if not public.check_scan_quota(target_org_id, caller) then
    raise exception 'Daily scan quota exceeded.';
  end if;

  insert into public.scans (org_id, user_id, project_id, scan_type, status, selected_model_key, metadata)
  values (target_org_id, caller, target_project_id, target_scan_type, 'queued', target_selected_model_key, target_metadata)
  returning id into new_scan_id;

  insert into public.scan_inputs (scan_id, input_kind, text_preview, text_hash, metadata)
  values (new_scan_id, target_input_kind, left(target_text_preview, 500), target_text_hash, target_metadata);

  perform public.increment_usage(target_org_id, caller, target_scan_type, false);
  perform public.record_audit_event(target_org_id, 'scan.created', 'scans', new_scan_id, jsonb_build_object('scan_type', target_scan_type));

  return new_scan_id;
end;
$$;

create or replace function public.complete_scan_record(
  target_scan_id uuid,
  result_label text,
  result_confidence numeric,
  result_risk_level public.risk_level,
  result_primary_score numeric,
  result_secondary_score numeric,
  result_explanation text,
  result_indicators jsonb default '[]'::jsonb,
  result_raw_scores jsonb default '[]'::jsonb,
  model_runs jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  run_item jsonb;
  target_org_id uuid;
begin
  update public.scans
  set
    status = 'completed',
    final_label = result_label,
    confidence = result_confidence,
    risk_level = result_risk_level,
    completed_at = now(),
    error_message = null
  where id = target_scan_id
  returning org_id into target_org_id;

  if target_org_id is null then
    raise exception 'Scan not found.';
  end if;

  insert into public.scan_results (
    scan_id, label, confidence, risk_level, primary_score, secondary_score,
    explanation, indicators, raw_scores
  )
  values (
    target_scan_id, result_label, result_confidence, result_risk_level,
    result_primary_score, result_secondary_score, result_explanation,
    result_indicators, result_raw_scores
  )
  on conflict (scan_id) do update set
    label = excluded.label,
    confidence = excluded.confidence,
    risk_level = excluded.risk_level,
    primary_score = excluded.primary_score,
    secondary_score = excluded.secondary_score,
    explanation = excluded.explanation,
    indicators = excluded.indicators,
    raw_scores = excluded.raw_scores,
    created_at = now();

  for run_item in select * from jsonb_array_elements(model_runs)
  loop
    insert into public.scan_model_runs (
      scan_id, model_key, provider, provider_model, status, latency_ms,
      request_metadata, response_metadata, error_message
    )
    values (
      target_scan_id,
      run_item->>'model_key',
      coalesce(run_item->>'provider', 'unknown'),
      coalesce(run_item->>'provider_model', 'unknown'),
      coalesce(run_item->>'status', 'completed'),
      nullif(run_item->>'latency_ms', '')::integer,
      coalesce(run_item->'request_metadata', '{}'::jsonb),
      coalesce(run_item->'response_metadata', '{}'::jsonb),
      run_item->>'error_message'
    );
  end loop;

  perform public.record_audit_event(target_org_id, 'scan.completed', 'scans', target_scan_id, jsonb_build_object('label', result_label, 'risk_level', result_risk_level));
end;
$$;

create or replace function public.fail_scan_record(target_scan_id uuid, failure_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
begin
  update public.scans
  set status = 'failed', error_message = failure_message, completed_at = now()
  where id = target_scan_id
  returning org_id into target_org_id;

  if target_org_id is not null then
    perform public.record_audit_event(target_org_id, 'scan.failed', 'scans', target_scan_id, jsonb_build_object('error', failure_message));
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  free_plan_id uuid;
  workspace_name text;
begin
  select id into free_plan_id from public.plans where code = 'free';
  workspace_name := coalesce(nullif(new.raw_user_meta_data->>'workspace_name', ''), split_part(new.email, '@', 1) || '''s Workspace');

  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email))
  on conflict (id) do nothing;

  insert into public.organizations (plan_id, name, slug, created_by)
  values (free_plan_id, workspace_name, 'org-' || replace(new.id::text, '-', ''), new.id)
  returning id into new_org_id;

  insert into public.organization_members (org_id, user_id, role, status)
  values (new_org_id, new.id, 'owner', 'active');

  update public.profiles
  set default_org_id = new_org_id
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.scan_projects enable row level security;
alter table public.model_catalog enable row level security;
alter table public.scans enable row level security;
alter table public.scan_inputs enable row level security;
alter table public.stored_files enable row level security;
alter table public.scan_results enable row level security;
alter table public.scan_model_runs enable row level security;
alter table public.user_usage_daily enable row level security;
alter table public.api_keys enable row level security;
alter table public.audit_logs enable row level security;
alter table public.feedback enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_events enable row level security;
alter table public.system_events enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "organizations_select_member" on public.organizations for select using (public.is_org_member(id));
create policy "organizations_insert_owner" on public.organizations for insert with check (created_by = auth.uid());
create policy "organizations_update_admin" on public.organizations for update using (public.has_org_role(id, array['owner','admin']::public.app_role[]));

create policy "organization_members_select_member" on public.organization_members for select using (public.is_org_member(org_id));
create policy "organization_members_manage_admin" on public.organization_members for all using (public.has_org_role(org_id, array['owner','admin']::public.app_role[])) with check (public.has_org_role(org_id, array['owner','admin']::public.app_role[]));

create policy "scan_projects_select_member" on public.scan_projects for select using (public.is_org_member(org_id));
create policy "scan_projects_write_analyst" on public.scan_projects for all using (public.has_org_role(org_id, array['owner','admin','analyst']::public.app_role[])) with check (public.has_org_role(org_id, array['owner','admin','analyst']::public.app_role[]));

create policy "model_catalog_read_all_authenticated" on public.model_catalog for select to authenticated using (true);

create policy "scans_select_member" on public.scans for select using (public.is_org_member(org_id));
create policy "scans_insert_analyst" on public.scans for insert with check (public.has_org_role(org_id, array['owner','admin','analyst']::public.app_role[]));
create policy "scans_update_analyst" on public.scans for update using (public.has_org_role(org_id, array['owner','admin','analyst']::public.app_role[]));

create policy "scan_inputs_select_member" on public.scan_inputs for select using (public.can_access_scan(scan_id));
create policy "scan_inputs_write_analyst" on public.scan_inputs for all using (public.can_write_scan(scan_id)) with check (public.can_write_scan(scan_id));

create policy "stored_files_select_member" on public.stored_files for select using (public.is_org_member(org_id));
create policy "stored_files_write_analyst" on public.stored_files for all using (public.has_org_role(org_id, array['owner','admin','analyst']::public.app_role[])) with check (public.has_org_role(org_id, array['owner','admin','analyst']::public.app_role[]));

create policy "scan_results_select_member" on public.scan_results for select using (public.can_access_scan(scan_id));
create policy "scan_model_runs_select_member" on public.scan_model_runs for select using (public.can_access_scan(scan_id));

create policy "usage_select_member" on public.user_usage_daily for select using (public.is_org_member(org_id));

create policy "api_keys_select_admin" on public.api_keys for select using (public.has_org_role(org_id, array['owner','admin']::public.app_role[]));
create policy "api_keys_manage_admin" on public.api_keys for all using (public.has_org_role(org_id, array['owner','admin']::public.app_role[])) with check (public.has_org_role(org_id, array['owner','admin']::public.app_role[]));

create policy "audit_logs_select_admin" on public.audit_logs for select using (public.has_org_role(org_id, array['owner','admin']::public.app_role[]));

create policy "feedback_select_member" on public.feedback for select using (public.is_org_member(org_id));
create policy "feedback_insert_member" on public.feedback for insert with check (public.is_org_member(org_id) and user_id = auth.uid());

create policy "webhook_endpoints_select_admin" on public.webhook_endpoints for select using (public.has_org_role(org_id, array['owner','admin']::public.app_role[]));
create policy "webhook_endpoints_manage_admin" on public.webhook_endpoints for all using (public.has_org_role(org_id, array['owner','admin']::public.app_role[])) with check (public.has_org_role(org_id, array['owner','admin']::public.app_role[]));
create policy "webhook_events_select_admin" on public.webhook_events for select using (public.has_org_role(org_id, array['owner','admin']::public.app_role[]));

create policy "system_events_select_admin" on public.system_events for select using (public.has_org_role(org_id, array['owner','admin']::public.app_role[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('scan-uploads', 'scan-uploads', false, 5242880, array['image/jpeg','image/png','image/webp','image/bmp']),
  ('scan-crops', 'scan-crops', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('avatars', 'avatars', false, 1048576, array['image/jpeg','image/png','image/webp']),
  ('exports', 'exports', false, 10485760, array['application/pdf','text/csv','application/json'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "storage_org_member_read_scan_uploads"
on storage.objects for select
using (
  bucket_id in ('scan-uploads', 'scan-crops', 'exports')
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

create policy "storage_org_analyst_insert_scan_uploads"
on storage.objects for insert
with check (
  bucket_id in ('scan-uploads', 'scan-crops', 'exports')
  and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin','analyst']::public.app_role[])
);

create policy "storage_org_admin_update_scan_uploads"
on storage.objects for update
using (
  bucket_id in ('scan-uploads', 'scan-crops', 'exports')
  and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.app_role[])
);

create policy "storage_org_admin_delete_scan_uploads"
on storage.objects for delete
using (
  bucket_id in ('scan-uploads', 'scan-crops', 'exports')
  and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.app_role[])
);

create policy "storage_avatar_owner_read"
on storage.objects for select
using (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1])::uuid = auth.uid()
);

create policy "storage_avatar_owner_write"
on storage.objects for all
using (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1])::uuid = auth.uid()
)
with check (
  bucket_id = 'avatars'
  and ((storage.foldername(name))[1])::uuid = auth.uid()
);

revoke execute on function public.complete_scan_record(uuid, text, numeric, public.risk_level, numeric, numeric, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_scan_record(uuid, text) from public, anon, authenticated;
grant execute on function public.create_scan_record(uuid, public.scan_type, public.input_kind, text, uuid, text, text, jsonb) to authenticated;
grant execute on function public.complete_scan_record(uuid, text, numeric, public.risk_level, numeric, numeric, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.fail_scan_record(uuid, text) to service_role;

commit;
