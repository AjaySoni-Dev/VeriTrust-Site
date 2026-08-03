-- VeriTrust private Storage buckets and PGMQ queues
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
insert into storage.buckets (id, name, type, public, file_size_limit, allowed_mime_types, avif_autodetection)
values ('avatars', 'avatars', 'STANDARD', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']::text[], false)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  avif_autodetection = excluded.avif_autodetection;

insert into storage.buckets (id, name, type, public, file_size_limit, allowed_mime_types, avif_autodetection)
values ('exports', 'exports', 'STANDARD', false, 10485760, array['application/pdf', 'text/csv', 'application/json']::text[], false)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  avif_autodetection = excluded.avif_autodetection;

insert into storage.buckets (id, name, type, public, file_size_limit, allowed_mime_types, avif_autodetection)
values ('gateway-uploads', 'gateway-uploads', 'STANDARD', false, 104857600, array['text/plain', 'message/rfc822', 'application/json', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'video/mp4', 'video/webm', 'video/quicktime']::text[], false)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  avif_autodetection = excluded.avif_autodetection;

insert into storage.buckets (id, name, type, public, file_size_limit, allowed_mime_types, avif_autodetection)
values ('learning-assets', 'learning-assets', 'STANDARD', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mpeg', 'video/mp4']::text[], false)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  avif_autodetection = excluded.avif_autodetection;

insert into storage.buckets (id, name, type, public, file_size_limit, allowed_mime_types, avif_autodetection)
values ('learning-certificates', 'learning-certificates', 'STANDARD', false, 10485760, array['application/pdf', 'image/png']::text[], false)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  avif_autodetection = excluded.avif_autodetection;

insert into storage.buckets (id, name, type, public, file_size_limit, allowed_mime_types, avif_autodetection)
values ('learning-exports', 'learning-exports', 'STANDARD', false, 52428800, array['application/json', 'text/csv', 'application/pdf']::text[], false)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  avif_autodetection = excluded.avif_autodetection;

insert into storage.buckets (id, name, type, public, file_size_limit, allowed_mime_types, avif_autodetection)
values ('scan-crops', 'scan-crops', 'STANDARD', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[], false)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  avif_autodetection = excluded.avif_autodetection;

insert into storage.buckets (id, name, type, public, file_size_limit, allowed_mime_types, avif_autodetection)
values ('scan-uploads', 'scan-uploads', 'STANDARD', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/bmp']::text[], false)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  avif_autodetection = excluded.avif_autodetection;

select pgmq.create('gateway_media')
where not exists (select 1 from pgmq.meta where queue_name = 'gateway_media');

select pgmq.create('gateway_retention')
where not exists (select 1 from pgmq.meta where queue_name = 'gateway_retention');

select pgmq.create('gateway_webhooks')
where not exists (select 1 from pgmq.meta where queue_name = 'gateway_webhooks');
