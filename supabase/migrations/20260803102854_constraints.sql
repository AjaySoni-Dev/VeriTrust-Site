-- VeriTrust table constraints
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
alter table "public"."api_keys" add constraint "api_keys_pkey" PRIMARY KEY (id);

alter table "public"."api_rate_limits" add constraint "api_rate_limits_pkey" PRIMARY KEY (id);

alter table "public"."api_usage_events" add constraint "api_usage_events_pkey" PRIMARY KEY (id);

alter table "public"."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY (id);

alter table "public"."billing_customers" add constraint "billing_customers_pkey" PRIMARY KEY (id);

alter table "public"."billing_events" add constraint "billing_events_pkey" PRIMARY KEY (id);

alter table "public"."entitlement_snapshots" add constraint "entitlement_snapshots_pkey" PRIMARY KEY (id);

alter table "public"."feedback" add constraint "feedback_pkey" PRIMARY KEY (id);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_pkey" PRIMARY KEY (id);

alter table "public"."gateway_decisions" add constraint "gateway_decisions_pkey" PRIMARY KEY (id);

alter table "public"."gateway_evidence" add constraint "gateway_evidence_pkey" PRIMARY KEY (id);

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_keys_pkey" PRIMARY KEY (id);

alter table "public"."gateway_integrations" add constraint "gateway_integrations_pkey" PRIMARY KEY (id);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_pkey" PRIMARY KEY (id);

alter table "public"."gateway_model_health" add constraint "gateway_model_health_pkey" PRIMARY KEY (id);

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_pkey" PRIMARY KEY (id);

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_pkey" PRIMARY KEY (id);

alter table "public"."gateway_policies" add constraint "gateway_policies_pkey" PRIMARY KEY (id);

alter table "public"."gateway_policy_activations" add constraint "gateway_policy_activations_pkey" PRIMARY KEY (id);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_pkey" PRIMARY KEY (id);

alter table "public"."gateway_retention_receipts" add constraint "gateway_retention_receipts_pkey" PRIMARY KEY (id);

alter table "public"."gateway_review_cases" add constraint "gateway_review_cases_pkey" PRIMARY KEY (id);

alter table "public"."gateway_scans" add constraint "gateway_scans_pkey" PRIMARY KEY (id);

alter table "public"."gateway_schema_migrations" add constraint "gateway_schema_migrations_pkey" PRIMARY KEY (version);

alter table "public"."gateway_uploads" add constraint "gateway_uploads_pkey" PRIMARY KEY (id);

alter table "public"."gateway_usage_daily" add constraint "gateway_usage_daily_pkey" PRIMARY KEY (org_id, usage_date);

alter table "public"."gateway_webhook_attempts" add constraint "gateway_webhook_attempts_pkey" PRIMARY KEY (id);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_pkey" PRIMARY KEY (id);

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_pkey" PRIMARY KEY (id);

alter table "public"."gateway_webhook_secrets" add constraint "gateway_webhook_secrets_pkey" PRIMARY KEY (id);

alter table "public"."learning_assessment_versions" add constraint "learning_assessment_versions_pkey" PRIMARY KEY (id);

alter table "public"."learning_assessments" add constraint "learning_assessments_pkey" PRIMARY KEY (id);

alter table "public"."learning_assignments" add constraint "learning_assignments_pkey" PRIMARY KEY (id);

alter table "public"."learning_attempt_items" add constraint "learning_attempt_items_pkey" PRIMARY KEY (id);

alter table "public"."learning_attempts" add constraint "learning_attempts_pkey" PRIMARY KEY (id);

alter table "public"."learning_audit_events" add constraint "learning_audit_events_pkey" PRIMARY KEY (id);

alter table "public"."learning_bookmarks" add constraint "learning_bookmarks_pkey" PRIMARY KEY (id);

alter table "public"."learning_certification_versions" add constraint "learning_certification_versions_pkey" PRIMARY KEY (id);

alter table "public"."learning_certifications" add constraint "learning_certifications_pkey" PRIMARY KEY (id);

alter table "public"."learning_cohort_members" add constraint "learning_cohort_members_pkey" PRIMARY KEY (cohort_id, user_id);

alter table "public"."learning_cohorts" add constraint "learning_cohorts_pkey" PRIMARY KEY (id);

alter table "public"."learning_competencies" add constraint "learning_competencies_pkey" PRIMARY KEY (id);

alter table "public"."learning_content_reviews" add constraint "learning_content_reviews_pkey" PRIMARY KEY (id);

alter table "public"."learning_course_competencies" add constraint "learning_course_competencies_pkey" PRIMARY KEY (course_version_id, competency_id);

alter table "public"."learning_course_versions" add constraint "learning_course_versions_pkey" PRIMARY KEY (id);

alter table "public"."learning_courses" add constraint "learning_courses_pkey" PRIMARY KEY (id);

alter table "public"."learning_credential_status_events" add constraint "learning_credential_status_events_pkey" PRIMARY KEY (id);

alter table "public"."learning_credentials" add constraint "learning_credentials_pkey" PRIMARY KEY (id);

alter table "public"."learning_enrollments" add constraint "learning_enrollments_pkey" PRIMARY KEY (id);

alter table "public"."learning_events" add constraint "learning_events_pkey" PRIMARY KEY (id);

alter table "public"."learning_idempotency_receipts" add constraint "learning_idempotency_receipts_pkey" PRIMARY KEY (id);

alter table "public"."learning_lab_sessions" add constraint "learning_lab_sessions_pkey" PRIMARY KEY (id);

alter table "public"."learning_lesson_blocks" add constraint "learning_lesson_blocks_pkey" PRIMARY KEY (id);

alter table "public"."learning_lesson_progress" add constraint "learning_lesson_progress_pkey" PRIMARY KEY (id);

alter table "public"."learning_lessons" add constraint "learning_lessons_pkey" PRIMARY KEY (id);

alter table "public"."learning_modules" add constraint "learning_modules_pkey" PRIMARY KEY (id);

alter table "public"."learning_program_courses" add constraint "learning_program_courses_pkey" PRIMARY KEY (program_id, course_id);

alter table "public"."learning_programs" add constraint "learning_programs_pkey" PRIMARY KEY (id);

alter table "public"."learning_question_revisions" add constraint "learning_question_revisions_pkey" PRIMARY KEY (id);

alter table "public"."learning_responses" add constraint "learning_responses_pkey" PRIMARY KEY (id);

alter table "public"."learning_role_assignments" add constraint "learning_role_assignments_pkey" PRIMARY KEY (id);

alter table "public"."model_catalog" add constraint "model_catalog_pkey" PRIMARY KEY (key);

alter table "public"."organization_members" add constraint "organization_members_pkey" PRIMARY KEY (org_id, user_id);

alter table "public"."organization_subscriptions" add constraint "organization_subscriptions_pkey" PRIMARY KEY (id);

alter table "public"."organizations" add constraint "organizations_pkey" PRIMARY KEY (id);

alter table "public"."plans" add constraint "plans_pkey" PRIMARY KEY (id);

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table "public"."scan_inputs" add constraint "scan_inputs_pkey" PRIMARY KEY (id);

alter table "public"."scan_model_runs" add constraint "scan_model_runs_pkey" PRIMARY KEY (id);

alter table "public"."scan_projects" add constraint "scan_projects_pkey" PRIMARY KEY (id);

alter table "public"."scan_results" add constraint "scan_results_pkey" PRIMARY KEY (id);

alter table "public"."scans" add constraint "scans_pkey" PRIMARY KEY (id);

alter table "public"."stored_files" add constraint "stored_files_pkey" PRIMARY KEY (id);

alter table "public"."system_events" add constraint "system_events_pkey" PRIMARY KEY (id);

alter table "public"."usage_events" add constraint "usage_events_pkey" PRIMARY KEY (id);

alter table "public"."usage_monthly" add constraint "usage_monthly_pkey" PRIMARY KEY (org_id, month_start);

alter table "public"."user_usage_daily" add constraint "user_usage_daily_pkey" PRIMARY KEY (org_id, user_id, usage_date);

alter table "public"."webhook_endpoints" add constraint "webhook_endpoints_pkey" PRIMARY KEY (id);

alter table "public"."webhook_events" add constraint "webhook_events_pkey" PRIMARY KEY (id);

