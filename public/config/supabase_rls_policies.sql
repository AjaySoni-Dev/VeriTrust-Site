-- Nexora.AI chat app Row Level Security policies
-- Run this once in Supabase SQL Editor after creating the tables.
-- These policies let authenticated users read/write only their own account data.

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

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "user_preferences_select_own"
on public.user_preferences for select
to authenticated
using (user_id = auth.uid());

create policy "user_preferences_insert_own"
on public.user_preferences for insert
to authenticated
with check (user_id = auth.uid());

create policy "user_preferences_update_own"
on public.user_preferences for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "billing_select_own"
on public.billing for select
to authenticated
using (user_id = auth.uid());

create policy "billing_insert_own"
on public.billing for insert
to authenticated
with check (user_id = auth.uid());

-- Frontend-only billing toggle support.
-- For Stripe production, remove this policy and update billing from a trusted backend/webhook.
create policy "billing_update_own"
on public.billing for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "templates_select_all_authenticated"
on public.templates for select
to authenticated
using (true);

-- Allows the static frontend to seed default templates if the table is empty.
-- For production, seed templates manually and remove this insert policy.
create policy "templates_insert_authenticated"
on public.templates for insert
to authenticated
with check (true);

create policy "projects_select_own"
on public.projects for select
to authenticated
using (user_id = auth.uid());

create policy "projects_insert_own"
on public.projects for insert
to authenticated
with check (user_id = auth.uid());

create policy "projects_update_own"
on public.projects for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "projects_delete_own"
on public.projects for delete
to authenticated
using (user_id = auth.uid());

create policy "deployments_select_own"
on public.deployments for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.projects
    where projects.id = deployments.project_id
    and projects.user_id = auth.uid()
  )
);

create policy "deployments_insert_own"
on public.deployments for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.projects
    where projects.id = deployments.project_id
    and projects.user_id = auth.uid()
  )
);

create policy "deployments_update_own"
on public.deployments for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "deployments_delete_own"
on public.deployments for delete
to authenticated
using (user_id = auth.uid());

create policy "conversations_select_own"
on public.conversations for select
to authenticated
using (user_id = auth.uid());

create policy "conversations_insert_own"
on public.conversations for insert
to authenticated
with check (user_id = auth.uid());

create policy "conversations_update_own"
on public.conversations for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "conversations_delete_own"
on public.conversations for delete
to authenticated
using (user_id = auth.uid());

create policy "messages_select_own_conversation"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and conversations.user_id = auth.uid()
  )
);

create policy "messages_insert_own_conversation"
on public.messages for insert
to authenticated
with check (
  exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and conversations.user_id = auth.uid()
  )
);

create policy "messages_update_own_conversation"
on public.messages for update
to authenticated
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

create policy "messages_delete_own_conversation"
on public.messages for delete
to authenticated
using (
  exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and conversations.user_id = auth.uid()
  )
);
