begin;

do $schema_contract$
declare
  actual integer;
begin
  select count(*) into actual
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p');
  if actual < 85 then raise exception 'Expected at least 85 public tables after forward migrations, found %', actual; end if;

  select count(*) into actual
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (select name from (values
      ('api_keys'), ('gateway_scans'), ('learning_courses'), ('organizations'), ('scans')
    ) required(name));
  if actual = 0 then raise exception 'Representative public columns are missing'; end if;

  select count(*) into actual
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'veritrust_private');
  if actual < 81 then raise exception 'Expected at least 81 owned routines after forward migrations, found %', actual; end if;

  select count(*) into actual
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal;
  if actual < 44 then raise exception 'Expected at least 44 public triggers, found %', actual; end if;

  if to_regclass('public.usage_reservations') is null
     or to_regclass('public.billing_outbox') is null
     or to_regprocedure('public.create_scan_record_atomic(uuid,public.scan_type,public.input_kind,text,uuid,text,text,jsonb,text,text,text,text)') is null then
    raise exception 'Task 4 atomic integrity objects are missing';
  end if;

  if to_regclass('public.cases') is null
     or to_regclass('public.case_evidence') is null
     or to_regclass('public.case_decisions') is null
     or to_regclass('public.case_events') is null
     or to_regprocedure('public.case_record_analyst_decision(uuid,text,public.risk_level,text,uuid[],uuid)') is null
     or to_regprocedure('public.case_update_workflow(uuid,text,text,uuid,uuid)') is null then
    raise exception 'Task 5 unified case workflow objects are missing';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  ) then raise exception 'Every public table must have RLS enabled'; end if;

  if not exists (
    select 1 from pg_event_trigger
    where evtname = 'veritrust_enable_public_rls' and evtenabled <> 'D'
  ) then raise exception 'The future-table RLS guard is missing'; end if;
end
$schema_contract$;

rollback;
