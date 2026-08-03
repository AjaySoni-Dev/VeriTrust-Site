begin;

set local session_replication_role = replica;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000089'),
  ('00000000-0000-4000-8000-000000000088');
set local session_replication_role = origin;

insert into public.plans (id, code, name)
values ('00000000-0000-4000-8000-000000000087', 'case-contract', 'Case contract');
insert into public.organizations (id, plan_id, name, slug, created_by)
values (
  '00000000-0000-4000-8000-000000000086',
  '00000000-0000-4000-8000-000000000087',
  'Case contract', 'case-contract',
  '00000000-0000-4000-8000-000000000089'
);
insert into public.organization_members (org_id, user_id, role, status) values
  ('00000000-0000-4000-8000-000000000086', '00000000-0000-4000-8000-000000000089', 'owner', 'active'),
  ('00000000-0000-4000-8000-000000000086', '00000000-0000-4000-8000-000000000088', 'viewer', 'active');

insert into public.scans (
  id, org_id, user_id, scan_type, status, selected_model_key, risk_level, source
) values (
  '00000000-0000-4000-8000-000000000085',
  '00000000-0000-4000-8000-000000000086',
  '00000000-0000-4000-8000-000000000089',
  'phishing', 'processing', 'mailguard', 'unknown', 'contract'
);
insert into public.scan_results (
  id, scan_id, label, confidence, risk_level, primary_score, explanation, indicators
) values (
  '00000000-0000-4000-8000-000000000084',
  '00000000-0000-4000-8000-000000000085',
  'Phishing', 0.91, 'high', 0.91, 'Suspicious credential request.', '["credential_request"]'::jsonb
);
update public.scans set status = 'completed', risk_level = 'high', completed_at = statement_timestamp()
where id = '00000000-0000-4000-8000-000000000085';

do $case_contract$
declare
  target_case uuid;
  evidence_id uuid;
  result jsonb;
  failed_as_expected boolean;
begin
  select id into target_case from public.cases
  where standard_scan_id = '00000000-0000-4000-8000-000000000085';
  if target_case is null then raise exception 'Scan did not create a case'; end if;
  select e.id into evidence_id from public.case_evidence e where e.case_id = target_case;

  if (select count(*) from public.case_evidence e where e.case_id = target_case) <> 1 then
    raise exception 'Scan result did not normalize to one evidence item';
  end if;
  if (select count(*) from public.case_decisions d where d.case_id = target_case and d.decision_kind = 'machine') <> 1 then
    raise exception 'Scan result did not normalize to one machine decision';
  end if;

  failed_as_expected := false;
  begin
    perform public.case_update_workflow(
      target_case, 'closed', 'high', null,
      '00000000-0000-4000-8000-000000000089'
    );
  exception when sqlstate '55000' then failed_as_expected := true;
  end;
  if not failed_as_expected then raise exception 'Case closed without an analyst decision'; end if;

  failed_as_expected := false;
  begin
    perform public.case_record_analyst_decision(
      target_case, 'malicious', 'high', 'Viewer must not decide.', array[evidence_id],
      '00000000-0000-4000-8000-000000000088'
    );
  exception when insufficient_privilege then failed_as_expected := true;
  end;
  if not failed_as_expected then raise exception 'Viewer recorded an analyst decision'; end if;

  result := public.case_record_analyst_decision(
    target_case, 'malicious', 'high', 'Credential theft indicators support blocking this message.',
    array[evidence_id], '00000000-0000-4000-8000-000000000089'
  );
  if result ->> 'status' <> 'decided' then raise exception 'Analyst decision did not decide the case'; end if;
  perform public.case_update_workflow(
    target_case, 'closed', 'urgent', '00000000-0000-4000-8000-000000000089',
    '00000000-0000-4000-8000-000000000089'
  );
  if not exists (select 1 from public.cases c where c.id = target_case and c.status = 'closed' and c.closed_at is not null) then
    raise exception 'Decided case did not close consistently';
  end if;
end
$case_contract$;

rollback;
