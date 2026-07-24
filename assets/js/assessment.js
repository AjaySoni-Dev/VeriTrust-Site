(function initAssessmentPage(global) {
  'use strict';

  const api = global.VeriTrustLearningApi;
  const $ = (selector) => document.querySelector(selector);
  const assessmentId = decodeURIComponent(global.location.pathname.match(/\/assessments\/([^/]+)/i)?.[1] || '');
  const params = new URLSearchParams(global.location.search);
  let attempt = null;
  let timerId = null;

  function message(value, tone = '') {
    const node = $('#assessment-message');
    node.hidden = !value;
    node.dataset.tone = tone;
    node.textContent = value || '';
  }

  function renderQuestion(item, number) {
    const section = document.createElement('section');
    section.className = 'assessment-question';
    const revision = item.learning_question_revisions || {};
    const heading = document.createElement('h2');
    heading.textContent = `${number}. ${revision.prompt || 'Question'}`;
    const existing = item.learning_responses?.[0]?.answer || {};
    const schema = revision.answer_schema && typeof revision.answer_schema === 'object' ? revision.answer_schema : {};
    const save = async (control, answer) => {
      control.disabled = true;
      try {
        await api.saveResponse(attempt.id, item.id, answer);
      } catch (error) {
        message(error.message, 'error');
      } finally {
        control.disabled = false;
      }
    };
    section.appendChild(heading);
    if (revision.question_type === 'single_choice' && Array.isArray(schema.options)) {
      const choices = document.createElement('div');
      choices.className = 'assessment-options';
      schema.options.forEach((option, optionIndex) => {
        const value = String(option.value ?? optionIndex);
        const label = document.createElement('label');
        label.className = 'assessment-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `question-${item.id}`;
        input.value = value;
        input.checked = existing.value === value;
        input.addEventListener('change', () => save(input, { value }));
        const copy = document.createElement('span');
        copy.textContent = String(option.label ?? option.text ?? value);
        label.append(input, copy);
        choices.appendChild(label);
      });
      section.appendChild(choices);
    } else {
      const input = document.createElement('textarea');
      input.className = 'assessment-answer';
      input.rows = 4;
      input.maxLength = 4000;
      input.placeholder = 'Enter your answer';
      input.value = existing.text || '';
      input.addEventListener('change', () => save(input, { text: input.value.trim() }));
      section.appendChild(input);
    }
    return section;
  }

  function startTimer(expiresAt) {
    const timer = $('#assessment-timer');
    const update = () => {
      const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      const seconds = Math.floor(remaining / 1000);
      timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} remaining`;
      if (!remaining) {
        clearInterval(timerId);
        $('#assessment-submit').disabled = true;
        message('The server-enforced assessment window has ended.', 'error');
      }
    };
    update();
    timerId = global.setInterval(update, 1000);
  }

  async function load() {
    const attemptId = params.get('attempt');
    const response = attemptId ? await api.attempt(attemptId) : await api.startAttempt(assessmentId);
    attempt = response.data;
    if (!attempt?.learning_attempt_items) {
      const refreshed = await api.attempt(attempt.id);
      attempt = refreshed.data;
    }
    $('#assessment-title').textContent = attempt.learning_assessment_versions?.title || 'Assessment';
    $('#assessment-questions').replaceChildren(...(attempt.learning_attempt_items || []).map(renderQuestion));
    if (!attemptId) global.history.replaceState({}, '', `${global.location.pathname}?attempt=${encodeURIComponent(attempt.id)}`);
    if (attempt.status === 'in_progress') startTimer(attempt.expires_at);
    else message(`This attempt is ${attempt.status}.`);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const access = await global.VeriTrustPageAccess;
    if (!access.allowed) return;
    try {
      await load();
      message('');
    } catch (error) {
      $('#assessment-title').textContent = 'Assessment unavailable';
      message(error.message, 'error');
    }
    $('#assessment-submit')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Submitting…';
      try {
        const response = await api.submitAttempt(attempt.id);
        clearInterval(timerId);
        const result = response.data || {};
        message(`${result.passed ? 'Passed' : 'Submitted'} — ${Number(result.score_percent || 0).toFixed(0)}%.`);
        button.textContent = 'Submitted';
      } catch (error) {
        message(error.message, 'error');
        button.disabled = false;
        button.textContent = 'Submit assessment';
      }
    });
  });
})(window);
