-- VeriTrust platform prerequisites
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
create schema if not exists extensions;
create schema if not exists pgmq;
create schema if not exists vault;
create schema if not exists veritrust_private;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgmq with schema pgmq;
create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_stat_statements with schema extensions;
