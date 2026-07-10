-- BE-002..BE-006, BE-008, BE-013..BE-019 / SP-001..SP-014
-- Forward-only remediation. Take an encrypted backup before applying.
begin;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

alter table public.model_catalog add column if not exists revision text;
alter table public.model_catalog add column if not exists adapter_version text;
alter table public.model_catalog add column if not exists calibration_version text;
alter table public.model_catalog add column if not exists tier text not null default 'standard';
update public.model_catalog set provider_model = 'local-rules-disabled' where provider = 'locked' and provider_model is null;
alter table public.model_catalog alter column provider_model set not null;

alter table public.plans add column if not exists monthly_web_scan_limit integer;
alter table public.plans add column if not exists monthly_api_limit integer;
alter table public.plans add column if not exists monthly_total_limit integer;
alter table public.plans add column if not exists daily_api_limit integer not null default 10;
alter table public.plans add column if not exists retention_days integer;
alter table public.plans add column if not exists allow_pdf_export boolean not null default true;
alter table public.plans add column if not exists allow_batch_scans boolean not null default false;
alter table public.plans add column if not exists allow_webhooks boolean not null default false;
alter table public.plans add column if not exists allow_priority_models boolean not null default false;
alter table public.plans add column if not exists stripe_monthly_price_id text;
alter table public.plans add column if not exists stripe_yearly_price_id text;
update public.plans set
  monthly_web_scan_limit = coalesce(monthly_web_scan_limit, monthly_scan_limit),
  monthly_api_limit = coalesce(monthly_api_limit, case when allow_api_access then monthly_scan_limit else 0 end),
  monthly_total_limit = coalesce(monthly_total_limit, monthly_scan_limit + case when allow_api_access then monthly_scan_limit else 0 end),
  retention_days = coalesce(retention_days, file_retention_days);
alter table public.plans alter column monthly_web_scan_limit set not null;
alter table public.plans alter column monthly_api_limit set not null;
alter table public.plans alter column monthly_total_limit set not null;

alter table public.user_usage_daily add column if not exists link_count integer not null default 0;

alter table public.api_keys add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.api_keys add column if not exists public_id text;
alter table public.api_keys add column if not exists display_hint text;
alter table public.api_keys add column if not exists key_version integer not null default 1;
alter table public.api_keys add column if not exists ownership text not null default 'organization';
alter table public.api_keys add column if not exists usage_limit_daily integer not null default 100;
alter table public.api_keys add column if not exists revoked_at timestamptz;
alter table public.api_keys alter column key_prefix drop not null;
update public.api_keys set status = 'revoked', revoked_at = coalesce(revoked_at, now()), key_prefix = null, public_id = null
where status = 'active' or key_prefix is not null;
create unique index if not exists api_keys_public_id_unique on public.api_keys(public_id) where public_id is not null;
create index if not exists api_keys_org_status_idx on public.api_keys(org_id, status, created_at desc);

create table if not exists public.api_usage_events (
  id uuid primary key default gen_random_uuid(), api_key_id uuid not null references public.api_keys(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade, user_id uuid references auth.users(id) on delete set null,
  endpoint text not null, scan_type text, status text not null, request_id text, latency_ms integer, error_code text,
  created_at timestamptz not null default now(), check (latency_ms is null or latency_ms >= 0)
);
create index if not exists api_usage_key_created_idx on public.api_usage_events(api_key_id, created_at desc);

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'stripe', provider_customer_id text not null, email text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists billing_customers_org_provider_unique on public.billing_customers(org_id, provider);
create unique index if not exists billing_customers_provider_id_unique on public.billing_customers(provider, provider_customer_id);

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid references public.plans(id), provider text not null default 'stripe', provider_customer_id text,
  provider_subscription_id text, provider_price_id text, status text not null default 'active',
  current_period_start timestamptz, current_period_end timestamptz, cancel_at_period_end boolean not null default false,
  trial_end timestamptz, provider_event_created_at bigint, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.organization_subscriptions add column if not exists provider_event_created_at bigint;
create unique index if not exists subscriptions_provider_id_unique on public.organization_subscriptions(provider, provider_subscription_id);
create index if not exists subscriptions_org_status_period_idx on public.organization_subscriptions(org_id, status, current_period_end);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(), provider text not null default 'stripe', event_id text not null,
  event_type text not null, status text not null default 'processing', attempt_count integer not null default 1,
  error_message text, payload jsonb not null default '{}'::jsonb, received_at timestamptz not null default now(),
  processed_at timestamptz, created_at timestamptz not null default now(), check (attempt_count >= 0)
);
alter table public.billing_events add column if not exists attempt_count integer not null default 1;
alter table public.billing_events add column if not exists received_at timestamptz not null default now();
create unique index if not exists billing_events_provider_event_unique on public.billing_events(provider, event_id);
create index if not exists billing_events_retry_idx on public.billing_events(status, received_at) where status in ('processing','failed');

