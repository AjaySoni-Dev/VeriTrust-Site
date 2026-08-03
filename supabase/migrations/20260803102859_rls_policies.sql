-- VeriTrust row-level security and Storage policies
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
alter table "public"."api_keys" enable row level security;

alter table "public"."api_rate_limits" enable row level security;

alter table "public"."api_usage_events" enable row level security;

alter table "public"."audit_logs" enable row level security;

alter table "public"."billing_customers" enable row level security;

alter table "public"."billing_events" enable row level security;

alter table "public"."entitlement_snapshots" enable row level security;

alter table "public"."feedback" enable row level security;

alter table "public"."gateway_artifacts" enable row level security;

alter table "public"."gateway_decisions" enable row level security;

alter table "public"."gateway_evidence" enable row level security;

alter table "public"."gateway_idempotency_keys" enable row level security;

alter table "public"."gateway_integrations" enable row level security;

alter table "public"."gateway_jobs" enable row level security;

alter table "public"."gateway_model_health" enable row level security;

alter table "public"."gateway_model_runs" enable row level security;

alter table "public"."gateway_model_versions" enable row level security;

alter table "public"."gateway_policies" enable row level security;

alter table "public"."gateway_policy_activations" enable row level security;

alter table "public"."gateway_policy_versions" enable row level security;

alter table "public"."gateway_retention_receipts" enable row level security;

alter table "public"."gateway_review_cases" enable row level security;

alter table "public"."gateway_scans" enable row level security;

alter table "public"."gateway_schema_migrations" enable row level security;

alter table "public"."gateway_uploads" enable row level security;

alter table "public"."gateway_usage_daily" enable row level security;

alter table "public"."gateway_webhook_attempts" enable row level security;

alter table "public"."gateway_webhook_endpoints" enable row level security;

alter table "public"."gateway_webhook_events" enable row level security;

alter table "public"."gateway_webhook_secrets" enable row level security;

alter table "public"."learning_assessment_versions" enable row level security;

alter table "public"."learning_assessment_versions" force row level security;

alter table "public"."learning_assessments" enable row level security;

alter table "public"."learning_assessments" force row level security;

alter table "public"."learning_assignments" enable row level security;

alter table "public"."learning_assignments" force row level security;

alter table "public"."learning_attempt_items" enable row level security;

alter table "public"."learning_attempt_items" force row level security;

alter table "public"."learning_attempts" enable row level security;

alter table "public"."learning_attempts" force row level security;

alter table "public"."learning_audit_events" enable row level security;

alter table "public"."learning_audit_events" force row level security;

alter table "public"."learning_bookmarks" enable row level security;

alter table "public"."learning_bookmarks" force row level security;

alter table "public"."learning_certification_versions" enable row level security;

alter table "public"."learning_certification_versions" force row level security;

alter table "public"."learning_certifications" enable row level security;

alter table "public"."learning_certifications" force row level security;

alter table "public"."learning_cohort_members" enable row level security;

alter table "public"."learning_cohort_members" force row level security;

alter table "public"."learning_cohorts" enable row level security;

alter table "public"."learning_cohorts" force row level security;

alter table "public"."learning_competencies" enable row level security;

alter table "public"."learning_competencies" force row level security;

alter table "public"."learning_content_reviews" enable row level security;

alter table "public"."learning_content_reviews" force row level security;

alter table "public"."learning_course_competencies" enable row level security;

alter table "public"."learning_course_competencies" force row level security;

alter table "public"."learning_course_versions" enable row level security;

alter table "public"."learning_course_versions" force row level security;

alter table "public"."learning_courses" enable row level security;

alter table "public"."learning_courses" force row level security;

alter table "public"."learning_credential_status_events" enable row level security;

alter table "public"."learning_credential_status_events" force row level security;

alter table "public"."learning_credentials" enable row level security;

alter table "public"."learning_credentials" force row level security;

alter table "public"."learning_enrollments" enable row level security;

alter table "public"."learning_enrollments" force row level security;

alter table "public"."learning_events" enable row level security;

alter table "public"."learning_events" force row level security;

alter table "public"."learning_idempotency_receipts" enable row level security;

alter table "public"."learning_idempotency_receipts" force row level security;

