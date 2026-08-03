-- Read-only check before reverting the Task 5 unified case workflow.
-- Safe to run in Supabase SQL Editor. It changes nothing.

select
  to_regclass('public.cases') is not null as task5_installed,
  to_regclass('public.case_evidence') is not null as case_evidence_installed,
  to_regclass('public.case_decisions') is not null as case_decisions_installed,
  to_regclass('public.case_events') is not null as case_events_installed,
  to_regprocedure('public.case_record_analyst_decision(uuid,text,public.risk_level,text,uuid[],uuid)') is not null
    as analyst_rpc_installed;

do $rollback_inventory$
declare
  case_count bigint;
  evidence_count bigint;
  decision_count bigint;
  human_decision_count bigint;
  workflow_event_count bigint;
begin
  if to_regclass('public.cases') is null then
    raise notice 'Task 5 is not installed. The original transaction likely rolled back; do not run the destructive rollback.';
    return;
  end if;

  select count(*) into case_count from public.cases;
  select count(*) into evidence_count from public.case_evidence;
  select count(*) into decision_count from public.case_decisions;
  select count(*) into human_decision_count
  from public.case_decisions
  where source_type is null and decision_kind in ('analyst', 'analyst_override');
  select count(*) into workflow_event_count
  from public.case_events
  where event_type in ('analyst_decision_recorded', 'case_workflow_updated');

  raise notice 'Task 5 rows: cases=%, evidence=%, decisions=%', case_count, evidence_count, decision_count;
  raise notice 'Non-reconstructable activity: human_decisions=%, workflow_events=%',
    human_decision_count, workflow_event_count;
end
$rollback_inventory$;