alter table "public"."api_keys" add constraint "api_keys_key_hash_key" UNIQUE (key_hash);

alter table "public"."api_rate_limits" add constraint "api_rate_limits_identity_type_identity_hash_endpoint_window_key" UNIQUE (identity_type, identity_hash, endpoint, window_date);

alter table "public"."billing_customers" add constraint "billing_customers_org_id_provider_key" UNIQUE (org_id, provider);

alter table "public"."billing_customers" add constraint "billing_customers_provider_provider_customer_id_key" UNIQUE (provider, provider_customer_id);

alter table "public"."billing_events" add constraint "billing_events_provider_event_id_key" UNIQUE (provider, event_id);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_id_scan_org_unique" UNIQUE (id, scan_id, org_id);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_scan_ordinal_unique" UNIQUE (scan_id, ordinal);

alter table "public"."gateway_decisions" add constraint "gateway_decisions_id_scan_org_unique" UNIQUE (id, scan_id, org_id);

alter table "public"."gateway_decisions" add constraint "gateway_decisions_key_unique" UNIQUE (scan_id, decision_key);

alter table "public"."gateway_decisions" add constraint "gateway_decisions_sequence_unique" UNIQUE (scan_id, sequence);

alter table "public"."gateway_evidence" add constraint "gateway_evidence_model_run_unique" UNIQUE (model_run_id);

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_identity_unique" UNIQUE (org_id, integration_id, idempotency_key);

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_scan_unique" UNIQUE (scan_id);

alter table "public"."gateway_integrations" add constraint "gateway_integrations_api_key_unique" UNIQUE (api_key_id);

alter table "public"."gateway_integrations" add constraint "gateway_integrations_id_org_unique" UNIQUE (id, org_id);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_dedupe_unique" UNIQUE (org_id, job_type, dedupe_key);

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_attempt_unique" UNIQUE (artifact_id, model_version_id, attempt_group, attempt);

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_identity_unique" UNIQUE (id, artifact_id, scan_id, org_id);

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_identity_unique" UNIQUE (id, org_id);

alter table "public"."gateway_policies" add constraint "gateway_policies_id_org_unique" UNIQUE (id, org_id);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_id_org_unique" UNIQUE (id, org_id);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_policy_version_unique" UNIQUE (policy_id, version);

alter table "public"."gateway_retention_receipts" add constraint "gateway_retention_receipts_artifact_unique" UNIQUE (artifact_id);

alter table "public"."gateway_review_cases" add constraint "gateway_review_cases_decision_unique" UNIQUE (decision_id);

alter table "public"."gateway_scans" add constraint "gateway_scans_display_unique" UNIQUE (display_id);

alter table "public"."gateway_scans" add constraint "gateway_scans_id_org_unique" UNIQUE (id, org_id);

alter table "public"."gateway_scans" add constraint "gateway_scans_request_id_unique" UNIQUE (org_id, request_id);

alter table "public"."gateway_uploads" add constraint "gateway_uploads_id_org_unique" UNIQUE (id, org_id);

alter table "public"."gateway_webhook_attempts" add constraint "gateway_webhook_attempts_event_attempt_unique" UNIQUE (event_id, attempt);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_id_org_unique" UNIQUE (id, org_id);

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_dedupe_unique" UNIQUE (endpoint_id, dedupe_key);

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_id_org_unique" UNIQUE (id, org_id);

alter table "public"."learning_assessment_versions" add constraint "learning_assessment_versions_assessment_id_version_key" UNIQUE (assessment_id, version);

alter table "public"."learning_assessments" add constraint "learning_assessments_course_version_id_assessment_type_key" UNIQUE (course_version_id, assessment_type);

alter table "public"."learning_attempt_items" add constraint "learning_attempt_items_attempt_id_position_key" UNIQUE (attempt_id, "position");

alter table "public"."learning_attempt_items" add constraint "learning_attempt_items_attempt_id_question_revision_id_key" UNIQUE (attempt_id, question_revision_id);

alter table "public"."learning_bookmarks" add constraint "learning_bookmarks_user_id_lesson_id_block_id_key" UNIQUE (user_id, lesson_id, block_id);

alter table "public"."learning_certification_versions" add constraint "learning_certification_versions_certification_id_version_key" UNIQUE (certification_id, version);

alter table "public"."learning_certifications" add constraint "learning_certifications_slug_key" UNIQUE (slug);

alter table "public"."learning_competencies" add constraint "learning_competencies_code_key" UNIQUE (code);

alter table "public"."learning_course_versions" add constraint "learning_course_versions_course_id_version_key" UNIQUE (course_id, version);

alter table "public"."learning_courses" add constraint "learning_courses_slug_key" UNIQUE (slug);

alter table "public"."learning_credentials" add constraint "learning_credentials_public_code_key" UNIQUE (public_code);

alter table "public"."learning_credentials" add constraint "learning_credentials_user_id_certification_version_id_key" UNIQUE (user_id, certification_version_id);

alter table "public"."learning_enrollments" add constraint "learning_enrollments_org_id_user_id_course_version_id_key" UNIQUE (org_id, user_id, course_version_id);

alter table "public"."learning_idempotency_receipts" add constraint "learning_idempotency_receipts_user_id_operation_idempotency_key" UNIQUE (user_id, operation, idempotency_key);

alter table "public"."learning_lesson_blocks" add constraint "learning_lesson_blocks_lesson_id_position_key" UNIQUE (lesson_id, "position");

alter table "public"."learning_lesson_progress" add constraint "learning_lesson_progress_enrollment_id_lesson_id_key" UNIQUE (enrollment_id, lesson_id);

alter table "public"."learning_lessons" add constraint "learning_lessons_module_id_position_key" UNIQUE (module_id, "position");

alter table "public"."learning_lessons" add constraint "learning_lessons_module_id_slug_key" UNIQUE (module_id, slug);

alter table "public"."learning_modules" add constraint "learning_modules_course_version_id_position_key" UNIQUE (course_version_id, "position");

alter table "public"."learning_program_courses" add constraint "learning_program_courses_program_id_position_key" UNIQUE (program_id, "position");

alter table "public"."learning_programs" add constraint "learning_programs_slug_key" UNIQUE (slug);

alter table "public"."learning_question_revisions" add constraint "learning_question_revisions_assessment_version_id_external__key" UNIQUE (assessment_version_id, external_key);

alter table "public"."learning_responses" add constraint "learning_responses_attempt_item_id_key" UNIQUE (attempt_item_id);

alter table "public"."learning_role_assignments" add constraint "learning_role_assignments_org_id_user_id_role_key" UNIQUE (org_id, user_id, role);

alter table "public"."organization_subscriptions" add constraint "organization_subscriptions_provider_provider_subscription_i_key" UNIQUE (provider, provider_subscription_id);

alter table "public"."organizations" add constraint "organizations_slug_key" UNIQUE (slug);

alter table "public"."plans" add constraint "plans_code_key" UNIQUE (code);

alter table "public"."scan_inputs" add constraint "scan_inputs_scan_id_key" UNIQUE (scan_id);

alter table "public"."scan_results" add constraint "scan_results_scan_id_key" UNIQUE (scan_id);

alter table "public"."stored_files" add constraint "stored_files_bucket_id_object_path_key" UNIQUE (bucket_id, object_path);

alter table "public"."api_keys" add constraint "api_keys_rotation_not_self" CHECK (rotated_from_id IS NULL OR rotated_from_id <> id);

alter table "public"."api_keys" add constraint "api_keys_time_window_valid" CHECK (expires_at IS NULL OR expires_at > not_before);

alter table "public"."api_rate_limits" add constraint "api_rate_limits_identity_type_check" CHECK (identity_type = ANY (ARRAY['user'::text, 'ip'::text]));

