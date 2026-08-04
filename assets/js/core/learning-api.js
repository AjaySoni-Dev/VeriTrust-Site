(function initVeriTrustLearningApi(global) {
  'use strict';

  function key(scope) {
    const random = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `learning:${scope}:${random}`;
  }

  function request(path, options = {}) {
    const client = global.VeriTrustSupabase;
    if (!client?.learningApi) return Promise.reject(new Error('Learning service is unavailable.'));
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    return client.learningApi(path, { cache: 'no-store', ...options, headers });
  }

  const mutation = (path, method, body, scope) => request(path, {
    method,
    headers: { 'Idempotency-Key': key(scope) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  global.VeriTrustLearningApi = Object.freeze({
    catalog(filters = {}) {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.level) params.set('level', filters.level);
      return request(`catalog${params.size ? `?${params}` : ''}`);
    },
    course(slug) {
      return request(`courses/${encodeURIComponent(slug)}`);
    },
    me() {
      return request('me');
    },
    enrollment(id) {
      return request(`enrollments/${encodeURIComponent(id)}`);
    },
    enroll(courseVersionId, assignmentId = null) {
      return mutation('enrollments', 'POST', {
        course_version_id: courseVersionId,
        source: assignmentId ? 'assignment' : 'self',
        assignment_id: assignmentId,
      }, 'enroll');
    },
    lesson(id, enrollmentId) {
      return request(`lessons/${encodeURIComponent(id)}?enrollment_id=${encodeURIComponent(enrollmentId)}`);
    },
    recordEvent(event) {
      return mutation('events', 'POST', event, `event:${event.event_type}`);
    },
    startAttempt(assessmentVersionId) {
      return mutation(`assessments/${encodeURIComponent(assessmentVersionId)}/start`, 'POST', undefined, 'attempt-start');
    },
    attempt(id) {
      return request(`attempts/${encodeURIComponent(id)}`);
    },
    saveResponse(attemptId, attemptItemId, answer) {
      return mutation(`attempts/${encodeURIComponent(attemptId)}/response`, 'PUT', {
        attempt_item_id: attemptItemId,
        answer,
      }, `response:${attemptItemId}`);
    },
    submitAttempt(id) {
      return mutation(`attempts/${encodeURIComponent(id)}/submit`, 'POST', undefined, 'attempt-submit');
    },
    credentials(cursor = '') {
      return request(`certificates${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    },
    verify(publicCode) {
      return request(`verify/${encodeURIComponent(publicCode)}`);
    },
    adminSummary() {
      return request('admin');
    },
  });
})(window);
