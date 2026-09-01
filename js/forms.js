/* Z Sphere - Authentication & Form Validation Handlers */

document.addEventListener('DOMContentLoaded', function () {
    // Accessible password visibility toggle buttons (UI-30)
    document.querySelectorAll('.password-toggle-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const input = btn.previousElementSibling;
            if (input && input.type === 'password') {
                input.type = 'text';
                btn.textContent = 'Hide';
                btn.setAttribute('aria-label', 'Hide password');
                btn.setAttribute('aria-pressed', 'true');
            } else if (input) {
                input.type = 'password';
                btn.textContent = 'Show';
                btn.setAttribute('aria-label', 'Show password');
                btn.setAttribute('aria-pressed', 'false');
            }
        });
    });

    // Helper functions for field error handling
    function showFieldError(inputEl, msg) {
        const group = inputEl.closest('.form-group');
        if (group) {
            group.classList.add('has-error');
            const errEl = group.querySelector('.form-error');
            inputEl.setAttribute('aria-invalid', 'true');
            if (errEl) {
                if (!errEl.id) errEl.id = `${inputEl.id || 'field'}-error`;
                errEl.textContent = msg;
                const describedBy = new Set((inputEl.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
                describedBy.add(errEl.id);
                inputEl.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
            }
        }
    }

    function clearFieldError(inputEl) {
        const group = inputEl.closest('.form-group');
        if (group) {
            group.classList.remove('has-error');
            const errEl = group.querySelector('.form-error');
            inputEl.removeAttribute('aria-invalid');
            if (errEl) errEl.textContent = '';
        }
    }

    // 1. LOGIN FORM HANDLER
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            let isValid = true;

            const emailInput = document.getElementById('login-email');
            const passwordInput = document.getElementById('login-password');
            const submitBtn = loginForm.querySelector('button[type="submit"]');

            if (!emailInput.value.trim() || !emailInput.validity.valid) {
                showFieldError(emailInput, 'Please enter a valid student email address');
                isValid = false;
            } else {
                clearFieldError(emailInput);
            }

            if (!passwordInput.value || passwordInput.value.length < 6) {
                showFieldError(passwordInput, 'Password must be at least 6 characters');
                isValid = false;
            } else {
                clearFieldError(passwordInput);
            }

            if (!isValid) return;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in...';

            try {
                await window.ZSphereAuth.signIn({
                    email: emailInput.value.trim(),
                    password: passwordInput.value
                });

                window.ZSphereUI.showToast('Signed in successfully!', 'success');

                // Check stored return destination or route to account/admin
                const redirect = sessionStorage.getItem('zsphere_redirect_after_login');
                sessionStorage.removeItem('zsphere_redirect_after_login');

                setTimeout(() => {
                    if (redirect) {
                        window.location.href = redirect;
                    } else if (window.ZSphereAuthState.isAdmin) {
                        window.location.href = 'admin.html';
                    } else {
                        window.location.href = 'account.html';
                    }
                }, 800);

            } catch (err) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign In';
                const friendly = window.ZSphereDataService ? window.ZSphereDataService.mapError(err.message) : err.message;
                showFieldError(passwordInput, friendly);
                window.ZSphereUI.showToast(friendly, 'error');
            }
        });
    }

    // 2. SIGNUP FORM HANDLER
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            let isValid = true;

            const nameInput = document.getElementById('signup-name');
            const emailInput = document.getElementById('signup-email');
            const courseSelect = document.getElementById('signup-course');
            const semSelect = document.getElementById('signup-semester');
            const passInput = document.getElementById('signup-password');
            const confirmInput = document.getElementById('signup-confirm');
            const submitBtn = signupForm.querySelector('button[type="submit"]');

            if (!nameInput.value || nameInput.value.trim().length < 2) {
                showFieldError(nameInput, 'Full name must be at least 2 characters');
                isValid = false;
            } else {
                clearFieldError(nameInput);
            }

            if (!emailInput.value.trim() || !emailInput.validity.valid) {
                showFieldError(emailInput, 'Please enter a valid student email address');
                isValid = false;
            } else {
                clearFieldError(emailInput);
            }

            if (!passInput.value || passInput.value.length < 6) {
                showFieldError(passInput, 'Password must be at least 6 characters');
                isValid = false;
            } else {
                clearFieldError(passInput);
            }

            if (confirmInput.value !== passInput.value) {
                showFieldError(confirmInput, 'Passwords do not match');
                isValid = false;
            } else {
                clearFieldError(confirmInput);
            }

            if (!isValid) return;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Account...';

            try {
                const result = await window.ZSphereAuth.signUp({
                    email: emailInput.value.trim(),
                    password: passInput.value,
                    fullName: nameInput.value.trim(),
                    course: courseSelect ? courseSelect.value : '',
                    semester: semSelect ? semSelect.value : ''
                });

                if (result.needsConfirmation) {
                    const card = signupForm.closest('.auth-card');
                    if (card) {
                        card.innerHTML = `
                            <div class="auth-header">
                                <div class="mb-3 d-flex justify-center" aria-hidden="true">
                                    <div class="avatar-circle avatar-lg avatar-hero flex-center">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                    </div>
                                </div>
                                <h1 class="auth-title">Check Your Email</h1>
                                <p class="auth-subtitle">We sent a confirmation link to <strong>${window.ZSphereApp.escapeHtml(emailInput.value)}</strong>.</p>
                            </div>
                            <p class="text-center text-body mb-4">
                                Confirm your email address to activate your Z Sphere student account, then sign in to complete your profile.
                            </p>
                            <a href="login.html" class="btn btn-primary btn-full">Go to Sign In</a>
                        `;
                    }
                } else {
                    window.ZSphereUI.showToast('Account created successfully!', 'success');
                    setTimeout(() => window.location.href = 'account.html', 1000);
                }

            } catch (err) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Student Account';
                const friendly = window.ZSphereDataService ? window.ZSphereDataService.mapError(err.message) : err.message;
                showFieldError(emailInput, friendly);
                window.ZSphereUI.showToast(friendly, 'error');
            }
        });
    }

    // 3. FORGOT PASSWORD FORM HANDLER
    const forgotForm = document.getElementById('forgot-form');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const emailInput = document.getElementById('forgot-email');
            const submitBtn = forgotForm.querySelector('button[type="submit"]');

            if (!emailInput.value.trim() || !emailInput.validity.valid) {
                showFieldError(emailInput, 'Enter a valid student email address');
                return;
            }
            clearFieldError(emailInput);

            if (window.location.protocol === 'file:') {
                window.ZSphereUI.showToast('Password recovery email links require an HTTP(S) hosted deployment.', 'info');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';

            try {
                await window.ZSphereAuth.requestPasswordReset(emailInput.value.trim());
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Recovery Link';
                window.ZSphereUI.showToast('Password recovery instructions sent to your email.', 'success');
            } catch (err) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Recovery Link';
                const friendly = window.ZSphereDataService ? window.ZSphereDataService.mapError(err.message) : err.message;
                showFieldError(emailInput, friendly);
            }
        });
    }

    // 4. RESET PASSWORD FORM HANDLER
    const resetForm = document.getElementById('reset-form');
    if (resetForm) {
        resetForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const passInput = document.getElementById('reset-pass');
            const confirmInput = document.getElementById('reset-confirm');
            const submitBtn = resetForm.querySelector('button[type="submit"]');

            if (!passInput.value || passInput.value.length < 6) {
                showFieldError(passInput, 'Password must be at least 6 characters');
                return;
            }
            clearFieldError(passInput);

            if (passInput.value !== confirmInput.value) {
                showFieldError(confirmInput, 'Passwords do not match');
                return;
            }
            clearFieldError(confirmInput);

            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating Password...';

            try {
                await window.ZSphereAuth.updatePassword(passInput.value);
                window.ZSphereUI.showToast('Password updated! Redirecting to sign in...', 'success');
                setTimeout(() => window.location.href = 'login.html', 1200);
            } catch (err) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update Password';
                const friendly = window.ZSphereDataService ? window.ZSphereDataService.mapError(err.message) : err.message;
                showFieldError(passInput, friendly);
            }
        });
    }
});
