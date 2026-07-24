'use strict';

const {
  HttpError,
  handleOptions,
  parseJsonBody,
  sendJson,
} = require('../lib/veritrust-api');
const { validateJsonContentType } = require('../lib/validators');
const { enforceRateLimit } = require('../lib/rate-limit');
const repo = require('../lib/learning/repository');
const {
  boundedText,
  cursor,
  eventPayload,
  idempotencyKey,
  publicCode,
  requestId,
  requiredSlug,
  requiredUuid,
  responsePayload,
} = require('../lib/learning/validation');

function route(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  return {
    resource: String(url.searchParams.get('resource') || ''),
    action: String(url.searchParams.get('action') || ''),
    id: String(url.searchParams.get('id') || ''),
    slug: String(url.searchParams.get('slug') || ''),
    code: String(url.searchParams.get('code') || ''),
    search: String(url.searchParams.get('search') || ''),
    level: String(url.searchParams.get('level') || ''),
    cursor: String(url.searchParams.get('cursor') || ''),
    limit: String(url.searchParams.get('limit') || ''),
  };
}

function requireMethods(req, methods) {
  if (!methods.includes(req.method)) throw new HttpError(405, `Use ${methods.join(' or ')} for this endpoint.`, { code: 'METHOD_NOT_ALLOWED' });
}

function result(res, status, data, requestIdValue, meta = undefined) {
  sendJson(res, status, { ok: true, data, ...(meta ? { meta } : {}), request_id: requestIdValue });
}

