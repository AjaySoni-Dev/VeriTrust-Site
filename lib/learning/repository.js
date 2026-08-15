'use strict';

const { HttpError } = require('../veritrust-api');
const {
  eq,
  getProfileContext,
  supabaseFetch,
} = require('../supabase-server');
const { encodeCursor } = require('./validation');

function missingSchema(error) {
  const text = `${error?.message || ''} ${JSON.stringify(error?.details || '')}`.toLowerCase();
  return Number(error?.status || 0) === 404
    || text.includes('does not exist')
    || text.includes('schema cache')
    || text.includes('pgrst202');
}

function learningUnavailable(error) {
  if (!missingSchema(error)) throw error;
  throw new HttpError(503, 'Learning is being prepared. Run the supplied Supabase learning migration, then redeploy.', {
    code: 'LEARNING_SCHEMA_REQUIRED',
  });
}

function planFor(context) {
  return context?.organization?.plans || context?.organization?.plan || {};
}

function requireEntitlement(context, key, message) {
  const value = planFor(context)?.[key];
  if (value === false) throw new HttpError(403, message, { code: 'LEARNING_ENTITLEMENT_REQUIRED' });
}

async function publicCatalog({ search = '', level = '', limit = 24 }) {
  let path = `/rest/v1/learning_public_catalog?select=course_id,course_version_id,slug,title,summary,level,estimated_minutes,module_count,lesson_count,lab_count,certification_available,cover_asset_path&order=published_at.desc&limit=${limit}`;
  if (level) path += `&level=eq.${eq(level)}`;
  if (search) path += `&or=(title.ilike.*${eq(search)}*,summary.ilike.*${eq(search)}*)`;
  try {
    return await supabaseFetch(path, { service: true, maxResponseBytes: 1024 * 1024 });
  } catch (error) {
    return learningUnavailable(error);
  }
}

async function publicCourse(slug) {
  try {
    const rows = await supabaseFetch(`/rest/v1/learning_public_catalog?slug=eq.${eq(slug)}&select=course_id,course_version_id,slug,title,summary,description,level,estimated_minutes,module_count,lesson_count,lab_count,certification_available,learning_outcomes,prerequisites,cover_asset_path&limit=1`, { service: true });
    const course = rows?.[0];
    if (!course) throw new HttpError(404, 'Course was not found.', { code: 'NOT_FOUND' });
    const modules = await supabaseFetch(`/rest/v1/learning_modules?course_version_id=eq.${eq(course.course_version_id)}&select=id,title,summary,position,estimated_minutes,learning_lessons(id,slug,title,summary,position,estimated_minutes,lesson_type,is_preview)&order=position.asc&learning_lessons.order=position.asc`, { service: true });
    return { ...course, modules: modules || [] };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return learningUnavailable(error);
  }
}

async function learnerContext(req) {
  const context = await getProfileContext(req);
  return context;
}

async function myLearning(context) {
  requireEntitlement(context, 'learning_catalog_access', 'Learning catalog access is not enabled for this workspace.');
  try {
    const enrollments = await supabaseFetch(`/rest/v1/learning_enrollments?user_id=eq.${eq(context.user.id)}&select=id,status,started_at,completed_at,last_activity_at,progress_percent,course_version_id,learning_course_versions(id,version,title,summary,learning_courses(slug))&order=last_activity_at.desc`, {
      service: true,
      maxResponseBytes: 1024 * 1024,
    });
    const credentials = await supabaseFetch(`/rest/v1/learning_credentials?user_id=eq.${eq(context.user.id)}&select=id,public_code,status,issued_at,expires_at,display_name,learning_certification_versions(title,version)&order=issued_at.desc&limit=20`, {
      service: true,
    });
    return {
      user: { id: context.user.id, display_name: context.profile?.full_name || context.user.email?.split('@')[0] || 'Learner' },
      organization: { id: context.organization.id, name: context.organization.name },
      enrollments: enrollments || [],
      credentials: credentials || [],
    };
  } catch (error) {
    return learningUnavailable(error);
  }
}

async function enrollment(context, enrollmentId) {
  requireEntitlement(context, 'learning_catalog_access', 'Learning catalog access is not enabled for this workspace.');
  try {
    const rows = await supabaseFetch(`/rest/v1/learning_enrollments?id=eq.${eq(enrollmentId)}&user_id=eq.${eq(context.user.id)}&select=id,status,started_at,completed_at,last_activity_at,progress_percent,course_version_id,learning_course_versions(id,title,summary,learning_courses(slug),learning_modules(id,title,summary,position,learning_lessons(id,slug,title,summary,position,estimated_minutes,lesson_type,is_preview)),learning_assessments(id,title,assessment_type,learning_assessment_versions(id,version,status,duration_minutes,passing_percent)))&limit=1`, { service: true, maxResponseBytes: 2 * 1024 * 1024 });
    const record = rows?.[0];
    if (!record) throw new HttpError(404, 'Enrollment was not found.', { code: 'NOT_FOUND' });
    const progress = await supabaseFetch(`/rest/v1/learning_lesson_progress?enrollment_id=eq.${eq(enrollmentId)}&user_id=eq.${eq(context.user.id)}&select=lesson_id,status,progress_percent,last_position,completed_at`, { service: true });
    return { ...record, lesson_progress: progress || [] };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return learningUnavailable(error);
  }
}

