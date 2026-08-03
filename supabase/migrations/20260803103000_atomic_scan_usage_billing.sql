-- VeriTrust V2 atomic integrity
-- Forward-only migration: quota reservation, scan finalization/refund,
-- API metering, billing outbox, and Stripe webhook claiming.

begin;

set local check_function_bodies = on;
set local search_path = public, extensions, pg_catalog;

create table public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  api_key_id uuid references public.api_keys(id) on delete set null,
  scan_id uuid references public.scans(id) on delete cascade,
  source text not null check (source in ('web', 'api')),
  scan_type public.scan_type not null,
  endpoint text,
  request_id text not null,
  request_fingerprint text not null,
  units integer not null default 1 check (units between 1 and 1000),
  status text not null default 'reserved'
    check (status in ('reserved', 'committed', 'released')),
  month_start date not null,
  usage_date date not null,
  reserved_at timestamptz not null default statement_timestamp(),
  finalized_at timestamptz,
  final_status text,
  metadata jsonb not null default '{}'::jsonb,
  constraint usage_reservations_org_request_key unique (org_id, request_id),
  constraint usage_reservations_scan_key unique (scan_id),
  constraint usage_reservations_fingerprint_length
    check (length(request_fingerprint) between 32 and 128),
  constraint usage_reservations_request_length
    check (length(request_id) between 1 and 200)
);

create index usage_reservations_org_month_status_idx
  on public.usage_reservations (org_id, month_start, status);
create index usage_reservations_api_key_day_status_idx
  on public.usage_reservations (api_key_id, usage_date, status)
  where api_key_id is not null;

create table public.billing_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default statement_timestamp(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint billing_outbox_event_key_length check (length(event_key) between 1 and 200)
);

create index billing_outbox_dispatch_idx
  on public.billing_outbox (status, available_at, created_at)
  where status in ('pending', 'failed');

alter table public.billing_events
  add column if not exists attempt_count integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid;

alter table public.scans
  add constraint scans_atomic_lifecycle_check
  check (
    (status in ('queued', 'processing') and completed_at is null)
    or
    (status = 'completed' and completed_at is not null
      and final_label is not null and confidence is not null)
    or
    (status in ('failed', 'cancelled') and completed_at is not null)
  ) not valid;

alter table public.usage_reservations enable row level security;
alter table public.billing_outbox enable row level security;

revoke all on table public.usage_reservations from public, anon, authenticated;
revoke all on table public.billing_outbox from public, anon, authenticated;
grant all on table public.usage_reservations to service_role;
grant all on table public.billing_outbox to service_role;