alter table "public"."feedback" add constraint "feedback_rating_check" CHECK (rating = ANY (ARRAY['correct'::text, 'incorrect'::text, 'unclear'::text]));

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_hmac_format" CHECK (content_hmac IS NULL OR content_hmac ~ '^[0-9a-f]{64}$'::text);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_metadata_object" CHECK (jsonb_typeof(metadata) = 'object'::text);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_nonnegative_ordinal" CHECK (ordinal >= 0);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_retention_valid" CHECK ((retention = ANY (ARRAY['none'::retention_policy, 'metadata_only'::retention_policy])) AND retention_until IS NULL OR (retention = ANY (ARRAY['temporary_file'::retention_policy, 'retained_file'::retention_policy])) AND retention_until IS NOT NULL);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_size_valid" CHECK (size_bytes IS NULL OR size_bytes >= 0);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_storage_bucket" CHECK (storage_bucket IS NULL OR storage_bucket = 'gateway-uploads'::text);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_storage_pair" CHECK ((storage_bucket IS NULL) = (storage_path IS NULL));

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_storage_path_length" CHECK (storage_path IS NULL OR length(storage_path) <= 1024);

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_tenant_storage_prefix" CHECK (storage_path IS NULL OR storage_path ~~ (((org_id::text || '/'::text) || scan_id::text) || '/%'::text));

alter table "public"."gateway_decisions" add constraint "gateway_decisions_correlation_length" CHECK (length(correlation_version) >= 1 AND length(correlation_version) <= 120);

alter table "public"."gateway_decisions" add constraint "gateway_decisions_key_length" CHECK (length(decision_key) >= 1 AND length(decision_key) <= 160);

alter table "public"."gateway_decisions" add constraint "gateway_decisions_risk_range" CHECK (risk_score >= 0::numeric AND risk_score <= 1::numeric);

alter table "public"."gateway_decisions" add constraint "gateway_decisions_sequence_positive" CHECK (sequence > 0);

alter table "public"."gateway_evidence" add constraint "gateway_evidence_completed_score" CHECK (status <> 'completed'::gateway_evidence_status OR score IS NOT NULL);

alter table "public"."gateway_evidence" add constraint "gateway_evidence_confidence_range" CHECK (confidence_value IS NULL OR confidence_value >= 0::numeric AND confidence_value <= 1::numeric);

alter table "public"."gateway_evidence" add constraint "gateway_evidence_indicators_array" CHECK (jsonb_typeof(indicators) = 'array'::text);

alter table "public"."gateway_evidence" add constraint "gateway_evidence_raw_object" CHECK (jsonb_typeof(raw_response_redacted) = 'object'::text);

alter table "public"."gateway_evidence" add constraint "gateway_evidence_raw_size" CHECK (pg_column_size(raw_response_redacted) <= 65536);

alter table "public"."gateway_evidence" add constraint "gateway_evidence_score_range" CHECK (score IS NULL OR score >= 0::numeric AND score <= 1::numeric);

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_expiry_valid" CHECK (expires_at > created_at);

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_hash_format" CHECK (request_hash ~ '^[0-9a-f]{64}$'::text);

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_key_length" CHECK (length(idempotency_key) >= 1 AND length(idempotency_key) <= 200);

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_response_object" CHECK (response_body IS NULL OR jsonb_typeof(response_body) = 'object'::text);

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_response_size" CHECK (response_body IS NULL OR pg_column_size(response_body) <= 1048576);

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_response_status" CHECK (response_status IS NULL OR response_status >= 100 AND response_status <= 599);

alter table "public"."gateway_integrations" add constraint "gateway_integrations_actions_nonempty" CHECK (cardinality(allowed_actions) > 0);

alter table "public"."gateway_integrations" add constraint "gateway_integrations_auth_mode" CHECK (auth_mode = ANY (ARRAY['supabase_jwt'::text, 'api_key'::text, 'hmac_event'::text, 'internal'::text]));

alter table "public"."gateway_integrations" add constraint "gateway_integrations_external_length" CHECK (external_id IS NULL OR length(external_id) <= 255);

alter table "public"."gateway_integrations" add constraint "gateway_integrations_metadata_object" CHECK (jsonb_typeof(metadata) = 'object'::text);

alter table "public"."gateway_integrations" add constraint "gateway_integrations_name_length" CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 120);

alter table "public"."gateway_integrations" add constraint "gateway_integrations_replay_window" CHECK (replay_window_seconds >= 30 AND replay_window_seconds <= 3600);

alter table "public"."gateway_integrations" add constraint "gateway_integrations_source_length" CHECK (length(source_type) >= 1 AND length(source_type) <= 64);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_attempts_range" CHECK (attempt_count >= 0 AND max_attempts >= 1 AND max_attempts <= 100);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_dedupe_length" CHECK (length(dedupe_key) >= 1 AND length(dedupe_key) <= 200);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_error_object" CHECK (jsonb_typeof(last_error_detail) = 'object'::text);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_lease_consistency" CHECK (lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL OR lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_payload_object" CHECK (jsonb_typeof(payload) = 'object'::text);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_payload_size" CHECK (pg_column_size(payload) <= 1048576);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_priority_range" CHECK (priority >= 0 AND priority <= 1000);

alter table "public"."gateway_jobs" add constraint "gateway_jobs_queue_mapping" CHECK (job_type = 'media'::gateway_job_type AND queue_name = 'gateway_media'::text OR job_type = 'webhook'::gateway_job_type AND queue_name = 'gateway_webhooks'::text OR job_type = 'retention'::gateway_job_type AND queue_name = 'gateway_retention'::text);

alter table "public"."gateway_model_health" add constraint "gateway_model_health_counters" CHECK (consecutive_failures >= 0 AND consecutive_successes >= 0);

alter table "public"."gateway_model_health" add constraint "gateway_model_health_metrics_object" CHECK (jsonb_typeof(metrics) = 'object'::text);

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_attempt_positive" CHECK (attempt > 0);

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_error_object" CHECK (jsonb_typeof(error_detail) = 'object'::text);

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_error_size" CHECK (pg_column_size(error_detail) <= 65536);

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_latency_valid" CHECK (latency_ms IS NULL OR latency_ms >= 0);

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_metrics_object" CHECK (jsonb_typeof(metrics) = 'object'::text);

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_timestamps_valid" CHECK ((started_at IS NULL OR started_at >= created_at) AND (completed_at IS NULL OR completed_at >= created_at));

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_artifacts_nonempty" CHECK (cardinality(supported_artifacts) > 0);

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_calibration_length" CHECK (length(calibration_version) >= 1 AND length(calibration_version) <= 120);

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_canary_consistency" CHECK (rollout_status = 'canary'::gateway_model_rollout_status AND canary_percent > 0::numeric OR rollout_status <> 'canary'::gateway_model_rollout_status AND canary_percent = 0::numeric);

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_canary_range" CHECK (canary_percent >= 0::numeric AND canary_percent <= 100::numeric);

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_configuration_object" CHECK (jsonb_typeof(configuration) = 'object'::text);

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_timeout_range" CHECK (timeout_ms >= 100 AND timeout_ms <= 300000);

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_version_length" CHECK (length(version) >= 1 AND length(version) <= 255);

alter table "public"."gateway_policies" add constraint "gateway_policies_name_length" CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 120);

alter table "public"."gateway_policy_activations" add constraint "gateway_policy_activations_reason_length" CHECK (reason IS NULL OR length(reason) <= 500);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_checksum_format" CHECK (checksum ~ '^[0-9a-f]{64}$'::text);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_compiled_object" CHECK (jsonb_typeof(compiled_policy) = 'object'::text);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_document_object" CHECK (jsonb_typeof(policy_document) = 'object'::text);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_document_size" CHECK (pg_column_size(policy_document) <= 262144);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_errors_array" CHECK (jsonb_typeof(validation_errors) = 'array'::text);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_positive_version" CHECK (version > 0);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_schema_version_length" CHECK (length(schema_version) >= 1 AND length(schema_version) <= 32);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_validation_status" CHECK (validation_status = ANY (ARRAY['valid'::text, 'invalid'::text]));

alter table "public"."gateway_retention_receipts" add constraint "gateway_retention_receipts_storage_hash_format" CHECK (storage_reference_hash IS NULL OR storage_reference_hash ~ '^[0-9a-f]{64}$'::text);

alter table "public"."gateway_retention_receipts" add constraint "gateway_retention_receipts_verification_object" CHECK (jsonb_typeof(verification_detail) = 'object'::text);

alter table "public"."gateway_retention_receipts" add constraint "gateway_retention_receipts_verified_consistency" CHECK (NOT verified OR object_deleted AND metadata_scrubbed);

