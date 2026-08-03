-- VeriTrust supporting indexes
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
CREATE INDEX api_keys_dashboard_idx ON public.api_keys USING btree (org_id, created_by, created_at DESC) INCLUDE (status, last_used_at, usage_limit_daily, masked_key);

CREATE INDEX api_keys_rotated_from_idx ON public.api_keys USING btree (rotated_from_id) WHERE (rotated_from_id IS NOT NULL);

CREATE INDEX api_keys_user_id_idx ON public.api_keys USING btree (user_id);

CREATE INDEX api_rate_limits_endpoint_window_idx ON public.api_rate_limits USING btree (endpoint, window_date);

CREATE INDEX api_usage_events_api_key_id_created_at_idx ON public.api_usage_events USING btree (api_key_id, created_at DESC);

CREATE INDEX api_usage_events_org_id_created_at_idx ON public.api_usage_events USING btree (org_id, created_at DESC);

CREATE INDEX api_usage_events_user_id_created_at_idx ON public.api_usage_events USING btree (user_id, created_at DESC);

CREATE INDEX audit_logs_org_idx ON public.audit_logs USING btree (org_id, created_at DESC);

CREATE INDEX entitlement_snapshots_org_effective_idx ON public.entitlement_snapshots USING btree (org_id, effective_from DESC);

CREATE INDEX feedback_scan_created_idx ON public.feedback USING btree (scan_id, created_at DESC);

CREATE INDEX gateway_artifacts_content_cache_idx ON public.gateway_artifacts USING btree (org_id, artifact_type, content_hmac) WHERE ((content_hmac IS NOT NULL) AND (scrubbed_at IS NULL));

CREATE INDEX gateway_artifacts_retention_idx ON public.gateway_artifacts USING btree (retention_until) WHERE ((retention_until IS NOT NULL) AND (scrubbed_at IS NULL));

CREATE INDEX gateway_artifacts_scan_idx ON public.gateway_artifacts USING btree (scan_id, ordinal);

CREATE UNIQUE INDEX gateway_decisions_one_final_uidx ON public.gateway_decisions USING btree (scan_id) WHERE (decision_kind = 'final'::gateway_decision_kind);

CREATE INDEX gateway_decisions_org_created_idx ON public.gateway_decisions USING btree (org_id, created_at DESC);

CREATE INDEX gateway_decisions_scan_created_idx ON public.gateway_decisions USING btree (scan_id, created_at DESC);

CREATE INDEX gateway_evidence_artifact_idx ON public.gateway_evidence USING btree (artifact_id, created_at);

CREATE INDEX gateway_evidence_scan_idx ON public.gateway_evidence USING btree (scan_id, created_at);

CREATE INDEX gateway_idempotency_expiry_idx ON public.gateway_idempotency_keys USING btree (expires_at);

CREATE UNIQUE INDEX gateway_integrations_org_external_uidx ON public.gateway_integrations USING btree (org_id, source_type, external_id) WHERE (external_id IS NOT NULL);

CREATE INDEX gateway_jobs_actionable_idx ON public.gateway_jobs USING btree (queue_name, status, available_at, priority, created_at) WHERE (status = ANY (ARRAY['queued'::gateway_job_status, 'retry'::gateway_job_status]));

CREATE INDEX gateway_jobs_lease_expiry_idx ON public.gateway_jobs USING btree (lease_expires_at) WHERE (status = 'leased'::gateway_job_status);

CREATE INDEX gateway_jobs_scan_idx ON public.gateway_jobs USING btree (scan_id, created_at);

CREATE UNIQUE INDEX gateway_model_health_global_uidx ON public.gateway_model_health USING btree (model_version_id, provider) WHERE (org_id IS NULL);

CREATE INDEX gateway_model_health_probe_idx ON public.gateway_model_health USING btree (state, next_probe_at);

CREATE UNIQUE INDEX gateway_model_health_tenant_uidx ON public.gateway_model_health USING btree (org_id, model_version_id, provider) WHERE (org_id IS NOT NULL);

CREATE INDEX gateway_model_runs_actionable_idx ON public.gateway_model_runs USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::gateway_model_run_status, 'queued'::gateway_model_run_status, 'leased'::gateway_model_run_status, 'running'::gateway_model_run_status]));

CREATE INDEX gateway_model_runs_model_idx ON public.gateway_model_runs USING btree (model_version_id, created_at DESC);

CREATE INDEX gateway_model_runs_scan_idx ON public.gateway_model_runs USING btree (scan_id, created_at);

CREATE UNIQUE INDEX gateway_model_versions_global_identity_uidx ON public.gateway_model_versions USING btree (model_key, version) WHERE (org_id IS NULL);

CREATE UNIQUE INDEX gateway_model_versions_tenant_identity_uidx ON public.gateway_model_versions USING btree (org_id, model_key, version) WHERE (org_id IS NOT NULL);

CREATE UNIQUE INDEX gateway_policies_org_name_active_uidx ON public.gateway_policies USING btree (org_id, lower(name)) WHERE (status = 'active'::gateway_policy_status);

CREATE INDEX gateway_retention_receipts_org_completed_idx ON public.gateway_retention_receipts USING btree (org_id, completed_at DESC);

CREATE INDEX gateway_review_cases_org_status_idx ON public.gateway_review_cases USING btree (org_id, status, priority, created_at);

