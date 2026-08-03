begin;

set local session_replication_role = replica;
insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000099');
set local session_replication_role = origin;

insert into public.plans (
  id, code, name, monthly_scan_limit, monthly_web_scan_limit,
  monthly_api_limit, monthly_total_limit
) values (
  '00000000-0000-4000-8000-000000000098',
  'atomic-contract', 'Atomic contract', 1, 1, 1, 1
);

insert into public.organizations (id, plan_id, name, slug, created_by)
values (
  '00000000-0000-4000-8000-000000000097',
  '00000000-0000-4000-8000-000000000098',
  'Atomic contract', 'atomic-contract',
  '00000000-0000-4000-8000-000000000099'
);

do $atomic_contract$
declare
  first_reservation jsonb;
  replayed_reservation jsonb;
  denied_reservation jsonb;
  second_reservation jsonb;
  finalization jsonb;
  counter integer;
  claim jsonb;
  claim_token uuid;
begin
  first_reservation := veritrust_private.reserve_usage(
    '00000000-0000-4000-8000-000000000097',
    '00000000-0000-4000-8000-000000000099',
    null, 'web', 'deepfake', '/test', 'contract-request-1',
    repeat('a', 64), 1, '{}'::jsonb
  );
  if not (first_reservation ->> 'allowed')::boolean
     or (first_reservation ->> 'duplicate')::boolean then
    raise exception 'Initial reservation was not accepted exactly once';
  end if;

  replayed_reservation := veritrust_private.reserve_usage(
    '00000000-0000-4000-8000-000000000097',
    '00000000-0000-4000-8000-000000000099',
    null, 'web', 'deepfake', '/test', 'contract-request-1',
    repeat('a', 64), 1, '{}'::jsonb
  );
  if not (replayed_reservation ->> 'duplicate')::boolean then
    raise exception 'Reservation replay was not identified';
  end if;

  select web_deepfake_count into counter
  from public.usage_monthly
  where org_id = '00000000-0000-4000-8000-000000000097'
    and month_start = date_trunc('month', statement_timestamp())::date;
  if counter <> 1 then raise exception 'Replay incremented quota more than once'; end if;

  denied_reservation := veritrust_private.reserve_usage(
    '00000000-0000-4000-8000-000000000097',
    '00000000-0000-4000-8000-000000000099',
    null, 'web', 'deepfake', '/test', 'contract-request-2',
    repeat('b', 64), 1, '{}'::jsonb
  );
  if (denied_reservation ->> 'allowed')::boolean then
    raise exception 'Quota admitted a second concurrent unit';
  end if;

  perform veritrust_private.finalize_usage(
    (first_reservation ->> 'reservation_id')::uuid,
    false, 'failed', '{}'::jsonb
  );
  select web_deepfake_count into counter
  from public.usage_monthly
  where org_id = '00000000-0000-4000-8000-000000000097'
    and month_start = date_trunc('month', statement_timestamp())::date;
  if counter <> 0 then raise exception 'Failed reservation was not refunded'; end if;

  second_reservation := veritrust_private.reserve_usage(
    '00000000-0000-4000-8000-000000000097',
    '00000000-0000-4000-8000-000000000099',
    null, 'web', 'deepfake', '/test', 'contract-request-2',
    repeat('b', 64), 1, '{}'::jsonb
  );
  if not (second_reservation ->> 'allowed')::boolean then
    raise exception 'Refunded quota could not be reserved again';
  end if;
  finalization := veritrust_private.finalize_usage(
    (second_reservation ->> 'reservation_id')::uuid,
    true, 'success', '{}'::jsonb
  );
  finalization := veritrust_private.finalize_usage(
    (second_reservation ->> 'reservation_id')::uuid,
    true, 'success', '{}'::jsonb
  );
  if not (finalization ->> 'duplicate')::boolean then
    raise exception 'Repeated finalization was not idempotent';
  end if;

  claim := public.claim_billing_event_atomic(
    'stripe', 'contract-event-1', 'contract.test', '{}'::jsonb
  );
  if not (claim ->> 'claimed')::boolean then raise exception 'First billing claim failed'; end if;
  claim_token := (claim ->> 'claim_token')::uuid;
  claim := public.claim_billing_event_atomic(
    'stripe', 'contract-event-1', 'contract.test', '{}'::jsonb
  );
  if (claim ->> 'claimed')::boolean then raise exception 'Concurrent billing claim was admitted'; end if;
  perform public.complete_billing_event_atomic('stripe', 'contract-event-1', claim_token);
  claim := public.claim_billing_event_atomic(
    'stripe', 'contract-event-1', 'contract.test', '{}'::jsonb
  );
  if not (claim ->> 'duplicate')::boolean then raise exception 'Processed billing replay was not rejected'; end if;
end
$atomic_contract$;

rollback;
