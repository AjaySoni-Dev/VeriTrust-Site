-- VeriTrust least-privilege grants and safe defaults
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
revoke create on schema public from public, anon, authenticated, service_role;

grant usage on schema public to public, anon, authenticated, service_role;

revoke all on schema veritrust_private from public, anon, authenticated, service_role;

revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;

revoke execute on all functions in schema public from public, anon, authenticated, service_role;

revoke execute on all functions in schema veritrust_private from public, anon, authenticated, service_role;

grant all privileges on table "public"."api_keys" to "service_role";

grant all privileges on table "public"."api_rate_limits" to "service_role";

grant all privileges on table "public"."api_usage_events" to "service_role";

grant all privileges on table "public"."audit_logs" to "service_role";

grant all privileges on table "public"."billing_customers" to "service_role";

grant all privileges on table "public"."billing_events" to "service_role";

grant all privileges on table "public"."entitlement_snapshots" to "service_role";

grant all privileges on table "public"."feedback" to "service_role";

grant all privileges on table "public"."gateway_artifacts" to "service_role";

grant all privileges on table "public"."gateway_decisions" to "service_role";

grant all privileges on table "public"."gateway_evidence" to "service_role";

grant all privileges on table "public"."gateway_idempotency_keys" to "service_role";

grant all privileges on table "public"."gateway_integrations" to "service_role";

grant all privileges on table "public"."gateway_jobs" to "service_role";

grant all privileges on table "public"."gateway_model_health" to "service_role";

grant all privileges on table "public"."gateway_model_runs" to "service_role";

grant all privileges on table "public"."gateway_model_versions" to "service_role";

grant all privileges on table "public"."gateway_policies" to "service_role";

grant all privileges on table "public"."gateway_policy_activations" to "service_role";

grant all privileges on table "public"."gateway_policy_versions" to "service_role";

grant all privileges on table "public"."gateway_retention_receipts" to "service_role";

grant all privileges on table "public"."gateway_review_cases" to "service_role";

grant all privileges on table "public"."gateway_scans" to "service_role";

grant all privileges on table "public"."gateway_schema_migrations" to "service_role";

grant all privileges on table "public"."gateway_uploads" to "service_role";

grant all privileges on table "public"."gateway_usage_daily" to "service_role";

grant all privileges on table "public"."gateway_webhook_attempts" to "service_role";

grant all privileges on table "public"."gateway_webhook_endpoints" to "service_role";

grant all privileges on table "public"."gateway_webhook_events" to "service_role";

grant all privileges on table "public"."gateway_webhook_secrets" to "service_role";

grant all privileges on table "public"."learning_assessment_versions" to "service_role";

grant all privileges on table "public"."learning_assessments" to "service_role";

grant SELECT on table "public"."learning_assignments" to "authenticated";

grant all privileges on table "public"."learning_assignments" to "service_role";

grant SELECT on table "public"."learning_attempt_items" to "authenticated";

grant all privileges on table "public"."learning_attempt_items" to "service_role";

grant SELECT on table "public"."learning_attempts" to "authenticated";

grant all privileges on table "public"."learning_attempts" to "service_role";

grant SELECT on table "public"."learning_audit_events" to "authenticated";

grant all privileges on table "public"."learning_audit_events" to "service_role";

grant SELECT on table "public"."learning_bookmarks" to "authenticated";

grant all privileges on table "public"."learning_bookmarks" to "service_role";

grant all privileges on table "public"."learning_certification_versions" to "service_role";

grant all privileges on table "public"."learning_certifications" to "service_role";

grant all privileges on table "public"."learning_cohort_members" to "service_role";

grant SELECT on table "public"."learning_cohorts" to "authenticated";

grant all privileges on table "public"."learning_cohorts" to "service_role";

grant all privileges on table "public"."learning_competencies" to "service_role";

grant all privileges on table "public"."learning_content_reviews" to "service_role";

grant all privileges on table "public"."learning_course_competencies" to "service_role";

grant all privileges on table "public"."learning_course_versions" to "service_role";

grant all privileges on table "public"."learning_courses" to "service_role";

grant all privileges on table "public"."learning_credential_status_events" to "service_role";

grant SELECT on table "public"."learning_credentials" to "authenticated";

grant all privileges on table "public"."learning_credentials" to "service_role";

