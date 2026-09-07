-- Nexora.AI complete Supabase setup
-- Run in Supabase SQL Editor.
-- Includes tables, indexes, defaults, auth provisioning, seed templates, and RLS.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid not null,
  name text,
  email text unique,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade
);

create table if not exists public.templates (
  id uuid not null default gen_random_uuid(),
  name text not null,
  description text,
  source_url text,
  created_at timestamp with time zone default current_timestamp,
  constraint templates_pkey primary key (id)
);

create table if not exists public.user_preferences (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  theme text default 'light'::text,
  email_notifications boolean default true,
  created_at timestamp with time zone default current_timestamp,
  updated_at timestamp with time zone default current_timestamp,
  constraint user_preferences_pkey primary key (id),
  constraint user_preferences_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.billing (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_tier text default 'free'::text,
  status text default 'active'::text,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone default current_timestamp,
  constraint billing_pkey primary key (id),
  constraint billing_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.projects (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  template_id uuid,
  name text not null,
  description text,
  zip_file_path text,
  created_at timestamp with time zone default current_timestamp,
  updated_at timestamp with time zone default current_timestamp,
  constraint projects_pkey primary key (id),
  constraint projects_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint projects_template_id_fkey foreign key (template_id) references public.templates(id) on delete set null
);

create table if not exists public.deployments (
  id uuid not null default gen_random_uuid(),
  project_id uuid,
  user_id uuid,
  deployment_url text,
  status text default 'pending'::text,
  created_at timestamp with time zone default current_timestamp,
  constraint deployments_pkey primary key (id),
  constraint deployments_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade,
  constraint deployments_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.conversations (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  title text,
  created_at timestamp with time zone default current_timestamp,
  constraint conversations_pkey primary key (id),
  constraint conversations_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.messages (
  id uuid not null default gen_random_uuid(),
  conversation_id uuid,
  role text check (role = any (array['user'::text, 'assistant'::text, 'system'::text])),
  content text not null,
  created_at timestamp with time zone default current_timestamp,
  constraint messages_pkey primary key (id),
  constraint messages_conversation_id_fkey foreign key (conversation_id) references public.conversations(id) on delete cascade
);

create index if not exists user_preferences_user_id_idx on public.user_preferences(user_id);
create index if not exists billing_user_id_idx on public.billing(user_id);
create index if not exists projects_user_id_updated_at_idx on public.projects(user_id, updated_at desc);
create index if not exists deployments_user_id_created_at_idx on public.deployments(user_id, created_at desc);
create index if not exists deployments_project_id_idx on public.deployments(project_id);
create index if not exists conversations_user_id_created_at_idx on public.conversations(user_id, created_at desc);
create index if not exists messages_conversation_id_created_at_idx on public.messages(conversation_id, created_at asc);

create unique index if not exists user_preferences_one_per_user_idx on public.user_preferences(user_id) where user_id is not null;
create unique index if not exists billing_one_per_user_idx on public.billing(user_id) where user_id is not null;
create unique index if not exists templates_source_url_unique_idx on public.templates(source_url) where source_url is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = current_timestamp;
  return new;
end;
$$;

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'User'),
    new.email,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  insert into public.user_preferences (user_id, theme, email_notifications)
  values (new.id, 'light', true)
  on conflict (user_id) where user_id is not null do nothing;

  insert into public.billing (user_id, plan_tier, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) where user_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.templates (name, description, source_url)
values
  ('Landing Page', 'A sleek, dark-themed responsive landing page with a hero section.', 'nexora://template/landing-page'),
  ('E-commerce App', 'Modern web store frontend with cart and checkout layout.', 'nexora://template/ecommerce'),
  ('Analytics Dashboard', 'Analytics dashboard template with charts and data tables.', 'nexora://template/analytics'),
  ('Developer Portfolio', 'Minimalist portfolio to showcase your work and GitHub repos.', 'nexora://template/portfolio'),
  ('SaaS Platform', 'Complete SaaS layout with sidebar, header, and pricing page.', 'nexora://template/saas'),
  ('Blog Layout', 'Clean typography-focused blog template for content creators.', 'nexora://template/blog'),
  ('Authentication Flow', 'Login, register, and forgot password screens.', 'nexora://template/authentication'),
  ('Settings Page', 'User profile and application settings layouts.', 'nexora://template/settings')
on conflict (source_url) where source_url is not null do update
set name = excluded.name,
    description = excluded.description;

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.billing enable row level security;
alter table public.templates enable row level security;
alter table public.projects enable row level security;
alter table public.deployments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "user_preferences_select_own" on public.user_preferences;
drop policy if exists "user_preferences_insert_own" on public.user_preferences;
drop policy if exists "user_preferences_update_own" on public.user_preferences;
drop policy if exists "billing_select_own" on public.billing;
drop policy if exists "billing_insert_own" on public.billing;
drop policy if exists "billing_update_own" on public.billing;
drop policy if exists "templates_select_all_authenticated" on public.templates;
drop policy if exists "templates_insert_authenticated" on public.templates;
drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;
drop policy if exists "deployments_select_own" on public.deployments;
drop policy if exists "deployments_insert_own" on public.deployments;
drop policy if exists "deployments_update_own" on public.deployments;
drop policy if exists "deployments_delete_own" on public.deployments;
drop policy if exists "conversations_select_own" on public.conversations;
drop policy if exists "conversations_insert_own" on public.conversations;
drop policy if exists "conversations_update_own" on public.conversations;
drop policy if exists "conversations_delete_own" on public.conversations;
drop policy if exists "messages_select_own_conversation" on public.messages;
drop policy if exists "messages_insert_own_conversation" on public.messages;
drop policy if exists "messages_update_own_conversation" on public.messages;
drop policy if exists "messages_delete_own_conversation" on public.messages;

create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = auth.uid());

create policy "profiles_insert_own" on public.profiles
for insert to authenticated with check (id = auth.uid());

create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "user_preferences_select_own" on public.user_preferences
for select to authenticated using (user_id = auth.uid());

create policy "user_preferences_insert_own" on public.user_preferences
for insert to authenticated with check (user_id = auth.uid());

create policy "user_preferences_update_own" on public.user_preferences
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "billing_select_own" on public.billing
for select to authenticated using (user_id = auth.uid());

create policy "billing_insert_own" on public.billing
for insert to authenticated with check (user_id = auth.uid());

-- Static frontend support. For real Stripe production, remove this update policy
-- and update billing only from a trusted backend/webhook.
create policy "billing_update_own" on public.billing
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "templates_select_all_authenticated" on public.templates
for select to authenticated using (true);

create policy "templates_insert_authenticated" on public.templates
for insert to authenticated with check (true);

create policy "projects_select_own" on public.projects
for select to authenticated using (user_id = auth.uid());

create policy "projects_insert_own" on public.projects
for insert to authenticated with check (user_id = auth.uid());

create policy "projects_update_own" on public.projects
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "projects_delete_own" on public.projects
for delete to authenticated using (user_id = auth.uid());

create policy "deployments_select_own" on public.deployments
for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.projects
    where projects.id = deployments.project_id
    and projects.user_id = auth.uid()
  )
);

