(function initLessonPage(global) {
  'use strict';

  const api = global.VeriTrustLearningApi;
  const $ = (selector) => document.querySelector(selector);
  const lessonSlug = decodeURIComponent(global.location.pathname.match(/\/lessons\/([^/]+)/i)?.[1] || '');
  const params = new URLSearchParams(global.location.search);
  const enrollmentId = params.get('enrollment') || '';
  let lesson = null;

  function blockNode(block) {
    const section = document.createElement('section');
    section.className = `lesson-block${block.block_type === 'callout' ? ' lesson-callout' : ''}`;
    const content = block.content && typeof block.content === 'object' ? block.content : {};
    if (content.heading) {
      const heading = document.createElement('h2');
      heading.textContent = String(content.heading);
      section.appendChild(heading);
    }
    if (block.block_type === 'checklist' && Array.isArray(content.items)) {
      const list = document.createElement('ul');
      list.className = 'lesson-checklist';
      content.items.forEach((value) => {
        const item = document.createElement('li');
        item.textContent = String(value);
        list.appendChild(item);
      });
      section.appendChild(list);
    } else {
      const paragraph = document.createElement('p');
      paragraph.textContent = String(content.text || content.prompt || '');
      section.appendChild(paragraph);
    }
    return section;
  }

  async function record(type) {
    if (!lesson) return;
    await api.recordEvent({
      enrollment_id: enrollmentId,
      lesson_id: lesson.id,
      event_type: type,
      payload: { source: 'web', lesson_slug: lesson.slug },
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const access = await global.VeriTrustPageAccess;
    if (!access.allowed) return;
    const message = $('#lesson-message');
    try {
      const enrollmentResponse = await api.enrollment(enrollmentId);
      const modules = enrollmentResponse.data?.learning_course_versions?.learning_modules || [];
      const matched = modules.flatMap((item) => item.learning_lessons || []).find((item) => item.slug === lessonSlug);
      if (!matched) throw new Error('This lesson is not part of the selected enrollment.');
      const response = await api.lesson(matched.id, enrollmentId);
      lesson = response.data.lesson;
      $('#lesson-title').textContent = lesson.title;
      $('#lesson-summary').textContent = lesson.summary || '';
      $('#lesson-duration').textContent = `${lesson.estimated_minutes || 0} min`;
      $('#lesson-blocks').replaceChildren(...(lesson.learning_lesson_blocks || []).map(blockNode));
      message.hidden = true;
      await record('lesson_started');
    } catch (error) {
      $('#lesson-title').textContent = 'Lesson unavailable';
      message.textContent = error.message;
      message.dataset.tone = 'error';
    }
    $('#lesson-complete')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        await record('lesson_completed');
        button.textContent = 'Completed';
      } catch (error) {
        message.hidden = false;
        message.textContent = error.message;
        message.dataset.tone = 'error';
        button.disabled = false;
        button.textContent = 'Mark complete';
      }
    });
  });
})(window);
