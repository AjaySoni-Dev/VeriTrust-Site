/* Cerebras Inference Landing Page Interactivity & Form State Handling */
document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('cerebras-auth-form');
    const emailInput = document.getElementById('email-input');
    const submitBtn = document.getElementById('btn-continue-email');
    const errorMsg = document.getElementById('email-error');
    const toast = document.getElementById('cerebras-toast');
    const toastText = document.getElementById('toast-text');
    const googleBtn = document.getElementById('btn-google-auth');
    const githubBtn = document.getElementById('btn-github-auth');

    let toastTimeout = null;

    function showToast(message, duration = 4000) {
        if (!toast || !toastText) return;
        
        toastText.textContent = message;
        toast.classList.add('show');
        
        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }
        
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }

    function validateEmail(email) {
        const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return re.test(String(email).trim().toLowerCase());
    }

    function clearError() {
        if (emailInput) emailInput.classList.remove('has-error');
        if (errorMsg) {
            errorMsg.textContent = '';
            errorMsg.classList.remove('active');
        }
    }

    function setError(message) {
        if (emailInput) emailInput.classList.add('has-error');
        if (errorMsg) {
            errorMsg.textContent = message;
            errorMsg.classList.add('active');
        }
    }

    if (emailInput) {
        emailInput.addEventListener('input', () => {
            clearError();
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearError();

            const email = emailInput ? emailInput.value.trim() : '';

            if (!email) {
                setError('Please enter your email address.');
                emailInput?.focus();
                return;
            }

            if (!validateEmail(email)) {
                setError('Please enter a valid email address.');
                emailInput?.focus();
                return;
            }

            // Set loading state on submit button
            const originalBtnContent = submitBtn.innerHTML;
            submitBtn.classList.add('is-loading');
            submitBtn.innerHTML = '<span class="spinner"></span> <span>PROCESSING...</span>';
            submitBtn.disabled = true;

            try {
                // Check if Supabase client is available for real authentication
                if (window.supabaseClient && window.supabaseClient.auth) {
                    const { error } = await window.supabaseClient.auth.signInWithOtp({
                        email: email,
                        options: {
                            emailRedirectTo: window.location.origin + '/pages/sessions.html'
                        }
                    });

                    if (error) {
                        throw error;
                    }

                    showToast(`Magic link sent! Please check ${email} to sign in.`);
                } else {
                    // Demo / Fallback interactive flow
                    await new Promise(resolve => setTimeout(resolve, 800));
                    showToast(`Welcome! A secure sign-in link has been sent to ${email}.`);
                }
            } catch (err) {
                console.error('Authentication error:', err);
                setError(err.message || 'Unable to continue. Please try again.');
                showToast('Authentication error: ' + (err.message || 'Please try again.'));
            } finally {
                submitBtn.classList.remove('is-loading');
                submitBtn.innerHTML = originalBtnContent;
                submitBtn.disabled = false;
            }
        });
    }

    // Google OAuth Handler
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            if (window.supabaseClient && window.supabaseClient.auth) {
                try {
                    const { error } = await window.supabaseClient.auth.signInWithOAuth({
                        provider: 'google',
                        options: {
                            redirectTo: window.location.origin + '/pages/sessions.html'
                        }
                    });
                    if (error) throw error;
                } catch (err) {
                    showToast('Google Sign-in: ' + (err.message || 'Could not initiate provider.'));
                }
            } else {
                showToast('Redirecting to Google Authentication...');
            }
        });
    }

    // GitHub OAuth Handler
    if (githubBtn) {
        githubBtn.addEventListener('click', async () => {
            if (window.supabaseClient && window.supabaseClient.auth) {
                try {
                    const { error } = await window.supabaseClient.auth.signInWithOAuth({
                        provider: 'github',
                        options: {
                            redirectTo: window.location.origin + '/pages/sessions.html'
                        }
                    });
                    if (error) throw error;
                } catch (err) {
                    showToast('GitHub Sign-in: ' + (err.message || 'Could not initiate provider.'));
                }
            } else {
                showToast('Redirecting to GitHub Authentication...');
            }
        });
    }
});
