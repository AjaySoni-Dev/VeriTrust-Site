-- VeriTrust application tables
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
create table "public"."api_keys" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "created_by" uuid,
  "name" text not null,
  "key_prefix" text not null,
  "key_hash" text not null,
  "scopes" jsonb default '["scan:create", "scan:read"]'::jsonb not null,
  "status" api_key_status default 'active'::api_key_status not null,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "user_id" uuid,
  "masked_key" text,
  "usage_limit_daily" integer default 100 not null,
  "revoked_at" timestamp with time zone,
  "not_before" timestamp with time zone default statement_timestamp() not null,
  "rotated_from_id" uuid
);

create table "public"."api_rate_limits" (
  "id" uuid default gen_random_uuid() not null,
  "identity_type" text not null,
  "identity_hash" text not null,
  "endpoint" text not null,
  "window_date" date default CURRENT_DATE not null,
  "request_count" integer default 0 not null,
  "limit_count" integer not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "first_seen_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."api_usage_events" (
  "id" uuid default gen_random_uuid() not null,
  "api_key_id" uuid not null,
  "org_id" uuid,
  "user_id" uuid,
  "endpoint" text not null,
  "scan_type" text,
  "status" text not null,
  "request_id" text,
  "created_at" timestamp with time zone default now() not null,
  "latency_ms" integer,
  "error_code" text
);

create table "public"."audit_logs" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid,
  "actor_user_id" uuid,
  "action" text not null,
  "target_table" text,
  "target_id" uuid,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."billing_customers" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "provider" text default 'stripe'::text not null,
  "provider_customer_id" text not null,
  "email" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."billing_events" (
  "id" uuid default gen_random_uuid() not null,
  "provider" text default 'stripe'::text not null,
  "event_id" text not null,
  "event_type" text not null,
  "status" text default 'processed'::text not null,
  "error_message" text,
  "payload" jsonb default '{}'::jsonb not null,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."entitlement_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "plan_id" uuid,
  "plan_code" text not null,
  "entitlements" jsonb default '{}'::jsonb not null,
  "source" text default 'system'::text not null,
  "effective_from" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."feedback" (
  "id" uuid default gen_random_uuid() not null,
  "scan_id" uuid not null,
  "org_id" uuid not null,
  "user_id" uuid,
  "rating" text not null,
  "note" text,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."gateway_artifacts" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "scan_id" uuid not null,
  "parent_artifact_id" uuid,
  "ordinal" integer default 0 not null,
  "artifact_type" gateway_artifact_type not null,
  "status" gateway_artifact_status default 'pending'::gateway_artifact_status not null,
  "content_hmac" text,
  "mime_type" text,
  "size_bytes" bigint,
  "storage_bucket" text,
  "storage_path" text,
  "retention" retention_policy default 'metadata_only'::retention_policy not null,
  "retention_until" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "scrubbed_at" timestamp with time zone,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_decisions" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "scan_id" uuid not null,
  "sequence" integer not null,
  "decision_key" text not null,
  "decision_kind" gateway_decision_kind not null,
  "risk_score" numeric(7,6) not null,
  "verdict" gateway_risk_verdict not null,
  "recommendation" gateway_recommendation not null,
  "degraded" boolean default false not null,
  "reason_codes" text[] default '{}'::text[] not null,
  "evidence_ids" uuid[] default '{}'::uuid[] not null,
  "policy_version_id" uuid not null,
  "correlation_version" text not null,
  "schema_version" text default '1.0'::text not null,
  "supersedes_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone default statement_timestamp() not null
);
comment on table "public"."gateway_decisions" is 'Append-only preliminary, final, and override decisions with exact policy/correlation references.';

create table "public"."gateway_evidence" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "scan_id" uuid not null,
  "artifact_id" uuid not null,
  "model_run_id" uuid not null,
  "model_key" text not null,
  "status" gateway_evidence_status not null,
  "score" numeric(7,6),
  "verdict" gateway_evidence_verdict default 'unknown'::gateway_evidence_verdict not null,
  "confidence" gateway_confidence_band default 'unknown'::gateway_confidence_band not null,
  "confidence_value" numeric(7,6),
  "indicators" jsonb default '[]'::jsonb not null,
  "reason_codes" text[] default '{}'::text[] not null,
  "model_version" text not null,
  "calibration_version" text not null,
  "raw_response_redacted" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default statement_timestamp() not null
);
comment on table "public"."gateway_evidence" is 'Append-only normalized model evidence. Missing/not-applicable evidence must never be represented as score zero.';