async function lesson(context, lessonId, enrollmentId) {
  const owned = await enrollment(context, enrollmentId);
  try {
    const rows = await supabaseFetch(`/rest/v1/learning_lessons?id=eq.${eq(lessonId)}&select=id,slug,title,summary,estimated_minutes,lesson_type,module_id,learning_modules!inner(course_version_id),learning_lesson_blocks(id,block_type,position,content,accessibility_label)&learning_lesson_blocks.order=position.asc&limit=1`, { service: true, maxResponseBytes: 1024 * 1024 });
    const record = rows?.[0];
    if (!record || record.learning_modules?.course_version_id !== owned.course_version_id) {
      throw new HttpError(404, 'Lesson was not found.', { code: 'NOT_FOUND' });
    }
    return { lesson: record, enrollment: { id: owned.id, status: owned.status, progress_percent: owned.progress_percent } };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return learningUnavailable(error);
  }
}

async function rpc(name, body, context) {
  requireEntitlement(context, 'learning_catalog_access', 'Learning catalog access is not enabled for this workspace.');
  try {
    return await supabaseFetch(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      service: true,
      body: { ...body, target_user_id: context.user.id, target_org_id: context.organization.id },
      headers: { Prefer: 'return=representation' },
    });
  } catch (error) {
    return learningUnavailable(error);
  }
}

async function attempt(context, attemptId) {
  try {
    const rows = await supabaseFetch(`/rest/v1/learning_attempts?id=eq.${eq(attemptId)}&user_id=eq.${eq(context.user.id)}&select=id,status,started_at,expires_at,submitted_at,score_percent,passed,assessment_version_id,learning_assessment_versions(title,duration_minutes,passing_percent),learning_attempt_items(id,position,question_revision_id,learning_question_revisions(prompt,question_type,answer_schema,points),learning_responses(id,answer,saved_at))&learning_attempt_items.order=position.asc&limit=1`, { service: true, maxResponseBytes: 2 * 1024 * 1024 });
    const record = rows?.[0];
    if (!record) throw new HttpError(404, 'Assessment attempt was not found.', { code: 'NOT_FOUND' });
    return record;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return learningUnavailable(error);
  }
}

async function verifyCredential(code) {
  try {
    const rows = await supabaseFetch(`/rest/v1/learning_public_credentials?public_code=eq.${eq(code)}&select=public_code,status,display_name,certification_title,certification_version,issuer_name,issued_at,expires_at,outcome&limit=1`, { service: true });
    const credential = rows?.[0];
    if (!credential) throw new HttpError(404, 'Credential was not found.', { code: 'NOT_FOUND' });
    return credential;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return learningUnavailable(error);
  }
}

async function credentials(context, cursorValue, limit) {
  requireEntitlement(context, 'learning_certificate_access', 'Learning credentials are not enabled for this workspace.');
  let path = `/rest/v1/learning_credentials?user_id=eq.${eq(context.user.id)}&select=id,public_code,status,issued_at,expires_at,display_name,created_at,learning_certification_versions(title,version)&order=created_at.desc,id.desc&limit=${limit + 1}`;
  if (cursorValue) path += `&created_at=lt.${eq(cursorValue.created_at)}`;
  try {
    const rows = await supabaseFetch(path, { service: true });
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    return { data, next_cursor: hasMore ? encodeCursor(data[data.length - 1]) : null };
  } catch (error) {
    return learningUnavailable(error);
  }
}

function canAdmin(context) {
  return ['owner', 'admin'].includes(String(context.role || '').toLowerCase());
}

async function adminSummary(context) {
  if (!canAdmin(context)) throw new HttpError(403, 'Learning administration requires an owner or administrator role.', { code: 'FORBIDDEN' });
  requireEntitlement(context, 'learning_admin_access', 'Learning administration is not enabled for this workspace plan.');
  try {
    const rows = await supabaseFetch('/rest/v1/rpc/learning_admin_summary', {
      method: 'POST',
      service: true,
      body: { target_org_id: context.organization.id, target_user_id: context.user.id },
    });
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (error) {
    return learningUnavailable(error);
  }
}

module.exports = {
  adminSummary,
  attempt,
  credentials,
  enrollment,
  learnerContext,
  lesson,
  myLearning,
  publicCatalog,
  publicCourse,
  rpc,
  verifyCredential,
};
