/* Z Sphere - Student Account, Profile & Registered Sessions Controller */

document.addEventListener('DOMContentLoaded', async function () {
    // 1. Guard protected account pages
    if (window.ZSphereAuth) {
        const isAuth = await window.ZSphereAuth.requireAuthAsync();
        if (!isAuth) return;
    }

    // Helper to update sidebar user info
    function populateSidebarUser() {
        const profile = window.ZSphereAuthState ? window.ZSphereAuthState.profile : null;
        const user = window.ZSphereAuthState ? window.ZSphereAuthState.user : null;

        const nameEls = document.querySelectorAll('.account-user-name');
        const emailEls = document.querySelectorAll('.account-user-email');
        const avatarEls = document.querySelectorAll('.account-user-avatar');

        const fullName = (profile && profile.full_name) || (user && user.user_metadata && user.user_metadata.full_name) || 'Student User';
        const email = (user && user.email) || (profile && profile.email) || '';
        const initials = fullName ? fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'SU';

        const avatarPath = (profile && profile.avatar_path) || (user && user.user_metadata && user.user_metadata.avatar_path);
        const avatarUrl = avatarPath ? window.ZSphereDataService.getPublicMediaUrl(avatarPath) : (user && user.user_metadata && user.user_metadata.avatar_url);

        nameEls.forEach(el => el.textContent = fullName);
        emailEls.forEach(el => el.textContent = email);

        avatarEls.forEach(el => {
            if (avatarUrl) {
                el.innerHTML = `<img src="${avatarUrl}" alt="${window.ZSphereApp.escapeHtml(fullName)}" class="account-user-avatar-img" data-fallback-text="${initials}">`;
            } else {
                el.textContent = initials;
            }
        });
    }

    // 2. Profile Editing Form (profile.html)
    const profileForm = document.getElementById('profile-edit-form');
    if (profileForm) {
        const nameInput = document.getElementById('profile-name');
        const emailInput = document.getElementById('profile-email');
        const courseInput = document.getElementById('profile-course');
        const semInput = document.getElementById('profile-semester');
        const photoInput = document.getElementById('profile-photo-input');
        const photoPreview = document.getElementById('profile-avatar-preview');
        const photoRemoveBtn = document.getElementById('profile-photo-remove-btn');
        let selectedPhotoFile = null;
        let removePhotoRequested = false;

        async function loadProfileForm() {
            populateSidebarUser();
            const profile = window.ZSphereAuthState ? window.ZSphereAuthState.profile : null;
            const user = window.ZSphereAuthState ? window.ZSphereAuthState.user : null;

            if (nameInput) nameInput.value = (profile && profile.full_name) || (user && user.user_metadata && user.user_metadata.full_name) || '';
            if (emailInput) emailInput.value = (user && user.email) || (profile && profile.email) || '';
            if (courseInput) courseInput.value = (profile && profile.course) || '';
            if (semInput) semInput.value = (profile && profile.semester) || '';

            const avatarPath = (profile && profile.avatar_path) || (user && user.user_metadata && user.user_metadata.avatar_path);
            const avatarUrl = avatarPath ? window.ZSphereDataService.getPublicMediaUrl(avatarPath) : (user && user.user_metadata && user.user_metadata.avatar_url);

            if (photoRemoveBtn) {
                photoRemoveBtn.style.display = avatarUrl ? 'inline-block' : 'none';
            }
        }

        // Live file selection & client-side auto-resizing preview
        if (photoInput && photoPreview) {
            photoInput.addEventListener('change', async function () {
                const file = photoInput.files && photoInput.files[0];
                if (!file) return;

                try {
                    window.ZSphereUI.showToast('Optimizing photo resolution (400×400)...', 'info');
                    const resized = await window.ZSphereApp.resizeImage(file, { size: 400, quality: 0.88 });
                    selectedPhotoFile = resized.file;
                    removePhotoRequested = false;

                    photoPreview.innerHTML = `<img src="${resized.dataUrl}" alt="Avatar Preview" class="account-user-avatar-img">`;
                    if (photoRemoveBtn) photoRemoveBtn.style.display = 'inline-block';
                    window.ZSphereUI.showToast('Photo resized & ready to save!', 'success');
                } catch (err) {
                    console.error('Image preview error:', err);
                    window.ZSphereUI.showToast('Could not process photo: ' + err.message, 'error');
                }
            });
        }

        if (photoRemoveBtn) {
            photoRemoveBtn.addEventListener('click', function () {
                selectedPhotoFile = null;
                removePhotoRequested = true;
                if (photoInput) photoInput.value = '';
                const fullName = nameInput ? nameInput.value : 'Student';
                const initials = fullName ? fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'SU';
                if (photoPreview) photoPreview.textContent = initials;
                photoRemoveBtn.style.display = 'none';
                window.ZSphereUI.showToast('Photo marked for removal. Click Save Changes to apply.', 'info');
            });
        }

        profileForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const submitBtn = profileForm.querySelector('button[type="submit"]');

            if (!nameInput.value || nameInput.value.trim().length < 2) {
                window.ZSphereUI.showToast('Full name must be at least 2 characters', 'warning');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving Changes...';

            try {
                // If a photo was selected, upload it
                if (selectedPhotoFile) {
                    submitBtn.textContent = 'Uploading Photo...';
                    await window.ZSphereDataService.uploadAvatar(selectedPhotoFile);
                } else if (removePhotoRequested) {
                    const user = window.ZSphereAuthState ? window.ZSphereAuthState.user : null;
                    if (user && window.supabaseClient) {
                        await window.supabaseClient.from('profiles').update({ avatar_path: null, updated_at: new Date().toISOString() }).eq('id', user.id);
                        if (window.ZSphereAuthState.profile) window.ZSphereAuthState.profile.avatar_path = null;
                    }
                }

                submitBtn.textContent = 'Saving Profile...';
                await window.ZSphereAuth.updateProfile({
                    full_name: nameInput.value.trim(),
                    course: courseInput.value ? courseInput.value.trim() : '',
                    semester: semInput.value ? semInput.value.trim() : ''
                });

                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Profile Changes';
                window.ZSphereUI.showToast('Profile & photo updated successfully!', 'success');
                selectedPhotoFile = null;
                removePhotoRequested = false;
                populateSidebarUser();
                loadProfileForm();
            } catch (err) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Profile Changes';
                const msg = window.ZSphereDataService ? window.ZSphereDataService.mapError(err.message) : err.message;
                window.ZSphereUI.showToast(msg, 'error');
            }
        });

        loadProfileForm();
    }

    // 3. My Registered Sessions (my-sessions.html)
    const mySessionsContainer = document.getElementById('my-sessions-container');
    const mySessionTabs = document.querySelectorAll('.my-sessions-tab');

    if (mySessionsContainer) {
        populateSidebarUser();
        let currentTab = 'upcoming';
        let userRegistrations = [];

        async function loadMySessions() {
            mySessionsContainer.innerHTML = `
                <div class="text-center py-5">
                    <p class="text-muted text-sm">Loading your registered sessions...</p>
                </div>
            `;

            try {
                userRegistrations = await window.ZSphereDataService.getUserRegistrations();
                renderMySessions();
            } catch (err) {
                console.error('Error loading my sessions:', err);
                mySessionsContainer.innerHTML = `
                    <div class="empty-state py-4 text-center">
                        <p class="text-danger mb-0">Failed to load sessions: ${window.ZSphereApp.escapeHtml(err.message)}</p>
                    </div>
                `;
            }
        }

        function renderMySessions() {
            const now = new Date();

            const filtered = userRegistrations.filter(r => {
                const evt = r.events || {};
                const isCancelled = r.status === 'cancelled';
                const isCompleted = evt.status === 'completed' || (evt.end_at && new Date(evt.end_at) < now);

                if (currentTab === 'cancelled') {
                    return isCancelled;
                }
                if (isCancelled) return false;

                if (currentTab === 'completed') {
                    return isCompleted || r.status === 'attended';
                }
                if (currentTab === 'upcoming') {
                    return !isCompleted && r.status === 'registered';
                }
                return true;
            });

            if (filtered.length === 0) {
                let tabLabel = 'upcoming';
                if (currentTab === 'completed') tabLabel = 'completed';
                if (currentTab === 'cancelled') tabLabel = 'cancelled';

                mySessionsContainer.innerHTML = `
                    <div class="empty-state py-5 text-center bg-surface-1 rounded border border-border-subtle p-4">
                        <div class="empty-state-icon mb-3" aria-hidden="true" style="font-size: 2rem;">📅</div>
                        <h3 class="font-semibold text-lg mb-1">No ${tabLabel} sessions</h3>
                        <p class="text-muted text-sm max-w-sm mx-auto mb-4">
                            ${currentTab === 'upcoming' 
                                ? 'You have not registered for any upcoming sessions yet. Explore our open workshops to reserve your seat!' 
                                : `You do not have any ${tabLabel} workshop sessions.`}
                        </p>
                        ${currentTab === 'upcoming' ? '<a href="sessions.html" class="btn btn-primary btn-sm">Explore Open Sessions</a>' : ''}
                    </div>
                `;
                return;
            }

            mySessionsContainer.innerHTML = `
                <div class="sessions-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
                    ${filtered.map(r => {
                        const evt = r.events || {};
                        const fallbackCover = window.ZSphereApp.getDefaultBanner(evt);
                        const coverUrl = evt.cover_path ? window.ZSphereDataService.getPublicMediaUrl(evt.cover_path) : fallbackCover;
                        const dateDisplay = evt.start_at ? window.ZSphereApp.formatDate(evt.start_at) : 'TBA';
                        const isOnline = evt.venue && (evt.venue.toLowerCase().includes('online') || evt.venue.toLowerCase().includes('meet'));
                        const isCompleted = evt.status === 'completed' || (evt.end_at && new Date(evt.end_at) < now);
                        const isCancelled = r.status === 'cancelled';

                        let badgeClass = 'badge-open';
                        let statusText = 'REGISTERED';
                        if (isCancelled) {
                            badgeClass = 'badge-warning';
                            statusText = 'CANCELLED';
                        } else if (r.status === 'attended' || isCompleted) {
                            badgeClass = 'badge-completed';
                            statusText = r.status === 'attended' ? 'ATTENDED' : 'COMPLETED';
                        }

                        return `
                            <div class="session-card ${isCompleted || isCancelled ? 'session-card-completed' : ''}" style="background: var(--color-surface, #ffffff); border: 1px solid var(--color-border-subtle, #e5e7eb); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column;">
                                <div class="session-card-cover-wrap" style="position: relative; height: 160px; overflow: hidden;">
                                    <img src="${coverUrl}" alt="${window.ZSphereApp.escapeHtml(evt.title || 'Session')}" style="width: 100%; height: 100%; object-fit: cover;">
                                    <div style="position: absolute; top: 12px; right: 12px;">
                                        <span class="badge ${badgeClass}">${statusText}</span>
                                    </div>
                                    <div style="position: absolute; bottom: 12px; left: 12px;">
                                        <span class="badge ${isOnline ? 'badge-online' : 'badge-in-person'}">${isOnline ? 'ONLINE' : 'IN-PERSON'}</span>
                                    </div>
                                </div>
                                <div class="session-card-body" style="padding: 1.25rem; display: flex; flex-direction: column; flex: 1;">
                                    <div class="text-xs text-muted font-semibold mb-1">${window.ZSphereApp.escapeHtml(evt.category || 'Workshop')}</div>
                                    <h3 class="session-card-title mb-2 font-bold text-base" style="line-height: 1.35;">
                                        <a href="event.html?slug=${encodeURIComponent(evt.slug || evt.id)}" class="text-navy hover:text-blue-600">${window.ZSphereApp.escapeHtml(evt.title || 'Workshop Session')}</a>
                                    </h3>
                                    <div class="session-meta text-xs text-muted mb-3">
                                        <div class="d-flex items-center gap-1 mb-1">
                                            <span>📅 ${dateDisplay}</span>
                                        </div>
                                        <div class="d-flex items-center gap-1">
                                            <span>📍 ${window.ZSphereApp.escapeHtml(evt.venue || 'Campus')}</span>
                                        </div>
                                    </div>
                                    <div class="session-card-footer mt-auto pt-3 border-t border-border-subtle d-flex gap-2 flex-wrap">
                                        <a href="event.html?slug=${encodeURIComponent(evt.slug || evt.id)}" class="btn btn-secondary btn-sm flex-1 text-center">Session Details</a>
                                        ${!isCompleted && !isCancelled && evt.whatsapp_group_url ? `
                                            <a href="${window.ZSphereApp.sanitizeUrl(evt.whatsapp_group_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Join WhatsApp Group">WhatsApp</a>
                                        ` : ''}
                                        ${!isCompleted && !isCancelled ? `
                                            <button type="button" class="btn btn-secondary btn-sm cancel-my-reg-btn" data-id="${evt.id}" data-title="${window.ZSphereApp.escapeHtml(evt.title || 'Session')}" title="Cancel Registration">Cancel</button>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            // Attach cancel registration listeners
            document.querySelectorAll('.cancel-my-reg-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    const eventId = btn.getAttribute('data-id');
                    const title = btn.getAttribute('data-title');

                    window.ZSphereUI.showModal({
                        title: 'Cancel Registration',
                        body: `<p>Are you sure you want to cancel your seat registration for <strong>${title}</strong>?</p>`,
                        confirmText: 'Yes, Cancel Seat',
                        onConfirm: async function () {
                            try {
                                await window.ZSphereDataService.cancelRegistration(eventId);
                                window.ZSphereUI.showToast('Registration cancelled successfully.', 'info');
                                loadMySessions();
                            } catch (err) {
                                window.ZSphereUI.showToast(err.message, 'error');
                            }
                        }
                    });
                });
            });
        }

        // Tab click listeners
        mySessionTabs.forEach(tab => {
            tab.addEventListener('click', function () {
                mySessionTabs.forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                currentTab = tab.getAttribute('data-tab') || 'upcoming';
                renderMySessions();
            });
        });

        loadMySessions();
    }

    // 4. Account Overview Page Command Center (account.html)
    if (window.location.pathname.includes('account.html')) {
        populateSidebarUser();
        const profile = window.ZSphereAuthState ? window.ZSphereAuthState.profile : null;
        const bannerContainer = document.getElementById('account-profile-banner');
        const overviewSessionsContainer = document.getElementById('account-overview-sessions-container');
        const overviewAnnouncementsContainer = document.getElementById('account-overview-announcements-container');

        if (bannerContainer) {
            const isComplete = window.ZSphereAuth.isProfileComplete(profile);
            if (!isComplete) {
                bannerContainer.classList.add('warning');
                bannerContainer.innerHTML = `
                    <span class="banner-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    </span>
                    <div style="flex: 1;">
                        <strong style="color: #92400e; font-size: 0.96rem; display: block; margin-bottom: 2px;">Profile Incomplete</strong>
                        <div class="text-xs mb-2" style="color: #78350f; line-height: 1.45;">Please complete your academic details (Course and Semester) to help us personalize your workshop experience.</div>
                        <a href="profile.html" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">
                            <span>Complete Profile Now</span>
                            <span aria-hidden="true">&rarr;</span>
                        </a>
                    </div>
                `;
            } else {
                bannerContainer.classList.remove('warning');
                bannerContainer.innerHTML = `
                    <span class="banner-icon" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </span>
                    <div>
                        <strong style="color: #065f46; font-size: 0.95rem;">Profile Complete</strong>
                        <div class="text-xs" style="color: #047857;">Your student profile is active and verified for workshop registrations.</div>
                    </div>
                `;
            }
        }

        // Render Overview Registered Sessions
        if (overviewSessionsContainer) {
            async function loadOverviewSessions() {
                try {
                    const registrations = await window.ZSphereDataService.getUserRegistrations();
                    const now = new Date();

                    const activeUpcoming = (registrations || []).filter(r => {
                        const evt = r.events || {};
                        const isCancelled = r.status === 'cancelled';
                        const isCompleted = evt.status === 'completed' || (evt.end_at && new Date(evt.end_at) < now);
                        return !isCancelled && !isCompleted && r.status === 'registered';
                    });

                    if (activeUpcoming.length === 0) {
                        overviewSessionsContainer.innerHTML = `
                            <div class="empty-state py-4 text-center">
                                <p class="text-muted text-sm mb-3">You don't have any upcoming session reservations right now.</p>
                                <a href="sessions.html" class="btn btn-primary btn-sm">Explore Open Workshops &rarr;</a>
                            </div>
                        `;
                    } else {
                        overviewSessionsContainer.innerHTML = `
                            <div class="overview-sessions-list" style="display: flex; flex-direction: column; gap: 12px;">
                                ${activeUpcoming.slice(0, 3).map(r => {
                                    const evt = r.events || {};
                                    const dateDisplay = evt.start_at ? window.ZSphereApp.formatDate(evt.start_at) : 'TBA';
                                    const isOnline = evt.venue && (evt.venue.toLowerCase().includes('online') || evt.venue.toLowerCase().includes('meet'));
                                    
                                    return `
                                        <div class="overview-session-row p-3 rounded border border-border-subtle bg-surface-1 d-flex justify-between items-center flex-wrap gap-3" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                                            <div>
                                                <div class="d-flex items-center gap-2 mb-1">
                                                    <span class="badge ${isOnline ? 'badge-online' : 'badge-in-person'}">${isOnline ? 'ONLINE' : 'IN-PERSON'}</span>
                                                    <span class="badge badge-open">CONFIRMED SEAT</span>
                                                    <span class="tag text-xs">${window.ZSphereApp.escapeHtml(evt.category || 'Workshop')}</span>
                                                </div>
                                                <h3 class="font-bold text-sm text-navy mb-1" style="font-size: 0.96rem;">
                                                    <a href="event.html?slug=${encodeURIComponent(evt.slug || evt.id)}" class="text-navy hover:text-blue-600">${window.ZSphereApp.escapeHtml(evt.title || 'Technical Session')}</a>
                                                </h3>
                                                <div class="text-xs text-muted d-flex items-center gap-3">
                                                    <span>📅 ${dateDisplay}</span>
                                                    <span>📍 ${window.ZSphereApp.escapeHtml(evt.venue || 'Campus')}</span>
                                                </div>
                                            </div>
                                            <div class="d-flex gap-2">
                                                <a href="event.html?slug=${encodeURIComponent(evt.slug || evt.id)}" class="btn btn-secondary btn-sm">Session Pass</a>
                                                ${evt.whatsapp_group_url ? `<a href="${window.ZSphereApp.sanitizeUrl(evt.whatsapp_group_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Join WhatsApp">WhatsApp</a>` : ''}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        `;
                    }
                } catch (e) {
                    console.warn('Overview sessions load error:', e);
                    overviewSessionsContainer.innerHTML = '<p class="text-muted text-sm">Could not load session passes.</p>';
                }
            }
            loadOverviewSessions();
        }

        // Render Overview Announcements
        if (overviewAnnouncementsContainer) {
            async function loadOverviewAnnouncements() {
                try {
                    const announcements = await window.ZSphereDataService.getAnnouncements();
                    if (announcements && announcements.length > 0) {
                        overviewAnnouncementsContainer.innerHTML = announcements.slice(0, 3).map((ann, idx) => {
                            const dateStr = ann.published_at ? window.ZSphereApp.formatDate(ann.published_at) : 'Recent';
                            const isLast = idx === Math.min(announcements.length, 3) - 1;
                            return `
                                <div class="notice-item ${isLast ? 'no-border' : ''}">
                                    <strong class="notice-title text-navy">${window.ZSphereApp.escapeHtml(ann.title)}</strong>
                                    <span class="text-muted text-xs">${dateStr}</span>
                                </div>
                            `;
                        }).join('');
                    }
                } catch (e) {
                    console.warn('Overview announcements load error:', e);
                }
            }
            loadOverviewAnnouncements();
        }
    }
});