CREATE INDEX gateway_scans_deadline_idx ON public.gateway_scans USING btree (deadline_at) WHERE (status = ANY (ARRAY['accepted'::gateway_scan_status, 'queued'::gateway_scan_status, 'processing'::gateway_scan_status, 'partially_completed'::gateway_scan_status]));

CREATE UNIQUE INDEX gateway_scans_external_event_uidx ON public.gateway_scans USING btree (org_id, integration_id, external_event_id) WHERE (external_event_id IS NOT NULL);

CREATE INDEX gateway_scans_integration_created_idx ON public.gateway_scans USING btree (integration_id, created_at DESC);

CREATE INDEX gateway_scans_org_created_idx ON public.gateway_scans USING btree (org_id, created_at DESC);

CREATE INDEX gateway_scans_status_created_idx ON public.gateway_scans USING btree (status, created_at);

CREATE UNIQUE INDEX gateway_uploads_artifact_uidx ON public.gateway_uploads USING btree (artifact_id) WHERE (artifact_id IS NOT NULL);

CREATE INDEX gateway_uploads_expiry_idx ON public.gateway_uploads USING btree (expires_at) WHERE (status = ANY (ARRAY['pending'::gateway_upload_status, 'uploaded'::gateway_upload_status, 'expired'::gateway_upload_status]));

CREATE INDEX gateway_uploads_org_created_idx ON public.gateway_uploads USING btree (org_id, created_at DESC);

CREATE UNIQUE INDEX gateway_uploads_staging_path_uidx ON public.gateway_uploads USING btree (storage_bucket, staging_path);

CREATE INDEX gateway_usage_daily_date_idx ON public.gateway_usage_daily USING btree (usage_date, org_id);

CREATE INDEX gateway_webhook_attempts_event_idx ON public.gateway_webhook_attempts USING btree (event_id, attempt DESC);

CREATE INDEX gateway_webhook_endpoints_org_status_idx ON public.gateway_webhook_endpoints USING btree (org_id, status);

CREATE INDEX gateway_webhook_events_delivery_idx ON public.gateway_webhook_events USING btree (status, available_at, created_at) WHERE (status = ANY (ARRAY['pending'::gateway_delivery_status, 'retry'::gateway_delivery_status]));

CREATE INDEX gateway_webhook_events_scan_idx ON public.gateway_webhook_events USING btree (scan_id, created_at);

CREATE UNIQUE INDEX gateway_webhook_secrets_active_uidx ON public.gateway_webhook_secrets USING btree (endpoint_id) WHERE (revoked_at IS NULL);

CREATE INDEX learning_attempts_user_idx ON public.learning_attempts USING btree (user_id, created_at DESC);

CREATE INDEX learning_audit_events_org_time_idx ON public.learning_audit_events USING btree (org_id, created_at DESC);

CREATE INDEX learning_credentials_public_code_idx ON public.learning_credentials USING btree (public_code);

CREATE INDEX learning_enrollments_org_status_idx ON public.learning_enrollments USING btree (org_id, status);

CREATE INDEX learning_enrollments_user_activity_idx ON public.learning_enrollments USING btree (user_id, last_activity_at DESC);

CREATE INDEX learning_events_enrollment_time_idx ON public.learning_events USING btree (enrollment_id, occurred_at DESC);

CREATE UNIQUE INDEX learning_one_published_assessment_version ON public.learning_assessment_versions USING btree (assessment_id) WHERE (status = 'published'::text);

CREATE UNIQUE INDEX learning_one_published_certification_version ON public.learning_certification_versions USING btree (certification_id) WHERE (status = 'published'::text);

CREATE UNIQUE INDEX learning_one_published_course_version ON public.learning_course_versions USING btree (course_id) WHERE (status = 'published'::text);

CREATE INDEX organization_members_user_idx ON public.organization_members USING btree (user_id, status);

CREATE INDEX organization_subscriptions_org_created_idx ON public.organization_subscriptions USING btree (org_id, created_at DESC);

CREATE INDEX organizations_created_by_idx ON public.organizations USING btree (created_by);

CREATE UNIQUE INDEX profiles_username_lower_key ON public.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);

CREATE INDEX scan_model_runs_scan_idx ON public.scan_model_runs USING btree (scan_id, created_at);

CREATE INDEX scan_projects_org_idx ON public.scan_projects USING btree (org_id, archived_at);

CREATE INDEX scans_org_created_idx ON public.scans USING btree (org_id, created_at DESC);

CREATE INDEX scans_status_idx ON public.scans USING btree (status, created_at);

CREATE INDEX scans_user_created_idx ON public.scans USING btree (user_id, created_at DESC);

CREATE INDEX stored_files_org_idx ON public.stored_files USING btree (org_id, created_at DESC);

CREATE INDEX system_events_org_created_idx ON public.system_events USING btree (org_id, created_at DESC);

CREATE INDEX usage_events_org_month_idx ON public.usage_events USING btree (org_id, created_at DESC) INCLUDE (source, scan_type, status, units);

CREATE UNIQUE INDEX usage_events_org_request_key ON public.usage_events USING btree (org_id, request_id) WHERE (request_id IS NOT NULL);

CREATE INDEX webhook_endpoints_org_active_idx ON public.webhook_endpoints USING btree (org_id, is_active);

CREATE INDEX webhook_events_delivery_idx ON public.webhook_events USING btree (delivery_status, created_at);
