document.addEventListener('DOMContentLoaded', async () => {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const forms = document.querySelectorAll('.auth-form');
  const message = document.getElementById('authMessage');
  const params = new URLSearchParams(window.location.search);
  const redirectTarget = window.VeriTrustAuthRouting?.safeReturnPath(params.get('redirect')) || '/dashboard';

  const showMessage = (text, tone = 'info') => {
    if (!message) return;
    message.textContent = text;
    message.dataset.tone = tone;
    message.classList.add('active');
  };

  const setSubmitting = (form, submitting) => {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
    button.disabled = submitting;
    button.textContent = submitting ? 'Please wait...' : button.dataset.defaultLabel;
  };

  const showRecoveryForm = async () => {
    const code = params.get('code');
    document.querySelector('.auth-tabs')?.setAttribute('hidden', '');
    forms.forEach((form) => form.classList.remove('active'));
    const wrapper = document.querySelector('.auth-forms-wrapper');
    if (!wrapper) return;
    wrapper.insertAdjacentHTML('beforeend', `
      <form id="recovery-form" class="auth-form active" aria-labelledby="recovery-title">
        <h2 id="recovery-title">Choose a new password</h2>
        <div class="form-group"><label for="recovery-password">New password</label><input type="password" id="recovery-password" class="form-input" minlength="10" autocomplete="new-password" required></div>
        <div class="form-group"><label for="recovery-confirm">Confirm new password</label><input type="password" id="recovery-confirm" class="form-input" minlength="10" autocomplete="new-password" required></div>
        <button type="submit" class="btn btn-primary">Update password</button>
      </form>`);
    const recoveryForm = document.getElementById('recovery-form');
    try {
      if (!code) throw new Error('Recovery link is invalid or expired.');
      await window.VeriTrustSupabase.exchangeRecovery(code);
      window.history.replaceState({}, '', '/auth?mode=recovery');
      showMessage('Recovery link verified. Choose a new password.', 'success');
    } catch (error) {
      recoveryForm.querySelector('button').disabled = true;
      showMessage(error.message || 'Recovery link is invalid or expired.', 'error');
      return;
    }
    recoveryForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = document.getElementById('recovery-password').value;
      const confirm = document.getElementById('recovery-confirm').value;
      if (password !== confirm) { showMessage('Passwords do not match.', 'error'); return; }
      try {
        setSubmitting(recoveryForm, true);
        await window.VeriTrustSupabase.updatePassword(password);
        showMessage('Password updated. Opening your dashboard...', 'success');
        window.location.assign(redirectTarget);
      } catch (error) {
        showMessage(error.message || 'Unable to update password.', 'error');
      } finally {
        setSubmitting(recoveryForm, false);
      }
    });
  };

  try {
    await window.VeriTrust_CONFIG_READY;
  } catch {
    showMessage('Service configuration unavailable. Retry in a moment.', 'error');
    forms.forEach((form) => form.querySelectorAll('input,button').forEach((control) => { control.disabled = true; }));
    return;
  }

  if (!window.VeriTrustSupabase?.isConfigured()) {
    showMessage('Account access is temporarily unavailable.', 'error');
    return;
  }

  if (params.get('mode') === 'recovery' || params.has('code')) {
    await showRecoveryForm();
    return;
  }

  try {
    const existingSession = await window.VeriTrustSupabase.getSession();
    if (existingSession) {
      window.location.replace(redirectTarget);
      return;
    }
  } catch (error) {
    if (error.status !== 401) showMessage('Account service is temporarily unavailable. You can retry sign in.', 'error');
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((item) => item.classList.remove('active'));
      forms.forEach((form) => form.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.getAttribute('data-target'))?.classList.add('active');
      message?.classList.remove('active');
    });
  });

  forms.forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setSubmitting(form, true);
      try {
        if (form.dataset.authMode === 'signup') {
          const password = document.getElementById('signup-password')?.value || '';
          if (password !== (document.getElementById('signup-confirm')?.value || '')) throw new Error('Passwords do not match.');
          const data = await window.VeriTrustSupabase.signUp({
            fullName: document.getElementById('signup-name')?.value.trim() || '',
            email: document.getElementById('signup-email')?.value.trim() || '',
            password,
            workspaceName: document.getElementById('signup-workspace')?.value.trim() || '',
          });
          if (data.authenticated) {
            showMessage('Account created. Opening your dashboard...', 'success');
            window.location.assign(redirectTarget);
          } else {
            showMessage('Account created. Check your email to verify the account, then sign in.', 'success');
          }
          return;
        }
        await window.VeriTrustSupabase.signIn({
          email: document.getElementById('login-email')?.value.trim() || '',
          password: document.getElementById('login-password')?.value || '',
        });
        showMessage('Signed in. Opening your dashboard...', 'success');
        window.location.assign(redirectTarget);
      } catch (error) {
        showMessage(error.message || 'Authentication failed.', 'error');
      } finally {
        setSubmitting(form, false);
      }
    });
  });

  document.querySelectorAll('[data-auth-provider]').forEach((button) => {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    button.title = 'Not available';
  });

  document.querySelector('[data-auth-action="reset"]')?.addEventListener('click', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email')?.value.trim() || '';
    if (!email) { showMessage('Enter your email address first.', 'info'); return; }
    try {
      await window.VeriTrustSupabase.resetPassword(email);
      showMessage('If the account exists, a password recovery email will arrive shortly.', 'success');
    } catch (error) {
      showMessage(error.retryable ? 'Recovery service is temporarily unavailable. Please retry.' : 'If the account exists, a recovery email will arrive shortly.', error.retryable ? 'error' : 'success');
    }
  });
});
