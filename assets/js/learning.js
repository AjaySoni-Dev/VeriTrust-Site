(function initLearningPage(global) {
  'use strict';

  const api = global.VeriTrustLearningApi;
  const $ = (selector) => document.querySelector(selector);

  function text(node, value) {
    if (node) node.textContent = String(value ?? '');
  }

  function message(value, tone = '') {
    const node = $('#learning-message');
    if (!node) return;
    node.hidden = !value;
    node.dataset.tone = tone;
    text(node, value);
  }

  function meta(items) {
    const list = document.createElement('ul');
    list.className = 'learning-meta';
    items.filter(Boolean).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    return list;
  }

  function courseCard(course) {
    const article = document.createElement('article');
    article.className = 'learning-card learning-course-card';
    const main = document.createElement('div');
    main.className = 'learning-card-main';
    main.appendChild(meta([
      course.level,
      `${course.module_count || 0} modules · ${course.lesson_count || 0} lessons`,
      course.certification_available ? 'Certificate' : '',
    ]));
    const title = document.createElement('h2');
    title.textContent = course.title;
    const summary = document.createElement('p');
    summary.textContent = course.summary;
    const actions = document.createElement('div');
    actions.className = 'learning-card-actions';
    const link = document.createElement('a');
    link.className = 'learning-btn';
    link.href = `/learn/courses/${encodeURIComponent(course.slug)}`;
    link.textContent = 'View course';
    actions.appendChild(link);
    main.append(title, summary);
    article.append(main, actions);
    return article;
  }

  function enrollmentCard(enrollment) {
    const version = enrollment.learning_course_versions || {};
    const course = version.learning_courses || {};
    const article = document.createElement('article');
    article.className = 'learning-card';
    article.appendChild(meta([enrollment.status, `Version ${version.version || 1}`]));
    const title = document.createElement('h2');
    title.textContent = version.title || 'Course';
    const summary = document.createElement('p');
    summary.textContent = version.summary || 'Continue your VeriTrust learning path.';
    const progress = document.createElement('div');
    progress.className = 'learning-progress';
    progress.setAttribute('aria-label', `${Number(enrollment.progress_percent || 0)} percent complete`);
    const fill = document.createElement('span');
    fill.style.width = `${Math.max(0, Math.min(100, Number(enrollment.progress_percent || 0)))}%`;
    progress.appendChild(fill);
    const actions = document.createElement('div');
    actions.className = 'learning-card-actions';
    const link = document.createElement('a');
    link.className = 'learning-btn learning-btn-primary';
    link.href = `/learn/courses/${encodeURIComponent(course.slug || 'course')}?enrollment=${encodeURIComponent(enrollment.id)}`;
    link.textContent = Number(enrollment.progress_percent || 0) > 0 ? 'Continue' : 'Start';
    actions.appendChild(link);
    article.append(title, summary, progress, actions);
    return article;
  }

  async function loadCatalog() {
    const grid = $('#learning-grid');
    if (!grid) return;
    grid.replaceChildren();
    message('Loading the published catalog…');
    try {
      const response = await api.catalog({
        search: $('#learning-search')?.value.trim(),
        level: $('#learning-level')?.value,
      });
      const courses = response.data || [];
      grid.classList.toggle('is-featured', courses.length === 1);
      grid.replaceChildren(...courses.map(courseCard));
      message(courses.length ? '' : 'No published courses match this filter.');
    } catch (error) {
      message(error.message, 'error');
    }
  }

  async function loadMyLearning() {
    const grid = $('#learning-grid');
    if (!grid) return;
    message('Loading your learning workspace…');
    try {
      const response = await api.me();
      const enrollments = response.data?.enrollments || [];
      text($('#learning-name'), response.data?.user?.display_name || 'Learner');
      grid.replaceChildren(...enrollments.map(enrollmentCard));
      message(enrollments.length ? '' : 'You have no active courses yet. Open the catalog to enroll.');
    } catch (error) {
      message(error.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await global.VeriTrustPageAccess;
    const mine = /^\/learn\/my-learning\/?$/i.test(global.location.pathname);
    document.body.classList.toggle('learning-my-page', mine);
    $('[data-catalog-view]')?.toggleAttribute('hidden', mine);
    $('[data-my-view]')?.toggleAttribute('hidden', !mine);
    if (mine) {
      await loadMyLearning();
      return;
    }
    $('#learning-filter')?.addEventListener('submit', (event) => {
      event.preventDefault();
      loadCatalog();
    });
    await loadCatalog();
  });
})(window);
