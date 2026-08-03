-- VeriTrust application enum types
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
create type "public"."api_key_status" as enum ('active', 'revoked');

create type "public"."app_role" as enum ('owner', 'admin', 'analyst', 'viewer');

create type "public"."gateway_artifact_status" as enum ('pending', 'ready', 'processing', 'completed', 'failed', 'deleted');

create type "public"."gateway_artifact_type" as enum ('text', 'url', 'image', 'audio', 'video', 'email', 'attachment', 'qr_code', 'transcript', 'frame', 'other');

create type "public"."gateway_confidence_band" as enum ('low', 'medium', 'high', 'unknown');

create type "public"."gateway_decision_kind" as enum ('preliminary', 'final', 'override');

create type "public"."gateway_delivery_status" as enum ('pending', 'delivering', 'delivered', 'retry', 'failed', 'dead_letter');

create type "public"."gateway_evidence_status" as enum ('pending', 'completed', 'failed', 'timed_out', 'not_applicable');

create type "public"."gateway_evidence_verdict" as enum ('safe', 'suspicious', 'malicious', 'manipulated', 'unknown');

create type "public"."gateway_health_state" as enum ('closed', 'open', 'half_open');

create type "public"."gateway_integration_status" as enum ('active', 'paused', 'revoked');

create type "public"."gateway_job_status" as enum ('queued', 'leased', 'retry', 'completed', 'failed', 'dead_letter', 'cancelled');

create type "public"."gateway_job_type" as enum ('media', 'webhook', 'retention');

create type "public"."gateway_model_rollout_status" as enum ('active', 'canary', 'disabled', 'retired');

create type "public"."gateway_model_run_status" as enum ('pending', 'queued', 'leased', 'running', 'completed', 'failed', 'timed_out', 'not_applicable', 'cancelled');

create type "public"."gateway_policy_status" as enum ('active', 'archived');

create type "public"."gateway_processing_mode" as enum ('synchronous', 'asynchronous', 'hybrid');

create type "public"."gateway_recommendation" as enum ('allow', 'warn', 'manual_review', 'quarantine', 'block', 'hold');

create type "public"."gateway_review_status" as enum ('open', 'assigned', 'resolved', 'dismissed');

create type "public"."gateway_risk_verdict" as enum ('low', 'medium', 'high', 'critical', 'unknown');

create type "public"."gateway_scan_status" as enum ('accepted', 'queued', 'processing', 'partially_completed', 'completed', 'failed', 'cancel_requested', 'cancelled');

create type "public"."gateway_upload_status" as enum ('pending', 'uploaded', 'attached', 'expired', 'deleted');

create type "public"."gateway_webhook_status" as enum ('active', 'paused', 'disabled');

create type "public"."input_kind" as enum ('image', 'text', 'url', 'email', 'sms', 'mixed');

create type "public"."member_status" as enum ('active', 'invited', 'removed');

create type "public"."retention_policy" as enum ('none', 'metadata_only', 'temporary_file', 'retained_file');

create type "public"."risk_level" as enum ('low', 'medium', 'high', 'unknown', 'critical');

create type "public"."scan_status" as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');

create type "public"."scan_type" as enum ('deepfake', 'phishing', 'link');

create type "public"."webhook_delivery_status" as enum ('pending', 'delivered', 'failed');