create table "public"."gateway_idempotency_keys" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "integration_id" uuid not null,
  "idempotency_key" text not null,
  "request_hash" text not null,
  "scan_id" uuid not null,
  "response_status" integer,
  "response_body" jsonb,
  "expires_at" timestamp with time zone default statement_timestamp() + '24:00:00'::interval not null,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_integrations" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "api_key_id" uuid,
  "name" text not null,
  "source_type" text not null,
  "auth_mode" text not null,
  "external_id" text,
  "allowed_actions" text[] default ARRAY['gateway:scan'::text, 'gateway:read'::text] not null,
  "status" gateway_integration_status default 'active'::gateway_integration_status not null,
  "signing_key_ref" text,
  "replay_window_seconds" integer default 300 not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_jobs" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "scan_id" uuid not null,
  "artifact_id" uuid,
  "job_type" gateway_job_type not null,
  "queue_name" text not null,
  "status" gateway_job_status default 'queued'::gateway_job_status not null,
  "dedupe_key" text not null,
  "priority" smallint default 100 not null,
  "available_at" timestamp with time zone default statement_timestamp() not null,
  "attempt_count" integer default 0 not null,
  "max_attempts" integer default 5 not null,
  "lease_token" uuid,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "pgmq_message_id" bigint,
  "payload" jsonb default '{}'::jsonb not null,
  "last_error_code" text,
  "last_error_detail" jsonb default '{}'::jsonb not null,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);
comment on table "public"."gateway_jobs" is 'Canonical durable job state paired with PGMQ messages; workers must use lease-token RPCs.';

create table "public"."gateway_model_health" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid,
  "model_version_id" uuid not null,
  "provider" text not null,
  "state" gateway_health_state default 'closed'::gateway_health_state not null,
  "consecutive_failures" integer default 0 not null,
  "consecutive_successes" integer default 0 not null,
  "opened_at" timestamp with time zone,
  "next_probe_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "last_failure_at" timestamp with time zone,
  "metrics" jsonb default '{}'::jsonb not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_model_runs" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "scan_id" uuid not null,
  "artifact_id" uuid not null,
  "model_version_id" uuid not null,
  "model_key" text not null,
  "attempt_group" uuid default gen_random_uuid() not null,
  "attempt" integer default 1 not null,
  "status" gateway_model_run_status default 'pending'::gateway_model_run_status not null,
  "provider" text not null,
  "provider_model_version" text not null,
  "calibration_version" text not null,
  "preprocessing_version" text not null,
  "deadline_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "latency_ms" integer,
  "error_code" text,
  "error_detail" jsonb default '{}'::jsonb not null,
  "metrics" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_model_versions" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid,
  "model_key" text not null,
  "version" text not null,
  "provider" text not null,
  "calibration_version" text not null,
  "preprocessing_version" text default '1'::text not null,
  "supported_artifacts" gateway_artifact_type[] not null,
  "rollout_status" gateway_model_rollout_status default 'disabled'::gateway_model_rollout_status not null,
  "canary_percent" numeric(5,2) default 0 not null,
  "timeout_ms" integer default 10000 not null,
  "configuration" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_policies" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "name" text not null,
  "description" text,
  "status" gateway_policy_status default 'active'::gateway_policy_status not null,
  "active_version_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_policy_activations" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "policy_id" uuid not null,
  "version_id" uuid not null,
  "previous_version_id" uuid,
  "activated_by" uuid,
  "reason" text,
  "created_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_policy_versions" (
  "id" uuid default gen_random_uuid() not null,
  "policy_id" uuid not null,
  "org_id" uuid not null,
  "version" integer not null,
  "schema_version" text default '1.0'::text not null,
  "policy_document" jsonb not null,
  "compiled_policy" jsonb not null,
  "checksum" text not null,
  "validation_status" text default 'valid'::text not null,
  "validation_errors" jsonb default '[]'::jsonb not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default statement_timestamp() not null
);
comment on table "public"."gateway_policy_versions" is 'Immutable, validated policy versions. Activation is recorded in gateway_policy_activations.';

