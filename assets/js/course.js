(function initCoursePage(global) {
  'use strict';

  const api = global.VeriTrustLearningApi;
  const $ = (selector) => document.querySelector(selector);
  const slug = decodeURIComponent(global.location.pathname.match(/\/learn\/courses\/([^/]+)/i)?.[1] || '');
  let course = null;

  function setMessage(value, tone = '') {
    const node = $('#course-message');
    node.hidden = !value;
    node.dataset.tone = tone;
    node.textContent = value || '';
  }

  function renderModules(modules, enrollmentId = '') {
    const container = $('#course-modules');
    const fragment = document.createDocumentFragment();
    modules.forEach((module) => {
      const section = document.createElement('section');
      section.className = 'course-module';
      const heading = document.createElement('h3');
      heading.textContent = `${module.position}. ${module.title}`;
      const summary = document.createElement('p');
      summary.textContent = module.summary || '';
      const list = document.createElement('ol');
      (module.learning_lessons || []).forEach((lesson) => {
        const item = document.createElement('li');
        if (enrollmentId || lesson.is_preview) {
          const link = document.createElement('a');
          link.href = `/learn/courses/${encodeURIComponent(slug)}/lessons/${encodeURIComponent(lesson.slug)}${enrollmentId ? `?enrollment=${encodeURIComponent(enrollmentId)}` : ''}`;
          link.textContent = lesson.title;
          item.appendChild(link);
        } else {
          item.textContent = lesson.title;
        }
        list.appendChild(item);
      });
      section.append(heading, summary, list);
      fragment.appendChild(section);
    });
    container.replaceChildren(fragment);
  }

  function renderModulesSkeleton() {
    const container = $('#course-modules');
    if (!container) return;
    const fragment = document.createDocumentFragment();
    [1, 2].forEach(() => {
      const section = document.createElement('section');
      section.className = 'course-module learning-module-skeleton';
      section.setAttribute('aria-hidden', 'true');
      ['34%', '76%', '58%'].forEach((width, index) => {
        const line = document.createElement('span');
        line.className = `learning-skeleton-line${index === 0 ? ' is-title' : ''}`;
        line.style.setProperty('--skeleton-width', width);
        section.appendChild(line);
      });
      fragment.appendChild(section);
    });
    container.replaceChildren(fragment);
  }

  async function enroll() {
    const button = $('#course-enroll');
    button.disabled = true;
    button.textContent = 'Enrolling…';
    try {
      const response = await api.enroll(course.course_version_id);
      const enrollment = response.data;
      global.location.href = `/learn/courses/${encodeURIComponent(slug)}?enrollment=${encodeURIComponent(enrollment.id)}`;
    } catch (error) {
      setMessage(error.message, 'error');
      button.disabled = false;
      button.textContent = 'Enroll';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const access = await global.VeriTrustPageAccess;
    if (!access.allowed) return;
    renderModulesSkeleton();
    setMessage('');
    try {
      const response = await api.course(slug);
      course = response.data;
      $('#course-title').textContent = course.title;
      $('#course-summary').textContent = course.description || course.summary;
      $('#course-level').textContent = course.level;
      $('#course-duration').textContent = `${course.estimated_minutes} min`;
      $('#course-count').textContent = `${course.lesson_count} lessons`;
      const enrollmentId = new URLSearchParams(global.location.search).get('enrollment') || '';
      renderModules(course.modules || [], enrollmentId);
      if (enrollmentId) {
        const enrollmentResponse = await api.enrollment(enrollmentId);
        const enrolledVersion = enrollmentResponse.data?.learning_course_versions || {};
        if (Array.isArray(enrolledVersion.learning_modules)) renderModules(enrolledVersion.learning_modules, enrollmentId);
        $('#course-enroll').hidden = true;
        $('#course-continue').hidden = false;
        const first = (enrolledVersion.learning_modules || course.modules || []).flatMap((item) => item.learning_lessons || [])[0];
        if (first) $('#course-continue').href = `/learn/courses/${encodeURIComponent(slug)}/lessons/${encodeURIComponent(first.slug)}?enrollment=${encodeURIComponent(enrollmentId)}`;
        const assessment = (enrolledVersion.learning_assessments || [])
          .flatMap((item) => item.learning_assessment_versions || [])
          .find((item) => item.status === 'published');
        if (assessment) {
          $('#course-assessment').hidden = false;
          $('#course-assessment').href = `/learn/assessments/${encodeURIComponent(assessment.id)}`;
        }
      }
      setMessage('');
    } catch (error) {
      $('#course-title').textContent = 'Course unavailable';
      setMessage(error.message, 'error');
    } finally {
      document.body.classList.remove('learning-data-loading');
    }
    $('#course-enroll')?.addEventListener('click', enroll);
  });
})(window);
