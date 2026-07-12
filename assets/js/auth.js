document.addEventListener('DOMContentLoaded', async () => {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const forms = document.querySelectorAll('.auth-form');
  const message = document.getElementById('authMessage');
  const params = new URLSearchParams(window.location.search);
  const redirectTarget = params.get('redirect') || 'dashboard.html';

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

  if (!window.VeriTrustSupabase?.isConfigured()) {
    showMessage('Account access is temporarily unavailable.', 'error');
    return;
  }

  const existingSession = await window.VeriTrustSupabase.getSession();
  if (existingSession) {
    window.location.replace(redirectTarget);
    return;
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((item) => item.classList.remove('active'));
      forms.forEach((form) => form.classList.remove('active'));
      btn.classList.add('active');

      const targetId = btn.getAttribute('data-target');
      const targetForm = document.getElementById(targetId);
      if (targetForm) targetForm.classList.add('active');
      if (message) message.classList.remove('active');
    });
  });

  forms.forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setSubmitting(form, true);

      try {
        if (form.dataset.authMode === 'signup') {
          const password = document.getElementById('signup-password')?.value || '';
          const confirm = document.getElementById('signup-confirm')?.value || '';
          if (password !== confirm) {
            throw new Error('Passwords do not match.');
          }

          const data = await window.VeriTrustSupabase.signUp({
            fullName: document.getElementById('signup-name')?.value.trim() || '',
            email: document.getElementById('signup-email')?.value.trim() || '',
            password,
            workspaceName: document.getElementById('signup-workspace')?.value.trim() || '',
          });

          if (data?.access_token) {
            showMessage('Account created. Opening your dashboard...', 'success');
            window.location.href = redirectTarget;
          } else {
            showMessage('Account created. Check your email to confirm your account, then sign in.', 'success');
          }
          return;
        }

        await window.VeriTrustSupabase.signIn({
          email: document.getElementById('login-email')?.value.trim() || '',
          password: document.getElementById('login-password')?.value || '',
        });
        showMessage('Signed in. Opening your dashboard...', 'success');
        window.location.href = redirectTarget;
      } catch (error) {
        showMessage(error.message || 'Authentication failed.', 'error');
      } finally {
        setSubmitting(form, false);
      }
    });
  });

  document.querySelectorAll('[data-auth-provider]').forEach((button) => {
    button.addEventListener('click', () => {
      showMessage('This sign-in provider is not available yet for this workspace.', 'info');
    });
  });

  document.querySelector('[data-auth-action="reset"]')?.addEventListener('click', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email')?.value.trim() || '';
    if (!email) {
      showMessage('Enter your email address first, then request a password reset.', 'info');
      return;
    }
    try {
      await window.VeriTrustSupabase.resetPassword(email);
      showMessage('Password reset email sent. Check your inbox for the recovery link.', 'success');
    } catch (error) {
      showMessage(error.message || 'Unable to send password reset email.', 'error');
    }
  });
});