create or replace function veritrust_private.reserve_usage(
  target_org_id uuid,
  target_user_id uuid,
  target_api_key_id uuid,
  target_source text,
  target_scan_type public.scan_type,
  target_endpoint text,
  target_request_id text,
  target_request_fingerprint text,
  target_units integer default 1,
  target_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'veritrust_private'
as $function$
declare
  existing_reservation public.usage_reservations%rowtype;
  api_key_row public.api_keys%rowtype;
  decision jsonb;
  reservation_id uuid;
  current_month date := date_trunc('month', statement_timestamp())::date;
  current_usage_date date := current_date;
  key_usage integer := 0;
  web_deepfake integer := 0;
  web_phishing integer := 0;
  web_link integer := 0;
  api_deepfake integer := 0;
  api_phishing integer := 0;
  api_link integer := 0;
begin
  if target_source not in ('web', 'api')
     or target_scan_type is null
     or target_units not between 1 and 1000
     or length(coalesce(target_request_id, '')) not between 1 and 200
     or length(coalesce(target_request_fingerprint, '')) not between 32 and 128
     or jsonb_typeof(coalesce(target_metadata, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid usage reservation request.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veritrust:usage:' || target_org_id::text || ':' || current_month::text, 0)
  );

  select * into existing_reservation
  from public.usage_reservations
  where org_id = target_org_id and request_id = target_request_id
  for update;

  if found then
    if existing_reservation.request_fingerprint <> target_request_fingerprint then
      raise exception using
        errcode = '22023',
        message = 'The idempotency key was already used for a different request.';
    end if;
    return jsonb_build_object(
      'allowed', true,
      'duplicate', true,
      'reservation_id', existing_reservation.id,
      'scan_id', existing_reservation.scan_id,
      'reservation_status', existing_reservation.status
    );
  end if;

  decision := public.check_entitlement_quota(
    target_org_id,
    target_user_id,
    case when target_source = 'api' then 'api_scan' else 'web_scan' end,
    target_source,
    target_scan_type,
    target_units
  );
  if not coalesce((decision ->> 'allowed')::boolean, false) then
    return decision || jsonb_build_object('duplicate', false);
  end if;

  if target_source = 'api' then
    if target_api_key_id is null then
      raise exception using errcode = '22023', message = 'API reservations require an API key.';
    end if;
    select * into api_key_row
    from public.api_keys
    where id = target_api_key_id and org_id = target_org_id
    for update;
    if not found
       or api_key_row.status <> 'active'
       or api_key_row.revoked_at is not null
       or api_key_row.not_before > statement_timestamp()
       or (api_key_row.expires_at is not null and api_key_row.expires_at <= statement_timestamp()) then
      return jsonb_build_object(
        'allowed', false, 'status', 401, 'code', 'INVALID_API_KEY',
        'message', 'The API key is not active.'
      );
    end if;

    select coalesce(sum(units), 0)::integer into key_usage
    from public.usage_reservations
    where api_key_id = target_api_key_id
      and usage_date = current_usage_date
      and status in ('reserved', 'committed');
    if key_usage + target_units > api_key_row.usage_limit_daily then
      return jsonb_build_object(
        'allowed', false, 'status', 429, 'code', 'DAILY_API_KEY_LIMIT_REACHED',
        'message', 'Daily API key usage limit reached.',
        'usage', jsonb_build_object(
          'limit_daily', api_key_row.usage_limit_daily,
          'used_today', key_usage,
          'remaining_today', greatest(api_key_row.usage_limit_daily - key_usage, 0)
        )
      );
    end if;
  end if;

  web_deepfake := case when target_source = 'web' and target_scan_type = 'deepfake' then target_units else 0 end;
  web_phishing := case when target_source = 'web' and target_scan_type = 'phishing' then target_units else 0 end;
  web_link := case when target_source = 'web' and target_scan_type = 'link' then target_units else 0 end;
  api_deepfake := case when target_source = 'api' and target_scan_type = 'deepfake' then target_units else 0 end;
  api_phishing := case when target_source = 'api' and target_scan_type = 'phishing' then target_units else 0 end;
  api_link := case when target_source = 'api' and target_scan_type = 'link' then target_units else 0 end;

  insert into public.usage_monthly (
    org_id, month_start,
    web_deepfake_count, web_phishing_count, web_link_count,
    api_deepfake_count, api_phishing_count, api_link_count
  ) values (
    target_org_id, current_month,
    web_deepfake, web_phishing, web_link,
    api_deepfake, api_phishing, api_link
  )
  on conflict (org_id, month_start) do update set
    web_deepfake_count = public.usage_monthly.web_deepfake_count + excluded.web_deepfake_count,
    web_phishing_count = public.usage_monthly.web_phishing_count + excluded.web_phishing_count,
    web_link_count = public.usage_monthly.web_link_count + excluded.web_link_count,
    api_deepfake_count = public.usage_monthly.api_deepfake_count + excluded.api_deepfake_count,
    api_phishing_count = public.usage_monthly.api_phishing_count + excluded.api_phishing_count,
    api_link_count = public.usage_monthly.api_link_count + excluded.api_link_count,
    updated_at = statement_timestamp();

  if target_user_id is not null then
    insert into public.user_usage_daily (
      org_id, user_id, usage_date, deepfake_count, phishing_count, link_count, api_count
    ) values (
      target_org_id, target_user_id, current_usage_date,
      case when target_scan_type = 'deepfake' then target_units else 0 end,
      case when target_scan_type = 'phishing' then target_units else 0 end,
      case when target_scan_type = 'link' then target_units else 0 end,
      case when target_source = 'api' then target_units else 0 end
    )
    on conflict (org_id, user_id, usage_date) do update set
      deepfake_count = public.user_usage_daily.deepfake_count + excluded.deepfake_count,
      phishing_count = public.user_usage_daily.phishing_count + excluded.phishing_count,
      link_count = public.user_usage_daily.link_count + excluded.link_count,
      api_count = public.user_usage_daily.api_count + excluded.api_count,
      updated_at = statement_timestamp();
  end if;

  insert into public.usage_reservations (
    org_id, user_id, api_key_id, source, scan_type, endpoint,
    request_id, request_fingerprint, units, month_start, usage_date, metadata
  ) values (
    target_org_id, target_user_id, target_api_key_id, target_source, target_scan_type,
    left(target_endpoint, 200), target_request_id, target_request_fingerprint,
    target_units, current_month, current_usage_date, coalesce(target_metadata, '{}'::jsonb)
  ) returning id into reservation_id;

  return public.check_entitlement_quota(
    target_org_id,
    target_user_id,
    case when target_source = 'api' then 'api_scan' else 'web_scan' end,
    target_source,
    target_scan_type,
    0
  ) || jsonb_build_object(
    'duplicate', false,
    'reservation_id', reservation_id,
    'reservation_status', 'reserved',
    'api_key_usage', case when target_source = 'api' then jsonb_build_object(
      'limit_daily', api_key_row.usage_limit_daily,
      'used_today', key_usage + target_units,
      'remaining_today', greatest(api_key_row.usage_limit_daily - key_usage - target_units, 0)
    ) else null end
  );
end
$function$;

create or replace function veritrust_private.finalize_usage(
  target_reservation_id uuid,
  target_success boolean,
  target_final_status text,
  target_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'veritrust_private'
as $function$
declare
  reservation public.usage_reservations%rowtype;
begin
  select * into reservation
  from public.usage_reservations
  where id = target_reservation_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Usage reservation was not found.';
  end if;
  if reservation.status <> 'reserved' then
    return jsonb_build_object(
      'duplicate', true,
      'reservation_id', reservation.id,
      'reservation_status', reservation.status
    );
  end if;

  if not target_success then
    update public.usage_monthly set
      web_deepfake_count = greatest(web_deepfake_count - case when reservation.source = 'web' and reservation.scan_type = 'deepfake' then reservation.units else 0 end, 0),
      web_phishing_count = greatest(web_phishing_count - case when reservation.source = 'web' and reservation.scan_type = 'phishing' then reservation.units else 0 end, 0),
      web_link_count = greatest(web_link_count - case when reservation.source = 'web' and reservation.scan_type = 'link' then reservation.units else 0 end, 0),
      api_deepfake_count = greatest(api_deepfake_count - case when reservation.source = 'api' and reservation.scan_type = 'deepfake' then reservation.units else 0 end, 0),
      api_phishing_count = greatest(api_phishing_count - case when reservation.source = 'api' and reservation.scan_type = 'phishing' then reservation.units else 0 end, 0),
      api_link_count = greatest(api_link_count - case when reservation.source = 'api' and reservation.scan_type = 'link' then reservation.units else 0 end, 0),
      updated_at = statement_timestamp()
    where org_id = reservation.org_id and month_start = reservation.month_start;

    if reservation.user_id is not null then
      update public.user_usage_daily set
        deepfake_count = greatest(deepfake_count - case when reservation.scan_type = 'deepfake' then reservation.units else 0 end, 0),
        phishing_count = greatest(phishing_count - case when reservation.scan_type = 'phishing' then reservation.units else 0 end, 0),
        link_count = greatest(link_count - case when reservation.scan_type = 'link' then reservation.units else 0 end, 0),
        api_count = greatest(api_count - case when reservation.source = 'api' then reservation.units else 0 end, 0),
        updated_at = statement_timestamp()
      where org_id = reservation.org_id
        and user_id = reservation.user_id
        and usage_date = reservation.usage_date;
    end if;
  end if;

  insert into public.usage_events (
    org_id, user_id, source, scan_type, endpoint,
    status, units, request_id, metadata
  ) values (
    reservation.org_id, reservation.user_id, reservation.source,
    reservation.scan_type, reservation.endpoint,
    target_final_status, reservation.units, reservation.request_id,
    reservation.metadata || coalesce(target_metadata, '{}'::jsonb)
  ) on conflict (org_id, request_id) where request_id is not null do nothing;

  update public.usage_reservations set
    status = case when target_success then 'committed' else 'released' end,
    final_status = left(target_final_status, 80),
    finalized_at = statement_timestamp(),
    metadata = metadata || coalesce(target_metadata, '{}'::jsonb)
  where id = reservation.id;

  return jsonb_build_object(
    'duplicate', false,
    'reservation_id', reservation.id,
    'reservation_status', case when target_success then 'committed' else 'released' end
  );
end
$function$;

create or replace function public.create_scan_record_atomic(
  target_org_id uuid,
  target_scan_type public.scan_type,
  target_input_kind public.input_kind,
  target_selected_model_key text,
  target_project_id uuid default null,
  target_text_preview text default null,
  target_text_hash text default null,
  target_metadata jsonb default '{}'::jsonb,
  target_source text default 'web',
  target_endpoint text default null,
  target_request_id text default null,
  target_request_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'veritrust_private'
as $function$
declare
  caller uuid := auth.uid();
  reservation jsonb;
  new_scan_id uuid;
begin
  if caller is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if not public.has_org_role(target_org_id, array['owner','admin','analyst']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'Workspace scan access denied.';
  end if;
  if target_source <> 'web' then
    raise exception using errcode = '22023', message = 'Authenticated scan creation supports web source only.';
  end if;

  reservation := veritrust_private.reserve_usage(
    target_org_id, caller, null, target_source, target_scan_type,
    target_endpoint, target_request_id, target_request_fingerprint, 1,
    coalesce(target_metadata, '{}'::jsonb)
  );
  if not coalesce((reservation ->> 'allowed')::boolean, false) then
    return reservation;
  end if;
  if coalesce((reservation ->> 'duplicate')::boolean, false) then
    if reservation ->> 'scan_id' is null then
      raise exception using errcode = '55000', message = 'Idempotent scan reservation is incomplete.';
    end if;
    return reservation;
  end if;

  new_scan_id := gen_random_uuid();
  insert into public.scans (
    id, org_id, user_id, project_id, scan_type, status,
    selected_model_key, source, metadata
  ) values (
    new_scan_id, target_org_id, caller, target_project_id, target_scan_type,
    'queued', target_selected_model_key, target_source, coalesce(target_metadata, '{}'::jsonb)
  );
  insert into public.scan_inputs (
    scan_id, input_kind, text_preview, text_hash, metadata
  ) values (
    new_scan_id, target_input_kind, left(target_text_preview, 500),
    target_text_hash, coalesce(target_metadata, '{}'::jsonb)
  );
  update public.usage_reservations
  set scan_id = new_scan_id
  where id = (reservation ->> 'reservation_id')::uuid;

  perform public.record_audit_event(
    target_org_id, 'scan.created', 'scans', new_scan_id,
    jsonb_build_object('scan_type', target_scan_type, 'request_id', target_request_id)
  );
  return reservation || jsonb_build_object('scan_id', new_scan_id);
end
$function$;

create or replace function public.complete_scan_record_atomic(
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
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'veritrust_private'
as $function$
declare
  scan_row public.scans%rowtype;
  reservation public.usage_reservations%rowtype;
  run_item jsonb;
  usage_result jsonb;
begin
  if jsonb_typeof(coalesce(result_indicators, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(result_raw_scores, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(model_runs, '[]'::jsonb)) <> 'array'
     or result_confidence not between 0 and 1 then
    raise exception using errcode = '22023', message = 'Invalid scan completion payload.';
  end if;

  select * into scan_row from public.scans where id = target_scan_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Scan not found.'; end if;
  if scan_row.status = 'completed' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'scan_id', scan_row.id);
  end if;
  if scan_row.status in ('failed', 'cancelled') then
    raise exception using errcode = '55000', message = 'A terminal scan cannot be completed.';
  end if;

  select * into reservation
  from public.usage_reservations
  where scan_id = target_scan_id
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'Scan usage reservation is missing.';
  end if;

  insert into public.scan_results (
    scan_id, label, confidence, risk_level, primary_score, secondary_score,
    explanation, indicators, raw_scores
  ) values (
    target_scan_id, result_label, result_confidence, result_risk_level,
    result_primary_score, result_secondary_score, result_explanation,
    coalesce(result_indicators, '[]'::jsonb), coalesce(result_raw_scores, '[]'::jsonb)
  );

  for run_item in select value from jsonb_array_elements(model_runs)
  loop
    insert into public.scan_model_runs (
      scan_id, model_key, provider, provider_model, status, latency_ms,
      request_metadata, response_metadata, error_message
    ) values (
      target_scan_id, nullif(run_item ->> 'model_key', ''),
      coalesce(nullif(run_item ->> 'provider', ''), 'unknown'),
      coalesce(nullif(run_item ->> 'provider_model', ''), 'unknown'),
      coalesce(nullif(run_item ->> 'status', ''), 'completed'),
      nullif(run_item ->> 'latency_ms', '')::integer,
      coalesce(run_item -> 'request_metadata', '{}'::jsonb),
      coalesce(run_item -> 'response_metadata', '{}'::jsonb),
      run_item ->> 'error_message'
    );
  end loop;

  update public.scans set
    status = 'completed', final_label = result_label,
    confidence = result_confidence, risk_level = result_risk_level,
    completed_at = statement_timestamp(), error_message = null
  where id = target_scan_id;

  usage_result := veritrust_private.finalize_usage(
    reservation.id, true, 'success', jsonb_build_object('scan_id', target_scan_id)
  );
  insert into public.billing_outbox (event_key, event_type, org_id, aggregate_id, payload)
  values (
    'scan:' || target_scan_id::text || ':completed', 'scan.completed',
    scan_row.org_id, target_scan_id,
    jsonb_build_object(
      'scan_id', target_scan_id, 'org_id', scan_row.org_id,
      'user_id', scan_row.user_id, 'source', scan_row.source,
      'scan_type', scan_row.scan_type, 'units', reservation.units
    )
  ) on conflict (event_key) do nothing;
  perform public.record_audit_event(
    scan_row.org_id, 'scan.completed', 'scans', target_scan_id,
    jsonb_build_object('label', result_label, 'risk_level', result_risk_level)
  );
  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'scan_id', target_scan_id,
    'usage', usage_result
  );
end
$function$;

create or replace function public.fail_scan_record_atomic(
  target_scan_id uuid,
  failure_message text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'veritrust_private'
as $function$
declare
  scan_row public.scans%rowtype;
  reservation public.usage_reservations%rowtype;
  usage_result jsonb;
begin
  select * into scan_row from public.scans where id = target_scan_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Scan not found.'; end if;
  if scan_row.status = 'completed' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'scan_id', scan_row.id, 'status', 'completed');
  end if;
  if scan_row.status in ('failed', 'cancelled') then
    return jsonb_build_object('ok', true, 'duplicate', true, 'scan_id', scan_row.id, 'status', scan_row.status);
  end if;

  select * into reservation
  from public.usage_reservations
  where scan_id = target_scan_id
  for update;
  if found then
    usage_result := veritrust_private.finalize_usage(
      reservation.id, false, 'failed', jsonb_build_object('scan_id', target_scan_id)
    );
  end if;

  update public.scans set
    status = 'failed', error_message = left(coalesce(failure_message, 'Scan failed.'), 1000),
    completed_at = statement_timestamp()
  where id = target_scan_id;
  perform public.record_audit_event(
    scan_row.org_id, 'scan.failed', 'scans', target_scan_id,
    jsonb_build_object('error', left(coalesce(failure_message, 'Scan failed.'), 500))
  );
  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'scan_id', target_scan_id,
    'status', 'failed', 'usage', usage_result
  );
end
$function$;

create or replace function public.reserve_api_usage_atomic(
  target_api_key_id uuid,
  target_request_id text,
  target_request_fingerprint text,
  target_scan_type public.scan_type,
  target_endpoint text,
  target_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'veritrust_private'
as $function$
declare
  key_row public.api_keys%rowtype;
begin
  select * into key_row from public.api_keys where id = target_api_key_id;
  if not found then
    return jsonb_build_object('allowed', false, 'status', 401, 'code', 'INVALID_API_KEY', 'message', 'API key not found.');
  end if;
  return veritrust_private.reserve_usage(
    key_row.org_id, coalesce(key_row.user_id, key_row.created_by), key_row.id,
    'api', target_scan_type, target_endpoint, target_request_id,
    target_request_fingerprint, 1,
    coalesce(target_metadata, '{}'::jsonb) || jsonb_build_object('api_key_id', key_row.id)
  );
end
$function$;

create or replace function public.finalize_api_usage_atomic(
  target_api_key_id uuid,
  target_request_id text,
  target_status text,
  target_latency_ms integer default null,
  target_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'veritrust_private'
as $function$
declare
  reservation public.usage_reservations%rowtype;
  result jsonb;
  used_today integer;
  daily_limit integer;
begin
  select r.* into reservation
  from public.usage_reservations r
  where r.api_key_id = target_api_key_id and r.request_id = target_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'API usage reservation was not found.';
  end if;

  result := veritrust_private.finalize_usage(
    reservation.id,
    target_status = 'success',
    case when target_status = 'success' then 'success' else 'error' end,
    jsonb_strip_nulls(jsonb_build_object(
      'api_key_id', target_api_key_id,
      'latency_ms', target_latency_ms,
      'error_code', target_error_code
    ))
  );

  if not coalesce((result ->> 'duplicate')::boolean, false) then
    insert into public.api_usage_events (
      api_key_id, org_id, user_id, endpoint, scan_type, status,
      request_id, latency_ms, error_code
    ) values (
      target_api_key_id, reservation.org_id, reservation.user_id,
      coalesce(reservation.endpoint, 'unknown'), reservation.scan_type::text,
      case when target_status = 'success' then 'success' else 'error' end,
      reservation.request_id, target_latency_ms, target_error_code
    );
    update public.api_keys set last_used_at = statement_timestamp()
    where id = target_api_key_id;
  end if;

  select usage_limit_daily into daily_limit from public.api_keys where id = target_api_key_id;
  select coalesce(sum(units), 0)::integer into used_today
  from public.usage_reservations
  where api_key_id = target_api_key_id
    and usage_date = current_date
    and status in ('reserved', 'committed');
  return result || jsonb_build_object(
    'usage', jsonb_build_object(
      'limit_daily', daily_limit,
      'used_today', used_today,
      'remaining_today', greatest(daily_limit - used_today, 0)
    )
  );
end
$function$;

create or replace function public.recover_stale_usage_reservations(
  target_max_age interval default interval '15 minutes',
  target_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'veritrust_private'
as $function$
declare
  reservation public.usage_reservations%rowtype;
  recovered integer := 0;
begin
  if target_max_age < interval '5 minutes'
     or target_max_age > interval '7 days'
     or target_limit not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'Invalid reservation recovery bounds.';
  end if;

  for reservation in
    select r.*
    from public.usage_reservations r
    where r.status = 'reserved'
      and r.reserved_at < statement_timestamp() - target_max_age
    order by r.reserved_at
    for update skip locked
    limit target_limit
  loop
    if reservation.scan_id is not null then
      update public.scans set
        status = 'failed',
        error_message = 'Scan reservation expired before completion.',
        completed_at = statement_timestamp()
      where id = reservation.scan_id
        and status in ('queued', 'processing');
    end if;
    perform veritrust_private.finalize_usage(
      reservation.id, false, 'expired', jsonb_build_object('recovered', true)
    );
    recovered := recovered + 1;
  end loop;
  return recovered;
end
$function$;

create or replace function public.claim_billing_event_atomic(
  target_provider text,
  target_event_id text,
  target_event_type text,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  event_row public.billing_events%rowtype;
  inserted integer := 0;
  new_claim_token uuid := gen_random_uuid();
begin
  if length(coalesce(target_provider, '')) not between 1 and 40
     or length(coalesce(target_event_id, '')) not between 1 and 255
     or length(coalesce(target_event_type, '')) not between 1 and 160
     or jsonb_typeof(coalesce(target_payload, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid billing event claim.';
  end if;

  insert into public.billing_events (
    provider, event_id, event_type, status, payload, attempt_count, claimed_at, claim_token
  ) values (
    target_provider, target_event_id, target_event_type, 'processing',
    coalesce(target_payload, '{}'::jsonb), 1, statement_timestamp(), new_claim_token
  ) on conflict (provider, event_id) do nothing;
  get diagnostics inserted = row_count;

  select * into event_row
  from public.billing_events
  where provider = target_provider and event_id = target_event_id
  for update;
  if inserted = 1 then
    return jsonb_build_object(
      'claimed', true, 'duplicate', false, 'retry', false,
      'claim_token', new_claim_token
    );
  end if;
  if event_row.status = 'processed' then
    return jsonb_build_object('claimed', false, 'duplicate', true, 'status', event_row.status);
  end if;
  if event_row.status = 'processing'
     and event_row.attempt_count > 0
     and event_row.claimed_at < statement_timestamp() - interval '5 minutes' then
    update public.billing_events set
      attempt_count = attempt_count + 1,
      claimed_at = statement_timestamp(), payload = target_payload,
      error_message = null, claim_token = new_claim_token
    where id = event_row.id;
    return jsonb_build_object(
      'claimed', true, 'duplicate', false, 'retry', true,
      'claim_token', new_claim_token
    );
  end if;
  if event_row.status = 'failed' then
    update public.billing_events set
      status = 'processing', attempt_count = attempt_count + 1,
      claimed_at = statement_timestamp(), payload = target_payload,
      error_message = null, claim_token = new_claim_token
    where id = event_row.id;
    return jsonb_build_object(
      'claimed', true, 'duplicate', false, 'retry', true,
      'claim_token', new_claim_token
    );
  end if;
  return jsonb_build_object('claimed', false, 'duplicate', true, 'status', event_row.status);
end
$function$;

create or replace function public.apply_billing_subscription_event_atomic(
  target_provider text,
  target_event_id text,
  target_claim_token uuid,
  target_org_id uuid,
  target_plan_id uuid,
  target_customer_id text,
  target_subscription_id text,
  target_price_id text,
  target_status text,
  target_period_start timestamptz,
  target_period_end timestamptz,
  target_cancel_at_period_end boolean,
  target_trial_end timestamptz,
  target_subscription_metadata jsonb,
  target_event_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  event_row public.billing_events%rowtype;
  subscription_id uuid;
begin
  select * into event_row
  from public.billing_events
  where provider = target_provider and event_id = target_event_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Billing event was not claimed.'; end if;
  if event_row.status = 'processed' then
    return jsonb_build_object('processed', true, 'duplicate', true);
  end if;
  if event_row.status <> 'processing' then
    raise exception using errcode = '55000', message = 'Billing event is not processing.';
  end if;
  if target_claim_token is null or event_row.claim_token <> target_claim_token then
    raise exception using errcode = '55000', message = 'Billing event claim is no longer current.';
  end if;
  if target_org_id is null or length(coalesce(target_subscription_id, '')) = 0 then
    raise exception using errcode = '22023', message = 'Subscription organization and ID are required.';
  end if;

  if target_plan_id is not null then
    update public.organizations set plan_id = target_plan_id, updated_at = statement_timestamp()
    where id = target_org_id;
    if not found then raise exception using errcode = 'P0002', message = 'Billing organization was not found.'; end if;
  end if;

  insert into public.organization_subscriptions (
    org_id, plan_id, provider, provider_customer_id, provider_subscription_id,
    provider_price_id, status, current_period_start, current_period_end,
    cancel_at_period_end, trial_end, metadata
  ) values (
    target_org_id, target_plan_id, target_provider, target_customer_id,
    target_subscription_id, target_price_id, target_status,
    target_period_start, target_period_end,
    coalesce(target_cancel_at_period_end, false), target_trial_end,
    coalesce(target_subscription_metadata, '{}'::jsonb)
  )
  on conflict (provider, provider_subscription_id) do update set
    org_id = excluded.org_id,
    plan_id = excluded.plan_id,
    provider_customer_id = excluded.provider_customer_id,
    provider_price_id = excluded.provider_price_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    trial_end = excluded.trial_end,
    metadata = excluded.metadata,
    updated_at = statement_timestamp()
  returning id into subscription_id;

  update public.billing_events set
    status = 'processed', error_message = null,
    processed_at = statement_timestamp(), payload = coalesce(target_event_payload, payload)
  where id = event_row.id;
  return jsonb_build_object(
    'processed', true, 'duplicate', false, 'subscription_id', subscription_id
  );
end
$function$;

create or replace function public.complete_billing_event_atomic(
  target_provider text,
  target_event_id text,
  target_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  changed integer;
begin
  update public.billing_events set
    status = 'processed', error_message = null, processed_at = statement_timestamp()
  where provider = target_provider and event_id = target_event_id
    and status = 'processing' and claim_token = target_claim_token;
  get diagnostics changed = row_count;
  return jsonb_build_object('processed', true, 'duplicate', changed = 0);
end
$function$;

create or replace function public.fail_billing_event_atomic(
  target_provider text,
  target_event_id text,
  target_claim_token uuid,
  target_error_message text
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  update public.billing_events set
    status = 'failed', error_message = left(coalesce(target_error_message, 'Billing event failed.'), 1000),
    processed_at = statement_timestamp()
  where provider = target_provider and event_id = target_event_id
    and status = 'processing' and claim_token = target_claim_token;
end
$function$;

revoke execute on function veritrust_private.reserve_usage(uuid, uuid, uuid, text, public.scan_type, text, text, text, integer, jsonb)
  from public, anon, authenticated;
revoke execute on function veritrust_private.finalize_usage(uuid, boolean, text, jsonb)
  from public, anon, authenticated;

revoke execute on function public.create_scan_record_atomic(uuid, public.scan_type, public.input_kind, text, uuid, text, text, jsonb, text, text, text, text)
  from public, anon;
grant execute on function public.create_scan_record_atomic(uuid, public.scan_type, public.input_kind, text, uuid, text, text, jsonb, text, text, text, text)
  to authenticated, service_role;

revoke execute on function public.complete_scan_record_atomic(uuid, text, numeric, public.risk_level, numeric, numeric, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.fail_scan_record_atomic(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.reserve_api_usage_atomic(uuid, text, text, public.scan_type, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.finalize_api_usage_atomic(uuid, text, text, integer, text)
  from public, anon, authenticated;
revoke execute on function public.recover_stale_usage_reservations(interval, integer)
  from public, anon, authenticated;
revoke execute on function public.claim_billing_event_atomic(text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.apply_billing_subscription_event_atomic(text, text, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.complete_billing_event_atomic(text, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.fail_billing_event_atomic(text, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.complete_scan_record_atomic(uuid, text, numeric, public.risk_level, numeric, numeric, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.fail_scan_record_atomic(uuid, text) to service_role;
grant execute on function public.reserve_api_usage_atomic(uuid, text, text, public.scan_type, text, jsonb) to service_role;
grant execute on function public.finalize_api_usage_atomic(uuid, text, text, integer, text) to service_role;
grant execute on function public.recover_stale_usage_reservations(interval, integer) to service_role;
grant execute on function public.claim_billing_event_atomic(text, text, text, jsonb) to service_role;
grant execute on function public.apply_billing_subscription_event_atomic(text, text, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.complete_billing_event_atomic(text, text, uuid) to service_role;
grant execute on function public.fail_billing_event_atomic(text, text, uuid, text) to service_role;

select cron.schedule(
  'veritrust-usage-reservation-recovery',
  '*/5 * * * *',
  $command$select public.recover_stale_usage_reservations();$command$
);

notify pgrst, 'reload schema';

commit;