alter table "public"."gateway_review_cases" add constraint "gateway_review_cases_priority_range" CHECK (priority >= 0 AND priority <= 1000);

alter table "public"."gateway_review_cases" add constraint "gateway_review_cases_resolution_consistency" CHECK ((status = ANY (ARRAY['open'::gateway_review_status, 'assigned'::gateway_review_status])) AND resolved_at IS NULL AND resolved_by IS NULL OR (status = ANY (ARRAY['resolved'::gateway_review_status, 'dismissed'::gateway_review_status])) AND resolved_at IS NOT NULL);

alter table "public"."gateway_scans" add constraint "gateway_scans_failure_object" CHECK (jsonb_typeof(failure_detail) = 'object'::text);

alter table "public"."gateway_scans" add constraint "gateway_scans_metadata_object" CHECK (jsonb_typeof(metadata) = 'object'::text);

alter table "public"."gateway_scans" add constraint "gateway_scans_metadata_size" CHECK (pg_column_size(metadata) <= 65536);

alter table "public"."gateway_scans" add constraint "gateway_scans_request_hash_format" CHECK (request_hash ~ '^[0-9a-f]{64}$'::text);

alter table "public"."gateway_scans" add constraint "gateway_scans_source_length" CHECK (length(source) >= 1 AND length(source) <= 64);

alter table "public"."gateway_scans" add constraint "gateway_scans_timestamps_valid" CHECK ((started_at IS NULL OR started_at >= created_at) AND (completed_at IS NULL OR completed_at >= created_at) AND (deadline_at IS NULL OR deadline_at > created_at));

alter table "public"."gateway_scans" add constraint "gateway_scans_trace_length" CHECK (length(trace_id) >= 1 AND length(trace_id) <= 128);

alter table "public"."gateway_schema_migrations" add constraint "gateway_schema_migrations_checksum_format" CHECK (checksum ~ '^[0-9a-f]{64}$'::text);

alter table "public"."gateway_schema_migrations" add constraint "gateway_schema_migrations_metadata_object" CHECK (jsonb_typeof(metadata) = 'object'::text);

alter table "public"."gateway_uploads" add constraint "gateway_uploads_attachment_pair" CHECK ((artifact_id IS NULL) = (attached_at IS NULL));

alter table "public"."gateway_uploads" add constraint "gateway_uploads_bucket" CHECK (storage_bucket = 'gateway-uploads'::text);

alter table "public"."gateway_uploads" add constraint "gateway_uploads_expiry" CHECK (expires_at > created_at);

alter table "public"."gateway_uploads" add constraint "gateway_uploads_final_pair" CHECK ((final_path IS NULL) = (scan_id IS NULL));

alter table "public"."gateway_uploads" add constraint "gateway_uploads_final_prefix" CHECK (final_path IS NULL OR final_path ~~ (((org_id::text || '/'::text) || scan_id::text) || '/%'::text));

alter table "public"."gateway_uploads" add constraint "gateway_uploads_hash" CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'::text);

alter table "public"."gateway_uploads" add constraint "gateway_uploads_media_type" CHECK (artifact_type = ANY (ARRAY['image'::gateway_artifact_type, 'audio'::gateway_artifact_type, 'video'::gateway_artifact_type]));

alter table "public"."gateway_uploads" add constraint "gateway_uploads_mime_length" CHECK (length(declared_mime_type) >= 1 AND length(declared_mime_type) <= 160 AND (detected_mime_type IS NULL OR length(detected_mime_type) >= 1 AND length(detected_mime_type) <= 160));

alter table "public"."gateway_uploads" add constraint "gateway_uploads_size" CHECK (declared_size_bytes >= 1 AND declared_size_bytes <= 104857600 AND (actual_size_bytes IS NULL OR actual_size_bytes >= 1 AND actual_size_bytes <= 104857600));

alter table "public"."gateway_uploads" add constraint "gateway_uploads_staging_prefix" CHECK (staging_path ~~ (((org_id::text || '/staging/'::text) || id::text) || '/%'::text));

alter table "public"."gateway_uploads" add constraint "gateway_uploads_state_consistency" CHECK (status = 'pending'::gateway_upload_status AND completed_at IS NULL AND artifact_id IS NULL OR status = 'uploaded'::gateway_upload_status AND completed_at IS NOT NULL AND artifact_id IS NULL OR status = 'attached'::gateway_upload_status AND completed_at IS NOT NULL AND artifact_id IS NOT NULL OR (status = ANY (ARRAY['expired'::gateway_upload_status, 'deleted'::gateway_upload_status])));

alter table "public"."gateway_usage_daily" add constraint "gateway_usage_daily_nonnegative" CHECK (accepted_scans >= 0 AND artifact_count >= 0 AND model_run_count >= 0 AND submitted_bytes >= 0);

alter table "public"."gateway_webhook_attempts" add constraint "gateway_webhook_attempts_attempt_positive" CHECK (attempt > 0);

alter table "public"."gateway_webhook_attempts" add constraint "gateway_webhook_attempts_error_object" CHECK (jsonb_typeof(error_detail) = 'object'::text);

alter table "public"."gateway_webhook_attempts" add constraint "gateway_webhook_attempts_latency" CHECK (latency_ms IS NULL OR latency_ms >= 0);

alter table "public"."gateway_webhook_attempts" add constraint "gateway_webhook_attempts_outcome" CHECK (outcome = ANY (ARRAY['delivered'::text, 'retry'::text, 'failed'::text]));

alter table "public"."gateway_webhook_attempts" add constraint "gateway_webhook_attempts_response_code" CHECK (response_code IS NULL OR response_code >= 100 AND response_code <= 599);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_attempt_range" CHECK (max_attempts >= 1 AND max_attempts <= 20);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_events_nonempty" CHECK (cardinality(event_types) > 0);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_https" CHECK (url ~* '^https://'::text);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_metadata_object" CHECK (jsonb_typeof(metadata) = 'object'::text);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_name_length" CHECK (length(btrim(name)) >= 1 AND length(btrim(name)) <= 120);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_replay_range" CHECK (replay_window_seconds >= 30 AND replay_window_seconds <= 3600);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_secret_ref_length" CHECK (length(signing_secret_ref) >= 1 AND length(signing_secret_ref) <= 255);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_timeout_range" CHECK (timeout_ms >= 500 AND timeout_ms <= 30000);

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_attempt_nonnegative" CHECK (attempt_count >= 0);

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_checksum_format" CHECK (payload_checksum ~ '^[0-9a-f]{64}$'::text);

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_payload_object" CHECK (jsonb_typeof(payload) = 'object'::text);

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_payload_size" CHECK (pg_column_size(payload) <= 1048576);

alter table "public"."gateway_webhook_secrets" add constraint "gateway_webhook_secrets_encoding" CHECK (ciphertext ~ '^[A-Za-z0-9_-]+$'::text AND iv ~ '^[A-Za-z0-9_-]+$'::text AND auth_tag ~ '^[A-Za-z0-9_-]+$'::text);

alter table "public"."gateway_webhook_secrets" add constraint "gateway_webhook_secrets_key_version_length" CHECK (length(key_version) >= 1 AND length(key_version) <= 32);

alter table "public"."learning_assessment_versions" add constraint "learning_assessment_versions_duration_minutes_check" CHECK (duration_minutes >= 1 AND duration_minutes <= 1440);

alter table "public"."learning_assessment_versions" add constraint "learning_assessment_versions_maximum_attempts_check" CHECK (maximum_attempts > 0);

alter table "public"."learning_assessment_versions" add constraint "learning_assessment_versions_passing_percent_check" CHECK (passing_percent >= 0::numeric AND passing_percent <= 100::numeric);

alter table "public"."learning_assessment_versions" add constraint "learning_assessment_versions_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'published'::text, 'archived'::text]));

alter table "public"."learning_assessment_versions" add constraint "learning_assessment_versions_version_check" CHECK (version > 0);

alter table "public"."learning_assessments" add constraint "learning_assessments_assessment_type_check" CHECK (assessment_type = ANY (ARRAY['practice'::text, 'final'::text, 'lab'::text]));

alter table "public"."learning_assignments" add constraint "learning_assignments_check" CHECK ((cohort_id IS NOT NULL) <> (assignee_user_id IS NOT NULL));