grant SELECT on table "public"."learning_enrollments" to "authenticated";

grant all privileges on table "public"."learning_enrollments" to "service_role";

grant SELECT on table "public"."learning_events" to "authenticated";

grant all privileges on table "public"."learning_events" to "service_role";

grant all privileges on table "public"."learning_idempotency_receipts" to "service_role";

grant SELECT on table "public"."learning_lab_sessions" to "authenticated";

grant all privileges on table "public"."learning_lab_sessions" to "service_role";

grant all privileges on table "public"."learning_lesson_blocks" to "service_role";

grant SELECT on table "public"."learning_lesson_progress" to "authenticated";

grant all privileges on table "public"."learning_lesson_progress" to "service_role";

grant all privileges on table "public"."learning_lessons" to "service_role";

grant all privileges on table "public"."learning_modules" to "service_role";

grant all privileges on table "public"."learning_program_courses" to "service_role";

grant all privileges on table "public"."learning_programs" to "service_role";

grant all privileges on table "public"."learning_public_catalog" to "service_role";

grant all privileges on table "public"."learning_public_credentials" to "service_role";

grant all privileges on table "public"."learning_question_revisions" to "service_role";

grant SELECT on table "public"."learning_responses" to "authenticated";

grant all privileges on table "public"."learning_responses" to "service_role";

grant SELECT on table "public"."learning_role_assignments" to "authenticated";

grant all privileges on table "public"."learning_role_assignments" to "service_role";

grant all privileges on table "public"."model_catalog" to "service_role";

grant all privileges on table "public"."organization_members" to "service_role";

grant all privileges on table "public"."organization_subscriptions" to "service_role";

grant all privileges on table "public"."organizations" to "service_role";

grant all privileges on table "public"."plans" to "service_role";

grant all privileges on table "public"."profiles" to "service_role";

grant all privileges on table "public"."scan_inputs" to "service_role";

grant all privileges on table "public"."scan_model_runs" to "service_role";

grant all privileges on table "public"."scan_projects" to "service_role";

grant all privileges on table "public"."scan_results" to "service_role";

grant all privileges on table "public"."scans" to "service_role";

grant all privileges on table "public"."stored_files" to "service_role";

grant all privileges on table "public"."system_events" to "service_role";

grant all privileges on table "public"."usage_events" to "service_role";

grant all privileges on table "public"."usage_monthly" to "service_role";

grant all privileges on table "public"."user_usage_daily" to "service_role";

grant all privileges on table "public"."webhook_endpoints" to "service_role";

grant all privileges on table "public"."webhook_events" to "service_role";

grant execute on function "public"."can_access_scan"(target_scan_id uuid) to "authenticated";

grant execute on function "public"."can_access_scan"(target_scan_id uuid) to "service_role";

grant execute on function "public"."can_write_scan"(target_scan_id uuid) to "authenticated";

grant execute on function "public"."can_write_scan"(target_scan_id uuid) to "service_role";

grant execute on function "public"."check_entitlement_quota"(target_org_id uuid, target_user_id uuid, target_action text, target_source text, target_scan_type scan_type, target_units integer) to "service_role";

grant execute on function "public"."check_scan_quota"(target_org_id uuid, target_user_id uuid) to "service_role";

grant execute on function "public"."complete_scan_record"(target_scan_id uuid, result_label text, result_confidence numeric, result_risk_level risk_level, result_primary_score numeric, result_secondary_score numeric, result_explanation text, result_indicators jsonb, result_raw_scores jsonb, model_runs jsonb) to "service_role";

grant execute on function "public"."consume_api_rate_limit"(target_identity_type text, target_identity_hash text, target_endpoint text, target_limit_count integer, target_metadata jsonb) to "service_role";

grant execute on function "public"."create_scan_record"(target_org_id uuid, target_scan_type scan_type, target_input_kind input_kind, target_selected_model_key text, target_project_id uuid, target_text_preview text, target_text_hash text, target_metadata jsonb) to "authenticated";

grant execute on function "public"."create_scan_record"(target_org_id uuid, target_scan_type scan_type, target_input_kind input_kind, target_selected_model_key text, target_project_id uuid, target_text_preview text, target_text_hash text, target_metadata jsonb) to "service_role";

