/* Z Sphere - Central Authentication & Session State Service */

(function () {
    window.ZSphereAuthState = {
        session: null,
        user: null,
        profile: null,
        role: null,
        isAdmin: false,
        initialized: false
    };

    window.ZSphereAuth = {
        initAuth: async function () {
            if (!window.supabaseClient) {
                console.error('Supabase client not ready');
                return;
            }

            try {
                const { data: { session }, error } = await window.supabaseClient.auth.getSession();
                if (error) throw error;

                if (session) {
                    window.ZSphereAuthState.session = session;
                    window.ZSphereAuthState.user = session.user;
                    await this.loadUserProfileAndRole(session.user.id);
                } else {
                    this.clearState();
                }
            } catch (err) {
                console.warn('Auth initialization check failed:', err.message);
                this.clearState();
            } finally {
                window.ZSphereAuthState.initialized = true;
                this.updateHeaderAuthUI();
                document.dispatchEvent(new CustomEvent('zsphere:auth:ready', { detail: window.ZSphereAuthState }));
            }

            // Subscribe to Auth State Changes
            window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
                if (session) {
                    window.ZSphereAuthState.session = session;
                    window.ZSphereAuthState.user = session.user;
                    await this.loadUserProfileAndRole(session.user.id);
                } else {
                    this.clearState();
                }
                window.ZSphereAuthState.initialized = true;
                this.updateHeaderAuthUI();
                document.dispatchEvent(new CustomEvent('zsphere:auth:changed', { detail: { event, state: window.ZSphereAuthState } }));

                // Handle password recovery state automatically
                if (event === 'PASSWORD_RECOVERY') {
                    const isPages = window.location.pathname.includes('/pages/');
                    const target = isPages ? 'reset-password.html' : 'pages/reset-password.html';
                    if (!window.location.pathname.includes('reset-password.html')) {
                        window.location.href = target;
                    }
                }
            });
        },

        loadUserProfileAndRole: async function (userId) {
            if (!window.supabaseClient || !userId) return;

            try {
                // 1. Fetch Profile
                const { data: profile, error: profileErr } = await window.supabaseClient
                    .from('profiles')
                    .select('id, email, full_name, course, semester, avatar_path, created_at, updated_at')
                    .eq('id', userId)
                    .maybeSingle();

                if (profileErr) console.warn('Error fetching profile:', profileErr.message);
                window.ZSphereAuthState.profile = profile || null;

                // 2. Query user_roles to check Admin Role (no row = normal user)
                const { data: roleRow, error: roleErr } = await window.supabaseClient
                    .from('user_roles')
                    .select('role')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (roleErr) console.warn('Error fetching user_roles:', roleErr.message);
                window.ZSphereAuthState.role = roleRow ? roleRow.role : null;
                window.ZSphereAuthState.isAdmin = (roleRow && roleRow.role === 'admin');

            } catch (e) {
                console.error('Failed to load user profile or role:', e);
            }
        },

        clearState: function () {
            window.ZSphereAuthState.session = null;
            window.ZSphereAuthState.user = null;
            window.ZSphereAuthState.profile = null;
            window.ZSphereAuthState.role = null;
            window.ZSphereAuthState.isAdmin = false;
        },

        // Helper to check profile completeness for RPC
        isProfileComplete: function (profile) {
            const p = profile || window.ZSphereAuthState.profile;
            return Boolean(
                p &&
                p.full_name && p.full_name.trim().length >= 2 &&
                p.course && p.course.trim().length >= 1 &&
                p.semester && String(p.semester).trim().length >= 1
            );
        },

        // Email + Password Sign Up
        signUp: async function ({ email, password, fullName, course, semester }) {
            if (!window.supabaseClient) throw new Error('Database client offline');

            const { data, error } = await window.supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName
                    }
                }
            });

            if (error) throw error;

            // If session returned immediately (email confirmation off): update profile course & semester
            if (data.session && data.user) {
                window.ZSphereAuthState.session = data.session;
                window.ZSphereAuthState.user = data.user;

                // Wait briefly for Auth trigger to create profile row, then UPDATE course & semester
                await this.updateProfile({ full_name: fullName, course, semester });
                await this.loadUserProfileAndRole(data.user.id);
                return { user: data.user, session: data.session, needsConfirmation: false };
            }

            // Email confirmation required case
            return { user: data.user, session: null, needsConfirmation: true };
        },

        // Email + Password Sign In
        signIn: async function ({ email, password }) {
            if (!window.supabaseClient) throw new Error('Database client offline');

            const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            window.ZSphereAuthState.session = data.session;
            window.ZSphereAuthState.user = data.user;
            await this.loadUserProfileAndRole(data.user.id);
            this.updateHeaderAuthUI();

            return data;
        },

        // Sign Out
        signOut: async function () {
            if (!window.supabaseClient) return;

            const { error } = await window.supabaseClient.auth.signOut();
            if (error) console.warn('Signout warning:', error.message);

            this.clearState();
            this.updateHeaderAuthUI();

            // Redirect if currently on a protected page
            const path = window.location.pathname;
            if (path.includes('account.html') || path.includes('profile.html') || path.includes('admin')) {
                const isPages = path.includes('/pages/');
                window.location.href = isPages ? '../index2.html' : 'index2.html';
            }
        },

        // Request Password Reset Link
        requestPasswordReset: async function (email) {
            if (!window.supabaseClient) throw new Error('Database client offline');

            const redirectUrl = window.ZSphereConfig.getRedirectUrl('reset-password.html');

            const options = redirectUrl ? { redirectTo: redirectUrl } : {};
            const { data, error } = await window.supabaseClient.auth.resetPasswordForEmail(email, options);

            if (error) throw error;
            return data;
        },

        // Update Password for Recovery Flow
        updatePassword: async function (newPassword) {
            if (!window.supabaseClient) throw new Error('Database client offline');

            const { data, error } = await window.supabaseClient.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;
            return data;
        },

        // Update Profile fields
        updateProfile: async function ({ full_name, course, semester }) {
            const user = window.ZSphereAuthState.user;
            if (!user) throw new Error('Authentication required');

            const payload = { id: user.id }; // Add ID for upsert
            if (user.email) payload.email = user.email; // Add email for upsert
            
            // Convert empty strings to null to pass DB check constraints
            if (full_name !== undefined) payload.full_name = full_name.trim() === '' ? null : full_name;
            if (course !== undefined) payload.course = course.trim() === '' ? null : course;
            
            // Semester can be a string or number. If empty string, pass null.
            if (semester !== undefined) {
                payload.semester = (semester === '' || semester === null) ? null : parseInt(semester, 10);
            }

            const { data, error } = await window.supabaseClient
                .from('profiles')
                .upsert(payload) // Changed from update to upsert to auto-create missing rows
                .select()
                .maybeSingle();

            if (error) throw error;
            window.ZSphereAuthState.profile = data;
            return data;
        },

        // Require Authentication Guard
        requireAuth: function (returnUrl) {
            if (!window.ZSphereAuthState.user) {
                if (returnUrl) {
                    sessionStorage.setItem('zsphere_redirect_after_login', returnUrl);
                }
                const isPages = window.location.pathname.includes('/pages/');
                const loginPath = isPages ? 'login.html' : 'pages/login.html';
                window.location.href = loginPath;
                return false;
            }
            return true;
        },

        // Require Admin Guard
        requireAdmin: function () {
            if (!window.ZSphereAuthState.user || !window.ZSphereAuthState.isAdmin) {
                const isPages = window.location.pathname.includes('/pages/');
                const target = isPages ? 'account.html' : 'pages/account.html';
                window.location.href = target;
                return false;
            }
            return true;
        },

        waitUntilReady: function () {
            return new Promise((resolve) => {
                if (window.ZSphereAuthState.initialized) {
                    resolve();
                } else {
                    document.addEventListener('zsphere:auth:ready', () => {
                        resolve();
                    }, { once: true });
                }
            });
        },

        requireAuthAsync: async function (returnUrl) {
            await this.waitUntilReady();
            return this.requireAuth(returnUrl);
        },

        requireAdminAsync: async function () {
            await this.waitUntilReady();
            return this.requireAdmin();
        },

        // Dynamically Update Site Header Navigation Links
        updateHeaderAuthUI: function () {
            const path = window.location.pathname;
            const isAdminPage = path.includes('admin') || path.includes('admin-');
            const actionsContainers = document.querySelectorAll('.header-actions, .drawer-actions');
            const isPages = path.includes('/pages/');

            actionsContainers.forEach(container => {
                if (!container) return;

                const isDrawer = container.classList.contains('drawer-actions');
                const btnFullClass = isDrawer ? 'btn-full' : '';

                // On Admin pages, keep Return to Website, Admin Profile & Sign Out
                if (isAdminPage && !isDrawer) {
                    const homeLink = isPages ? '../index2.html' : 'index2.html';
                    const email = (window.ZSphereAuthState.user && window.ZSphereAuthState.user.email) ? window.ZSphereAuthState.user.email : 'Administrator';
                    container.innerHTML = `
                        <a href="${homeLink}" class="btn btn-secondary btn-sm return-web-btn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                            <span>Return to Website</span>
                        </a>
                        <span class="admin-sidebar-badge" id="admin-user-email">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(email) : email}</span>
                        <button type="button" data-zsphere-signout class="btn btn-secondary btn-sm">Sign Out</button>
                    `;
                    return;
                }

                if (window.ZSphereAuthState.user) {
                    const accountLink = isPages ? 'account.html' : 'pages/account.html';
                    const adminLink = isPages ? 'admin.html' : 'pages/admin.html';
                    const exploreLink = isPages ? 'sessions.html' : 'pages/sessions.html';

                    let html = `
                        <a href="${exploreLink}" class="btn btn-primary ${isDrawer ? '' : 'btn-sm'} ${btnFullClass}">Explore Sessions</a>
                        <a href="${accountLink}" class="btn btn-secondary ${isDrawer ? '' : 'btn-sm'} ${btnFullClass}">Account</a>
                    `;

                    if (window.ZSphereAuthState.isAdmin) {
                        html += `<a href="${adminLink}" class="btn btn-navy ${isDrawer ? '' : 'btn-sm'} ${btnFullClass}">Admin Panel</a>`;
                    }

                    if (isDrawer) {
                        html += `<button class="btn btn-ghost ${btnFullClass}" data-zsphere-signout>Sign Out</button>`;
                    }

                    container.innerHTML = html;
                } else {
                    const exploreLink = isPages ? 'sessions.html' : 'pages/sessions.html';
                    const loginLink = isPages ? 'login.html' : 'pages/login.html';
                    const isAuthPage = document.body.classList.contains('auth-page');

                    if (isAuthPage) {
                        container.innerHTML = `
                            <a href="${exploreLink}" class="btn btn-secondary ${isDrawer ? '' : 'btn-sm'} ${btnFullClass}">Explore Sessions</a>
                        `;
                    } else {
                        container.innerHTML = `
                            <a href="${exploreLink}" class="btn btn-primary ${isDrawer ? '' : 'btn-sm'} ${btnFullClass}">Explore Sessions</a>
                            <a href="${loginLink}" class="btn btn-secondary ${isDrawer ? '' : 'btn-sm'} ${btnFullClass}">Sign In</a>
                        `;
                    }
                }
            });
        }
    };

    // Centralized sign-out action binding. Keeps markup CSP-friendly and avoids inline handlers.
    document.addEventListener('click', function (event) {
        const signOutButton = event.target.closest('[data-zsphere-signout]');
        if (!signOutButton) return;
        event.preventDefault();
        window.ZSphereAuth.signOut();
    });

    // Auto-init on script load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.ZSphereAuth.initAuth());
    } else {
        window.ZSphereAuth.initAuth();
    }
})();