alter table "public"."learning_assignments" add constraint "learning_assignments_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text, 'cancelled'::text]));

alter table "public"."learning_assignments" add constraint "learning_assignments_title_check" CHECK (char_length(title) >= 2 AND char_length(title) <= 180);

alter table "public"."learning_attempt_items" add constraint "learning_attempt_items_position_check" CHECK ("position" > 0);

alter table "public"."learning_attempts" add constraint "learning_attempts_score_percent_check" CHECK (score_percent >= 0::numeric AND score_percent <= 100::numeric);

alter table "public"."learning_attempts" add constraint "learning_attempts_status_check" CHECK (status = ANY (ARRAY['in_progress'::text, 'submitted'::text, 'scored'::text, 'expired'::text, 'cancelled'::text]));

alter table "public"."learning_audit_events" add constraint "learning_audit_events_metadata_check" CHECK (jsonb_typeof(metadata) = 'object'::text);

alter table "public"."learning_audit_events" add constraint "learning_audit_events_metadata_check1" CHECK (pg_column_size(metadata) <= 32768);

alter table "public"."learning_bookmarks" add constraint "learning_bookmarks_note_check" CHECK (char_length(note) <= 2000);

alter table "public"."learning_certification_versions" add constraint "learning_certification_versions_requirements_check" CHECK (jsonb_typeof(requirements) = 'object'::text);

alter table "public"."learning_certification_versions" add constraint "learning_certification_versions_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]));

alter table "public"."learning_certification_versions" add constraint "learning_certification_versions_validity_days_check" CHECK (validity_days IS NULL OR validity_days > 0);

alter table "public"."learning_certification_versions" add constraint "learning_certification_versions_version_check" CHECK (version > 0);

alter table "public"."learning_certifications" add constraint "learning_certifications_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));

alter table "public"."learning_cohorts" add constraint "learning_cohorts_name_check" CHECK (char_length(name) >= 2 AND char_length(name) <= 180);

alter table "public"."learning_cohorts" add constraint "learning_cohorts_status_check" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

alter table "public"."learning_content_reviews" add constraint "learning_content_reviews_content_type_check" CHECK (content_type = ANY (ARRAY['course_version'::text, 'assessment_version'::text, 'certification_version'::text]));

alter table "public"."learning_content_reviews" add constraint "learning_content_reviews_notes_check" CHECK (char_length(notes) <= 10000);

alter table "public"."learning_content_reviews" add constraint "learning_content_reviews_status_check" CHECK (status = ANY (ARRAY['requested'::text, 'approved'::text, 'changes_requested'::text, 'cancelled'::text]));

alter table "public"."learning_course_competencies" add constraint "learning_course_competencies_weight_check" CHECK (weight > 0::numeric);

alter table "public"."learning_course_versions" add constraint "learning_course_versions_description_check" CHECK (char_length(description) >= 20 AND char_length(description) <= 10000);

alter table "public"."learning_course_versions" add constraint "learning_course_versions_estimated_minutes_check" CHECK (estimated_minutes >= 0 AND estimated_minutes <= 100000);

alter table "public"."learning_course_versions" add constraint "learning_course_versions_learning_outcomes_check" CHECK (jsonb_typeof(learning_outcomes) = 'array'::text);

alter table "public"."learning_course_versions" add constraint "learning_course_versions_level_check" CHECK (level = ANY (ARRAY['foundation'::text, 'intermediate'::text, 'advanced'::text]));

alter table "public"."learning_course_versions" add constraint "learning_course_versions_prerequisites_check" CHECK (jsonb_typeof(prerequisites) = 'array'::text);

alter table "public"."learning_course_versions" add constraint "learning_course_versions_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'published'::text, 'archived'::text]));

alter table "public"."learning_course_versions" add constraint "learning_course_versions_summary_check" CHECK (char_length(summary) >= 10 AND char_length(summary) <= 1000);

alter table "public"."learning_course_versions" add constraint "learning_course_versions_title_check" CHECK (char_length(title) >= 2 AND char_length(title) <= 180);

alter table "public"."learning_course_versions" add constraint "learning_course_versions_version_check" CHECK (version > 0);

alter table "public"."learning_courses" add constraint "learning_courses_slug_check" CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text);

alter table "public"."learning_courses" add constraint "learning_courses_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));

alter table "public"."learning_credential_status_events" add constraint "learning_credential_status_events_new_status_check" CHECK (new_status = ANY (ARRAY['valid'::text, 'expired'::text, 'revoked'::text, 'suspended'::text]));

alter table "public"."learning_credential_status_events" add constraint "learning_credential_status_events_reason_check" CHECK (char_length(reason) <= 2000);

alter table "public"."learning_credentials" add constraint "learning_credentials_display_name_check" CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 180);

alter table "public"."learning_credentials" add constraint "learning_credentials_public_code_check" CHECK (public_code ~ '^VT-([A-F0-9]{8}-){3}[A-F0-9]{8}$'::text);

alter table "public"."learning_credentials" add constraint "learning_credentials_status_check" CHECK (status = ANY (ARRAY['valid'::text, 'expired'::text, 'revoked'::text, 'suspended'::text]));

alter table "public"."learning_enrollments" add constraint "learning_enrollments_progress_percent_check" CHECK (progress_percent >= 0::numeric AND progress_percent <= 100::numeric);

alter table "public"."learning_enrollments" add constraint "learning_enrollments_source_check" CHECK (source = ANY (ARRAY['self'::text, 'assignment'::text, 'admin'::text, 'import'::text]));

alter table "public"."learning_enrollments" add constraint "learning_enrollments_status_check" CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'withdrawn'::text, 'expired'::text]));

alter table "public"."learning_events" add constraint "learning_events_event_type_check" CHECK (event_type = ANY (ARRAY['lesson_started'::text, 'lesson_completed'::text, 'block_completed'::text, 'bookmark_added'::text, 'bookmark_removed'::text, 'lab_completed'::text]));

alter table "public"."learning_events" add constraint "learning_events_payload_check" CHECK (jsonb_typeof(payload) = 'object'::text);

alter table "public"."learning_events" add constraint "learning_events_payload_check1" CHECK (pg_column_size(payload) <= 8192);

alter table "public"."learning_idempotency_receipts" add constraint "learning_idempotency_receipts_idempotency_key_check" CHECK (char_length(idempotency_key) >= 16 AND char_length(idempotency_key) <= 160);

alter table "public"."learning_lab_sessions" add constraint "learning_lab_sessions_result_summary_check" CHECK (jsonb_typeof(result_summary) = 'object'::text);

alter table "public"."learning_lab_sessions" add constraint "learning_lab_sessions_status_check" CHECK (status = ANY (ARRAY['started'::text, 'completed'::text, 'abandoned'::text]));

alter table "public"."learning_lab_sessions" add constraint "learning_lab_sessions_training_mode_check" CHECK (training_mode = true);

alter table "public"."learning_lesson_blocks" add constraint "learning_lesson_blocks_block_type_check" CHECK (block_type = ANY (ARRAY['paragraph'::text, 'callout'::text, 'checklist'::text, 'scenario'::text, 'lab'::text, 'knowledge_check'::text, 'media'::text]));

alter table "public"."learning_lesson_blocks" add constraint "learning_lesson_blocks_content_check" CHECK (jsonb_typeof(content) = 'object'::text);

alter table "public"."learning_lesson_blocks" add constraint "learning_lesson_blocks_content_check1" CHECK (pg_column_size(content) <= 65536);

alter table "public"."learning_lesson_blocks" add constraint "learning_lesson_blocks_position_check" CHECK ("position" > 0);

alter table "public"."learning_lesson_progress" add constraint "learning_lesson_progress_progress_percent_check" CHECK (progress_percent >= 0::numeric AND progress_percent <= 100::numeric);

alter table "public"."learning_lesson_progress" add constraint "learning_lesson_progress_status_check" CHECK (status = ANY (ARRAY['not_started'::text, 'started'::text, 'completed'::text]));

alter table "public"."learning_lessons" add constraint "learning_lessons_estimated_minutes_check" CHECK (estimated_minutes >= 0);

alter table "public"."learning_lessons" add constraint "learning_lessons_lesson_type_check" CHECK (lesson_type = ANY (ARRAY['lesson'::text, 'scenario'::text, 'lab'::text, 'knowledge_check'::text, 'review'::text]));