grant execute on function "public"."fail_scan_record"(target_scan_id uuid, failure_message text) to "service_role";

grant execute on function "public"."gateway_activate_policy_version"(target_version_id uuid, target_activated_by uuid, target_reason text) to "service_role";

grant execute on function "public"."gateway_attach_upload"(target_upload_id uuid, target_scan_id uuid, target_artifact_id uuid, target_final_path text) to "service_role";

grant execute on function "public"."gateway_claim_expired_uploads"(target_limit integer) to "service_role";

grant execute on function "public"."gateway_claim_jobs"(target_queue text, target_worker_id text, target_limit integer, target_visibility_seconds integer) to "service_role";

grant execute on function "public"."gateway_complete_job"(target_job_id uuid, target_lease_token uuid) to "service_role";

grant execute on function "public"."gateway_complete_upload"(target_upload_id uuid, target_detected_mime_type text, target_actual_size_bytes bigint, target_content_sha256 text) to "service_role";

grant execute on function "public"."gateway_create_policy_version"(target_policy_id uuid, target_policy_document jsonb, target_schema_version text, target_created_by uuid) to "service_role";

grant execute on function "public"."gateway_enqueue_job"(target_org_id uuid, target_scan_id uuid, target_job_type gateway_job_type, target_dedupe_key text, target_artifact_id uuid, target_payload jsonb, target_priority smallint, target_available_at timestamp with time zone, target_max_attempts integer) to "service_role";

grant execute on function "public"."gateway_fail_job"(target_job_id uuid, target_lease_token uuid, target_error_code text, target_error_detail jsonb, target_retry_seconds integer) to "service_role";

grant execute on function "public"."gateway_heartbeat_job"(target_job_id uuid, target_lease_token uuid, target_visibility_seconds integer) to "service_role";

grant execute on function "public"."gateway_mark_upload_deleted"(target_upload_id uuid) to "service_role";

grant execute on function "public"."gateway_prepare_upload_attachment"(target_upload_id uuid, target_scan_id uuid, target_artifact_id uuid, target_final_path text) to "service_role";

grant execute on function "public"."gateway_publish_decision"(target_scan_id uuid, target_decision_key text, target_decision_kind gateway_decision_kind, target_risk_score numeric, target_verdict gateway_risk_verdict, target_recommendation gateway_recommendation, target_degraded boolean, target_reason_codes text[], target_evidence_ids uuid[], target_correlation_version text, target_created_by uuid, target_create_review boolean) to "service_role";

grant execute on function "public"."gateway_record_evidence"(target_model_run_id uuid, target_status gateway_evidence_status, target_score numeric, target_verdict gateway_evidence_verdict, target_confidence gateway_confidence_band, target_confidence_value numeric, target_indicators jsonb, target_reason_codes text[], target_raw_response_redacted jsonb) to "service_role";

grant execute on function "public"."gateway_record_retention_receipt"(target_artifact_id uuid, target_object_deleted boolean, target_metadata_scrubbed boolean, target_verified boolean, target_worker_id text, target_verification_detail jsonb) to "service_role";

grant execute on function "public"."gateway_record_webhook_attempt"(target_event_id uuid, target_outcome text, target_response_code integer, target_latency_ms integer, target_retry_at timestamp with time zone, target_error_code text, target_error_detail jsonb) to "service_role";

grant execute on function "public"."gateway_register_upload"(target_org_id uuid, target_integration_id uuid, target_artifact_type gateway_artifact_type, target_mime_type text, target_size_bytes bigint, target_created_by uuid, target_ttl_seconds integer) to "service_role";

grant execute on function "public"."gateway_request_cancel"(target_scan_id uuid) to "service_role";

grant execute on function "public"."gateway_schema_health"() to "service_role";

grant execute on function "public"."gateway_store_idempotent_response"(target_scan_id uuid, target_response_status integer, target_response_body jsonb) to "service_role";

grant execute on function "public"."gateway_submit_scan"(target_org_id uuid, target_integration_id uuid, target_idempotency_key text, target_request_hash text, target_api_key_id uuid, target_submitted_by uuid, target_processing_mode gateway_processing_mode, target_source text, target_external_event_id text, target_request_id text, target_trace_id text, target_policy_version_id uuid, target_deadline_at timestamp with time zone, target_metadata jsonb) to "service_role";