create table "public"."gateway_retention_receipts" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "scan_id" uuid not null,
  "artifact_id" uuid not null,
  "storage_reference_hash" text,
  "object_deleted" boolean not null,
  "metadata_scrubbed" boolean not null,
  "verified" boolean default false not null,
  "verification_detail" jsonb default '{}'::jsonb not null,
  "worker_id" text not null,
  "completed_at" timestamp with time zone default statement_timestamp() not null,
  "created_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_review_cases" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "scan_id" uuid not null,
  "decision_id" uuid not null,
  "status" gateway_review_status default 'open'::gateway_review_status not null,
  "priority" smallint default 100 not null,
  "reason_codes" text[] default '{}'::text[] not null,
  "assigned_to" uuid,
  "resolution" text,
  "resolution_note" text,
  "resolved_by" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_scans" (
  "id" uuid default gen_random_uuid() not null,
  "display_id" text default (('VTG-'::text || to_char(statement_timestamp(), 'YYYY'::text)) || '-'::text) || upper(substr(replace(gen_random_uuid()::text, '-'::text, ''::text), 1, 12)) not null,
  "org_id" uuid not null,
  "integration_id" uuid not null,
  "api_key_id" uuid,
  "submitted_by" uuid,
  "external_event_id" text,
  "processing_mode" gateway_processing_mode default 'hybrid'::gateway_processing_mode not null,
  "status" gateway_scan_status default 'accepted'::gateway_scan_status not null,
  "source" text default 'api'::text not null,
  "request_id" text not null,
  "trace_id" text not null,
  "schema_version" text default '1.0'::text not null,
  "request_hash" text not null,
  "policy_version_id" uuid not null,
  "correlation_version" text default 'gateway-correlation-v1'::text not null,
  "preliminary_decision_id" uuid,
  "final_decision_id" uuid,
  "degraded" boolean default false not null,
  "deadline_at" timestamp with time zone,
  "cancel_requested_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "failure_code" text,
  "failure_detail" jsonb default '{}'::jsonb not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);
comment on table "public"."gateway_scans" is 'Unified gateway requests. Raw content is stored only through gateway_artifacts under explicit retention.';

create table "public"."gateway_schema_migrations" (
  "version" text not null,
  "checksum" text not null,
  "applied_at" timestamp with time zone default statement_timestamp() not null,
  "applied_by" text default SESSION_USER not null,
  "metadata" jsonb default '{}'::jsonb not null
);

create table "public"."gateway_uploads" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "integration_id" uuid not null,
  "created_by" uuid,
  "artifact_type" gateway_artifact_type not null,
  "status" gateway_upload_status default 'pending'::gateway_upload_status not null,
  "storage_bucket" text default 'gateway-uploads'::text not null,
  "staging_path" text not null,
  "final_path" text,
  "declared_mime_type" text not null,
  "detected_mime_type" text,
  "declared_size_bytes" bigint not null,
  "actual_size_bytes" bigint,
  "content_sha256" text,
  "scan_id" uuid,
  "artifact_id" uuid,
  "expires_at" timestamp with time zone not null,
  "completed_at" timestamp with time zone,
  "attached_at" timestamp with time zone,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);
comment on table "public"."gateway_uploads" is 'Short-lived private upload intents. Staging objects are moved into tenant/scan paths before attachment.';

create table "public"."gateway_usage_daily" (
  "org_id" uuid not null,
  "usage_date" date default CURRENT_DATE not null,
  "accepted_scans" integer default 0 not null,
  "artifact_count" integer default 0 not null,
  "model_run_count" integer default 0 not null,
  "submitted_bytes" bigint default 0 not null,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_webhook_attempts" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "event_id" uuid not null,
  "attempt" integer not null,
  "outcome" text not null,
  "response_code" integer,
  "latency_ms" integer,
  "retry_at" timestamp with time zone,
  "error_code" text,
  "error_detail" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_webhook_endpoints" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "integration_id" uuid,
  "name" text not null,
  "url" text not null,
  "signing_secret_ref" text not null,
  "event_types" text[] default ARRAY['gateway.scan.completed'::text] not null,
  "status" gateway_webhook_status default 'active'::gateway_webhook_status not null,
  "timeout_ms" integer default 10000 not null,
  "max_attempts" integer default 8 not null,
  "replay_window_seconds" integer default 300 not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);
