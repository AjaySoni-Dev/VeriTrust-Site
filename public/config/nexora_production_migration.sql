-- Nexora.AI production migration for the supplied Supabase project
-- Safe to run more than once in Supabase SQL Editor.
-- Existing Nexora tables/RLS/RPCs are preserved; this adds only the Codex vault
-- and compatibility indexes/columns already used by the chat application.

begin;

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

commit;
