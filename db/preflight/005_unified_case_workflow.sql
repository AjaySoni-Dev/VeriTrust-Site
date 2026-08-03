-- Read-only sizing and consistency checks before Task 5 is applied.
-- Run against staging first, then production immediately before the migration.

select 'standard_scans_to_backfill' as check_name, count(*)::bigint as row_count
from public.scans
union all
select 'standard_evidence_to_backfill', count(*)::bigint from public.scan_results
union all
select 'gateway_scans_to_backfill', count(*)::bigint from public.gateway_scans
union all
select 'gateway_evidence_to_backfill', count(*)::bigint from public.gateway_evidence
union all
select 'gateway_decisions_to_backfill', count(*)::bigint from public.gateway_decisions;

select 'orphan_standard_results' as check_name, count(*)::bigint as row_count
from public.scan_results r left join public.scans s on s.id = r.scan_id
where s.id is null
union all
select 'orphan_gateway_evidence', count(*)::bigint
from public.gateway_evidence e left join public.gateway_scans s on s.id = e.scan_id
where s.id is null
union all
select 'orphan_gateway_decisions', count(*)::bigint
from public.gateway_decisions d left join public.gateway_scans s on s.id = d.scan_id
where s.id is null;

select 'standard_scans_with_multiple_results' as check_name, count(*)::bigint as row_count
from (
  select scan_id from public.scan_results group by scan_id having count(*) > 1
) duplicates;