create table if not exists public.usage_monthly (
  org_id uuid not null references public.organizations(id) on delete cascade, month_start date not null,
  web_deepfake_count integer not null default 0, web_phishing_count integer not null default 0, web_link_count integer not null default 0,
  api_deepfake_count integer not null default 0, api_phishing_count integer not null default 0, api_link_count integer not null default 0,
  api_usage_count integer not null default 0, storage_bytes bigint not null default 0, overage_count integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(org_id, month_start)
);
alter table public.usage_monthly add column if not exists web_link_count integer not null default 0;
alter table public.usage_monthly add column if not exists api_link_count integer not null default 0;

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, source text not null check(source in ('web','api')),
  scan_type public.scan_type, endpoint text, status text not null default 'success', units integer not null default 1 check(units > 0),
  request_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists usage_events_org_created_idx on public.usage_events(org_id, created_at desc);

create table if not exists public.quota_reservations (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, source text not null check(source in ('web','api')),
  scan_type public.scan_type, units integer not null check(units > 0), status text not null default 'reserved' check(status in ('reserved','consumed','released','expired')),
  reason text, created_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '10 minutes'),
  finalized_at timestamptz
);
create index if not exists quota_reservations_active_idx on public.quota_reservations(org_id, source, expires_at) where status = 'reserved';

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(), org_id uuid references public.organizations(id) on delete cascade,
  scan_id uuid references public.scans(id) on delete cascade, event_type text not null, payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending', attempt_count integer not null default 0, available_at timestamptz not null default now(),
  processed_at timestamptz, last_error_code text, created_at timestamptz not null default now()
);
create index if not exists outbox_pending_idx on public.outbox_events(status, available_at) where status = 'pending';

alter table public.scans add column if not exists request_id text;
alter table public.scan_results add column if not exists report_snapshot jsonb;
alter table public.scan_model_runs add column if not exists attempt_index integer;
alter table public.scan_model_runs add column if not exists model_revision text;
alter table public.scan_model_runs add column if not exists adapter_version text;
create unique index if not exists scan_model_runs_attempt_unique on public.scan_model_runs(scan_id, attempt_index) where attempt_index is not null;

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  session_hash text not null unique, user_agent_label text, created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(), revoked_at timestamptz, revoke_reason text
);
create index if not exists user_sessions_active_idx on public.user_sessions(user_id, last_seen_at desc) where revoked_at is null;

create table if not exists public.lifecycle_jobs (
  id uuid primary key default gen_random_uuid(), org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, job_type text not null check(job_type in ('export','delete_account','delete_workspace','delete_scan','retention_cleanup')),
  target_id uuid, status text not null default 'queued', receipt jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), completed_at timestamptz
);

create table if not exists public.vendor_registry (
  key text primary key, name text not null, purpose text not null, data_categories text[] not null default '{}',
  regions text[] not null default '{}', retention_basis text, approved boolean not null default false,
  owner text, reviewed_at timestamptz, metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete cascade, endpoint text not null, idempotency_key text not null,
  request_hash text not null, response_status integer, response_body jsonb, created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'), unique(org_id, api_key_id, endpoint, idempotency_key)
);

alter table public.scan_results drop constraint if exists scan_results_confidence_check;
alter table public.scan_results add constraint scan_results_confidence_check check(confidence between 0 and 1);
alter table public.scan_results drop constraint if exists scan_results_primary_score_check;
alter table public.scan_results add constraint scan_results_primary_score_check check(primary_score is null or primary_score between 0 and 1);
alter table public.scan_results drop constraint if exists scan_results_secondary_score_check;
alter table public.scan_results add constraint scan_results_secondary_score_check check(secondary_score is null or secondary_score between 0 and 1);
alter table public.scans drop constraint if exists scans_terminal_state_check;
alter table public.scans add constraint scans_terminal_state_check check(
  (status = 'completed' and completed_at is not null and final_label is not null and confidence between 0 and 1)
  or (status = 'failed' and completed_at is not null and error_message is not null)
  or status in ('queued','processing','cancelled')
);

create or replace function public.safe_uuid(value text) returns uuid
language plpgsql immutable strict set search_path = pg_catalog as $$
begin
  if value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return null; end if;
  return value::uuid;
exception when invalid_text_representation then return null;
end; $$;
revoke execute on function public.safe_uuid(text) from public, anon;
grant execute on function public.safe_uuid(text) to authenticated, service_role;

