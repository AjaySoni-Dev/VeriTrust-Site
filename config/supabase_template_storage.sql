-- Nexora.AI template Storage bucket configuration
-- Safe to run repeatedly in Supabase SQL Editor.
-- Files themselves are uploaded through Dashboard/S3/CLI, not by this SQL.

insert into storage.buckets (id, name, public)
values ('template-previews', 'template-previews', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('template-packages', 'template-packages', false)
on conflict (id) do update set public = false;

-- Intentionally create NO client read/write policy for template-packages.
-- The Nexora Vercel backend reads it with SUPABASE_SECRET_KEY/service_role
-- after it has authenticated the user and checked premium entitlement.