function learningError(res, error, requestIdValue) {
  const status = Math.max(400, Math.min(599, Number(error?.status || 500)));
  const code = error?.code || error?.extra?.code || (status >= 500 ? 'INTERNAL_ERROR' : 'LEARNING_REQUEST_FAILED');
  const message = status >= 500 && code !== 'LEARNING_SCHEMA_REQUIRED'
    ? 'The learning request could not be completed.'
    : String(error?.message || 'The learning request could not be completed.');
  if (status >= 500) console.error('VeriTrust learning API error', { request_id: requestIdValue, status, code, name: error?.name });
  sendJson(res, status, { ok: false, error: { code, message }, request_id: requestIdValue });
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  const target = route(req);
  const rid = requestId(req);
  res.setHeader('X-Request-Id', rid);

  try {
    if (target.resource === 'catalog') {
      requireMethods(req, ['GET']);
      await enforceRateLimit({ req, endpoint: 'learning:catalog', limit: 240, identityType: 'ip' });
      const search = boundedText(target.search, 'search', 80, { optional: true }) || '';
      const level = boundedText(target.level, 'level', 30, { optional: true }) || '';
      if (level && !['foundation', 'intermediate', 'advanced'].includes(level)) throw new HttpError(400, 'Course level is invalid.', { code: 'INVALID_INPUT' });
      result(res, 200, await repo.publicCatalog({ search, level, limit: 24 }), rid);
      return;
    }

    if (target.resource === 'courses' && target.slug) {
      requireMethods(req, ['GET']);
      await enforceRateLimit({ req, endpoint: 'learning:course', limit: 240, identityType: 'ip' });
      result(res, 200, await repo.publicCourse(requiredSlug(target.slug)), rid);
      return;
    }

    if (target.resource === 'verify') {
      requireMethods(req, ['GET']);
      await enforceRateLimit({ req, endpoint: 'learning:credential-verify', limit: 90, identityType: 'ip' });
      result(res, 200, await repo.verifyCredential(publicCode(target.code)), rid);
      return;
    }

    const context = await repo.learnerContext(req);
    await enforceRateLimit({ req, endpoint: `learning:${target.resource || 'unknown'}`, context, limit: req.method === 'GET' ? 300 : 150 });

    if (target.resource === 'me') {
      requireMethods(req, ['GET']);
      result(res, 200, await repo.myLearning(context), rid);
      return;
    }

    if (target.resource === 'enrollments' && !target.id) {
      requireMethods(req, ['POST']);
      validateJsonContentType(req);
      const body = await parseJsonBody(req, 16384);
      const key = idempotencyKey(req);
      const data = await repo.rpc('learning_enroll', {
        target_course_version_id: requiredUuid(body.course_version_id, 'course_version_id'),
        target_source: boundedText(body.source || 'self', 'source', 30),
        target_assignment_id: body.assignment_id ? requiredUuid(body.assignment_id, 'assignment_id') : null,
        target_idempotency_key: key,
      }, context);
      result(res, 201, Array.isArray(data) ? data[0] : data, rid);
      return;
    }

    if (target.resource === 'enrollments' && target.id) {
      requireMethods(req, ['GET']);
      result(res, 200, await repo.enrollment(context, requiredUuid(target.id)), rid);
      return;
    }

    if (target.resource === 'lessons' && target.id) {
      requireMethods(req, ['GET']);
      const url = new URL(req.url || '/', 'http://localhost');
      result(res, 200, await repo.lesson(context, requiredUuid(target.id), requiredUuid(url.searchParams.get('enrollment_id'), 'enrollment_id')), rid);
      return;
    }

    if (target.resource === 'events') {
      requireMethods(req, ['POST']);
      validateJsonContentType(req);
      const body = eventPayload(await parseJsonBody(req, 16384));
      const data = await repo.rpc('learning_record_event', {
        ...body,
        target_idempotency_key: idempotencyKey(req),
      }, context);
      result(res, 202, Array.isArray(data) ? data[0] : data, rid);
      return;
    }

    if (target.resource === 'assessments' && target.id && target.action === 'start') {
      requireMethods(req, ['POST']);
      const data = await repo.rpc('learning_start_attempt', {
        target_assessment_version_id: requiredUuid(target.id, 'assessment_version_id'),
        target_idempotency_key: idempotencyKey(req),
      }, context);
      result(res, 201, Array.isArray(data) ? data[0] : data, rid);
      return;
    }

    if (target.resource === 'attempts' && target.id && !target.action) {
      requireMethods(req, ['GET']);
      result(res, 200, await repo.attempt(context, requiredUuid(target.id)), rid);
      return;
    }

    if (target.resource === 'attempts' && target.id && target.action === 'response') {
      requireMethods(req, ['PUT']);
      validateJsonContentType(req);
      const body = responsePayload(await parseJsonBody(req, 32768));
      const data = await repo.rpc('learning_save_response', {
        target_attempt_id: requiredUuid(target.id),
        target_attempt_item_id: body.attempt_item_id,
        target_answer: body.answer,
        target_idempotency_key: idempotencyKey(req),
      }, context);
      result(res, 200, Array.isArray(data) ? data[0] : data, rid);
      return;
    }

    if (target.resource === 'attempts' && target.id && target.action === 'submit') {
      requireMethods(req, ['POST']);
      const data = await repo.rpc('learning_submit_attempt', {
        target_attempt_id: requiredUuid(target.id),
        target_idempotency_key: idempotencyKey(req),
      }, context);
      result(res, 200, Array.isArray(data) ? data[0] : data, rid);
      return;
    }

    if (target.resource === 'certificates') {
      requireMethods(req, ['GET']);
      const limit = Math.max(1, Math.min(50, Number(target.limit) || 20));
      const page = await repo.credentials(context, cursor(target.cursor), limit);
      result(res, 200, page.data, rid, { next_cursor: page.next_cursor });
      return;
    }

    if (target.resource === 'admin') {
      requireMethods(req, ['GET']);
      result(res, 200, await repo.adminSummary(context), rid);
      return;
    }

    throw new HttpError(404, 'Learning endpoint was not found.', { code: 'NOT_FOUND' });
  } catch (error) {
    learningError(res, error, rid);
  }
};
