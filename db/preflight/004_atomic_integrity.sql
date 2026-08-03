-- Read-only production preflight for Task 4.
-- Run before the forward migration and retain the JSON result as change evidence.

select jsonb_build_object(
  'required_objects_present',
  to_regclass('public.scans') is not null
    and to_regclass('public.scan_results') is not null
    and to_regclass('public.usage_monthly') is not null
    and to_regclass('public.user_usage_daily') is not null
    and to_regclass('public.billing_events') is not null
    and to_regprocedure('public.check_entitlement_quota(uuid,uuid,text,text,public.scan_type,integer)') is not null,
  'active_scans', (
    select count(*) from public.scans where status in ('queued', 'processing')
  ),
  'stale_active_scans_15m', (
    select count(*) from public.scans
    where status in ('queued', 'processing')
      and created_at < statement_timestamp() - interval '15 minutes'
  ),
  'completed_without_result', (
    select count(*)
    from public.scans s
    left join public.scan_results r on r.scan_id = s.id
    where s.status = 'completed' and r.id is null
  ),
  'nonterminal_with_completed_at', (
    select count(*) from public.scans
    where status in ('queued', 'processing') and completed_at is not null
  ),
  'terminal_without_completed_at', (
    select count(*) from public.scans
    where status in ('completed', 'failed', 'cancelled') and completed_at is null
  ),
  'billing_events_by_status', (
    select coalesce(jsonb_object_agg(status, event_count), '{}'::jsonb)
    from (
      select status, count(*) as event_count
      from public.billing_events
      group by status
    ) statuses
  )
) as veritrust_task_4_preflight;
