-- VeriTrust functions and RPCs
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
CREATE OR REPLACE FUNCTION public.check_entitlement_quota(target_org_id uuid, target_user_id uuid DEFAULT NULL::uuid, target_action text DEFAULT 'web_scan'::text, target_source text DEFAULT 'web'::text, target_scan_type scan_type DEFAULT NULL::scan_type, target_units integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.check_scan_quota(target_org_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(target_identity_type text, target_identity_hash text, target_endpoint text, target_limit_count integer, target_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(allowed boolean, request_count integer, limit_count integer, remaining integer, reset_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  current_row public.api_rate_limits%rowtype;
begin
  if target_identity_type not in ('user', 'ip') then
    raise exception 'Invalid rate limit identity type.';
  end if;

  if coalesce(target_identity_hash, '') = '' or coalesce(target_endpoint, '') = '' then
    raise exception 'Invalid rate limit bucket.';
  end if;

  if target_limit_count < 1 then
    raise exception 'Invalid rate limit count.';
  end if;

  insert into public.api_rate_limits (
    identity_type,
    identity_hash,
    endpoint,
    window_date,
    request_count,
    limit_count,
    metadata
  )
  values (
    target_identity_type,
    target_identity_hash,
    target_endpoint,
    current_date,
    1,
    target_limit_count,
    coalesce(target_metadata, '{}'::jsonb)
  )
  on conflict (identity_type, identity_hash, endpoint, window_date)
  do update set
    request_count = public.api_rate_limits.request_count + 1,
    limit_count = excluded.limit_count,
    metadata = public.api_rate_limits.metadata || excluded.metadata,
    updated_at = now()
  returning * into current_row;

  return query select
    current_row.request_count <= current_row.limit_count,
    current_row.request_count,
    current_row.limit_count,
    greatest(current_row.limit_count - current_row.request_count, 0),
    (current_row.window_date + interval '1 day')::timestamptz;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gateway_activate_policy_version(target_version_id uuid, target_activated_by uuid DEFAULT NULL::uuid, target_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  version_row public.gateway_policy_versions%rowtype;
  policy_row public.gateway_policies%rowtype;
  activation_id uuid;
  enforcement_allowed boolean;
begin
  select * into version_row
  from public.gateway_policy_versions
  where id = target_version_id;

  if not found or version_row.validation_status <> 'valid' then
    raise exception 'Only a valid gateway policy version may be activated.' using errcode = '22023';
  end if;

  select * into policy_row
  from public.gateway_policies
  where id = version_row.policy_id
  for update;

  if policy_row.status <> 'active' then
    raise exception 'Archived gateway policy cannot be activated.' using errcode = '55000';
  end if;

  if coalesce((version_row.policy_document -> 'enforcement' ->> 'automatic_block')::boolean, false) then
    select o.gateway_enabled
           and o.gateway_enforcement_enabled
           and p.allow_gateway_enforcement
    into enforcement_allowed
    from public.organizations o
    join public.plans p on p.id = o.plan_id
    where o.id = policy_row.org_id;

    if not coalesce(enforcement_allowed, false) then
      raise exception 'Automatic block policy activation is not enabled for this organization and plan.'
        using errcode = '42501';
    end if;
  end if;

  update public.gateway_policies
  set active_version_id = version_row.id
  where id = policy_row.id;

  insert into public.gateway_policy_activations (
    org_id, policy_id, version_id, previous_version_id, activated_by, reason
  ) values (
    policy_row.org_id, policy_row.id, version_row.id, policy_row.active_version_id,
    target_activated_by, left(target_reason, 500)
  ) returning id into activation_id;

  return activation_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_attach_upload(target_upload_id uuid, target_scan_id uuid, target_artifact_id uuid, target_final_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  upload_row public.gateway_uploads%rowtype;
begin
  select *
  into upload_row
  from public.gateway_uploads
  where id = target_upload_id
  for update;

  if not found
     or upload_row.status <> 'uploaded'
     or upload_row.expires_at <= statement_timestamp()
  then
    return false;
  end if;

  if upload_row.scan_id is distinct from target_scan_id
     or upload_row.final_path is distinct from target_final_path
  then
    raise exception
      'Upload attachment was not prepared for this scan path.'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.gateway_artifacts a
    where a.id = target_artifact_id
      and a.scan_id = target_scan_id
      and a.org_id = upload_row.org_id
      and a.storage_bucket = upload_row.storage_bucket
      and a.storage_path = target_final_path
  ) then
    raise exception
      'Attached gateway artifact does not match the upload.'
      using errcode = '23503';
  end if;

  update public.gateway_uploads
  set
    status = 'attached',
    artifact_id = target_artifact_id,
    attached_at = statement_timestamp()
  where id = target_upload_id;

  return true;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_claim_expired_uploads(target_limit integer DEFAULT 25)
 RETURNS TABLE(upload_id uuid, storage_bucket text, staging_path text, final_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  candidate public.gateway_uploads%rowtype;
begin
  if target_limit not between 1 and 100 then
    raise exception
      'Expired upload claim limit must be between 1 and 100.'
      using errcode = '22023';
  end if;

  for candidate in
    select *
    from public.gateway_uploads
    where status in (
      'pending',
      'uploaded',
      'expired'
    )
      and expires_at <= statement_timestamp()
    order by expires_at asc
    for update skip locked
    limit target_limit
  loop
    update public.gateway_uploads
    set status = 'expired'
    where id = candidate.id;

    upload_id := candidate.id;
    storage_bucket := candidate.storage_bucket;
    staging_path := candidate.staging_path;
    final_path := candidate.final_path;

    return next;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_claim_jobs(target_queue text, target_worker_id text, target_limit integer DEFAULT 10, target_visibility_seconds integer DEFAULT 60)
 RETURNS TABLE(job_id uuid, org_id uuid, scan_id uuid, artifact_id uuid, job_type gateway_job_type, payload jsonb, attempt_count integer, max_attempts integer, lease_token uuid, lease_expires_at timestamp with time zone, queue_message_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pgmq'
AS $function$
declare
  queue_message record;
  claimed public.gateway_jobs%rowtype;
  parsed_job_id uuid;
  new_lease_token uuid;
begin
  if target_queue not in ('gateway_media', 'gateway_webhooks', 'gateway_retention') then
    raise exception 'Unsupported gateway queue.' using errcode = '22023';
  end if;
  if length(coalesce(target_worker_id, '')) not between 1 and 160 then
    raise exception 'Worker id must contain 1 to 160 characters.' using errcode = '22023';
  end if;
  if target_limit not between 1 and 100 or target_visibility_seconds not between 10 and 3600 then
    raise exception 'Invalid queue batch or visibility timeout.' using errcode = '22023';
  end if;

  for queue_message in
    select * from pgmq.read(target_queue, target_visibility_seconds, target_limit)
  loop
    begin
      parsed_job_id := (queue_message.message ->> 'job_id')::uuid;
    exception when others then
      perform pgmq.archive(target_queue, queue_message.msg_id);
      continue;
    end;

    new_lease_token := gen_random_uuid();
    update public.gateway_jobs j
    set status = 'leased',
        attempt_count = j.attempt_count + 1,
        lease_token = new_lease_token,
        lease_owner = target_worker_id,
        lease_expires_at = statement_timestamp() + make_interval(secs => target_visibility_seconds),
        pgmq_message_id = queue_message.msg_id
    where j.id = parsed_job_id
      and j.queue_name = target_queue
      and (
        j.status in ('queued', 'retry')
        or (j.status = 'leased' and j.lease_expires_at < statement_timestamp())
      )
      and j.available_at <= statement_timestamp()
      and j.attempt_count < j.max_attempts
    returning j.* into claimed;

    if not found then
      update public.gateway_jobs
      set status = 'dead_letter',
          completed_at = statement_timestamp(),
          lease_token = null, lease_owner = null, lease_expires_at = null,
          last_error_code = coalesce(last_error_code, 'MAX_ATTEMPTS_EXHAUSTED')
      where id = parsed_job_id
        and queue_name = target_queue
        and attempt_count >= max_attempts
        and status not in ('completed', 'dead_letter', 'cancelled');
      perform pgmq.archive(target_queue, queue_message.msg_id);
      continue;
    end if;

    job_id := claimed.id;
    org_id := claimed.org_id;
    scan_id := claimed.scan_id;
    artifact_id := claimed.artifact_id;
    job_type := claimed.job_type;
    payload := claimed.payload;
    attempt_count := claimed.attempt_count;
    max_attempts := claimed.max_attempts;
    lease_token := claimed.lease_token;
    lease_expires_at := claimed.lease_expires_at;
    queue_message_id := queue_message.msg_id;
    return next;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_complete_job(target_job_id uuid, target_lease_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pgmq'
AS $function$
declare
  job_row public.gateway_jobs%rowtype;
begin
  select * into job_row
  from public.gateway_jobs
  where id = target_job_id
  for update;

  if not found or job_row.status <> 'leased' or job_row.lease_token <> target_lease_token then
    return false;
  end if;

  perform pgmq.archive(job_row.queue_name, job_row.pgmq_message_id);
  update public.gateway_jobs
  set status = 'completed', completed_at = statement_timestamp(),
      lease_token = null, lease_owner = null, lease_expires_at = null
  where id = target_job_id;

  update public.gateway_scans s
  set status = 'cancelled', completed_at = statement_timestamp()
  where s.id = job_row.scan_id
    and s.status = 'cancel_requested'
    and not exists (
      select 1 from public.gateway_jobs remaining
      where remaining.scan_id = s.id
        and remaining.id <> target_job_id
        and remaining.status in ('queued', 'retry', 'leased')
    );
  return true;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_complete_upload(target_upload_id uuid, target_detected_mime_type text, target_actual_size_bytes bigint, target_content_sha256 text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  update public.gateway_uploads
  set
    status = 'uploaded',
    detected_mime_type = lower(target_detected_mime_type),
    actual_size_bytes = target_actual_size_bytes,
    content_sha256 = target_content_sha256,
    completed_at = statement_timestamp()
  where id = target_upload_id
    and status = 'pending'
    and expires_at > statement_timestamp()
    and target_actual_size_bytes
      between 1 and declared_size_bytes
    and (
      target_content_sha256 is null
      or target_content_sha256 ~ '^[0-9a-f]{64}$'
    )
    and length(
      coalesce(target_detected_mime_type, '')
    ) between 1 and 160;

  return found;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_create_policy_version(target_policy_id uuid, target_policy_document jsonb, target_schema_version text DEFAULT '1.0'::text, target_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  policy_row public.gateway_policies%rowtype;
  next_version integer;
  policy_checksum text;
  new_id uuid;
begin
  select * into policy_row
  from public.gateway_policies
  where id = target_policy_id
  for update;

  if not found then
    raise exception 'Gateway policy was not found.' using errcode = 'P0002';
  end if;
  if policy_row.status <> 'active' then
    raise exception 'Archived gateway policies cannot receive new versions.' using errcode = '55000';
  end if;
  if jsonb_typeof(target_policy_document) <> 'object' then
    raise exception 'Gateway policy document must be a JSON object.' using errcode = '22023';
  end if;
  if not (target_policy_document ?& array[
    'actions', 'routing', 'timeouts', 'failure_modes', 'retention', 'enforcement', 'webhooks'
  ]) then
    raise exception 'Gateway policy is missing one or more required sections.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(target_policy_document) as policy_key(key_name)
    where key_name <> all(array[
      'actions', 'routing', 'timeouts', 'failure_modes', 'retention',
      'enforcement', 'webhooks', 'model_rollout', 'correlation_version'
    ])
  ) then
    raise exception 'Gateway policy contains an unknown top-level key.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(array['actions','routing','timeouts','failure_modes','retention','enforcement','webhooks'])
      as required_section(key_name)
    where jsonb_typeof(target_policy_document -> key_name) <> 'object'
  ) then
    raise exception 'Every enforcement-critical policy section must be a JSON object.' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.gateway_policy_versions
  where policy_id = target_policy_id;

  policy_checksum := encode(
    extensions.digest(convert_to(target_policy_document::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.gateway_policy_versions (
    policy_id, org_id, version, schema_version, policy_document,
    compiled_policy, checksum, validation_status, created_by
  ) values (
    policy_row.id, policy_row.org_id, next_version, target_schema_version,
    target_policy_document, target_policy_document, policy_checksum, 'valid', target_created_by
  ) returning id into new_id;

  return new_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_enqueue_job(target_org_id uuid, target_scan_id uuid, target_job_type gateway_job_type, target_dedupe_key text, target_artifact_id uuid DEFAULT NULL::uuid, target_payload jsonb DEFAULT '{}'::jsonb, target_priority smallint DEFAULT 100, target_available_at timestamp with time zone DEFAULT statement_timestamp(), target_max_attempts integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pgmq'
AS $function$
declare
  resolved_queue text;
  existing_job public.gateway_jobs%rowtype;
  new_job_id uuid;
  new_message_id bigint;
  delay_seconds integer;
begin
  resolved_queue := case target_job_type
    when 'media' then 'gateway_media'
    when 'webhook' then 'gateway_webhooks'
    when 'retention' then 'gateway_retention'
  end;

  if resolved_queue is null then
    raise exception 'Unsupported gateway job type.' using errcode = '22023';
  end if;
  if length(coalesce(target_dedupe_key, '')) not between 1 and 200 then
    raise exception 'Job dedupe key must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(target_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Job payload must be a JSON object.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.gateway_scans
    where id = target_scan_id and org_id = target_org_id
  ) then
    raise exception 'Gateway scan was not found for this organization.' using errcode = '23503';
  end if;
  if target_artifact_id is not null and not exists (
    select 1 from public.gateway_artifacts
    where id = target_artifact_id and scan_id = target_scan_id and org_id = target_org_id
  ) then
    raise exception 'Gateway artifact was not found for this scan.' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_org_id::text || ':' || target_job_type::text || ':' || target_dedupe_key,
    0
  ));

  select * into existing_job
  from public.gateway_jobs
  where org_id = target_org_id
    and job_type = target_job_type
    and dedupe_key = target_dedupe_key;

  if found then
    return jsonb_build_object('job_id', existing_job.id, 'replayed', true);
  end if;

  insert into public.gateway_jobs (
    org_id, scan_id, artifact_id, job_type, queue_name, dedupe_key,
    priority, available_at, max_attempts, payload
  ) values (
    target_org_id, target_scan_id, target_artifact_id, target_job_type,
    resolved_queue, target_dedupe_key, target_priority,
    greatest(target_available_at, statement_timestamp()), target_max_attempts,
    coalesce(target_payload, '{}'::jsonb)
  ) returning id into new_job_id;

  delay_seconds := greatest(0, ceil(extract(epoch from (target_available_at - statement_timestamp())))::integer);
  select * into new_message_id
  from pgmq.send(
    resolved_queue,
    jsonb_build_object('job_id', new_job_id, 'job_type', target_job_type),
    delay_seconds
  );

  update public.gateway_jobs
  set pgmq_message_id = new_message_id
  where id = new_job_id;

  return jsonb_build_object('job_id', new_job_id, 'message_id', new_message_id, 'replayed', false);
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_fail_job(target_job_id uuid, target_lease_token uuid, target_error_code text, target_error_detail jsonb DEFAULT '{}'::jsonb, target_retry_seconds integer DEFAULT 30)
 RETURNS gateway_job_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pgmq'
AS $function$
declare
  job_row public.gateway_jobs%rowtype;
  next_status public.gateway_job_status;
  new_message_id bigint;
begin
  if jsonb_typeof(coalesce(target_error_detail, '{}'::jsonb)) <> 'object'
     or target_retry_seconds not between 0 and 86400 then
    raise exception 'Invalid job failure metadata.' using errcode = '22023';
  end if;

  select * into job_row
  from public.gateway_jobs
  where id = target_job_id
  for update;

  if not found or job_row.status <> 'leased' or job_row.lease_token <> target_lease_token then
    raise exception 'Job lease is no longer valid.' using errcode = '55000';
  end if;

  perform pgmq.archive(job_row.queue_name, job_row.pgmq_message_id);

  if job_row.attempt_count >= job_row.max_attempts then
    next_status := 'dead_letter';
    new_message_id := null;
  else
    next_status := 'retry';
    select * into new_message_id
    from pgmq.send(
      job_row.queue_name,
      jsonb_build_object('job_id', job_row.id, 'job_type', job_row.job_type),
      target_retry_seconds
    );
  end if;

  update public.gateway_jobs
  set status = next_status,
      available_at = statement_timestamp() + make_interval(secs => target_retry_seconds),
      lease_token = null, lease_owner = null, lease_expires_at = null,
      pgmq_message_id = new_message_id,
      last_error_code = left(target_error_code, 120),
      last_error_detail = coalesce(target_error_detail, '{}'::jsonb),
      completed_at = case when next_status = 'dead_letter' then statement_timestamp() else null end
  where id = target_job_id;

  return next_status;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_heartbeat_job(target_job_id uuid, target_lease_token uuid, target_visibility_seconds integer DEFAULT 60)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pgmq'
AS $function$
declare
  job_row public.gateway_jobs%rowtype;
begin
  if target_visibility_seconds not between 10 and 3600 then
    raise exception 'Invalid visibility timeout.' using errcode = '22023';
  end if;

  select * into job_row
  from public.gateway_jobs
  where id = target_job_id
  for update;

  if not found or job_row.status <> 'leased' or job_row.lease_token <> target_lease_token then
    return false;
  end if;

  perform pgmq.set_vt(job_row.queue_name, job_row.pgmq_message_id, target_visibility_seconds);
  update public.gateway_jobs
  set lease_expires_at = statement_timestamp() + make_interval(secs => target_visibility_seconds)
  where id = target_job_id;
  return true;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_mark_upload_deleted(target_upload_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  update public.gateway_uploads
  set status = 'deleted'
  where id = target_upload_id
    and status = 'expired'
  returning true
$function$;

CREATE OR REPLACE FUNCTION public.gateway_prepare_upload_attachment(target_upload_id uuid, target_scan_id uuid, target_artifact_id uuid, target_final_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  upload_row public.gateway_uploads%rowtype;
begin
  select *
  into upload_row
  from public.gateway_uploads
  where id = target_upload_id
  for update;

  if not found
     or upload_row.status <> 'uploaded'
     or upload_row.expires_at <= statement_timestamp()
  then
    return false;
  end if;

  if target_final_path not like
    upload_row.org_id::text
    || '/'
    || target_scan_id::text
    || '/%'
  then
    raise exception
      'Final upload path is outside the tenant/scan prefix.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.gateway_artifacts a
    where a.id = target_artifact_id
      and a.scan_id = target_scan_id
      and a.org_id = upload_row.org_id
      and a.storage_bucket = upload_row.storage_bucket
      and a.storage_path = target_final_path
  ) then
    raise exception
      'Prepared gateway artifact does not match the upload.'
      using errcode = '23503';
  end if;

  update public.gateway_uploads
  set
    scan_id = target_scan_id,
    final_path = target_final_path
  where id = target_upload_id;

  return true;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_record_evidence(target_model_run_id uuid, target_status gateway_evidence_status, target_score numeric DEFAULT NULL::numeric, target_verdict gateway_evidence_verdict DEFAULT 'unknown'::gateway_evidence_verdict, target_confidence gateway_confidence_band DEFAULT 'unknown'::gateway_confidence_band, target_confidence_value numeric DEFAULT NULL::numeric, target_indicators jsonb DEFAULT '[]'::jsonb, target_reason_codes text[] DEFAULT '{}'::text[], target_raw_response_redacted jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  run_row public.gateway_model_runs%rowtype;
  existing_id uuid;
  new_id uuid;
  mapped_status public.gateway_model_run_status;
begin
  select id into existing_id
  from public.gateway_evidence
  where model_run_id = target_model_run_id;
  if found then
    return existing_id;
  end if;

  select * into run_row
  from public.gateway_model_runs
  where id = target_model_run_id
  for update;
  if not found then
    raise exception 'Gateway model run was not found.' using errcode = 'P0002';
  end if;
  select id into existing_id
  from public.gateway_evidence
  where model_run_id = target_model_run_id;
  if found then
    return existing_id;
  end if;
  if exists (
    select 1 from public.gateway_scans s
    where s.id = run_row.scan_id and s.status in ('cancel_requested', 'cancelled')
  ) then
    update public.gateway_model_runs
    set status = 'cancelled', completed_at = statement_timestamp()
    where id = run_row.id;
    return null;
  end if;
  if jsonb_typeof(coalesce(target_indicators, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(target_raw_response_redacted, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid normalized evidence JSON shape.' using errcode = '22023';
  end if;

  insert into public.gateway_evidence (
    org_id, scan_id, artifact_id, model_run_id, model_key, status, score,
    verdict, confidence, confidence_value, indicators, reason_codes,
    model_version, calibration_version, raw_response_redacted
  ) values (
    run_row.org_id, run_row.scan_id, run_row.artifact_id, run_row.id, run_row.model_key,
    target_status, target_score, target_verdict, target_confidence,
    target_confidence_value, coalesce(target_indicators, '[]'::jsonb),
    coalesce(target_reason_codes, '{}'::text[]), run_row.provider_model_version,
    run_row.calibration_version, coalesce(target_raw_response_redacted, '{}'::jsonb)
  ) returning id into new_id;

  mapped_status := target_status::text::public.gateway_model_run_status;
  update public.gateway_model_runs
  set status = mapped_status,
      completed_at = statement_timestamp(),
      latency_ms = case
        when started_at is null then latency_ms
        else greatest(0, floor(extract(epoch from (statement_timestamp() - started_at)) * 1000)::integer)
      end
  where id = run_row.id;

  return new_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_record_retention_receipt(target_artifact_id uuid, target_object_deleted boolean, target_metadata_scrubbed boolean, target_verified boolean, target_worker_id text, target_verification_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  artifact_row public.gateway_artifacts%rowtype;
  existing_id uuid;
  receipt_id uuid;
  storage_hash text;
begin
  select id into existing_id
  from public.gateway_retention_receipts
  where artifact_id = target_artifact_id;
  if found then
    return existing_id;
  end if;

  select * into artifact_row
  from public.gateway_artifacts
  where id = target_artifact_id
  for update;
  if not found then
    raise exception 'Gateway artifact was not found.' using errcode = 'P0002';
  end if;
  select id into existing_id
  from public.gateway_retention_receipts
  where artifact_id = target_artifact_id;
  if found then
    return existing_id;
  end if;
  if target_verified and not (target_object_deleted and target_metadata_scrubbed) then
    raise exception 'Verified retention requires object deletion and metadata scrubbing.' using errcode = '22023';
  end if;

  if artifact_row.storage_bucket is not null then
    storage_hash := encode(extensions.digest(
      convert_to(artifact_row.storage_bucket || '/' || artifact_row.storage_path, 'UTF8'),
      'sha256'
    ), 'hex');
  end if;

  if target_metadata_scrubbed then
    update public.gateway_artifacts
    set status = 'deleted', storage_bucket = null, storage_path = null,
        mime_type = null, size_bytes = null, metadata = '{}'::jsonb,
        scrubbed_at = statement_timestamp()
    where id = artifact_row.id;
  end if;

  insert into public.gateway_retention_receipts (
    org_id, scan_id, artifact_id, storage_reference_hash, object_deleted,
    metadata_scrubbed, verified, verification_detail, worker_id
  ) values (
    artifact_row.org_id, artifact_row.scan_id, artifact_row.id, storage_hash,
    target_object_deleted, target_metadata_scrubbed, target_verified,
    coalesce(target_verification_detail, '{}'::jsonb), target_worker_id
  ) returning id into receipt_id;

  return receipt_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_record_webhook_attempt(target_event_id uuid, target_outcome text, target_response_code integer DEFAULT NULL::integer, target_latency_ms integer DEFAULT NULL::integer, target_retry_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_error_code text DEFAULT NULL::text, target_error_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  event_row public.gateway_webhook_events%rowtype;
  next_attempt integer;
  attempt_id uuid;
  mapped_status public.gateway_delivery_status;
begin
  if target_outcome not in ('delivered', 'retry', 'failed') then
    raise exception 'Unsupported webhook attempt outcome.' using errcode = '22023';
  end if;

  select * into event_row
  from public.gateway_webhook_events
  where id = target_event_id
  for update;
  if not found then
    raise exception 'Gateway webhook event was not found.' using errcode = 'P0002';
  end if;

  next_attempt := event_row.attempt_count + 1;
  insert into public.gateway_webhook_attempts (
    org_id, event_id, attempt, outcome, response_code, latency_ms,
    retry_at, error_code, error_detail
  ) values (
    event_row.org_id, event_row.id, next_attempt, target_outcome,
    target_response_code, target_latency_ms, target_retry_at,
    left(target_error_code, 120), coalesce(target_error_detail, '{}'::jsonb)
  ) returning id into attempt_id;

  mapped_status := case target_outcome
    when 'delivered' then 'delivered'::public.gateway_delivery_status
    when 'retry' then 'retry'::public.gateway_delivery_status
    else 'failed'::public.gateway_delivery_status
  end;

  update public.gateway_webhook_events
  set status = mapped_status,
      attempt_count = next_attempt,
      available_at = coalesce(target_retry_at, available_at),
      delivered_at = case when target_outcome = 'delivered' then statement_timestamp() else delivered_at end,
      terminal_error_code = case when target_outcome = 'failed' then left(target_error_code, 120) else null end
  where id = event_row.id;

  return attempt_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_register_upload(target_org_id uuid, target_integration_id uuid, target_artifact_type gateway_artifact_type, target_mime_type text, target_size_bytes bigint, target_created_by uuid DEFAULT NULL::uuid, target_ttl_seconds integer DEFAULT 900)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  new_id uuid := gen_random_uuid();
  new_path text;
  new_expiry timestamptz;
begin
  if target_artifact_type not in (
    'image',
    'audio',
    'video'
  ) then
    raise exception
      'Only image, audio, and video uploads are supported.'
      using errcode = '22023';
  end if;

  if target_size_bytes not between 1 and 104857600
     or length(coalesce(target_mime_type, ''))
        not between 1 and 160
  then
    raise exception
      'Invalid upload size or MIME type.'
      using errcode = '22023';
  end if;

  if target_ttl_seconds not between 60 and 3600 then
    raise exception
      'Upload TTL must be between 60 and 3600 seconds.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.gateway_integrations i
    join public.organizations o
      on o.id = i.org_id
    where i.id = target_integration_id
      and i.org_id = target_org_id
      and i.status = 'active'
      and 'gateway:scan' = any(i.allowed_actions)
      and o.gateway_enabled
  ) then
    raise exception
      'Active gateway upload integration was not found or gateway is disabled.'
      using errcode = '42501';
  end if;

  new_path :=
    target_org_id::text
    || '/staging/'
    || new_id::text
    || '/source';

  new_expiry :=
    statement_timestamp()
    + make_interval(secs => target_ttl_seconds);

  insert into public.gateway_uploads (
    id,
    org_id,
    integration_id,
    created_by,
    artifact_type,
    staging_path,
    declared_mime_type,
    declared_size_bytes,
    expires_at
  )
  values (
    new_id,
    target_org_id,
    target_integration_id,
    target_created_by,
    target_artifact_type,
    new_path,
    lower(target_mime_type),
    target_size_bytes,
    new_expiry
  );

  return jsonb_build_object(
    'upload_id', new_id,
    'bucket', 'gateway-uploads',
    'path', new_path,
    'expires_at', new_expiry
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_request_cancel(target_scan_id uuid)
 RETURNS gateway_scan_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pgmq'
AS $function$
declare
  scan_row public.gateway_scans%rowtype;
  job_row public.gateway_jobs%rowtype;
  has_leased boolean;
  next_status public.gateway_scan_status;
begin
  select * into scan_row
  from public.gateway_scans
  where id = target_scan_id
  for update;

  if not found then
    raise exception 'Gateway scan was not found.' using errcode = 'P0002';
  end if;
  if scan_row.status in ('completed', 'failed', 'cancelled') then
    return scan_row.status;
  end if;

  for job_row in
    select * from public.gateway_jobs
    where scan_id = target_scan_id and status in ('queued', 'retry')
    for update
  loop
    if job_row.pgmq_message_id is not null then
      perform pgmq.archive(job_row.queue_name, job_row.pgmq_message_id);
    end if;
    update public.gateway_jobs
    set status = 'cancelled', completed_at = statement_timestamp()
    where id = job_row.id;
  end loop;

  update public.gateway_model_runs
  set status = 'cancelled', completed_at = statement_timestamp()
  where scan_id = target_scan_id and status in ('pending', 'queued');

  select exists(
    select 1 from public.gateway_jobs
    where scan_id = target_scan_id and status = 'leased'
  ) into has_leased;

  next_status := case when has_leased then 'cancel_requested' else 'cancelled' end;
  update public.gateway_scans
  set status = next_status,
      cancel_requested_at = coalesce(cancel_requested_at, statement_timestamp()),
      completed_at = case when next_status = 'cancelled' then statement_timestamp() else completed_at end
  where id = target_scan_id;

  return next_status;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_schema_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object(
    'migration', (select version from public.gateway_schema_migrations where version = 'veritrust_gateway_001'),
    'gateway_enabled_orgs', (select count(*) from public.organizations where gateway_enabled),
    'gateway_enforcement_enabled_orgs', (select count(*) from public.organizations where gateway_enforcement_enabled),
    'active_policies_without_version', (
      select count(*) from public.gateway_policies where status = 'active' and active_version_id is null
    ),
    'accepted_scans_today', (
      select coalesce(sum(accepted_scans), 0) from public.gateway_usage_daily where usage_date = current_date
    ),
    'actionable_jobs', (
      select count(*) from public.gateway_jobs where status in ('queued', 'retry', 'leased')
    ),
    'dead_letter_jobs', (
      select count(*) from public.gateway_jobs where status = 'dead_letter'
    ),
    'overdue_retention_artifacts', (
      select count(*) from public.gateway_artifacts
      where retention_until < statement_timestamp() and scrubbed_at is null
    ),
    'generated_at', statement_timestamp()
  );
$function$;

CREATE OR REPLACE FUNCTION public.gateway_store_idempotent_response(target_scan_id uuid, target_response_status integer, target_response_body jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  idempotency_row public.gateway_idempotency_keys%rowtype;
begin
  if target_response_status not between 100 and 599
     or jsonb_typeof(target_response_body) <> 'object'
     or pg_column_size(target_response_body) > 1048576 then
    raise exception 'Invalid idempotent response envelope.' using errcode = '22023';
  end if;

  select * into idempotency_row
  from public.gateway_idempotency_keys
  where scan_id = target_scan_id
  for update;

  if not found then
    raise exception 'Gateway idempotency record was not found.' using errcode = 'P0002';
  end if;
  if idempotency_row.response_status is not null then
    return false;
  end if;

  update public.gateway_idempotency_keys
  set response_status = target_response_status,
      response_body = target_response_body
  where id = idempotency_row.id;
  return true;
end
$function$;

CREATE OR REPLACE FUNCTION public.gateway_submit_scan(target_org_id uuid, target_integration_id uuid, target_idempotency_key text, target_request_hash text, target_api_key_id uuid DEFAULT NULL::uuid, target_submitted_by uuid DEFAULT NULL::uuid, target_processing_mode gateway_processing_mode DEFAULT 'hybrid'::gateway_processing_mode, target_source text DEFAULT 'api'::text, target_external_event_id text DEFAULT NULL::text, target_request_id text DEFAULT NULL::text, target_trace_id text DEFAULT NULL::text, target_policy_version_id uuid DEFAULT NULL::uuid, target_deadline_at timestamp with time zone DEFAULT NULL::timestamp with time zone, target_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  integration_row public.gateway_integrations%rowtype;
  existing_idempotency public.gateway_idempotency_keys%rowtype;
  selected_policy_version uuid;
  new_scan_id uuid;
  resolved_request_id text;
  resolved_trace_id text;
  daily_limit integer;
  monthly_limit integer;
  current_daily integer;
  current_monthly bigint;
begin
  if length(coalesce(target_idempotency_key, '')) not between 1 and 200 then
    raise exception 'Idempotency-Key must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if target_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Request hash must be a lowercase SHA-256 hex digest.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(target_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Scan metadata must be a JSON object.' using errcode = '22023';
  end if;

  select * into integration_row
  from public.gateway_integrations
  where id = target_integration_id and org_id = target_org_id
  for share;

  if not found or integration_row.status <> 'active' then
    raise exception 'Active gateway integration was not found for this organization.' using errcode = '42501';
  end if;
  if not ('gateway:scan' = any(integration_row.allowed_actions)) then
    raise exception 'Gateway integration is not allowed to submit scans.' using errcode = '42501';
  end if;
  if integration_row.api_key_id is not null
     and integration_row.api_key_id is distinct from target_api_key_id then
    raise exception 'API key is not bound to the selected gateway integration.' using errcode = '42501';
  end if;
  if target_api_key_id is not null and not exists (
    select 1
    from public.api_keys ak
    where ak.id = target_api_key_id
      and ak.org_id = target_org_id
      and ak.status = 'active'
      and ak.revoked_at is null
      and ak.not_before <= statement_timestamp()
      and (ak.expires_at is null or ak.expires_at > statement_timestamp())
      and ak.scopes @> '["gateway:scan"]'::jsonb
  ) then
    raise exception 'A valid gateway:scan API key is required.' using errcode = '42501';
  end if;
  if target_submitted_by is not null and not exists (
    select 1
    from public.organization_members om
    where om.org_id = target_org_id
      and om.user_id = target_submitted_by
      and om.status = 'active'
  ) then
    raise exception 'Submitting user is not an active organization member.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_org_id::text || ':' || target_integration_id::text || ':' || target_idempotency_key,
    0
  ));

  select * into existing_idempotency
  from public.gateway_idempotency_keys
  where org_id = target_org_id
    and integration_id = target_integration_id
    and idempotency_key = target_idempotency_key
  for update;

  if found then
    if existing_idempotency.request_hash <> target_request_hash then
      raise exception 'Idempotency-Key was already used with a different request.'
        using errcode = '23505', detail = 'GATEWAY_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'scan_id', existing_idempotency.scan_id,
      'replayed', true,
      'response_status', existing_idempotency.response_status,
      'response_body', existing_idempotency.response_body
    );
  end if;

  if target_policy_version_id is null then
    select p.active_version_id into selected_policy_version
    from public.gateway_policies p
    where p.org_id = target_org_id
      and p.status = 'active'
      and p.active_version_id is not null
    order by p.created_at
    limit 1;
  else
    select pv.id into selected_policy_version
    from public.gateway_policy_versions pv
    where pv.id = target_policy_version_id
      and pv.org_id = target_org_id
      and pv.validation_status = 'valid';
  end if;

  if selected_policy_version is null then
    raise exception 'No active valid gateway policy exists for this organization.' using errcode = '55000';
  end if;

  select p.daily_gateway_scan_limit, p.monthly_gateway_scan_limit
  into daily_limit, monthly_limit
  from public.organizations o
  join public.plans p on p.id = o.plan_id
  where o.id = target_org_id and o.gateway_enabled;

  if not found then
    raise exception 'The unified gateway is not enabled for this organization.' using errcode = '42501';
  end if;

  insert into public.gateway_usage_daily (org_id, usage_date)
  values (target_org_id, current_date)
  on conflict (org_id, usage_date) do nothing;

  select accepted_scans into current_daily
  from public.gateway_usage_daily
  where org_id = target_org_id and usage_date = current_date
  for update;

  select coalesce(sum(accepted_scans), 0) into current_monthly
  from public.gateway_usage_daily
  where org_id = target_org_id
    and usage_date >= date_trunc('month', current_date)::date
    and usage_date < (date_trunc('month', current_date) + interval '1 month')::date;

  if current_daily >= daily_limit or current_monthly >= monthly_limit then
    raise exception 'Gateway scan quota exceeded.'
      using errcode = 'P0001', detail = 'GATEWAY_QUOTA_EXCEEDED';
  end if;

  update public.gateway_usage_daily
  set accepted_scans = accepted_scans + 1
  where org_id = target_org_id and usage_date = current_date;

  resolved_request_id := coalesce(nullif(target_request_id, ''), 'vt_req_' || replace(gen_random_uuid()::text, '-', ''));
  resolved_trace_id := coalesce(nullif(target_trace_id, ''), 'vt_trace_' || replace(gen_random_uuid()::text, '-', ''));

  insert into public.gateway_scans (
    org_id, integration_id, api_key_id, submitted_by, external_event_id,
    processing_mode, status, source, request_id, trace_id, request_hash,
    policy_version_id, deadline_at, metadata
  ) values (
    target_org_id, target_integration_id, target_api_key_id, target_submitted_by,
    nullif(target_external_event_id, ''), target_processing_mode, 'accepted',
    left(coalesce(nullif(target_source, ''), 'api'), 64), resolved_request_id,
    resolved_trace_id, target_request_hash, selected_policy_version,
    target_deadline_at, coalesce(target_metadata, '{}'::jsonb)
  ) returning id into new_scan_id;

  insert into public.gateway_idempotency_keys (
    org_id, integration_id, idempotency_key, request_hash, scan_id
  ) values (
    target_org_id, target_integration_id, target_idempotency_key,
    target_request_hash, new_scan_id
  );

  return jsonb_build_object(
    'scan_id', new_scan_id,
    'request_id', resolved_request_id,
    'trace_id', resolved_trace_id,
    'policy_version_id', selected_policy_version,
    'replayed', false
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.has_org_role(target_org_id uuid, allowed_roles app_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select auth.uid() is not null and exists (
    select 1
    from public.organization_members om
    where om.org_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = any(allowed_roles)
  );
$function$;

CREATE OR REPLACE FUNCTION public.increment_usage(target_org_id uuid, target_user_id uuid, target_scan_type scan_type, from_api boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select auth.uid() is not null and exists (
    select 1
    from public.organization_members om
    where om.org_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.learning_assert_member(target_user_id uuid, target_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if not exists (
    select 1
    from public.organization_members member
    where member.org_id = target_org_id
      and member.user_id = target_user_id
      and member.status::text = 'active'
  ) then
    raise exception 'LEARNING_MEMBERSHIP_REQUIRED';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.learning_is_org_admin(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select exists (
    select 1
    from public.organization_members member
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status::text = 'active'
      and member.role::text in ('owner', 'admin')
  )
  or exists (
    select 1
    from public.learning_role_assignments role_assignment
    where role_assignment.org_id = target_org_id
      and role_assignment.user_id = auth.uid()
      and role_assignment.role in (
        'author', 'reviewer', 'publisher',
        'instructor', 'credential_admin'
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.learning_is_org_member(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select exists (
    select 1
    from public.organization_members member
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status::text = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.learning_lock_published_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if old.status = 'published' then
    if tg_op = 'DELETE' then
      raise exception 'PUBLISHED_VERSION_IS_IMMUTABLE';
    end if;

    if (to_jsonb(new) - 'status' - 'updated_at')
       <> (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'PUBLISHED_VERSION_IS_IMMUTABLE';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.learning_new_public_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  raw_code text;
begin
  raw_code := upper(encode(gen_random_bytes(16), 'hex'));

  return
    'VT-' ||
    substr(raw_code, 1, 8) || '-' ||
    substr(raw_code, 9, 8) || '-' ||
    substr(raw_code, 17, 8) || '-' ||
    substr(raw_code, 25, 8);
end;
$function$;

CREATE OR REPLACE FUNCTION public.learning_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_audit_event(target_org_id uuid, event_action text, target_table_name text DEFAULT NULL::text, target_record_id uuid DEFAULT NULL::uuid, event_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  new_id uuid;
begin
  insert into public.audit_logs (org_id, actor_user_id, action, target_table, target_id, metadata)
  values (target_org_id, auth.uid(), event_action, target_table_name, target_record_id, event_metadata)
  returning id into new_id;
  return new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at = statement_timestamp();
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION veritrust_private.enable_rls_on_new_public_tables()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  command record;
begin
  for command in
    select *
    from pg_catalog.pg_event_trigger_ddl_commands()
    where command_tag in (
      'CREATE TABLE',
      'CREATE TABLE AS',
      'SELECT INTO'
    )
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

CREATE OR REPLACE FUNCTION veritrust_private.gateway_dispatch_worker(target_source text DEFAULT 'manual'::text, target_job_id uuid DEFAULT NULL::uuid, target_queue text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'veritrust_private', 'extensions', 'vault', 'net'
AS $function$
declare
  normalized_source text;
  normalized_queue text;
  worker_url text;
  dispatch_secret text;
  dispatch_timestamp text;
  dispatch_nonce uuid;
  signing_message text;
  dispatch_signature text;
  dispatch_body jsonb;
  request_id bigint;
begin
  normalized_source :=
    lower(btrim(coalesce(target_source, '')));

  normalized_queue :=
    nullif(btrim(coalesce(target_queue, '')), '');

  if normalized_source not in (
    'job_insert',
    'cron',
    'manual',
    'recovery'
  ) then
    raise exception
      'Unsupported gateway dispatch source: %',
      normalized_source
      using errcode = '22023';
  end if;

  if normalized_queue is not null
     and normalized_queue not in (
       'gateway_media',
       'gateway_webhooks',
       'gateway_retention'
     ) then
    raise exception
      'Unsupported gateway queue: %',
      normalized_queue
      using errcode = '22023';
  end if;

  select decrypted_secret
  into worker_url
  from vault.decrypted_secrets
  where name = 'veritrust_gateway_worker_url'
  order by updated_at desc
  limit 1;

  select decrypted_secret
  into dispatch_secret
  from vault.decrypted_secrets
  where name = 'veritrust_gateway_dispatch_secret'
  order by updated_at desc
  limit 1;

  if worker_url is null
     or worker_url <>
        'https://www.veritrustlab.in/api/gateway-worker' then
    raise exception
      'The canonical gateway worker URL is missing or invalid.'
      using errcode = '55000';
  end if;

  if dispatch_secret is null
     or octet_length(dispatch_secret) < 32 then
    raise exception
      'The gateway dispatch secret is missing or too short.'
      using errcode = '55000';
  end if;

  dispatch_timestamp :=
    floor(
      extract(epoch from clock_timestamp())
    )::bigint::text;

  dispatch_nonce := gen_random_uuid();

  -- Must exactly match lib/gateway/worker-auth.js.
  signing_message :=
      'v1'
      || chr(10)
      || dispatch_timestamp
      || chr(10)
      || lower(dispatch_nonce::text)
      || chr(10)
      || normalized_source
      || chr(10)
      || coalesce(target_job_id::text, '')
      || chr(10)
      || coalesce(normalized_queue, '');

  dispatch_signature :=
    'v1=' ||
    encode(
      extensions.hmac(
        convert_to(signing_message, 'UTF8'),
        convert_to(dispatch_secret, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

  dispatch_body :=
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', normalized_source,
        'job_id', target_job_id,
        'queue_name', normalized_queue
      )
    );

  select net.http_post(
    url := worker_url,
    body := dispatch_body,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'X-VeriTrust-Dispatch-Timestamp',
      dispatch_timestamp,
      'X-VeriTrust-Dispatch-Nonce',
      lower(dispatch_nonce::text),
      'X-VeriTrust-Dispatch-Signature',
      dispatch_signature
    ),
    timeout_milliseconds := 15000
  )
  into request_id;

  if request_id is null then
    raise exception
      'pg_net did not return a worker request ID.'
      using errcode = '55000';
  end if;

  return request_id;
end;
$function$;
comment on function "veritrust_private"."gateway_dispatch_worker"(target_source text, target_job_id uuid, target_queue text) is 'Creates an authenticated asynchronous pg_net request to the VeriTrust Vercel gateway worker.';

CREATE OR REPLACE FUNCTION veritrust_private.prevent_gateway_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Gateway history table % is append-only.', tg_table_name
    using errcode = '55000';
end
$function$;

CREATE OR REPLACE FUNCTION veritrust_private.track_gateway_usage_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if tg_table_name = 'gateway_artifacts' then
    insert into public.gateway_usage_daily (
      org_id, usage_date, artifact_count, submitted_bytes
    ) values (
      new.org_id, new.created_at::date, 1, coalesce(new.size_bytes, 0)
    )
    on conflict (org_id, usage_date) do update
    set artifact_count = public.gateway_usage_daily.artifact_count + 1,
        submitted_bytes = public.gateway_usage_daily.submitted_bytes + excluded.submitted_bytes;
  elsif tg_table_name = 'gateway_model_runs' then
    insert into public.gateway_usage_daily (
      org_id, usage_date, model_run_count
    ) values (
      new.org_id, new.created_at::date, 1
    )
    on conflict (org_id, usage_date) do update
    set model_run_count = public.gateway_usage_daily.model_run_count + 1;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.can_access_scan(target_scan_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select exists (
    select 1
    from public.scans s
    where s.id = target_scan_id
      and public.is_org_member(s.org_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_write_scan(target_scan_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.complete_scan_record(target_scan_id uuid, result_label text, result_confidence numeric, result_risk_level risk_level, result_primary_score numeric, result_secondary_score numeric, result_explanation text, result_indicators jsonb DEFAULT '[]'::jsonb, result_raw_scores jsonb DEFAULT '[]'::jsonb, model_runs jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_scan_record(target_org_id uuid, target_scan_type scan_type, target_input_kind input_kind, target_selected_model_key text, target_project_id uuid DEFAULT NULL::uuid, target_text_preview text DEFAULT NULL::text, target_text_hash text DEFAULT NULL::text, target_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fail_scan_record(target_scan_id uuid, failure_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.gateway_publish_decision(target_scan_id uuid, target_decision_key text, target_decision_kind gateway_decision_kind, target_risk_score numeric, target_verdict gateway_risk_verdict, target_recommendation gateway_recommendation, target_degraded boolean DEFAULT false, target_reason_codes text[] DEFAULT '{}'::text[], target_evidence_ids uuid[] DEFAULT '{}'::uuid[], target_correlation_version text DEFAULT 'gateway-correlation-v1'::text, target_created_by uuid DEFAULT NULL::uuid, target_create_review boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  scan_row public.gateway_scans%rowtype;
  existing_id uuid;
  new_id uuid;
  next_sequence integer;
  superseded uuid;
  endpoint_row public.gateway_webhook_endpoints%rowtype;
  event_id uuid;
  event_payload jsonb;
  effective_recommendation public.gateway_recommendation;
  effective_reason_codes text[];
  enforcement_allowed boolean;
begin
  if length(coalesce(target_decision_key, '')) not between 1 and 160 then
    raise exception 'Decision key must contain 1 to 160 characters.' using errcode = '22023';
  end if;

  select id into existing_id
  from public.gateway_decisions
  where scan_id = target_scan_id and decision_key = target_decision_key;
  if found then
    return existing_id;
  end if;

  select * into scan_row
  from public.gateway_scans
  where id = target_scan_id
  for update;
  if not found then
    raise exception 'Gateway scan was not found.' using errcode = 'P0002';
  end if;

  select id into existing_id
  from public.gateway_decisions
  where scan_id = target_scan_id and decision_key = target_decision_key;
  if found then
    return existing_id;
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_evidence_ids, '{}'::uuid[])) requested_evidence(id)
    left join public.gateway_evidence e
      on e.id = requested_evidence.id
     and e.scan_id = scan_row.id
     and e.org_id = scan_row.org_id
    where e.id is null
  ) then
    raise exception 'Decision evidence must belong to the selected gateway scan.' using errcode = '23503';
  end if;

  effective_recommendation := target_recommendation;
  effective_reason_codes := coalesce(target_reason_codes, '{}'::text[]);

  if target_recommendation = 'block' then
    select o.gateway_enabled
           and o.gateway_enforcement_enabled
           and p.allow_gateway_enforcement
           and coalesce((pv.policy_document -> 'enforcement' ->> 'automatic_block')::boolean, false)
    into enforcement_allowed
    from public.organizations o
    join public.plans p on p.id = o.plan_id
    join public.gateway_policy_versions pv on pv.id = scan_row.policy_version_id
    where o.id = scan_row.org_id;

    if not coalesce(enforcement_allowed, false) then
      effective_recommendation := 'quarantine';
      if not ('AUTOMATIC_BLOCK_DISABLED' = any(effective_reason_codes)) then
        effective_reason_codes := array_append(effective_reason_codes, 'AUTOMATIC_BLOCK_DISABLED');
      end if;
    end if;
  end if;

  select coalesce(max(sequence), 0) + 1,
         (array_agg(id order by sequence desc))[1]
  into next_sequence, superseded
  from public.gateway_decisions
  where scan_id = target_scan_id;

  insert into public.gateway_decisions (
    org_id, scan_id, sequence, decision_key, decision_kind, risk_score,
    verdict, recommendation, degraded, reason_codes, evidence_ids,
    policy_version_id, correlation_version, supersedes_id, created_by
  ) values (
    scan_row.org_id, scan_row.id, next_sequence, target_decision_key,
    target_decision_kind, target_risk_score, target_verdict, effective_recommendation,
    target_degraded, effective_reason_codes,
    coalesce(target_evidence_ids, '{}'::uuid[]), scan_row.policy_version_id,
    target_correlation_version, superseded, target_created_by
  ) returning id into new_id;

  update public.gateway_scans
  set preliminary_decision_id = case
        when target_decision_kind = 'preliminary' then new_id else preliminary_decision_id end,
      final_decision_id = case
        when target_decision_kind = 'final' then new_id else final_decision_id end,
      status = case
        when target_decision_kind = 'final' then 'completed'::public.gateway_scan_status
        when target_decision_kind = 'preliminary' then 'partially_completed'::public.gateway_scan_status
        else status end,
      degraded = degraded or target_degraded,
      completed_at = case when target_decision_kind = 'final' then statement_timestamp() else completed_at end
  where id = scan_row.id;

  if target_create_review or effective_recommendation in ('manual_review', 'quarantine', 'block') then
    insert into public.gateway_review_cases (
      org_id, scan_id, decision_id, reason_codes
    ) values (
      scan_row.org_id, scan_row.id, new_id, effective_reason_codes
    ) on conflict (decision_id) do nothing;
  end if;

  if target_decision_kind = 'final' then
    for endpoint_row in
      select * from public.gateway_webhook_endpoints
      where org_id = scan_row.org_id
        and status = 'active'
        and 'gateway.scan.completed' = any(event_types)
    loop
      event_id := gen_random_uuid();
      event_payload := jsonb_build_object(
        'event_id', event_id,
        'event_type', 'gateway.scan.completed',
        'schema_version', '1.0',
        'created_at', statement_timestamp(),
        'data', jsonb_build_object(
          'scan_id', scan_row.id,
          'display_id', scan_row.display_id,
          'decision_id', new_id,
          'risk_score', target_risk_score,
          'verdict', target_verdict,
          'recommendation', effective_recommendation,
          'degraded', target_degraded,
          'policy_version_id', scan_row.policy_version_id,
          'correlation_version', target_correlation_version
        )
      );

      insert into public.gateway_webhook_events (
        id, org_id, endpoint_id, scan_id, decision_id, event_type,
        dedupe_key, payload, payload_checksum
      ) values (
        event_id, scan_row.org_id, endpoint_row.id, scan_row.id, new_id,
        'gateway.scan.completed', 'decision:' || new_id::text,
        event_payload,
        encode(extensions.digest(convert_to(event_payload::text, 'UTF8'), 'sha256'), 'hex')
      );

      perform public.gateway_enqueue_job(
        scan_row.org_id,
        scan_row.id,
        'webhook',
        'webhook-event:' || event_id::text,
        null,
        jsonb_build_object('event_id', event_id),
        100,
        statement_timestamp(),
        endpoint_row.max_attempts
      );
    end loop;
  end if;

  return new_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard(target_org_id uuid DEFAULT NULL::uuid, recent_limit integer DEFAULT 20, recent_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
comment on function "public"."get_dashboard"(target_org_id uuid, recent_limit integer, recent_offset integer) is 'Returns the authenticated user dashboard in one bounded JSONB response. SECURITY INVOKER; RLS remains enforced.';

CREATE OR REPLACE FUNCTION public.learning_admin_summary(target_org_id uuid, target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  member_role text;
  active_learners integer;
  active_enrollments integer;
  completed_enrollments integer;
  issued_credentials integer;
  open_assignments integer;
  completion_rate numeric(8,3);
begin
  perform public.learning_assert_member(target_user_id, target_org_id);

  select member.role::text
  into member_role
  from public.organization_members member
  where member.org_id = target_org_id
    and member.user_id = target_user_id
    and member.status::text = 'active';

  if member_role not in ('owner', 'admin') then
    raise exception 'LEARNING_ADMIN_REQUIRED';
  end if;

  select count(distinct user_id)
  into active_learners
  from public.learning_enrollments
  where org_id = target_org_id
    and status in ('active', 'completed');

  select count(*)
  into active_enrollments
  from public.learning_enrollments
  where org_id = target_org_id
    and status = 'active';

  select count(*)
  into completed_enrollments
  from public.learning_enrollments
  where org_id = target_org_id
    and status = 'completed';

  select count(*)
  into issued_credentials
  from public.learning_credentials
  where org_id = target_org_id;

  select count(*)
  into open_assignments
  from public.learning_assignments
  where org_id = target_org_id
    and status = 'open';

  completion_rate := case
    when active_enrollments + completed_enrollments = 0 then 0
    else round(
      completed_enrollments::numeric /
      (active_enrollments + completed_enrollments)::numeric * 100,
      3
    )
  end;

  return jsonb_build_object(
    'active_learners', active_learners,
    'active_enrollments', active_enrollments,
    'completed_enrollments', completed_enrollments,
    'issued_credentials', issued_credentials,
    'open_assignments', open_assignments,
    'completion_rate', completion_rate
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.learning_enroll(target_course_version_id uuid, target_source text, target_assignment_id uuid, target_idempotency_key text, target_user_id uuid, target_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  existing_receipt jsonb;
  enrollment_record public.learning_enrollments%rowtype;
  seat_limit integer;
  current_seats integer;
begin
  perform public.learning_assert_member(target_user_id, target_org_id);

  select receipt.response_payload
  into existing_receipt
  from public.learning_idempotency_receipts receipt
  where receipt.user_id = target_user_id
    and receipt.operation = 'enroll'
    and receipt.idempotency_key = target_idempotency_key;

  if existing_receipt is not null then
    return existing_receipt;
  end if;

  if not exists (
    select 1
    from public.learning_course_versions version
    where version.id = target_course_version_id
      and version.status = 'published'
  ) then
    raise exception 'LEARNING_COURSE_VERSION_UNAVAILABLE';
  end if;

  select plan.learning_seat_limit
  into seat_limit
  from public.organizations organization
  join public.plans plan on plan.id = organization.plan_id
  where organization.id = target_org_id;

  select count(distinct enrollment.user_id)
  into current_seats
  from public.learning_enrollments enrollment
  where enrollment.org_id = target_org_id
    and enrollment.status in ('active', 'completed');

  if coalesce(seat_limit, 0) > 0
     and current_seats >= seat_limit
     and not exists (
       select 1
       from public.learning_enrollments enrollment
       where enrollment.org_id = target_org_id
         and enrollment.user_id = target_user_id
     ) then
    raise exception 'LEARNING_SEAT_LIMIT_REACHED';
  end if;

  insert into public.learning_enrollments (
    org_id,
    user_id,
    course_version_id,
    assignment_id,
    source
  )
  values (
    target_org_id,
    target_user_id,
    target_course_version_id,
    target_assignment_id,
    case
      when target_source in ('self', 'assignment', 'admin', 'import')
        then target_source
      else 'self'
    end
  )
  on conflict (org_id, user_id, course_version_id)
  do update set
    last_activity_at = now(),
    status = case
      when public.learning_enrollments.status in ('withdrawn', 'expired')
        then 'active'
      else public.learning_enrollments.status
    end
  returning * into enrollment_record;

  existing_receipt := jsonb_build_object(
    'id', enrollment_record.id,
    'status', enrollment_record.status,
    'course_version_id', enrollment_record.course_version_id,
    'progress_percent', enrollment_record.progress_percent
  );

  insert into public.learning_idempotency_receipts (
    user_id,
    operation,
    idempotency_key,
    response_payload
  )
  values (
    target_user_id,
    'enroll',
    target_idempotency_key,
    existing_receipt
  )
  on conflict do nothing;

  insert into public.learning_audit_events (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id
  )
  values (
    target_org_id,
    target_user_id,
    'learning.enrollment.created',
    'learning_enrollment',
    enrollment_record.id
  );

  return existing_receipt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.learning_issue_credential(target_certification_version_id uuid, target_user_id uuid, target_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  certification_record public.learning_certification_versions%rowtype;
  credential_record public.learning_credentials%rowtype;
  learner_name text;
  generated_code text;
begin
  perform public.learning_assert_member(target_user_id, target_org_id);

  select *
  into certification_record
  from public.learning_certification_versions version
  where version.id = target_certification_version_id
    and version.status = 'published';

  if not found then
    raise exception 'LEARNING_CERTIFICATION_UNAVAILABLE';
  end if;

  select coalesce(
    nullif(trim(profile.full_name), ''),
    'VeriTrust learner'
  )
  into learner_name
  from public.profiles profile
  where profile.id = target_user_id;

  learner_name := coalesce(learner_name, 'VeriTrust learner');

  generated_code := public.learning_new_public_code();

  insert into public.learning_credentials (
    org_id,
    user_id,
    certification_version_id,
    public_code,
    display_name,
    expires_at
  )
  values (
    target_org_id,
    target_user_id,
    target_certification_version_id,
    generated_code,
    learner_name,
    case
      when certification_record.validity_days is null then null
      else now() +
        make_interval(days => certification_record.validity_days)
    end
  )
  on conflict (user_id, certification_version_id)
  do update set
    display_name = excluded.display_name
  returning * into credential_record;

  insert into public.learning_credential_status_events (
    credential_id,
    previous_status,
    new_status,
    changed_by
  )
  values (
    credential_record.id,
    null,
    credential_record.status,
    target_user_id
  )
  on conflict do nothing;

  return jsonb_build_object(
    'id', credential_record.id,
    'public_code', credential_record.public_code,
    'status', credential_record.status,
    'issued_at', credential_record.issued_at,
    'expires_at', credential_record.expires_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.learning_record_event(target_enrollment_id uuid, target_lesson_id uuid, target_event_type text, target_occurred_at timestamp with time zone, target_payload jsonb, target_idempotency_key text, target_user_id uuid, target_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  enrollment_record public.learning_enrollments%rowtype;
  existing_receipt jsonb;
  completed_lessons integer;
  total_lessons integer;
  calculated_progress numeric(6,3);
begin
  perform public.learning_assert_member(target_user_id, target_org_id);

  select receipt.response_payload
  into existing_receipt
  from public.learning_idempotency_receipts receipt
  where receipt.user_id = target_user_id
    and receipt.operation = 'event'
    and receipt.idempotency_key = target_idempotency_key;

  if existing_receipt is not null then
    return existing_receipt;
  end if;

  select *
  into enrollment_record
  from public.learning_enrollments enrollment
  where enrollment.id = target_enrollment_id
    and enrollment.user_id = target_user_id
    and enrollment.org_id = target_org_id
  for update;

  if not found then
    raise exception 'LEARNING_ENROLLMENT_NOT_FOUND';
  end if;

  if target_event_type not in (
    'lesson_started', 'lesson_completed', 'block_completed',
    'bookmark_added', 'bookmark_removed', 'lab_completed'
  ) then
    raise exception 'LEARNING_EVENT_TYPE_INVALID';
  end if;

  if target_lesson_id is not null and not exists (
    select 1
    from public.learning_lessons lesson
    join public.learning_modules module on module.id = lesson.module_id
    where lesson.id = target_lesson_id
      and module.course_version_id = enrollment_record.course_version_id
  ) then
    raise exception 'LEARNING_LESSON_NOT_IN_ENROLLMENT';
  end if;

  insert into public.learning_events (
    org_id,
    user_id,
    enrollment_id,
    lesson_id,
    event_type,
    occurred_at,
    payload
  )
  values (
    target_org_id,
    target_user_id,
    target_enrollment_id,
    target_lesson_id,
    target_event_type,
    coalesce(target_occurred_at, now()),
    coalesce(target_payload, '{}'::jsonb)
  );

  if target_lesson_id is not null
     and target_event_type in ('lesson_started', 'lesson_completed') then
    insert into public.learning_lesson_progress (
      enrollment_id,
      user_id,
      lesson_id,
      status,
      progress_percent,
      started_at,
      completed_at
    )
    values (
      target_enrollment_id,
      target_user_id,
      target_lesson_id,
      case
        when target_event_type = 'lesson_completed' then 'completed'
        else 'started'
      end,
      case
        when target_event_type = 'lesson_completed' then 100
        else 1
      end,
      now(),
      case
        when target_event_type = 'lesson_completed' then now()
        else null
      end
    )
    on conflict (enrollment_id, lesson_id)
    do update set
      status = case
        when excluded.status = 'completed' then 'completed'
        else public.learning_lesson_progress.status
      end,
      progress_percent = greatest(
        public.learning_lesson_progress.progress_percent,
        excluded.progress_percent
      ),
      started_at = coalesce(
        public.learning_lesson_progress.started_at,
        excluded.started_at
      ),
      completed_at = coalesce(
        public.learning_lesson_progress.completed_at,
        excluded.completed_at
      ),
      updated_at = now();
  end if;

  select count(*)
  into total_lessons
  from public.learning_lessons lesson
  join public.learning_modules module on module.id = lesson.module_id
  where module.course_version_id = enrollment_record.course_version_id;

  select count(*)
  into completed_lessons
  from public.learning_lesson_progress progress
  join public.learning_lessons lesson on lesson.id = progress.lesson_id
  join public.learning_modules module on module.id = lesson.module_id
  where progress.enrollment_id = target_enrollment_id
    and progress.status = 'completed'
    and module.course_version_id = enrollment_record.course_version_id;

  calculated_progress := case
    when total_lessons = 0 then 0
    else round((completed_lessons::numeric / total_lessons::numeric) * 100, 3)
  end;

  update public.learning_enrollments
  set
    progress_percent = calculated_progress,
    last_activity_at = now(),
    status = case
      when calculated_progress >= 100 then 'completed'
      else status
    end,
    completed_at = case
      when calculated_progress >= 100 then coalesce(completed_at, now())
      else completed_at
    end
  where id = target_enrollment_id;

  existing_receipt := jsonb_build_object(
    'enrollment_id', target_enrollment_id,
    'progress_percent', calculated_progress,
    'completed_lessons', completed_lessons,
    'total_lessons', total_lessons
  );

  insert into public.learning_idempotency_receipts (
    user_id,
    operation,
    idempotency_key,
    response_payload
  )
  values (
    target_user_id,
    'event',
    target_idempotency_key,
    existing_receipt
  )
  on conflict do nothing;

  return existing_receipt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.learning_save_response(target_attempt_id uuid, target_attempt_item_id uuid, target_answer jsonb, target_idempotency_key text, target_user_id uuid, target_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  attempt_record public.learning_attempts%rowtype;
  existing_receipt jsonb;
begin
  perform public.learning_assert_member(target_user_id, target_org_id);

  select receipt.response_payload
  into existing_receipt
  from public.learning_idempotency_receipts receipt
  where receipt.user_id = target_user_id
    and receipt.operation = 'response_save'
    and receipt.idempotency_key = target_idempotency_key;

  if existing_receipt is not null then
    return existing_receipt;
  end if;

  select *
  into attempt_record
  from public.learning_attempts attempt
  where attempt.id = target_attempt_id
    and attempt.user_id = target_user_id
    and attempt.org_id = target_org_id
  for update;

  if not found then
    raise exception 'LEARNING_ATTEMPT_NOT_FOUND';
  end if;

  if attempt_record.status <> 'in_progress'
     or attempt_record.expires_at <= now() then
    raise exception 'LEARNING_ATTEMPT_NOT_WRITABLE';
  end if;

  if not exists (
    select 1
    from public.learning_attempt_items item
    where item.id = target_attempt_item_id
      and item.attempt_id = target_attempt_id
  ) then
    raise exception 'LEARNING_ATTEMPT_ITEM_NOT_FOUND';
  end if;

  if target_answer is null
     or jsonb_typeof(target_answer) <> 'object'
     or pg_column_size(target_answer) > 16384 then
    raise exception 'LEARNING_RESPONSE_INVALID';
  end if;

  insert into public.learning_responses (
    attempt_id,
    attempt_item_id,
    user_id,
    answer
  )
  values (
    target_attempt_id,
    target_attempt_item_id,
    target_user_id,
    target_answer
  )
  on conflict (attempt_item_id)
  do update set
    answer = excluded.answer,
    saved_at = now();

  existing_receipt := jsonb_build_object(
    'attempt_id', target_attempt_id,
    'attempt_item_id', target_attempt_item_id,
    'saved_at', now()
  );

  insert into public.learning_idempotency_receipts (
    user_id,
    operation,
    idempotency_key,
    response_payload
  )
  values (
    target_user_id,
    'response_save',
    target_idempotency_key,
    existing_receipt
  )
  on conflict do nothing;

  return existing_receipt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.learning_set_credential_status(target_credential_id uuid, target_status text, target_reason text, target_user_id uuid, target_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  credential_record public.learning_credentials%rowtype;
  member_role text;
begin
  perform public.learning_assert_member(target_user_id, target_org_id);

  select member.role::text
  into member_role
  from public.organization_members member
  where member.org_id = target_org_id
    and member.user_id = target_user_id
    and member.status::text = 'active';

  if member_role not in ('owner', 'admin')
     and not exists (
       select 1
       from public.learning_role_assignments role_assignment
       where role_assignment.org_id = target_org_id
         and role_assignment.user_id = target_user_id
         and role_assignment.role = 'credential_admin'
     ) then
    raise exception 'LEARNING_CREDENTIAL_ADMIN_REQUIRED';
  end if;

  if target_status not in ('valid', 'expired', 'revoked', 'suspended') then
    raise exception 'LEARNING_CREDENTIAL_STATUS_INVALID';
  end if;

  select *
  into credential_record
  from public.learning_credentials credential
  where credential.id = target_credential_id
    and credential.org_id = target_org_id
  for update;

  if not found then
    raise exception 'LEARNING_CREDENTIAL_NOT_FOUND';
  end if;

  insert into public.learning_credential_status_events (
    credential_id,
    previous_status,
    new_status,
    reason,
    changed_by
  )
  values (
    credential_record.id,
    credential_record.status,
    target_status,
    left(nullif(trim(target_reason), ''), 2000),
    target_user_id
  );

  update public.learning_credentials
  set status = target_status
  where id = target_credential_id;

  return jsonb_build_object(
    'id', target_credential_id,
    'public_code', credential_record.public_code,
    'status', target_status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.learning_start_attempt(target_assessment_version_id uuid, target_idempotency_key text, target_user_id uuid, target_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  version_record public.learning_assessment_versions%rowtype;
  attempt_record public.learning_attempts%rowtype;
  existing_receipt jsonb;
  attempt_count integer;
begin
  perform public.learning_assert_member(target_user_id, target_org_id);

  select receipt.response_payload
  into existing_receipt
  from public.learning_idempotency_receipts receipt
  where receipt.user_id = target_user_id
    and receipt.operation = 'attempt_start'
    and receipt.idempotency_key = target_idempotency_key;

  if existing_receipt is not null then
    return existing_receipt;
  end if;

  select *
  into version_record
  from public.learning_assessment_versions version
  where version.id = target_assessment_version_id
    and version.status = 'published';

  if not found then
    raise exception 'LEARNING_ASSESSMENT_UNAVAILABLE';
  end if;

  if not exists (
    select 1
    from public.learning_assessments assessment
    join public.learning_enrollments enrollment
      on enrollment.course_version_id = assessment.course_version_id
    where assessment.id = version_record.assessment_id
      and enrollment.user_id = target_user_id
      and enrollment.org_id = target_org_id
      and enrollment.status in ('active', 'completed')
  ) then
    raise exception 'LEARNING_ASSESSMENT_ENROLLMENT_REQUIRED';
  end if;

  select count(*)
  into attempt_count
  from public.learning_attempts attempt
  where attempt.user_id = target_user_id
    and attempt.org_id = target_org_id
    and attempt.assessment_version_id = target_assessment_version_id
    and attempt.status in ('submitted', 'scored', 'expired');

  if attempt_count >= version_record.maximum_attempts then
    raise exception 'LEARNING_MAXIMUM_ATTEMPTS_REACHED';
  end if;

  select *
  into attempt_record
  from public.learning_attempts attempt
  where attempt.user_id = target_user_id
    and attempt.org_id = target_org_id
    and attempt.assessment_version_id = target_assessment_version_id
    and attempt.status = 'in_progress'
    and attempt.expires_at > now()
  order by attempt.created_at desc
  limit 1;

  if not found then
    insert into public.learning_attempts (
      org_id,
      user_id,
      assessment_version_id,
      expires_at
    )
    values (
      target_org_id,
      target_user_id,
      target_assessment_version_id,
      now() + make_interval(mins => version_record.duration_minutes)
    )
    returning * into attempt_record;

    insert into public.learning_attempt_items (
      attempt_id,
      question_revision_id,
      position
    )
    select
      attempt_record.id,
      question.id,
      row_number() over (order by gen_random_uuid())
    from public.learning_question_revisions question
    where question.assessment_version_id = target_assessment_version_id;
  end if;

  existing_receipt := jsonb_build_object(
    'id', attempt_record.id,
    'status', attempt_record.status,
    'started_at', attempt_record.started_at,
    'expires_at', attempt_record.expires_at,
    'assessment_version_id', attempt_record.assessment_version_id
  );

  insert into public.learning_idempotency_receipts (
    user_id,
    operation,
    idempotency_key,
    response_payload
  )
  values (
    target_user_id,
    'attempt_start',
    target_idempotency_key,
    existing_receipt
  )
  on conflict do nothing;

  return existing_receipt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_billable_usage(target_org_id uuid, target_user_id uuid DEFAULT NULL::uuid, target_source text DEFAULT 'web'::text, target_scan_type scan_type DEFAULT NULL::scan_type, target_endpoint text DEFAULT NULL::text, target_status text DEFAULT 'success'::text, target_units integer DEFAULT 1, target_request_id text DEFAULT NULL::text, target_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.update_my_profile(profile_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
comment on function "public"."update_my_profile"(profile_patch jsonb) is 'Safely updates the authenticated user display name, username, avatar object path, preferences, or default workspace.';

CREATE OR REPLACE FUNCTION veritrust_private.gateway_dispatch_job_insert_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'veritrust_private', 'extensions', 'vault', 'net'
AS $function$
begin
  begin
    perform veritrust_private.gateway_dispatch_worker(
      'job_insert',
      new.id,
      new.queue_name::text
    );
  exception
    when others then
      raise warning
        'VeriTrust worker dispatch deferred for gateway job %. SQLSTATE=%, error=%',
        new.id,
        sqlstate,
        sqlerrm;
  end;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION veritrust_private.provision_gateway_organization(target_org_id uuid, target_created_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'veritrust_private', 'extensions'
AS $function$
declare
  policy_id uuid;
  version_id uuid;

  policy_document jsonb := $json$
  {
    "actions": {
      "allow_below": 0.20,
      "warn_below": 0.55,
      "manual_review_below": 0.75,
      "quarantine_below": 0.90,
      "block_at_or_above": 0.90
    },
    "routing": {
      "url": {
        "required": ["link"],
        "optional": []
      },
      "text": {
        "required": ["phishing"],
        "optional": ["link_extraction"]
      },
      "image": {
        "required": ["deepfake_image"],
        "optional": ["qr_link"]
      },
      "audio": {
        "required": [],
        "optional": ["transcript_phishing"],
        "on_unsupported": "hold"
      },
      "video": {
        "required": [],
        "optional": ["transcript_phishing"],
        "on_unsupported": "hold"
      }
    },
    "timeouts": {
      "overall_ms": 120000,
      "synchronous_ms": 12000,
      "per_model_ms": 10000
    },
    "failure_modes": {
      "interactive_text_url": "warn",
      "uploads": "hold",
      "critical_required_model": "hold"
    },
    "retention": {
      "raw_content": "temporary_file",
      "maximum_hours": 1,
      "normalized_evidence_days": 90
    },
    "enforcement": {
      "mode": "advisory",
      "automatic_block": false,
      "convert_block_to": "quarantine",
      "require_review_for": [
        "financial",
        "credential",
        "identity"
      ]
    },
    "webhooks": {
      "events": ["gateway.scan.completed"],
      "signing_version": "v1",
      "replay_window_seconds": 300
    },
    "model_rollout": {
      "canary_percent": 0
    },
    "correlation_version": "gateway-correlation-v1"
  }
  $json$::jsonb;
begin
  if not exists (
    select 1
    from public.organizations
    where id = target_org_id
  ) then
    raise exception
      'Organization was not found for gateway provisioning.'
      using errcode = 'P0002';
  end if;

  select p.id
  into policy_id
  from public.gateway_policies p
  where p.org_id = target_org_id
    and p.status = 'active'
    and p.active_version_id is not null
  order by p.created_at asc
  limit 1;

  if policy_id is null then
    insert into public.gateway_policies (
      org_id,
      name,
      description,
      created_by
    )
    values (
      target_org_id,
      'Default advisory gateway policy',
      'Safe launch policy: advisory decisions, explicit failure modes, short raw-content retention.',
      target_created_by
    )
    returning id into policy_id;

    version_id :=
      public.gateway_create_policy_version(
        policy_id,
        policy_document,
        '1.0',
        target_created_by
      );

    perform public.gateway_activate_policy_version(
      version_id,
      target_created_by,
      'Automatic default advisory gateway provisioning'
    );
  end if;

  insert into public.gateway_integrations (
    org_id,
    name,
    source_type,
    auth_mode,
    external_id,
    allowed_actions,
    status,
    created_by,
    metadata
  )
  values (
    target_org_id,
    'VeriTrust dashboard',
    'web',
    'supabase_jwt',
    'dashboard',
    array[
      'gateway:scan',
      'gateway:read',
      'gateway:cancel'
    ]::text[],
    'active',
    target_created_by,
    jsonb_build_object(
      'seeded_by',
      'veritrust_gateway_002'
    )
  )
  on conflict (
    org_id,
    source_type,
    external_id
  )
  where external_id is not null
  do nothing;
end
$function$;

CREATE OR REPLACE FUNCTION public.learning_submit_attempt(target_attempt_id uuid, target_idempotency_key text, target_user_id uuid, target_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  attempt_record public.learning_attempts%rowtype;
  version_record public.learning_assessment_versions%rowtype;
  existing_receipt jsonb;
  total_points numeric := 0;
  earned_points numeric := 0;
  calculated_score numeric(6,3);
  calculated_passed boolean;
  certification_version_id uuid;
  credential_result jsonb;
begin
  perform public.learning_assert_member(target_user_id, target_org_id);

  select receipt.response_payload
  into existing_receipt
  from public.learning_idempotency_receipts receipt
  where receipt.user_id = target_user_id
    and receipt.operation = 'attempt_submit'
    and receipt.idempotency_key = target_idempotency_key;

  if existing_receipt is not null then
    return existing_receipt;
  end if;

  select *
  into attempt_record
  from public.learning_attempts attempt
  where attempt.id = target_attempt_id
    and attempt.user_id = target_user_id
    and attempt.org_id = target_org_id
  for update;

  if not found then
    raise exception 'LEARNING_ATTEMPT_NOT_FOUND';
  end if;

  if attempt_record.status <> 'in_progress' then
    raise exception 'LEARNING_ATTEMPT_ALREADY_FINAL';
  end if;

  if attempt_record.expires_at <= now() then
    update public.learning_attempts
    set status = 'expired'
    where id = target_attempt_id;

    raise exception 'LEARNING_ATTEMPT_EXPIRED';
  end if;

  select *
  into version_record
  from public.learning_assessment_versions
  where id = attempt_record.assessment_version_id;

  select
    coalesce(sum(question.points), 0),
    coalesce(sum(
      case
        when question.question_type = 'single_choice'
         and response.answer ->> 'value'
             = question.correct_answer ->> 'value'
          then question.points
        when question.question_type = 'short_text'
         and lower(trim(response.answer ->> 'text'))
             = lower(trim(question.correct_answer ->> 'text'))
          then question.points
        else 0
      end
    ), 0)
  into total_points, earned_points
  from public.learning_attempt_items item
  join public.learning_question_revisions question
    on question.id = item.question_revision_id
  left join public.learning_responses response
    on response.attempt_item_id = item.id
  where item.attempt_id = target_attempt_id;

  calculated_score := case
    when total_points <= 0 then 0
    else round((earned_points / total_points) * 100, 3)
  end;

  calculated_passed := calculated_score >= version_record.passing_percent;

  update public.learning_attempts
  set
    status = 'scored',
    submitted_at = now(),
    scored_at = now(),
    score_percent = calculated_score,
    passed = calculated_passed
  where id = target_attempt_id;

  if calculated_passed then
    select certification_version.id
    into certification_version_id
    from public.learning_assessment_versions assessment_version
    join public.learning_assessments assessment
      on assessment.id = assessment_version.assessment_id
    join public.learning_course_versions course_version
      on course_version.id = assessment.course_version_id
    join public.learning_certifications certification
      on certification.course_id = course_version.course_id
     and certification.status = 'active'
    join public.learning_certification_versions certification_version
      on certification_version.certification_id = certification.id
     and certification_version.status = 'published'
    where assessment_version.id = attempt_record.assessment_version_id
    limit 1;

    if certification_version_id is not null then
      credential_result := public.learning_issue_credential(
        certification_version_id,
        target_user_id,
        target_org_id
      );
    end if;
  end if;

  existing_receipt := jsonb_build_object(
    'attempt_id', target_attempt_id,
    'status', 'scored',
    'score_percent', calculated_score,
    'passed', calculated_passed,
    'credential', credential_result
  );

  insert into public.learning_idempotency_receipts (
    user_id,
    operation,
    idempotency_key,
    response_payload
  )
  values (
    target_user_id,
    'attempt_submit',
    target_idempotency_key,
    existing_receipt
  )
  on conflict do nothing;

  insert into public.learning_audit_events (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_org_id,
    target_user_id,
    'learning.assessment.scored',
    'learning_attempt',
    target_attempt_id,
    jsonb_build_object(
      'passed', calculated_passed,
      'score_percent', calculated_score
    )
  );

  return existing_receipt;
end;
$function$;

CREATE OR REPLACE FUNCTION veritrust_private.provision_gateway_organization_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'veritrust_private'
AS $function$
begin
  perform veritrust_private.provision_gateway_organization(
    new.id,
    new.created_by
  );

  return new;
end
$function$;