comment on table "public"."gateway_webhook_endpoints" is 'Outbound webhook configuration. signing_secret_ref is a Vault/KMS reference, never plaintext or a one-way hash.';

create table "public"."gateway_webhook_events" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "endpoint_id" uuid not null,
  "scan_id" uuid not null,
  "decision_id" uuid,
  "event_type" text not null,
  "schema_version" text default '1.0'::text not null,
  "dedupe_key" text not null,
  "payload" jsonb not null,
  "payload_checksum" text not null,
  "status" gateway_delivery_status default 'pending'::gateway_delivery_status not null,
  "attempt_count" integer default 0 not null,
  "available_at" timestamp with time zone default statement_timestamp() not null,
  "delivered_at" timestamp with time zone,
  "terminal_error_code" text,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "updated_at" timestamp with time zone default statement_timestamp() not null
);

create table "public"."gateway_webhook_secrets" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "endpoint_id" uuid not null,
  "ciphertext" text not null,
  "iv" text not null,
  "auth_tag" text not null,
  "key_version" text default 'v1'::text not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default statement_timestamp() not null,
  "revoked_at" timestamp with time zone
);
comment on table "public"."gateway_webhook_secrets" is 'AES-GCM ciphertext only. Encryption keys remain in server/worker environment variables.';