create policy "deployments_insert_own" on public.deployments
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.projects
    where projects.id = deployments.project_id
    and projects.user_id = auth.uid()
  )
);

create policy "deployments_update_own" on public.deployments
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "deployments_delete_own" on public.deployments
for delete to authenticated using (user_id = auth.uid());

create policy "conversations_select_own" on public.conversations
for select to authenticated using (user_id = auth.uid());

create policy "conversations_insert_own" on public.conversations
for insert to authenticated with check (user_id = auth.uid());

create policy "conversations_update_own" on public.conversations
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "conversations_delete_own" on public.conversations
for delete to authenticated using (user_id = auth.uid());

create policy "messages_select_own_conversation" on public.messages
for select to authenticated
using (
  exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and conversations.user_id = auth.uid()
  )
);

create policy "messages_insert_own_conversation" on public.messages
for insert to authenticated
with check (
  exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and conversations.user_id = auth.uid()
  )
);

create policy "messages_update_own_conversation" on public.messages
for update to authenticated
using (
  exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and conversations.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and conversations.user_id = auth.uid()
  )
);

create policy "messages_delete_own_conversation" on public.messages
for delete to authenticated
using (
  exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and conversations.user_id = auth.uid()
  )
);

-- Backfill missing rows for users that already existed before this setup.
insert into public.profiles (id, name, email, avatar_url)
select
  users.id,
  coalesce(users.raw_user_meta_data->>'full_name', users.raw_user_meta_data->>'name', split_part(users.email, '@', 1), 'User'),
  users.email,
  coalesce(users.raw_user_meta_data->>'avatar_url', users.raw_user_meta_data->>'picture')