alter table "public"."learning_lab_sessions" enable row level security;

alter table "public"."learning_lab_sessions" force row level security;

alter table "public"."learning_lesson_blocks" enable row level security;

alter table "public"."learning_lesson_blocks" force row level security;

alter table "public"."learning_lesson_progress" enable row level security;

alter table "public"."learning_lesson_progress" force row level security;

alter table "public"."learning_lessons" enable row level security;

alter table "public"."learning_lessons" force row level security;

alter table "public"."learning_modules" enable row level security;

alter table "public"."learning_modules" force row level security;

alter table "public"."learning_program_courses" enable row level security;

alter table "public"."learning_program_courses" force row level security;

alter table "public"."learning_programs" enable row level security;

alter table "public"."learning_programs" force row level security;

alter table "public"."learning_question_revisions" enable row level security;

alter table "public"."learning_question_revisions" force row level security;

alter table "public"."learning_responses" enable row level security;

alter table "public"."learning_responses" force row level security;

alter table "public"."learning_role_assignments" enable row level security;

alter table "public"."learning_role_assignments" force row level security;

alter table "public"."model_catalog" enable row level security;

alter table "public"."organization_members" enable row level security;

alter table "public"."organization_subscriptions" enable row level security;

alter table "public"."organizations" enable row level security;

alter table "public"."plans" enable row level security;

alter table "public"."profiles" enable row level security;

alter table "public"."scan_inputs" enable row level security;

alter table "public"."scan_model_runs" enable row level security;

alter table "public"."scan_projects" enable row level security;

alter table "public"."scan_results" enable row level security;

alter table "public"."scans" enable row level security;

alter table "public"."stored_files" enable row level security;

alter table "public"."system_events" enable row level security;

alter table "public"."usage_events" enable row level security;

alter table "public"."usage_monthly" enable row level security;

alter table "public"."user_usage_daily" enable row level security;

alter table "public"."webhook_endpoints" enable row level security;

alter table "public"."webhook_events" enable row level security;

create policy "api_keys_select_admin"
on "public"."api_keys"
as PERMISSIVE
for SELECT
to "authenticated"
using (has_org_role(org_id, ARRAY['owner'::app_role, 'admin'::app_role]));

create policy "audit_logs_select_admin"
on "public"."audit_logs"
as PERMISSIVE
for SELECT
to "authenticated"
using (has_org_role(org_id, ARRAY['owner'::app_role, 'admin'::app_role]));

create policy "Org members can view billing customers"
on "public"."billing_customers"
as PERMISSIVE
for SELECT
to "authenticated"
using ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.org_id = billing_customers.org_id) AND (m.user_id = auth.uid()) AND (m.status = 'active'::member_status)))));

create policy "Org admins can view entitlement snapshots"
on "public"."entitlement_snapshots"
as PERMISSIVE
for SELECT
to "authenticated"
using ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.org_id = entitlement_snapshots.org_id) AND (m.user_id = auth.uid()) AND (m.status = 'active'::member_status) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy "feedback_insert_member"
on "public"."feedback"
as PERMISSIVE
for INSERT
to "authenticated"
with check ((is_org_member(org_id) AND (user_id = auth.uid())));

create policy "feedback_select_member"
on "public"."feedback"
as PERMISSIVE
for SELECT
to "authenticated"
using (is_org_member(org_id));

create policy "gateway_service_all"
on "public"."gateway_artifacts"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_decisions"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_evidence"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_idempotency_keys"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_integrations"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_jobs"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_model_health"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_model_runs"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_model_versions"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_policies"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_policy_activations"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_policy_versions"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_retention_receipts"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_review_cases"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_scans"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_schema_migrations"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_uploads_member_read"
on "public"."gateway_uploads"
as PERMISSIVE
for SELECT
to "authenticated"
using (is_org_member(org_id));

create policy "gateway_uploads_service_all"
on "public"."gateway_uploads"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_usage_daily"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_webhook_attempts"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_webhook_endpoints"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_service_all"
on "public"."gateway_webhook_events"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "gateway_webhook_secrets_service_all"
on "public"."gateway_webhook_secrets"
as PERMISSIVE
for ALL
to "service_role"
using (true)
with check (true);

