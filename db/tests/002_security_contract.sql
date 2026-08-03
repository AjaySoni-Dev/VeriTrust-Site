begin;

do $security_contract$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'veritrust_private')
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) setting
        where setting like 'search_path=%'
      )
  ) then raise exception 'A SECURITY DEFINER routine has no fixed search_path'; end if;

  if has_schema_privilege('anon', 'public', 'CREATE')
     or has_schema_privilege('authenticated', 'public', 'CREATE') then
    raise exception 'Untrusted API roles can create objects in public';
  end if;

  if exists (
    select 1
    from storage.buckets
    where id in ('avatars', 'exports', 'gateway-uploads', 'learning-assets',
      'learning-certificates', 'learning-exports', 'scan-crops', 'scan-uploads')
      and public
  ) then raise exception 'A VeriTrust Storage bucket is public'; end if;

  if (select count(*) from storage.buckets where id in (
    'avatars', 'exports', 'gateway-uploads', 'learning-assets',
    'learning-certificates', 'learning-exports', 'scan-crops', 'scan-uploads'
  )) <> 8 then raise exception 'One or more VeriTrust Storage buckets are missing'; end if;

  if (select count(*) from pgmq.meta where queue_name in (
    'gateway_media', 'gateway_retention', 'gateway_webhooks'
  )) <> 3 then raise exception 'One or more VeriTrust PGMQ queues are missing'; end if;
end
$security_contract$;

rollback;