alter table "public"."learning_lessons" add constraint "learning_lessons_position_check" CHECK ("position" > 0);

alter table "public"."learning_lessons" add constraint "learning_lessons_slug_check" CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text);

alter table "public"."learning_lessons" add constraint "learning_lessons_title_check" CHECK (char_length(title) >= 2 AND char_length(title) <= 180);

alter table "public"."learning_modules" add constraint "learning_modules_estimated_minutes_check" CHECK (estimated_minutes >= 0);

alter table "public"."learning_modules" add constraint "learning_modules_position_check" CHECK ("position" > 0);

alter table "public"."learning_modules" add constraint "learning_modules_title_check" CHECK (char_length(title) >= 2 AND char_length(title) <= 180);

alter table "public"."learning_program_courses" add constraint "learning_program_courses_position_check" CHECK ("position" > 0);

alter table "public"."learning_programs" add constraint "learning_programs_slug_check" CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text);

alter table "public"."learning_programs" add constraint "learning_programs_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));

alter table "public"."learning_programs" add constraint "learning_programs_summary_check" CHECK (char_length(summary) >= 10 AND char_length(summary) <= 1000);

alter table "public"."learning_programs" add constraint "learning_programs_title_check" CHECK (char_length(title) >= 2 AND char_length(title) <= 180);

alter table "public"."learning_question_revisions" add constraint "learning_question_revisions_answer_schema_check" CHECK (jsonb_typeof(answer_schema) = 'object'::text);

alter table "public"."learning_question_revisions" add constraint "learning_question_revisions_correct_answer_check" CHECK (jsonb_typeof(correct_answer) = 'object'::text);

alter table "public"."learning_question_revisions" add constraint "learning_question_revisions_points_check" CHECK (points > 0::numeric);

alter table "public"."learning_question_revisions" add constraint "learning_question_revisions_prompt_check" CHECK (char_length(prompt) >= 2 AND char_length(prompt) <= 5000);

alter table "public"."learning_question_revisions" add constraint "learning_question_revisions_question_type_check" CHECK (question_type = ANY (ARRAY['single_choice'::text, 'multiple_choice'::text, 'short_text'::text]));

alter table "public"."learning_responses" add constraint "learning_responses_answer_check" CHECK (jsonb_typeof(answer) = 'object'::text);

alter table "public"."learning_responses" add constraint "learning_responses_answer_check1" CHECK (pg_column_size(answer) <= 16384);

alter table "public"."learning_role_assignments" add constraint "learning_role_assignments_role_check" CHECK (role = ANY (ARRAY['author'::text, 'reviewer'::text, 'publisher'::text, 'instructor'::text, 'credential_admin'::text]));

alter table "public"."organizations" add constraint "organizations_gateway_enforcement_requires_gateway" CHECK (NOT gateway_enforcement_enabled OR gateway_enabled);

alter table "public"."plans" add constraint "plans_daily_gateway_limit_range" CHECK (daily_gateway_scan_limit >= 1 AND daily_gateway_scan_limit <= 10000000);

alter table "public"."plans" add constraint "plans_gateway_retention_range" CHECK (gateway_max_raw_retention_hours >= 0 AND gateway_max_raw_retention_hours <= 720);

alter table "public"."plans" add constraint "plans_learning_assignment_limit_check" CHECK (learning_assignment_limit >= 0);

alter table "public"."plans" add constraint "plans_learning_seat_limit_check" CHECK (learning_seat_limit >= 0);

alter table "public"."plans" add constraint "plans_max_gateway_artifacts_range" CHECK (max_gateway_artifacts >= 1 AND max_gateway_artifacts <= 100);

alter table "public"."plans" add constraint "plans_max_gateway_parallel_models_range" CHECK (max_gateway_parallel_models >= 1 AND max_gateway_parallel_models <= 20);

alter table "public"."plans" add constraint "plans_monthly_gateway_limit_range" CHECK (monthly_gateway_scan_limit >= daily_gateway_scan_limit AND monthly_gateway_scan_limit <= 300000000);

alter table "public"."profiles" add constraint "profiles_username_format_check" CHECK (username IS NULL OR username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'::text);

alter table "public"."system_events" add constraint "system_events_severity_check" CHECK (severity = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text]));

alter table "public"."usage_events" add constraint "usage_events_source_check" CHECK (source = ANY (ARRAY['web'::text, 'api'::text]));

alter table "public"."usage_monthly" add constraint "usage_monthly_nonnegative_check" CHECK (web_deepfake_count >= 0 AND web_phishing_count >= 0 AND web_link_count >= 0 AND api_deepfake_count >= 0 AND api_phishing_count >= 0 AND api_link_count >= 0 AND api_usage_count >= 0 AND storage_bytes >= 0 AND overage_count >= 0);

alter table "public"."user_usage_daily" add constraint "user_usage_daily_nonnegative_check" CHECK (deepfake_count >= 0 AND phishing_count >= 0 AND link_count >= 0 AND api_count >= 0);

alter table "public"."api_keys" add constraint "api_keys_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."api_keys" add constraint "api_keys_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."api_keys" add constraint "api_keys_rotated_from_fk" FOREIGN KEY (rotated_from_id) REFERENCES api_keys(id) ON DELETE SET NULL;

alter table "public"."api_keys" add constraint "api_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."api_usage_events" add constraint "api_usage_events_api_key_id_fkey" FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE;

alter table "public"."api_usage_events" add constraint "api_usage_events_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."api_usage_events" add constraint "api_usage_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."audit_logs" add constraint "audit_logs_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."audit_logs" add constraint "audit_logs_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."billing_customers" add constraint "billing_customers_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."entitlement_snapshots" add constraint "entitlement_snapshots_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."entitlement_snapshots" add constraint "entitlement_snapshots_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES plans(id);

alter table "public"."feedback" add constraint "feedback_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."feedback" add constraint "feedback_scan_id_fkey" FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE;