create policy "learning_assignments_member_read"
on "public"."learning_assignments"
as PERMISSIVE
for SELECT
to "authenticated"
using (learning_is_org_member(org_id));

create policy "learning_attempt_items_owner_read"
on "public"."learning_attempt_items"
as PERMISSIVE
for SELECT
to "authenticated"
using ((EXISTS ( SELECT 1
   FROM learning_attempts attempt
  WHERE ((attempt.id = learning_attempt_items.attempt_id) AND ((attempt.user_id = auth.uid()) OR learning_is_org_admin(attempt.org_id))))));

create policy "learning_attempts_owner_read"
on "public"."learning_attempts"
as PERMISSIVE
for SELECT
to "authenticated"
using (((user_id = auth.uid()) OR learning_is_org_admin(org_id)));

create policy "learning_audit_admin_read"
on "public"."learning_audit_events"
as PERMISSIVE
for SELECT
to "authenticated"
using (((org_id IS NOT NULL) AND learning_is_org_admin(org_id)));

create policy "learning_bookmarks_owner_read"
on "public"."learning_bookmarks"
as PERMISSIVE
for SELECT
to "authenticated"
using ((user_id = auth.uid()));

create policy "learning_cohorts_admin_read"
on "public"."learning_cohorts"
as PERMISSIVE
for SELECT
to "authenticated"
using (learning_is_org_admin(org_id));

create policy "learning_credentials_owner_read"
on "public"."learning_credentials"
as PERMISSIVE
for SELECT
to "authenticated"
using (((user_id = auth.uid()) OR learning_is_org_admin(org_id)));

create policy "learning_enrollments_owner_read"
on "public"."learning_enrollments"
as PERMISSIVE
for SELECT
to "authenticated"
using (((user_id = auth.uid()) OR learning_is_org_admin(org_id)));

create policy "learning_events_owner_read"
on "public"."learning_events"
as PERMISSIVE
for SELECT
to "authenticated"
using (((user_id = auth.uid()) OR learning_is_org_admin(org_id)));

create policy "learning_lab_sessions_owner_read"
on "public"."learning_lab_sessions"
as PERMISSIVE
for SELECT
to "authenticated"
using (((user_id = auth.uid()) OR learning_is_org_admin(org_id)));

create policy "learning_progress_owner_read"
on "public"."learning_lesson_progress"
as PERMISSIVE
for SELECT
to "authenticated"
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM learning_enrollments enrollment
  WHERE ((enrollment.id = learning_lesson_progress.enrollment_id) AND learning_is_org_admin(enrollment.org_id))))));

create policy "learning_responses_owner_read"
on "public"."learning_responses"
as PERMISSIVE
for SELECT
to "authenticated"
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM learning_attempts attempt
  WHERE ((attempt.id = learning_responses.attempt_id) AND learning_is_org_admin(attempt.org_id))))));

create policy "learning_role_assignments_admin_read"
on "public"."learning_role_assignments"
as PERMISSIVE
for SELECT
to "authenticated"
using ((learning_is_org_admin(org_id) OR (user_id = auth.uid())));

create policy "organization_members_select_member"
on "public"."organization_members"
as PERMISSIVE
for SELECT
to "authenticated"
using (is_org_member(org_id));

create policy "Org members can view subscriptions"
on "public"."organization_subscriptions"
as PERMISSIVE
for SELECT
to "authenticated"
using ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.org_id = organization_subscriptions.org_id) AND (m.user_id = auth.uid()) AND (m.status = 'active'::member_status)))));

create policy "organizations_select_member"
on "public"."organizations"
as PERMISSIVE
for SELECT
to "authenticated"
using (is_org_member(id));

create policy "plans_select_anon_public"
on "public"."plans"
as PERMISSIVE
for SELECT
to "anon"
using (is_public);

create policy "plans_select_authenticated"
on "public"."plans"
as PERMISSIVE
for SELECT
to "authenticated"
using ((is_public OR (EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.plan_id = plans.id) AND is_org_member(o.id))))));

create policy "profiles_select_own"
on "public"."profiles"
as PERMISSIVE
for SELECT
to "authenticated"
using ((id = auth.uid()));

