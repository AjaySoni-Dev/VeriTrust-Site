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

  function showMessage(message, text, tone) {
    message.hidden = false;
    message.textContent = text;
    message.dataset.tone = tone;
  }

  function setCompleted(button) {
    button.disabled = true;
    button.textContent = 'Completed';
    button.classList.add('is-complete');
    button.setAttribute('aria-label', 'Lesson completed');
  }

  function renderLessonSkeleton(layout, message) {
    layout.hidden = false;
    layout.classList.add('is-loading');
    message.hidden = true;
    const blocks = $('#lesson-blocks');
    const fragment = document.createDocumentFragment();
    [1, 2].forEach(() => {
      const section = document.createElement('section');
      section.className = 'lesson-block learning-block-skeleton';
      section.setAttribute('aria-hidden', 'true');
      ['42%', '92%', '76%', '64%'].forEach((width, index) => {
        const line = document.createElement('span');
        line.className = `learning-skeleton-line${index === 0 ? ' is-title' : ''}`;
        line.style.setProperty('--skeleton-width', width);
        section.appendChild(line);
      });
      fragment.appendChild(section);
    });
    blocks.replaceChildren(fragment);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const access = await global.VeriTrustPageAccess;
    if (!access.allowed) return;
    const message = $('#lesson-message');
    const layout = $('#lesson-layout');
    const completeButton = $('#lesson-complete');
    renderLessonSkeleton(layout, message);
    try {
      const enrollmentResponse = await api.enrollment(enrollmentId);
      const modules = enrollmentResponse.data?.learning_course_versions?.learning_modules || [];
      const matched = modules.flatMap((item) => item.learning_lessons || []).find((item) => item.slug === lessonSlug);
      if (!matched) throw new Error('This lesson is not part of the selected enrollment.');
      const savedProgress = (enrollmentResponse.data?.lesson_progress || [])
        .find((item) => item.lesson_id === matched.id);
      const alreadyCompleted = ['complete', 'completed', 'passed'].includes(String(savedProgress?.status || '').toLowerCase())
        || Number(savedProgress?.progress_percent || 0) >= 100
        || Boolean(savedProgress?.completed_at);
      const response = await api.lesson(matched.id, enrollmentId);
      lesson = response.data.lesson;
      $('#lesson-title').textContent = lesson.title;
      $('#lesson-summary').textContent = lesson.summary || '';
      $('#lesson-duration').textContent = `${lesson.estimated_minutes || 0} min`;
      $('#lesson-blocks').replaceChildren(...(lesson.learning_lesson_blocks || []).map(blockNode));
      layout.classList.remove('is-loading');
      layout.hidden = false;
      message.hidden = true;
      if (alreadyCompleted) {
        setCompleted(completeButton);
      } else {
        try {
          await record('lesson_started');
        } catch (error) {
          showMessage(
            message,
            error?.code === 'LEARNING_PROGRESS_SCHEMA_REQUIRED'
              ? 'Lesson loaded, but progress tracking is not configured yet. Apply the learning progress migration before marking lessons complete.'
              : 'Lesson loaded, but progress could not be synchronized. You can continue reading and try again shortly.',
            'warning',
          );
        }
      }
    } catch (error) {
      $('#lesson-title').textContent = 'Lesson unavailable';
      $('#lesson-summary').textContent = 'The requested lesson could not be loaded.';
      layout.hidden = true;
      showMessage(message, error.message, 'error');
    } finally {
      document.body.classList.remove('learning-data-loading');
    }
    $('#lesson-complete')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        await record('lesson_completed');
        setCompleted(button);
        message.hidden = true;
      } catch (error) {
        showMessage(
          message,
          error?.code === 'LEARNING_PROGRESS_SCHEMA_REQUIRED'
            ? 'Completion could not be saved because progress tracking is not configured yet. Apply the learning progress migration, then try again.'
            : error.message,
          'error',
        );
        button.disabled = false;
        button.textContent = 'Mark complete';
      }
    });
  });
})(window);