drop policy if exists "storage_org_analyst_insert_scan_uploads" on storage.objects;
create policy "storage_org_analyst_insert_scan_uploads" on storage.objects for insert with check(
  bucket_id in ('scan-uploads','scan-crops','exports') and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin','analyst']::public.app_role[])
);
drop policy if exists "storage_org_admin_update_scan_uploads" on storage.objects;
create policy "storage_org_admin_update_scan_uploads" on storage.objects for update using(
  bucket_id in ('scan-uploads','scan-crops','exports') and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin']::public.app_role[])
);
drop policy if exists "storage_org_admin_delete_scan_uploads" on storage.objects;
create policy "storage_org_admin_delete_scan_uploads" on storage.objects for delete using(
  bucket_id in ('scan-uploads','scan-crops','exports') and public.has_org_role(public.safe_uuid((storage.foldername(name))[1]), array['owner','admin']::public.app_role[])
);
drop policy if exists "storage_avatar_owner_read" on storage.objects;
create policy "storage_avatar_owner_read" on storage.objects for select using(bucket_id='avatars' and public.safe_uuid((storage.foldername(name))[1])=auth.uid());
drop policy if exists "storage_avatar_owner_write" on storage.objects;
create policy "storage_avatar_owner_write" on storage.objects for all using(bucket_id='avatars' and public.safe_uuid((storage.foldername(name))[1])=auth.uid())
with check(bucket_id='avatars' and public.safe_uuid((storage.foldername(name))[1])=auth.uid());

create or replace function public.api_key_usage_today(target_org_id uuid)
returns table(api_key_id uuid, used_today bigint) language sql stable security definer set search_path = pg_catalog, public as $$
  select e.api_key_id, count(*)::bigint from public.api_usage_events e
  join public.api_keys k on k.id=e.api_key_id where k.org_id=target_org_id and e.status='success' and e.scan_type is not null and e.created_at>=date_trunc('day',now()) group by e.api_key_id;
$$;

create or replace function public.check_entitlement_quota(target_org_id uuid, target_user_id uuid, target_action text, target_source text, target_scan_type public.scan_type, target_units integer default 1)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare p public.plans%rowtype; u public.usage_monthly%rowtype; used_count integer; reserved_count integer; limit_count integer; reservation uuid;
begin
  if target_units < 1 or target_source not in ('web','api') then raise exception 'invalid quota request'; end if;
  select pl.* into p from public.organizations o join public.plans pl on pl.id=o.plan_id where o.id=target_org_id for update of o;
  if not found then return jsonb_build_object('allowed',false,'status',404,'code','ORGANIZATION_NOT_FOUND'); end if;
  if target_action='api_key_create' then
    select count(*) into used_count from public.api_keys where org_id=target_org_id and status='active';
    return jsonb_build_object('allowed',used_count<p.max_api_keys,'status',case when used_count<p.max_api_keys then 200 else 403 end,'code',case when used_count<p.max_api_keys then 'ALLOWED' else 'API_KEY_LIMIT_REACHED' end,
      'limits',jsonb_build_object('max_api_keys',p.max_api_keys,'daily_api_limit',p.daily_api_limit),'features',jsonb_build_object('allow_api_access',p.allow_api_access));
  end if;
  if target_action='api_usage_read' then return jsonb_build_object('allowed',p.allow_api_access,'status',case when p.allow_api_access then 200 else 403 end,'code',case when p.allow_api_access then 'ALLOWED' else 'API_NOT_INCLUDED' end); end if;
  if target_source='api' and not p.allow_api_access then return jsonb_build_object('allowed',false,'status',403,'code','API_NOT_INCLUDED'); end if;
  insert into public.usage_monthly(org_id,month_start) values(target_org_id,date_trunc('month',current_date)::date) on conflict do nothing;
  select * into u from public.usage_monthly where org_id=target_org_id and month_start=date_trunc('month',current_date)::date for update;
  used_count := case when target_source='api' then u.api_usage_count else u.web_deepfake_count+u.web_phishing_count+u.web_link_count end;
  limit_count := case when target_source='api' then p.monthly_api_limit else p.monthly_web_scan_limit end;
  select coalesce(sum(units),0) into reserved_count from public.quota_reservations where org_id=target_org_id and source=target_source and status='reserved' and expires_at>now();
  if used_count+reserved_count+target_units>limit_count then return jsonb_build_object('allowed',false,'status',429,'code','MONTHLY_LIMIT_REACHED','usage',jsonb_build_object('used',used_count,'reserved',reserved_count),'limits',jsonb_build_object('limit',limit_count)); end if;
  insert into public.quota_reservations(org_id,user_id,source,scan_type,units) values(target_org_id,target_user_id,target_source,target_scan_type,target_units) returning id into reservation;
  return jsonb_build_object('allowed',true,'status',200,'code','ALLOWED','reservation_id',reservation,'usage',jsonb_build_object('used',used_count,'reserved',reserved_count+target_units),
    'limits',jsonb_build_object('monthly_web_scan_limit',p.monthly_web_scan_limit,'monthly_api_limit',p.monthly_api_limit,'monthly_total_limit',p.monthly_total_limit,'daily_api_limit',p.daily_api_limit,'max_api_keys',p.max_api_keys),
    'features',jsonb_build_object('allow_api_access',p.allow_api_access,'allow_pdf_export',p.allow_pdf_export,'allow_batch_scans',p.allow_batch_scans,'allow_webhooks',p.allow_webhooks,'allow_priority_models',p.allow_priority_models));