create policy "scan_inputs_select_member"
on "public"."scan_inputs"
as PERMISSIVE
for SELECT
to "authenticated"
using (can_access_scan(scan_id));

create policy "scan_model_runs_select_member"
on "public"."scan_model_runs"
as PERMISSIVE
for SELECT
to "authenticated"
using (can_access_scan(scan_id));

create policy "scan_projects_select_member"
on "public"."scan_projects"
as PERMISSIVE
for SELECT
to "authenticated"
using (is_org_member(org_id));

create policy "scan_results_select_member"
on "public"."scan_results"
as PERMISSIVE
for SELECT
to "authenticated"
using (can_access_scan(scan_id));

create policy "scans_select_member"
on "public"."scans"
as PERMISSIVE
for SELECT
to "authenticated"
using (is_org_member(org_id));

create policy "stored_files_select_member"
on "public"."stored_files"
as PERMISSIVE
for SELECT
to "authenticated"
using (is_org_member(org_id));

create policy "system_events_select_admin"
on "public"."system_events"
as PERMISSIVE
for SELECT
to "authenticated"
using (has_org_role(org_id, ARRAY['owner'::app_role, 'admin'::app_role]));

create policy "Org admins can view usage events"
on "public"."usage_events"
as PERMISSIVE
for SELECT
to "authenticated"
using ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.org_id = usage_events.org_id) AND (m.user_id = auth.uid()) AND (m.status = 'active'::member_status) AND ((m.role)::text = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy "Org members can view monthly usage"
on "public"."usage_monthly"
as PERMISSIVE
for SELECT
to "authenticated"
using ((EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.org_id = usage_monthly.org_id) AND (m.user_id = auth.uid()) AND (m.status = 'active'::member_status)))));

create policy "usage_select_member"
on "public"."user_usage_daily"
as PERMISSIVE
for SELECT
to "authenticated"
using (is_org_member(org_id));

create policy "webhook_endpoints_select_admin"
on "public"."webhook_endpoints"
as PERMISSIVE
for SELECT
to "authenticated"
using (has_org_role(org_id, ARRAY['owner'::app_role, 'admin'::app_role]));

create policy "webhook_events_select_admin"
on "public"."webhook_events"
as PERMISSIVE
for SELECT
to "authenticated"
using (has_org_role(org_id, ARRAY['owner'::app_role, 'admin'::app_role]));

create policy "storage_avatar_owner_read"
on "storage"."objects"
as PERMISSIVE
for SELECT
to "authenticated"
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy "storage_avatar_owner_write"
on "storage"."objects"
as PERMISSIVE
for ALL
to "authenticated"
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy "storage_org_admin_delete_scan_uploads"
on "storage"."objects"
as PERMISSIVE
for DELETE
to "authenticated"
using (((bucket_id = ANY (ARRAY['scan-uploads'::text, 'scan-crops'::text, 'exports'::text])) AND has_org_role(((storage.foldername(name))[1])::uuid, ARRAY['owner'::app_role, 'admin'::app_role])));

create policy "storage_org_admin_update_scan_uploads"
on "storage"."objects"
as PERMISSIVE
for UPDATE
to "authenticated"
using (((bucket_id = ANY (ARRAY['scan-uploads'::text, 'scan-crops'::text, 'exports'::text])) AND has_org_role(((storage.foldername(name))[1])::uuid, ARRAY['owner'::app_role, 'admin'::app_role])));

create policy "storage_org_analyst_insert_scan_uploads"
on "storage"."objects"
as PERMISSIVE
for INSERT
to "authenticated"
with check (((bucket_id = ANY (ARRAY['scan-uploads'::text, 'scan-crops'::text, 'exports'::text])) AND has_org_role(((storage.foldername(name))[1])::uuid, ARRAY['owner'::app_role, 'admin'::app_role, 'analyst'::app_role])));

create policy "storage_org_member_read_scan_uploads"
on "storage"."objects"
as PERMISSIVE
for SELECT
to "authenticated"
using (((bucket_id = ANY (ARRAY['scan-uploads'::text, 'scan-crops'::text, 'exports'::text])) AND is_org_member(((storage.foldername(name))[1])::uuid)));
