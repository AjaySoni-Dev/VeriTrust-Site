-- VeriTrust views, row triggers, and DDL guard
-- Generated from the read-only VeriTrust schema snapshot (2026-08-03T10:28:51.656215+00:00).
-- Snapshot SHA-256: 9fd45a67ebc2d9c1f8f9a644c7abb431bdebad0f51cf6383016d25563bb7b473
-- Apply only to a fresh Supabase project. Never apply this baseline over production.

set check_function_bodies = on;
set search_path = public, extensions, pg_catalog;
create view "public"."learning_public_catalog" with (security_invoker=true, security_barrier=true) as
 SELECT course.id AS course_id,
    version.id AS course_version_id,
    course.slug,
    version.title,
    version.summary,
    version.description,
    version.level,
    version.estimated_minutes,
    version.learning_outcomes,
    version.prerequisites,
    version.cover_asset_path,
    version.published_at,
    count(DISTINCT module.id)::integer AS module_count,
    count(DISTINCT lesson.id)::integer AS lesson_count,
    count(DISTINCT lesson.id) FILTER (WHERE lesson.lesson_type = 'lab'::text)::integer AS lab_count,
    (EXISTS ( SELECT 1
           FROM learning_certifications certification
             JOIN learning_certification_versions certification_version ON certification_version.certification_id = certification.id AND certification_version.status = 'published'::text
          WHERE certification.course_id = course.id AND certification.status = 'active'::text)) AS certification_available
   FROM learning_courses course
     JOIN learning_course_versions version ON version.course_id = course.id AND version.status = 'published'::text
     LEFT JOIN learning_modules module ON module.course_version_id = version.id
     LEFT JOIN learning_lessons lesson ON lesson.module_id = module.id
  WHERE course.status = 'active'::text
  GROUP BY course.id, version.id;

create view "public"."learning_public_credentials" with (security_invoker=true, security_barrier=true) as
 SELECT credential.public_code,
    credential.status,
    credential.display_name,
    certification_version.title AS certification_title,
    certification_version.version AS certification_version,
    credential.issuer_name,
    credential.issued_at,
    credential.expires_at,
    credential.outcome
   FROM learning_credentials credential
     JOIN learning_certification_versions certification_version ON certification_version.id = credential.certification_version_id
  WHERE credential.public_visible = true;

CREATE TRIGGER billing_customers_touch_updated_at BEFORE UPDATE ON "public"."billing_customers" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_artifacts_touch_updated_at BEFORE UPDATE ON "public"."gateway_artifacts" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_artifacts_track_usage AFTER INSERT ON "public"."gateway_artifacts" FOR EACH ROW EXECUTE FUNCTION veritrust_private.track_gateway_usage_insert();

CREATE TRIGGER gateway_decisions_append_only BEFORE DELETE OR UPDATE ON "public"."gateway_decisions" FOR EACH ROW EXECUTE FUNCTION veritrust_private.prevent_gateway_history_mutation();

CREATE TRIGGER gateway_evidence_append_only BEFORE DELETE OR UPDATE ON "public"."gateway_evidence" FOR EACH ROW EXECUTE FUNCTION veritrust_private.prevent_gateway_history_mutation();

CREATE TRIGGER gateway_idempotency_touch_updated_at BEFORE UPDATE ON "public"."gateway_idempotency_keys" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_integrations_touch_updated_at BEFORE UPDATE ON "public"."gateway_integrations" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_jobs_dispatch_after_insert AFTER INSERT ON "public"."gateway_jobs" FOR EACH ROW EXECUTE FUNCTION veritrust_private.gateway_dispatch_job_insert_trigger();

CREATE TRIGGER gateway_jobs_touch_updated_at BEFORE UPDATE ON "public"."gateway_jobs" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_model_health_touch_updated_at BEFORE UPDATE ON "public"."gateway_model_health" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_model_runs_touch_updated_at BEFORE UPDATE ON "public"."gateway_model_runs" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_model_runs_track_usage AFTER INSERT ON "public"."gateway_model_runs" FOR EACH ROW EXECUTE FUNCTION veritrust_private.track_gateway_usage_insert();

CREATE TRIGGER gateway_model_versions_touch_updated_at BEFORE UPDATE ON "public"."gateway_model_versions" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_policies_touch_updated_at BEFORE UPDATE ON "public"."gateway_policies" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_policy_activations_append_only BEFORE DELETE OR UPDATE ON "public"."gateway_policy_activations" FOR EACH ROW EXECUTE FUNCTION veritrust_private.prevent_gateway_history_mutation();

