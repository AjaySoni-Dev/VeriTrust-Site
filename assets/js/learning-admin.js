(function initLearningAdmin(global) {
  'use strict';

  const $ = (selector) => document.querySelector(selector);

  function metric(label, value) {
    const article = document.createElement('article');
    article.className = 'learning-card';
    const heading = document.createElement('h2');
    heading.textContent = String(value ?? 0);
    const copy = document.createElement('p');
    copy.textContent = label;
    article.append(heading, copy);
    return article;
  }

  function metricSkeleton() {
    const article = document.createElement('article');
    article.className = 'learning-card learning-metric-skeleton';
    article.setAttribute('aria-hidden', 'true');
    ['34%', '64%'].forEach((width, index) => {
      const line = document.createElement('span');
      line.className = `learning-skeleton-line${index === 0 ? ' is-title' : ''}`;
      line.style.setProperty('--skeleton-width', width);
      article.appendChild(line);
    });
    return article;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const access = await global.VeriTrustPageAccess;
    if (!access.allowed) return;
    const message = $('#admin-message');
    $('#admin-metrics').replaceChildren(...Array.from({ length: 6 }, metricSkeleton));
    message.hidden = true;
    try {
      const response = await global.VeriTrustLearningApi.adminSummary();
      const data = response.data || {};
      $('#admin-metrics').replaceChildren(
        metric('Active learners', data.active_learners),
        metric('Active enrollments', data.active_enrollments),
        metric('Completed courses', data.completed_enrollments),
        metric('Issued credentials', data.issued_credentials),
        metric('Open assignments', data.open_assignments),
        metric('Completion rate', `${Number(data.completion_rate || 0).toFixed(1)}%`),
      );
      message.hidden = true;
    } catch (error) {
      message.textContent = error.message;
      message.dataset.tone = 'error';
      message.hidden = false;
    } finally {
      document.body.classList.remove('learning-data-loading');
    }
  });
})(window);
