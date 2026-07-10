-- BE-006: legal scan transitions, canonical snapshot, ordered attempts, transactional outbox.
begin;

create or replace function public.create_scan_record(
  target_org_id uuid, target_scan_type public.scan_type, target_input_kind public.input_kind,
  target_selected_model_key text, target_project_id uuid default null, target_text_preview text default null,
  target_text_hash text default null, target_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare new_scan_id uuid; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'authentication required' using errcode='28000'; end if;
  if not public.has_org_role(target_org_id,array['owner','admin','analyst']::public.app_role[]) then raise exception 'forbidden' using errcode='42501'; end if;
  insert into public.scans(org_id,user_id,project_id,scan_type,status,selected_model_key,metadata,started_at)
  values(target_org_id,caller,target_project_id,target_scan_type,'processing',target_selected_model_key,coalesce(target_metadata,'{}'),now()) returning id into new_scan_id;
  insert into public.scan_inputs(scan_id,input_kind,retention,text_preview,text_hash,metadata)
  values(new_scan_id,target_input_kind,case when target_text_preview is null then 'metadata_only' else 'retained_file' end,
    case when target_text_preview is null then null else left(target_text_preview,500) end,target_text_hash,coalesce(target_metadata,'{}'));
  insert into public.audit_logs(org_id,actor_user_id,action,target_table,target_id,metadata)
  values(target_org_id,caller,'scan.started','scans',new_scan_id,jsonb_build_object('scan_type',target_scan_type));
  return new_scan_id;
end; $$;

create or replace function public.complete_scan_record(
  target_scan_id uuid,result_label text,result_confidence numeric,result_risk_level public.risk_level,
  result_primary_score numeric,result_secondary_score numeric,result_explanation text,
  result_indicators jsonb default '[]'::jsonb,result_raw_scores jsonb default '[]'::jsonb,model_runs jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_org_id uuid; run_item jsonb; run_index bigint; snapshot jsonb;
begin
  if result_confidence not between 0 and 1 or (result_primary_score is not null and result_primary_score not between 0 and 1)
    or (result_secondary_score is not null and result_secondary_score not between 0 and 1) then raise exception 'invalid result score' using errcode='22003'; end if;
  snapshot := jsonb_build_object('version','1','scan_id',target_scan_id,'result',jsonb_build_object('label',result_label,'confidence',result_confidence,'risk_level',result_risk_level,'primary_score',result_primary_score,'secondary_score',result_secondary_score,'explanation',left(coalesce(result_explanation,''),4000),'indicators',coalesce(result_indicators,'[]'::jsonb)),'model_attempts',coalesce(model_runs,'[]'::jsonb),'disclaimer','AI-assisted result; manual verification is recommended.');
  update public.scans set status='completed',final_label=result_label,confidence=result_confidence,risk_level=result_risk_level,completed_at=now(),error_message=null
  where id=target_scan_id and status='processing' returning org_id into target_org_id;
  if target_org_id is null then raise exception 'invalid scan transition' using errcode='23514'; end if;
  insert into public.scan_results(scan_id,label,confidence,risk_level,primary_score,secondary_score,explanation,indicators,raw_scores,report_snapshot)
  values(target_scan_id,result_label,result_confidence,result_risk_level,result_primary_score,result_secondary_score,left(coalesce(result_explanation,''),4000),coalesce(result_indicators,'[]'),coalesce(result_raw_scores,'[]'),snapshot);
  for run_item,run_index in select value,ordinality from jsonb_array_elements(coalesce(model_runs,'[]'::jsonb)) with ordinality loop
    insert into public.scan_model_runs(scan_id,attempt_index,model_key,provider,provider_model,status,latency_ms,request_metadata,response_metadata,error_message,model_revision,adapter_version)
    values(target_scan_id,run_index,run_item->>'model_key',coalesce(run_item->>'provider','unknown'),coalesce(run_item->>'provider_model','unknown'),coalesce(run_item->>'status','unknown'),nullif(run_item->>'latency_ms','')::integer,coalesce(run_item->'request_metadata','{}'),coalesce(run_item->'response_metadata','{}'),left(run_item->>'error_code',120),run_item->>'model_revision',run_item->>'adapter_version');
  end loop;
  insert into public.outbox_events(org_id,scan_id,event_type,payload) values(target_org_id,target_scan_id,'scan.completed',jsonb_build_object('scan_id',target_scan_id,'org_id',target_org_id));
end; $$;

create or replace function public.fail_scan_record(target_scan_id uuid,failure_message text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_org_id uuid;
begin
  update public.scans set status='failed',error_message=left(coalesce(failure_message,'SCAN_FAILED'),120),completed_at=now()
  where id=target_scan_id and status in ('queued','processing') returning org_id into target_org_id;
  if target_org_id is null then raise exception 'invalid scan transition' using errcode='23514'; end if;
  insert into public.outbox_events(org_id,scan_id,event_type,payload) values(target_org_id,target_scan_id,'scan.failed',jsonb_build_object('scan_id',target_scan_id,'error_code',left(coalesce(failure_message,'SCAN_FAILED'),120)));
end; $$;

revoke execute on function public.create_scan_record(uuid,public.scan_type,public.input_kind,text,uuid,text,text,jsonb) from public,anon;
grant execute on function public.create_scan_record(uuid,public.scan_type,public.input_kind,text,uuid,text,text,jsonb) to authenticated;
revoke execute on function public.complete_scan_record(uuid,text,numeric,public.risk_level,numeric,numeric,text,jsonb,jsonb,jsonb), public.fail_scan_record(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_scan_record(uuid,text,numeric,public.risk_level,numeric,numeric,text,jsonb,jsonb,jsonb), public.fail_scan_record(uuid,text) to service_role;

insert into public.schema_migrations(version,checksum) values('202607100003','managed-by-release-manifest') on conflict(version) do nothing;
commit;