CREATE TRIGGER gateway_policy_versions_append_only BEFORE DELETE OR UPDATE ON "public"."gateway_policy_versions" FOR EACH ROW EXECUTE FUNCTION veritrust_private.prevent_gateway_history_mutation();

CREATE TRIGGER gateway_retention_receipts_append_only BEFORE DELETE OR UPDATE ON "public"."gateway_retention_receipts" FOR EACH ROW EXECUTE FUNCTION veritrust_private.prevent_gateway_history_mutation();

CREATE TRIGGER gateway_review_cases_touch_updated_at BEFORE UPDATE ON "public"."gateway_review_cases" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_scans_touch_updated_at BEFORE UPDATE ON "public"."gateway_scans" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_uploads_touch_updated_at BEFORE UPDATE ON "public"."gateway_uploads" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_usage_daily_touch_updated_at BEFORE UPDATE ON "public"."gateway_usage_daily" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_webhook_attempts_append_only BEFORE DELETE OR UPDATE ON "public"."gateway_webhook_attempts" FOR EACH ROW EXECUTE FUNCTION veritrust_private.prevent_gateway_history_mutation();

CREATE TRIGGER gateway_webhook_endpoints_touch_updated_at BEFORE UPDATE ON "public"."gateway_webhook_endpoints" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER gateway_webhook_events_touch_updated_at BEFORE UPDATE ON "public"."gateway_webhook_events" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER learning_assessment_versions_touch BEFORE UPDATE ON "public"."learning_assessment_versions" FOR EACH ROW EXECUTE FUNCTION learning_touch_updated_at();

CREATE TRIGGER learning_lock_assessment_version BEFORE DELETE OR UPDATE ON "public"."learning_assessment_versions" FOR EACH ROW EXECUTE FUNCTION learning_lock_published_version();

CREATE TRIGGER learning_assignments_touch BEFORE UPDATE ON "public"."learning_assignments" FOR EACH ROW EXECUTE FUNCTION learning_touch_updated_at();

CREATE TRIGGER learning_certification_versions_touch BEFORE UPDATE ON "public"."learning_certification_versions" FOR EACH ROW EXECUTE FUNCTION learning_touch_updated_at();

CREATE TRIGGER learning_lock_certification_version BEFORE DELETE OR UPDATE ON "public"."learning_certification_versions" FOR EACH ROW EXECUTE FUNCTION learning_lock_published_version();

CREATE TRIGGER learning_cohorts_touch BEFORE UPDATE ON "public"."learning_cohorts" FOR EACH ROW EXECUTE FUNCTION learning_touch_updated_at();

CREATE TRIGGER learning_course_versions_touch BEFORE UPDATE ON "public"."learning_course_versions" FOR EACH ROW EXECUTE FUNCTION learning_touch_updated_at();

CREATE TRIGGER learning_lock_course_version BEFORE DELETE OR UPDATE ON "public"."learning_course_versions" FOR EACH ROW EXECUTE FUNCTION learning_lock_published_version();

CREATE TRIGGER learning_courses_touch BEFORE UPDATE ON "public"."learning_courses" FOR EACH ROW EXECUTE FUNCTION learning_touch_updated_at();

CREATE TRIGGER learning_programs_touch BEFORE UPDATE ON "public"."learning_programs" FOR EACH ROW EXECUTE FUNCTION learning_touch_updated_at();

CREATE TRIGGER model_catalog_touch_updated_at BEFORE UPDATE ON "public"."model_catalog" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER organization_members_touch_updated_at BEFORE UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER organization_subscriptions_touch_updated_at BEFORE UPDATE ON "public"."organization_subscriptions" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER organizations_provision_gateway AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION veritrust_private.provision_gateway_organization_trigger();

CREATE TRIGGER organizations_touch_updated_at BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER plans_touch_updated_at BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER scan_projects_touch_updated_at BEFORE UPDATE ON "public"."scan_projects" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER usage_monthly_touch_updated_at BEFORE UPDATE ON "public"."usage_monthly" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER user_usage_daily_touch_updated_at BEFORE UPDATE ON "public"."user_usage_daily" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

create event trigger "veritrust_enable_public_rls"
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function veritrust_private.enable_rls_on_new_public_tables();
