-- Revert only Task 5 / M-05.
-- Preserves scans, scan_results, gateway scans/evidence/decisions, organizations,
-- Task 4 atomic quota/billing objects, and every pre-Task-5 application object.
-- Run 005_task5_rollback_check.sql first and export the four case tables if needed.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';
set local search_path = public, extensions, pg_catalog;

do $rollback_guard$
declare
  human_decision_count bigint;
  workflow_event_count bigint;
begin
  if to_regclass('public.cases') is null then
    raise exception 'Task 5 is not installed; nothing should be rolled back.';
  end if;
  if to_regclass('public.case_evidence') is null
     or to_regclass('public.case_decisions') is null
     or to_regclass('public.case_events') is null then
    raise exception 'Task 5 is only partially present. Stop and inspect before rollback.';
  end if;

  select count(*) into human_decision_count
  from public.case_decisions
  where source_type is null and decision_kind in ('analyst', 'analyst_override');
  select count(*) into workflow_event_count
  from public.case_events
  where event_type in ('analyst_decision_recorded', 'case_workflow_updated');

  if human_decision_count > 0 or workflow_event_count > 0 then
    raise exception
      'Rollback stopped: Task 5 contains % human decisions and % workflow events. Export/review them first.',
      human_decision_count, workflow_event_count;
  end if;
end
$rollback_guard$;

drop trigger if exists case_sync_standard_scan on public.scans;
drop trigger if exists case_sync_gateway_scan on public.gateway_scans;
drop trigger if exists case_capture_scan_result on public.scan_results;
drop trigger if exists case_capture_gateway_evidence on public.gateway_evidence;
drop trigger if exists case_capture_gateway_decision on public.gateway_decisions;
drop trigger if exists case_log_created on public.cases;

drop function if exists public.case_record_analyst_decision(
  uuid, text, public.risk_level, text, uuid[], uuid
);
drop function if exists public.case_update_workflow(uuid, text, text, uuid, uuid);

drop function if exists veritrust_private.case_capture_gateway_decision();
drop function if exists veritrust_private.case_capture_gateway_evidence();
drop function if exists veritrust_private.case_capture_scan_result();
drop function if exists veritrust_private.case_sync_gateway_scan();
drop function if exists veritrust_private.case_log_created();
drop function if exists veritrust_private.case_sync_standard_scan();
drop function if exists veritrust_private.case_for_gateway_scan(uuid);
drop function if exists veritrust_private.case_for_standard_scan(uuid);
drop function if exists veritrust_private.case_outcome(text, text);

alter table public.cases
  drop constraint if exists cases_current_decision_case_org_fkey,
  drop constraint if exists cases_current_decision_fkey;

drop table public.case_events;
drop table public.case_evidence;
drop table public.case_decisions;
drop table public.cases;

drop index if exists public.scans_id_org_case_uidx;

notify pgrst, 'reload schema';

commit;