create table "public"."learning_assessment_versions" (
  "id" uuid default gen_random_uuid() not null,
  "assessment_id" uuid not null,
  "version" integer not null,
  "status" text default 'draft'::text not null,
  "title" text not null,
  "duration_minutes" integer not null,
  "passing_percent" numeric(6,3) not null,
  "maximum_attempts" integer default 3 not null,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."learning_assessments" (
  "id" uuid default gen_random_uuid() not null,
  "course_version_id" uuid not null,
  "title" text not null,
  "assessment_type" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_assignments" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "course_version_id" uuid not null,
  "cohort_id" uuid,
  "assignee_user_id" uuid,
  "title" text not null,
  "due_at" timestamp with time zone,
  "status" text default 'open'::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."learning_attempt_items" (
  "id" uuid default gen_random_uuid() not null,
  "attempt_id" uuid not null,
  "question_revision_id" uuid not null,
  "position" integer not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_attempts" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "user_id" uuid not null,
  "assessment_version_id" uuid not null,
  "status" text default 'in_progress'::text not null,
  "started_at" timestamp with time zone default now() not null,
  "expires_at" timestamp with time zone not null,
  "submitted_at" timestamp with time zone,
  "scored_at" timestamp with time zone,
  "score_percent" numeric(6,3),
  "passed" boolean,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_audit_events" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid,
  "actor_user_id" uuid,
  "event_type" text not null,
  "entity_type" text not null,
  "entity_id" uuid,
  "request_id" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_bookmarks" (
  "id" uuid default gen_random_uuid() not null,
  "enrollment_id" uuid not null,
  "user_id" uuid not null,
  "lesson_id" uuid not null,
  "block_id" uuid,
  "note" text,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_certification_versions" (
  "id" uuid default gen_random_uuid() not null,
  "certification_id" uuid not null,
  "version" integer not null,
  "status" text default 'draft'::text not null,
  "title" text not null,
  "validity_days" integer,
  "requirements" jsonb default '{}'::jsonb not null,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."learning_certifications" (
  "id" uuid default gen_random_uuid() not null,
  "course_id" uuid not null,
  "slug" text not null,
  "title" text not null,
  "status" text default 'active'::text not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_cohort_members" (
  "cohort_id" uuid not null,
  "user_id" uuid not null,
  "added_by" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_cohorts" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "name" text not null,
  "status" text default 'active'::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."learning_competencies" (
  "id" uuid default gen_random_uuid() not null,
  "code" text not null,
  "title" text not null,
  "description" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_content_reviews" (
  "id" uuid default gen_random_uuid() not null,
  "content_type" text not null,
  "content_id" uuid not null,
  "reviewer_id" uuid not null,
  "status" text not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "decided_at" timestamp with time zone
);

create table "public"."learning_course_competencies" (
  "course_version_id" uuid not null,
  "competency_id" uuid not null,
  "weight" numeric(6,3) default 1 not null
);

create table "public"."learning_course_versions" (
  "id" uuid default gen_random_uuid() not null,
  "course_id" uuid not null,
  "version" integer not null,
  "status" text default 'draft'::text not null,
  "title" text not null,
  "summary" text not null,
  "description" text not null,
  "level" text not null,
  "estimated_minutes" integer default 0 not null,
  "learning_outcomes" jsonb default '[]'::jsonb not null,
  "prerequisites" jsonb default '[]'::jsonb not null,
  "cover_asset_path" text,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."learning_courses" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."learning_credential_status_events" (
  "id" uuid default gen_random_uuid() not null,
  "credential_id" uuid not null,
  "previous_status" text,
  "new_status" text not null,
  "reason" text,
  "changed_by" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_credentials" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "user_id" uuid not null,
  "certification_version_id" uuid not null,
  "public_code" text not null,
  "status" text default 'valid'::text not null,
  "display_name" text not null,
  "issuer_name" text default 'VeriTrust'::text not null,
  "outcome" text default 'Passed'::text not null,
  "public_visible" boolean default true not null,
  "issued_at" timestamp with time zone default now() not null,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_enrollments" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "user_id" uuid not null,
  "course_version_id" uuid not null,
  "assignment_id" uuid,
  "source" text default 'self'::text not null,
  "status" text default 'active'::text not null,
  "progress_percent" numeric(6,3) default 0 not null,
  "started_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone,
  "last_activity_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_events" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "user_id" uuid not null,
  "enrollment_id" uuid not null,
  "lesson_id" uuid,
  "event_type" text not null,
  "occurred_at" timestamp with time zone default now() not null,
  "payload" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_idempotency_receipts" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "operation" text not null,
  "idempotency_key" text not null,
  "response_payload" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "expires_at" timestamp with time zone default now() + '7 days'::interval not null
);

create table "public"."learning_lab_sessions" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "user_id" uuid not null,
  "enrollment_id" uuid not null,
  "lesson_id" uuid not null,
  "status" text default 'started'::text not null,
  "training_mode" boolean default true not null,
  "result_summary" jsonb default '{}'::jsonb not null,
  "started_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone
);

create table "public"."learning_lesson_blocks" (
  "id" uuid default gen_random_uuid() not null,
  "lesson_id" uuid not null,
  "block_type" text not null,
  "position" integer not null,
  "content" jsonb default '{}'::jsonb not null,
  "accessibility_label" text,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_lesson_progress" (
  "id" uuid default gen_random_uuid() not null,
  "enrollment_id" uuid not null,
  "user_id" uuid not null,
  "lesson_id" uuid not null,
  "status" text default 'started'::text not null,
  "progress_percent" numeric(6,3) default 0 not null,
  "last_position" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."learning_lessons" (
  "id" uuid default gen_random_uuid() not null,
  "module_id" uuid not null,
  "slug" text not null,
  "title" text not null,
  "summary" text default ''::text not null,
  "position" integer not null,
  "estimated_minutes" integer default 0 not null,
  "lesson_type" text default 'lesson'::text not null,
  "is_preview" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_modules" (
  "id" uuid default gen_random_uuid() not null,
  "course_version_id" uuid not null,
  "title" text not null,
  "summary" text default ''::text not null,
  "position" integer not null,
  "estimated_minutes" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_program_courses" (
  "program_id" uuid not null,
  "course_id" uuid not null,
  "position" integer not null,
  "required" boolean default true not null
);

create table "public"."learning_programs" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "title" text not null,
  "summary" text not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."learning_question_revisions" (
  "id" uuid default gen_random_uuid() not null,
  "assessment_version_id" uuid not null,
  "external_key" text not null,
  "prompt" text not null,
  "question_type" text not null,
  "answer_schema" jsonb default '{}'::jsonb not null,
  "correct_answer" jsonb not null,
  "points" numeric(8,3) default 1 not null,
  "explanation" text,
  "competency_id" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."learning_responses" (
  "id" uuid default gen_random_uuid() not null,
  "attempt_id" uuid not null,
  "attempt_item_id" uuid not null,
  "user_id" uuid not null,
  "answer" jsonb not null,
  "saved_at" timestamp with time zone default now() not null
);

create table "public"."learning_role_assignments" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "user_id" uuid not null,
  "role" text not null,
  "granted_by" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."model_catalog" (
  "key" text not null,
  "scan_type" scan_type not null,
  "display_name" text not null,
  "provider" text not null,
  "provider_model" text not null,
  "is_active" boolean default true not null,
  "is_default" boolean default false not null,
  "fallback_key" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."organization_members" (
  "org_id" uuid not null,
  "user_id" uuid not null,
  "role" app_role default 'viewer'::app_role not null,
  "status" member_status default 'active'::member_status not null,
  "invited_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."organization_subscriptions" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "plan_id" uuid,
  "provider" text default 'stripe'::text not null,
  "provider_customer_id" text,
  "provider_subscription_id" text,
  "provider_price_id" text,
  "status" text default 'active'::text not null,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean default false not null,
  "trial_end" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."organizations" (
  "id" uuid default gen_random_uuid() not null,
  "plan_id" uuid not null,
  "name" text not null,
  "slug" text not null,
  "created_by" uuid not null,
  "settings" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "gateway_enabled" boolean default true not null,
  "gateway_enforcement_enabled" boolean default false not null
);
comment on column "public"."organizations"."gateway_enforcement_enabled" is 'Emergency/rollout gate. Must remain false until pilot acceptance and operational SLOs pass.';

create table "public"."plans" (
  "id" uuid default gen_random_uuid() not null,
  "code" text not null,
  "name" text not null,
  "monthly_scan_limit" integer default 100 not null,
  "daily_scan_limit" integer default 25 not null,
  "max_members" integer default 1 not null,
  "max_api_keys" integer default 0 not null,
  "file_retention_days" integer default 0 not null,
  "allow_file_retention" boolean default false not null,
  "allow_api_access" boolean default false not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "price_monthly_cents" integer default 0 not null,
  "price_yearly_cents" integer default 0 not null,
  "currency" text default 'usd'::text not null,
  "monthly_web_scan_limit" integer,
  "monthly_api_limit" integer,
  "monthly_total_limit" integer,
  "daily_api_limit" integer default 10 not null,
  "burst_per_minute" integer default 20 not null,
  "max_file_bytes" bigint default 4194304 not null,
  "retention_days" integer,
  "allow_pdf_export" boolean default true not null,
  "allow_batch_scans" boolean default false not null,
  "allow_webhooks" boolean default false not null,
  "allow_priority_models" boolean default false not null,
  "allow_overage" boolean default false not null,
  "overage_unit_cents" integer default 0 not null,
  "is_public" boolean default true not null,
  "sort_order" integer default 100 not null,
  "stripe_monthly_price_id" text,
  "stripe_yearly_price_id" text,
  "external_price_id" text,
  "updated_at" timestamp with time zone default now() not null,
  "max_gateway_artifacts" integer default 16 not null,
  "max_gateway_parallel_models" integer default 3 not null,
  "daily_gateway_scan_limit" integer default 25 not null,
  "monthly_gateway_scan_limit" integer default 750 not null,
  "gateway_max_raw_retention_hours" integer default 24 not null,
  "allow_gateway_enforcement" boolean default false not null,
  "learning_catalog_access" boolean default true not null,
  "learning_certificate_access" boolean default true not null,
  "learning_admin_access" boolean default false not null,
  "learning_seat_limit" integer default 1 not null,
  "learning_assignment_limit" integer default 0 not null,
  "learning_export_access" boolean default false not null,
  "learning_proctored_exam_access" boolean default false not null
);

create table "public"."profiles" (
  "id" uuid not null,
  "full_name" text,
  "avatar_url" text,
  "default_org_id" uuid,
  "preferences" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "username" text,
  "avatar_updated_at" timestamp with time zone
);

create table "public"."scan_inputs" (
  "id" uuid default gen_random_uuid() not null,
  "scan_id" uuid not null,
  "input_kind" input_kind not null,
  "retention" retention_policy default 'metadata_only'::retention_policy not null,
  "text_preview" text,
  "text_hash" text,
  "file_id" uuid,
  "mime_type" text,
  "size_bytes" bigint,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."scan_model_runs" (
  "id" uuid default gen_random_uuid() not null,
  "scan_id" uuid not null,
  "model_key" text,
  "provider" text not null,
  "provider_model" text not null,
  "status" text not null,
  "latency_ms" integer,
  "request_metadata" jsonb default '{}'::jsonb not null,
  "response_metadata" jsonb default '{}'::jsonb not null,
  "error_message" text,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."scan_projects" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "created_by" uuid not null,
  "name" text not null,
  "description" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table "public"."scan_results" (
  "id" uuid default gen_random_uuid() not null,
  "scan_id" uuid not null,
  "label" text not null,
  "confidence" numeric(7,6) not null,
  "risk_level" risk_level not null,
  "primary_score" numeric(7,6),
  "secondary_score" numeric(7,6),
  "explanation" text,
  "indicators" jsonb default '[]'::jsonb not null,
  "raw_scores" jsonb default '[]'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."scans" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "user_id" uuid,
  "project_id" uuid,
  "scan_type" scan_type not null,
  "status" scan_status default 'queued'::scan_status not null,
  "selected_model_key" text,
  "fallback_model_key" text,
  "final_label" text,
  "confidence" numeric(7,6),
  "risk_level" risk_level default 'unknown'::risk_level not null,
  "source" text default 'web'::text not null,
  "request_ip" inet,
  "user_agent" text,
  "error_message" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);

create table "public"."stored_files" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "user_id" uuid,
  "scan_id" uuid,
  "bucket_id" text not null,
  "object_path" text not null,
  "original_name" text,
  "mime_type" text,
  "size_bytes" bigint,
  "sha256" text,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."system_events" (
  "id" uuid default gen_random_uuid() not null,
  "severity" text not null,
  "event_type" text not null,
  "org_id" uuid,
  "scan_id" uuid,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."usage_events" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "user_id" uuid,
  "source" text not null,
  "scan_type" scan_type,
  "endpoint" text,
  "status" text default 'success'::text not null,
  "units" integer default 1 not null,
  "request_id" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."usage_monthly" (
  "org_id" uuid not null,
  "month_start" date not null,
  "web_deepfake_count" integer default 0 not null,
  "web_phishing_count" integer default 0 not null,
  "api_deepfake_count" integer default 0 not null,
  "api_phishing_count" integer default 0 not null,
  "api_usage_count" integer default 0 not null,
  "storage_bytes" bigint default 0 not null,
  "overage_count" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "web_link_count" integer default 0 not null,
  "api_link_count" integer default 0 not null
);

create table "public"."user_usage_daily" (
  "org_id" uuid not null,
  "user_id" uuid not null,
  "usage_date" date default CURRENT_DATE not null,
  "deepfake_count" integer default 0 not null,
  "phishing_count" integer default 0 not null,
  "api_count" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "link_count" integer default 0 not null
);

create table "public"."webhook_endpoints" (
  "id" uuid default gen_random_uuid() not null,
  "org_id" uuid not null,
  "created_by" uuid,
  "url" text not null,
  "secret_hash" text,
  "events" text[] default ARRAY['scan.completed'::text] not null,
  "is_active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table "public"."webhook_events" (
  "id" uuid default gen_random_uuid() not null,
  "endpoint_id" uuid not null,
  "org_id" uuid not null,
  "event_type" text not null,
  "payload" jsonb not null,
  "delivery_status" webhook_delivery_status default 'pending'::webhook_delivery_status not null,
  "attempt_count" integer default 0 not null,
  "last_error" text,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);