end; $$;

create or replace function public.release_quota_reservation(target_reservation_id uuid, release_reason text default 'request_failed') returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
begin update public.quota_reservations set status='released',reason=left(release_reason,120),finalized_at=now() where id=target_reservation_id and status='reserved'; return found; end; $$;

create or replace function public.record_billable_usage(target_org_id uuid,target_user_id uuid,target_source text,target_scan_type public.scan_type,target_endpoint text,target_status text,target_units integer,target_request_id text,target_metadata jsonb,target_reservation_id uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare changed integer;
begin
  if target_status<>'success' then raise exception 'only successful outcomes are billable'; end if;
  update public.quota_reservations set status='consumed',finalized_at=now() where id=target_reservation_id and org_id=target_org_id and status='reserved' and expires_at>now(); get diagnostics changed=row_count;
  if target_reservation_id is not null and changed<>1 then raise exception 'invalid or expired quota reservation'; end if;
  insert into public.usage_monthly(org_id,month_start) values(target_org_id,date_trunc('month',current_date)::date) on conflict do nothing;
  update public.usage_monthly set
    web_deepfake_count=web_deepfake_count+case when target_source='web' and target_scan_type='deepfake' then target_units else 0 end,
    web_phishing_count=web_phishing_count+case when target_source='web' and target_scan_type='phishing' then target_units else 0 end,
    web_link_count=web_link_count+case when target_source='web' and target_scan_type='link' then target_units else 0 end,
    api_deepfake_count=api_deepfake_count+case when target_source='api' and target_scan_type='deepfake' then target_units else 0 end,
    api_phishing_count=api_phishing_count+case when target_source='api' and target_scan_type='phishing' then target_units else 0 end,
    api_link_count=api_link_count+case when target_source='api' and target_scan_type='link' then target_units else 0 end,
    api_usage_count=api_usage_count+case when target_source='api' then target_units else 0 end,updated_at=now()
  where org_id=target_org_id and month_start=date_trunc('month',current_date)::date;
  insert into public.usage_events(org_id,user_id,source,scan_type,endpoint,status,units,request_id,metadata) values(target_org_id,target_user_id,target_source,target_scan_type,target_endpoint,'success',target_units,target_request_id,coalesce(target_metadata,'{}'));
  return jsonb_build_object('recorded',true,'reservation_id',target_reservation_id);
end; $$;

revoke execute on function public.api_key_usage_today(uuid) from public, anon, authenticated;
revoke execute on function public.check_entitlement_quota(uuid,uuid,text,text,public.scan_type,integer) from public, anon, authenticated;
revoke execute on function public.release_quota_reservation(uuid,text) from public, anon, authenticated;
revoke execute on function public.record_billable_usage(uuid,uuid,text,public.scan_type,text,text,integer,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.api_key_usage_today(uuid), public.check_entitlement_quota(uuid,uuid,text,text,public.scan_type,integer), public.release_quota_reservation(uuid,text), public.record_billable_usage(uuid,uuid,text,public.scan_type,text,text,integer,text,jsonb,uuid) to service_role;

revoke all on public.api_keys,public.api_usage_events,public.billing_customers,public.organization_subscriptions,public.billing_events,public.quota_reservations,public.outbox_events,public.user_sessions,public.lifecycle_jobs,public.idempotency_keys from public,anon,authenticated;
grant all on public.api_keys,public.api_usage_events,public.billing_customers,public.organization_subscriptions,public.billing_events,public.quota_reservations,public.outbox_events,public.user_sessions,public.lifecycle_jobs,public.idempotency_keys to service_role;

insert into public.schema_migrations(version,checksum) values('202607100002','managed-by-release-manifest') on conflict(version) do nothing;
commit;

-- Rollback policy: do not restore revoked pre-remediation keys. Forward-fix only for key/session/quota state.
-- Verification: all active api_keys have public_id and null key_prefix; privileged RPC ACLs exclude PUBLIC/anon/authenticated.