alter table "public"."feedback" add constraint "feedback_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_parent_scan_org_fk" FOREIGN KEY (parent_artifact_id, scan_id, org_id) REFERENCES gateway_artifacts(id, scan_id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_artifacts" add constraint "gateway_artifacts_scan_org_fk" FOREIGN KEY (scan_id, org_id) REFERENCES gateway_scans(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_decisions" add constraint "gateway_decisions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_decisions" add constraint "gateway_decisions_policy_org_fk" FOREIGN KEY (policy_version_id, org_id) REFERENCES gateway_policy_versions(id, org_id) ON DELETE RESTRICT;

alter table "public"."gateway_decisions" add constraint "gateway_decisions_scan_org_fk" FOREIGN KEY (scan_id, org_id) REFERENCES gateway_scans(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_decisions" add constraint "gateway_decisions_supersedes_scan_org_fk" FOREIGN KEY (supersedes_id, scan_id, org_id) REFERENCES gateway_decisions(id, scan_id, org_id);

alter table "public"."gateway_evidence" add constraint "gateway_evidence_run_artifact_scan_org_fk" FOREIGN KEY (model_run_id, artifact_id, scan_id, org_id) REFERENCES gateway_model_runs(id, artifact_id, scan_id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_integration_org_fk" FOREIGN KEY (integration_id, org_id) REFERENCES gateway_integrations(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_keys_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_idempotency_keys" add constraint "gateway_idempotency_scan_org_fk" FOREIGN KEY (scan_id, org_id) REFERENCES gateway_scans(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_integrations" add constraint "gateway_integrations_api_key_id_fkey" FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL;

alter table "public"."gateway_integrations" add constraint "gateway_integrations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_integrations" add constraint "gateway_integrations_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_jobs" add constraint "gateway_jobs_artifact_scan_org_fk" FOREIGN KEY (artifact_id, scan_id, org_id) REFERENCES gateway_artifacts(id, scan_id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_jobs" add constraint "gateway_jobs_scan_org_fk" FOREIGN KEY (scan_id, org_id) REFERENCES gateway_scans(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_model_health" add constraint "gateway_model_health_model_version_id_fkey" FOREIGN KEY (model_version_id) REFERENCES gateway_model_versions(id) ON DELETE CASCADE;

alter table "public"."gateway_model_health" add constraint "gateway_model_health_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_artifact_scan_org_fk" FOREIGN KEY (artifact_id, scan_id, org_id) REFERENCES gateway_artifacts(id, scan_id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_model_key_fkey" FOREIGN KEY (model_key) REFERENCES model_catalog(key) ON DELETE RESTRICT;

alter table "public"."gateway_model_runs" add constraint "gateway_model_runs_model_version_id_fkey" FOREIGN KEY (model_version_id) REFERENCES gateway_model_versions(id) ON DELETE RESTRICT;

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_model_key_fkey" FOREIGN KEY (model_key) REFERENCES model_catalog(key) ON DELETE RESTRICT;

alter table "public"."gateway_model_versions" add constraint "gateway_model_versions_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_policies" add constraint "gateway_policies_active_version_fk" FOREIGN KEY (active_version_id, org_id) REFERENCES gateway_policy_versions(id, org_id) DEFERRABLE INITIALLY DEFERRED;

alter table "public"."gateway_policies" add constraint "gateway_policies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_policies" add constraint "gateway_policies_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_policy_activations" add constraint "gateway_policy_activations_activated_by_fkey" FOREIGN KEY (activated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_policy_activations" add constraint "gateway_policy_activations_policy_org_fk" FOREIGN KEY (policy_id, org_id) REFERENCES gateway_policies(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_policy_activations" add constraint "gateway_policy_activations_previous_org_fk" FOREIGN KEY (previous_version_id, org_id) REFERENCES gateway_policy_versions(id, org_id);

alter table "public"."gateway_policy_activations" add constraint "gateway_policy_activations_version_org_fk" FOREIGN KEY (version_id, org_id) REFERENCES gateway_policy_versions(id, org_id);

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_policy_versions" add constraint "gateway_policy_versions_policy_org_fk" FOREIGN KEY (policy_id, org_id) REFERENCES gateway_policies(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_retention_receipts" add constraint "gateway_retention_receipts_artifact_scan_org_fk" FOREIGN KEY (artifact_id, scan_id, org_id) REFERENCES gateway_artifacts(id, scan_id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_review_cases" add constraint "gateway_review_cases_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_review_cases" add constraint "gateway_review_cases_decision_scan_org_fk" FOREIGN KEY (decision_id, scan_id, org_id) REFERENCES gateway_decisions(id, scan_id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_review_cases" add constraint "gateway_review_cases_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_review_cases" add constraint "gateway_review_cases_scan_org_fk" FOREIGN KEY (scan_id, org_id) REFERENCES gateway_scans(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_scans" add constraint "gateway_scans_api_key_id_fkey" FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL;

alter table "public"."gateway_scans" add constraint "gateway_scans_final_decision_fk" FOREIGN KEY (final_decision_id, id, org_id) REFERENCES gateway_decisions(id, scan_id, org_id) DEFERRABLE INITIALLY DEFERRED;

alter table "public"."gateway_scans" add constraint "gateway_scans_integration_org_fk" FOREIGN KEY (integration_id, org_id) REFERENCES gateway_integrations(id, org_id) ON DELETE RESTRICT;

alter table "public"."gateway_scans" add constraint "gateway_scans_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_scans" add constraint "gateway_scans_policy_org_fk" FOREIGN KEY (policy_version_id, org_id) REFERENCES gateway_policy_versions(id, org_id) ON DELETE RESTRICT;

alter table "public"."gateway_scans" add constraint "gateway_scans_preliminary_decision_fk" FOREIGN KEY (preliminary_decision_id, id, org_id) REFERENCES gateway_decisions(id, scan_id, org_id) DEFERRABLE INITIALLY DEFERRED;

alter table "public"."gateway_scans" add constraint "gateway_scans_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_uploads" add constraint "gateway_uploads_artifact_scan_org_fk" FOREIGN KEY (artifact_id, scan_id, org_id) REFERENCES gateway_artifacts(id, scan_id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_uploads" add constraint "gateway_uploads_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_uploads" add constraint "gateway_uploads_integration_org_fk" FOREIGN KEY (integration_id, org_id) REFERENCES gateway_integrations(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_uploads" add constraint "gateway_uploads_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_usage_daily" add constraint "gateway_usage_daily_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_webhook_attempts" add constraint "gateway_webhook_attempts_event_org_fk" FOREIGN KEY (event_id, org_id) REFERENCES gateway_webhook_events(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_webhook_attempts" add constraint "gateway_webhook_attempts_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_integration_org_fk" FOREIGN KEY (integration_id, org_id) REFERENCES gateway_integrations(id, org_id) ON DELETE SET NULL (integration_id);

alter table "public"."gateway_webhook_endpoints" add constraint "gateway_webhook_endpoints_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_decision_scan_org_fk" FOREIGN KEY (decision_id, scan_id, org_id) REFERENCES gateway_decisions(id, scan_id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_endpoint_org_fk" FOREIGN KEY (endpoint_id, org_id) REFERENCES gateway_webhook_endpoints(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_webhook_events" add constraint "gateway_webhook_events_scan_org_fk" FOREIGN KEY (scan_id, org_id) REFERENCES gateway_scans(id, org_id) ON DELETE CASCADE;

alter table "public"."gateway_webhook_secrets" add constraint "gateway_webhook_secrets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."gateway_webhook_secrets" add constraint "gateway_webhook_secrets_endpoint_org_fk" FOREIGN KEY (endpoint_id, org_id) REFERENCES gateway_webhook_endpoints(id, org_id) ON DELETE CASCADE;

alter table "public"."learning_assessment_versions" add constraint "learning_assessment_versions_assessment_id_fkey" FOREIGN KEY (assessment_id) REFERENCES learning_assessments(id) ON DELETE CASCADE;

alter table "public"."learning_assessments" add constraint "learning_assessments_course_version_id_fkey" FOREIGN KEY (course_version_id) REFERENCES learning_course_versions(id) ON DELETE CASCADE;

alter table "public"."learning_assignments" add constraint "learning_assignments_assignee_user_id_fkey" FOREIGN KEY (assignee_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_assignments" add constraint "learning_assignments_cohort_id_fkey" FOREIGN KEY (cohort_id) REFERENCES learning_cohorts(id) ON DELETE SET NULL;

alter table "public"."learning_assignments" add constraint "learning_assignments_course_version_id_fkey" FOREIGN KEY (course_version_id) REFERENCES learning_course_versions(id) ON DELETE RESTRICT;

alter table "public"."learning_assignments" add constraint "learning_assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table "public"."learning_assignments" add constraint "learning_assignments_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."learning_attempt_items" add constraint "learning_attempt_items_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES learning_attempts(id) ON DELETE CASCADE;

alter table "public"."learning_attempt_items" add constraint "learning_attempt_items_question_revision_id_fkey" FOREIGN KEY (question_revision_id) REFERENCES learning_question_revisions(id) ON DELETE RESTRICT;

alter table "public"."learning_attempts" add constraint "learning_attempts_assessment_version_id_fkey" FOREIGN KEY (assessment_version_id) REFERENCES learning_assessment_versions(id) ON DELETE RESTRICT;

alter table "public"."learning_attempts" add constraint "learning_attempts_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."learning_attempts" add constraint "learning_attempts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_audit_events" add constraint "learning_audit_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."learning_audit_events" add constraint "learning_audit_events_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table "public"."learning_bookmarks" add constraint "learning_bookmarks_block_id_fkey" FOREIGN KEY (block_id) REFERENCES learning_lesson_blocks(id) ON DELETE CASCADE;

alter table "public"."learning_bookmarks" add constraint "learning_bookmarks_enrollment_id_fkey" FOREIGN KEY (enrollment_id) REFERENCES learning_enrollments(id) ON DELETE CASCADE;

alter table "public"."learning_bookmarks" add constraint "learning_bookmarks_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES learning_lessons(id) ON DELETE CASCADE;

alter table "public"."learning_bookmarks" add constraint "learning_bookmarks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_certification_versions" add constraint "learning_certification_versions_certification_id_fkey" FOREIGN KEY (certification_id) REFERENCES learning_certifications(id) ON DELETE CASCADE;

alter table "public"."learning_certifications" add constraint "learning_certifications_course_id_fkey" FOREIGN KEY (course_id) REFERENCES learning_courses(id) ON DELETE RESTRICT;

alter table "public"."learning_cohort_members" add constraint "learning_cohort_members_added_by_fkey" FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."learning_cohort_members" add constraint "learning_cohort_members_cohort_id_fkey" FOREIGN KEY (cohort_id) REFERENCES learning_cohorts(id) ON DELETE CASCADE;

alter table "public"."learning_cohort_members" add constraint "learning_cohort_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_cohorts" add constraint "learning_cohorts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table "public"."learning_cohorts" add constraint "learning_cohorts_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."learning_content_reviews" add constraint "learning_content_reviews_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table "public"."learning_course_competencies" add constraint "learning_course_competencies_competency_id_fkey" FOREIGN KEY (competency_id) REFERENCES learning_competencies(id) ON DELETE CASCADE;

alter table "public"."learning_course_competencies" add constraint "learning_course_competencies_course_version_id_fkey" FOREIGN KEY (course_version_id) REFERENCES learning_course_versions(id) ON DELETE CASCADE;

alter table "public"."learning_course_versions" add constraint "learning_course_versions_course_id_fkey" FOREIGN KEY (course_id) REFERENCES learning_courses(id) ON DELETE RESTRICT;

alter table "public"."learning_credential_status_events" add constraint "learning_credential_status_events_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."learning_credential_status_events" add constraint "learning_credential_status_events_credential_id_fkey" FOREIGN KEY (credential_id) REFERENCES learning_credentials(id) ON DELETE CASCADE;

alter table "public"."learning_credentials" add constraint "learning_credentials_certification_version_id_fkey" FOREIGN KEY (certification_version_id) REFERENCES learning_certification_versions(id) ON DELETE RESTRICT;

alter table "public"."learning_credentials" add constraint "learning_credentials_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."learning_credentials" add constraint "learning_credentials_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_enrollments" add constraint "learning_enrollments_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES learning_assignments(id) ON DELETE SET NULL;

alter table "public"."learning_enrollments" add constraint "learning_enrollments_course_version_id_fkey" FOREIGN KEY (course_version_id) REFERENCES learning_course_versions(id) ON DELETE RESTRICT;

alter table "public"."learning_enrollments" add constraint "learning_enrollments_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."learning_enrollments" add constraint "learning_enrollments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_events" add constraint "learning_events_enrollment_id_fkey" FOREIGN KEY (enrollment_id) REFERENCES learning_enrollments(id) ON DELETE CASCADE;

alter table "public"."learning_events" add constraint "learning_events_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES learning_lessons(id) ON DELETE SET NULL;

alter table "public"."learning_events" add constraint "learning_events_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."learning_events" add constraint "learning_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_idempotency_receipts" add constraint "learning_idempotency_receipts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_lab_sessions" add constraint "learning_lab_sessions_enrollment_id_fkey" FOREIGN KEY (enrollment_id) REFERENCES learning_enrollments(id) ON DELETE CASCADE;

alter table "public"."learning_lab_sessions" add constraint "learning_lab_sessions_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES learning_lessons(id) ON DELETE CASCADE;

alter table "public"."learning_lab_sessions" add constraint "learning_lab_sessions_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."learning_lab_sessions" add constraint "learning_lab_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_lesson_blocks" add constraint "learning_lesson_blocks_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES learning_lessons(id) ON DELETE CASCADE;

alter table "public"."learning_lesson_progress" add constraint "learning_lesson_progress_enrollment_id_fkey" FOREIGN KEY (enrollment_id) REFERENCES learning_enrollments(id) ON DELETE CASCADE;

alter table "public"."learning_lesson_progress" add constraint "learning_lesson_progress_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES learning_lessons(id) ON DELETE CASCADE;

alter table "public"."learning_lesson_progress" add constraint "learning_lesson_progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_lessons" add constraint "learning_lessons_module_id_fkey" FOREIGN KEY (module_id) REFERENCES learning_modules(id) ON DELETE CASCADE;

alter table "public"."learning_modules" add constraint "learning_modules_course_version_id_fkey" FOREIGN KEY (course_version_id) REFERENCES learning_course_versions(id) ON DELETE CASCADE;

alter table "public"."learning_program_courses" add constraint "learning_program_courses_course_id_fkey" FOREIGN KEY (course_id) REFERENCES learning_courses(id) ON DELETE CASCADE;

alter table "public"."learning_program_courses" add constraint "learning_program_courses_program_id_fkey" FOREIGN KEY (program_id) REFERENCES learning_programs(id) ON DELETE CASCADE;

alter table "public"."learning_question_revisions" add constraint "learning_question_revisions_assessment_version_id_fkey" FOREIGN KEY (assessment_version_id) REFERENCES learning_assessment_versions(id) ON DELETE CASCADE;

alter table "public"."learning_question_revisions" add constraint "learning_question_revisions_competency_id_fkey" FOREIGN KEY (competency_id) REFERENCES learning_competencies(id) ON DELETE SET NULL;

alter table "public"."learning_responses" add constraint "learning_responses_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES learning_attempts(id) ON DELETE CASCADE;

alter table "public"."learning_responses" add constraint "learning_responses_attempt_item_id_fkey" FOREIGN KEY (attempt_item_id) REFERENCES learning_attempt_items(id) ON DELETE CASCADE;

alter table "public"."learning_responses" add constraint "learning_responses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."learning_role_assignments" add constraint "learning_role_assignments_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."learning_role_assignments" add constraint "learning_role_assignments_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."learning_role_assignments" add constraint "learning_role_assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."model_catalog" add constraint "model_catalog_fallback_key_fkey" FOREIGN KEY (fallback_key) REFERENCES model_catalog(key);

alter table "public"."organization_members" add constraint "organization_members_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."organization_members" add constraint "organization_members_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."organization_members" add constraint "organization_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."organization_subscriptions" add constraint "organization_subscriptions_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."organization_subscriptions" add constraint "organization_subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES plans(id);

alter table "public"."organizations" add constraint "organizations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table "public"."organizations" add constraint "organizations_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES plans(id);

alter table "public"."profiles" add constraint "profiles_default_org_id_fkey" FOREIGN KEY (default_org_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."scan_inputs" add constraint "scan_inputs_file_id_fkey" FOREIGN KEY (file_id) REFERENCES stored_files(id) ON DELETE SET NULL;

alter table "public"."scan_inputs" add constraint "scan_inputs_scan_id_fkey" FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE;

alter table "public"."scan_model_runs" add constraint "scan_model_runs_model_key_fkey" FOREIGN KEY (model_key) REFERENCES model_catalog(key);

alter table "public"."scan_model_runs" add constraint "scan_model_runs_scan_id_fkey" FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE;

alter table "public"."scan_projects" add constraint "scan_projects_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."scan_projects" add constraint "scan_projects_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."scan_results" add constraint "scan_results_scan_id_fkey" FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE;

alter table "public"."scans" add constraint "scans_fallback_model_key_fkey" FOREIGN KEY (fallback_model_key) REFERENCES model_catalog(key);

alter table "public"."scans" add constraint "scans_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."scans" add constraint "scans_project_id_fkey" FOREIGN KEY (project_id) REFERENCES scan_projects(id) ON DELETE SET NULL;

alter table "public"."scans" add constraint "scans_selected_model_key_fkey" FOREIGN KEY (selected_model_key) REFERENCES model_catalog(key);

alter table "public"."scans" add constraint "scans_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."stored_files" add constraint "stored_files_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."stored_files" add constraint "stored_files_scan_id_fkey" FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE;

alter table "public"."stored_files" add constraint "stored_files_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."system_events" add constraint "system_events_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table "public"."system_events" add constraint "system_events_scan_id_fkey" FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE SET NULL;

alter table "public"."usage_events" add constraint "usage_events_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."usage_events" add constraint "usage_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table "public"."usage_monthly" add constraint "usage_monthly_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."user_usage_daily" add constraint "user_usage_daily_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."user_usage_daily" add constraint "user_usage_daily_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."webhook_endpoints" add constraint "webhook_endpoints_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."webhook_endpoints" add constraint "webhook_endpoints_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."webhook_events" add constraint "webhook_events_endpoint_id_fkey" FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE;

alter table "public"."webhook_events" add constraint "webhook_events_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