grant execute on function "public"."get_dashboard"(target_org_id uuid, recent_limit integer, recent_offset integer) to "authenticated";

grant execute on function "public"."get_dashboard"(target_org_id uuid, recent_limit integer, recent_offset integer) to "service_role";

grant execute on function "public"."handle_new_user"() to "service_role";

grant execute on function "public"."has_org_role"(target_org_id uuid, allowed_roles app_role[]) to "authenticated";

grant execute on function "public"."has_org_role"(target_org_id uuid, allowed_roles app_role[]) to "service_role";

grant execute on function "public"."increment_usage"(target_org_id uuid, target_user_id uuid, target_scan_type scan_type, from_api boolean) to "service_role";

grant execute on function "public"."is_org_member"(target_org_id uuid) to "authenticated";

grant execute on function "public"."is_org_member"(target_org_id uuid) to "service_role";

grant execute on function "public"."learning_admin_summary"(target_org_id uuid, target_user_id uuid) to "service_role";

grant execute on function "public"."learning_assert_member"(target_user_id uuid, target_org_id uuid) to "service_role";

grant execute on function "public"."learning_enroll"(target_course_version_id uuid, target_source text, target_assignment_id uuid, target_idempotency_key text, target_user_id uuid, target_org_id uuid) to "service_role";

grant execute on function "public"."learning_is_org_admin"(target_org_id uuid) to "authenticated";

grant execute on function "public"."learning_is_org_admin"(target_org_id uuid) to "service_role";

grant execute on function "public"."learning_is_org_member"(target_org_id uuid) to "authenticated";

grant execute on function "public"."learning_is_org_member"(target_org_id uuid) to "service_role";

grant execute on function "public"."learning_issue_credential"(target_certification_version_id uuid, target_user_id uuid, target_org_id uuid) to "service_role";

grant execute on function "public"."learning_lock_published_version"() to public;

grant execute on function "public"."learning_lock_published_version"() to "service_role";

grant execute on function "public"."learning_new_public_code"() to "service_role";

grant execute on function "public"."learning_record_event"(target_enrollment_id uuid, target_lesson_id uuid, target_event_type text, target_occurred_at timestamp with time zone, target_payload jsonb, target_idempotency_key text, target_user_id uuid, target_org_id uuid) to "service_role";

grant execute on function "public"."learning_save_response"(target_attempt_id uuid, target_attempt_item_id uuid, target_answer jsonb, target_idempotency_key text, target_user_id uuid, target_org_id uuid) to "service_role";

grant execute on function "public"."learning_set_credential_status"(target_credential_id uuid, target_status text, target_reason text, target_user_id uuid, target_org_id uuid) to "service_role";

grant execute on function "public"."learning_start_attempt"(target_assessment_version_id uuid, target_idempotency_key text, target_user_id uuid, target_org_id uuid) to "service_role";

grant execute on function "public"."learning_submit_attempt"(target_attempt_id uuid, target_idempotency_key text, target_user_id uuid, target_org_id uuid) to "service_role";

grant execute on function "public"."learning_touch_updated_at"() to public;

grant execute on function "public"."learning_touch_updated_at"() to "service_role";

grant execute on function "public"."record_audit_event"(target_org_id uuid, event_action text, target_table_name text, target_record_id uuid, event_metadata jsonb) to "service_role";

grant execute on function "public"."record_billable_usage"(target_org_id uuid, target_user_id uuid, target_source text, target_scan_type scan_type, target_endpoint text, target_status text, target_units integer, target_request_id text, target_metadata jsonb) to "service_role";

grant execute on function "public"."touch_updated_at"() to "service_role";

grant execute on function "public"."update_my_profile"(profile_patch jsonb) to "authenticated";

grant execute on function "public"."update_my_profile"(profile_patch jsonb) to "service_role";

alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public grant all on tables to service_role;

alter default privileges for role postgres in schema public grant usage, select, update on sequences to service_role;

alter default privileges for role postgres in schema public grant execute on functions to service_role;

alter default privileges for role postgres in schema veritrust_private revoke all on tables from public, anon, authenticated;

alter default privileges for role postgres in schema veritrust_private revoke all on sequences from public, anon, authenticated;

alter default privileges for role postgres in schema veritrust_private revoke execute on functions from public, anon, authenticated;