from auth.users
on conflict (id) do update
set email = excluded.email;

insert into public.user_preferences (user_id, theme, email_notifications)
select id, 'light', true from public.profiles
on conflict (user_id) where user_id is not null do nothing;

insert into public.billing (user_id, plan_tier, status)
select id, 'free', 'active' from public.profiles
on conflict (user_id) where user_id is not null do nothing;

-- ================================================================
-- ChatGPT Codex encrypted credential vault (server-only)
-- ================================================================
-- Nexora.AI production migration for the supplied Supabase project
-- Safe to run more than once in Supabase SQL Editor.
-- Existing Nexora tables/RLS/RPCs are preserved; this adds only the Codex vault
-- and compatibility indexes/columns already used by the chat application.


-- The supplied database already contains messages.model and messages.token_count.
-- Keep these ALTERs idempotent so the project can also be deployed against an
-- older Nexora database snapshot without breaking chat persistence.
alter table if exists public.messages
  add column if not exists token_count integer,
  add column if not exists model text;

create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);
create index if not exists conversations_user_updated_at_idx
  on public.conversations (user_id, updated_at desc);
create index if not exists projects_user_updated_at_idx
  on public.projects (user_id, updated_at desc);

-- Per-user encrypted ChatGPT/Codex credential cache.
-- Ciphertext is encrypted by the Vercel-only NEXORA_CODEX_VAULT_KEY before it
-- reaches Supabase. RLS binds every operation to auth.uid().
create table if not exists public.codex_auth_vault (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  account_email text,
  plan_type text,
  model_snapshot jsonb not null default '[]'::jsonb,
  verified_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.codex_auth_vault enable row level security;
revoke all on table public.codex_auth_vault from anon;
grant select, insert, update, delete on table public.codex_auth_vault to authenticated;

-- Recreate policies deterministically so an older service-role-only migration is
-- upgraded correctly.
drop policy if exists codex_vault_select_own on public.codex_auth_vault;
drop policy if exists codex_vault_insert_own on public.codex_auth_vault;
drop policy if exists codex_vault_update_own on public.codex_auth_vault;
drop policy if exists codex_vault_delete_own on public.codex_auth_vault;

create policy codex_vault_select_own on public.codex_auth_vault
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy codex_vault_insert_own on public.codex_auth_vault
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy codex_vault_update_own on public.codex_auth_vault
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy codex_vault_delete_own on public.codex_auth_vault
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.codex_auth_vault is
  'Encrypted OpenAI Codex auth cache. One RLS-protected row per Nexora user.';

-- Reuse the set_updated_at() function already present in the supplied database.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    execute 'drop trigger if exists set_codex_auth_vault_updated_at on public.codex_auth_vault';
    execute 'create trigger set_codex_auth_vault_updated_at before update on public.codex_auth_vault for each row execute function public.set_updated_at()';
  end if;
end $$;
