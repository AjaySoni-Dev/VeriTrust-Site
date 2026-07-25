(function initLearningAccessPage(global) {
  'use strict';

  const form = document.getElementById('learning-access-form');
  const input = document.getElementById('learning-access-key');
  const submit = document.getElementById('learning-access-submit');
  const message = document.getElementById('learning-access-message');
  if (!form || !input || !submit || !message) return;

  const requestedNext = new URLSearchParams(global.location.search).get('next') || '/learn';

  function setMessage(value, tone = '') {
    message.textContent = value || '';
    message.dataset.tone = tone;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value) {
      setMessage('Enter the development access key.', 'error');
      input.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Verifyingâ€¦';
    setMessage('Checking preview access.');
    try {
      const response = await fetch('/api/learning-access', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: input.value, next: requestedNext }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error?.message || 'Preview access could not be verified.');
      }
      input.value = '';
      setMessage('Access confirmed. Opening VeriTrust Learning.');
      global.location.assign(payload.redirect || '/learn');
    } catch (error) {
      setMessage(error.message || 'Preview access could not be verified.', 'error');
      submit.disabled = false;
      submit.textContent = 'Unlock learning';
      input.focus();
    }
  });
})(window);
