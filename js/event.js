/* Z Sphere - Event Detail, Lifecycle & Registration Controller */

document.addEventListener('DOMContentLoaded', async function () {
    const detailContainer = document.getElementById('event-detail-container');
    if (!detailContainer || !window.ZSphereDataService) return;

    const slug = window.ZSphereApp.getParam('slug');
    if (!slug) {
        if (window.ZSphereUI) {
            window.ZSphereUI.renderEmptyState(detailContainer, 'No session selected', 'Please select a session from the catalogue to view details.', 'Browse Sessions', 'sessions.html');
        }
        return;
    }

    if (window.ZSphereUI) {
        window.ZSphereUI.renderLoadingSkeleton(detailContainer, 1, 'card');
    }

    // Helper to generate Google Calendar link
    function getGoogleCalendarUrl(evt) {
        if (!evt || !evt.start_at) return '#';
        const title = encodeURIComponent(evt.title || 'Z Sphere Workshop');
        const details = encodeURIComponent((evt.summary || evt.description || '') + '\n\nOrganized by Z Sphere');
        const location = encodeURIComponent(evt.venue || 'Online / Campus');
        
        const startDate = new Date(evt.start_at);
        const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000)); // Default 2h duration
        
        const formatCalDate = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');
        const dates = `${formatCalDate(startDate)}/${formatCalDate(endDate)}`;
        
        return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
    }

    // Helper to download .ics calendar event
    function downloadIcsFile(evt) {
        if (!evt || !evt.start_at) return;
        const startDate = new Date(evt.start_at);
        const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));
        const formatIcs = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Z Sphere//Student Events//EN',
            'BEGIN:VEVENT',
            `UID:zsphere-${evt.id || Date.now()}@zsphere.org`,
            `DTSTAMP:${formatIcs(new Date())}`,
            `DTSTART:${formatIcs(startDate)}`,
            `DTEND:${formatIcs(endDate)}`,
            `SUMMARY:${evt.title || 'Z Sphere Session'}`,
            `DESCRIPTION:${(evt.summary || evt.description || '').replace(/\n/g, '\\n')}`,
            `LOCATION:${evt.venue || 'Campus / Online'}`,
            'STATUS:CONFIRMED',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', `${evt.slug || 'session'}-calendar.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function loadEventPage() {
        try {
            // Public details are intentionally available without authentication. Auth is only
            // consulted to decide whether sensitive registration links may be requested.
            const authReady = (window.ZSphereAuth && typeof window.ZSphereAuth.waitUntilReady === 'function')
                ? window.ZSphereAuth.waitUntilReady()
                : Promise.resolve();

            let evt = await window.ZSphereDataService.getPublicEventBySlug(slug, false);
            await authReady;

            const isSignedIn = Boolean(window.ZSphereAuthState && window.ZSphereAuthState.user);
            if (evt && isSignedIn) {
                const authenticatedEvent = await window.ZSphereDataService.getPublicEventBySlug(slug, true);
                if (authenticatedEvent) evt = authenticatedEvent;
            }

            if (!evt) {
                if (window.ZSphereUI) {
                    window.ZSphereUI.renderEmptyState(detailContainer, 'Session Not Found', 'The session you are looking for does not exist or has been archived.', 'Back to Sessions', 'sessions.html');
                }
                return;
            }

            document.title = `${evt.title} — Z Sphere`;

            const fallbackBanner = window.ZSphereApp.getDefaultBanner(evt);
            const coverUrl = evt.cover_path ? window.ZSphereDataService.getPublicMediaUrl(evt.cover_path) : fallbackBanner;
            const isOnline = evt.venue && (evt.venue.toLowerCase().includes('online') || evt.venue.toLowerCase().includes('meet'));
            const dateDisplay = evt.start_at ? window.ZSphereApp.formatDate(evt.start_at) : 'TBA';

            // Calculate Seats & Availability
            const registeredCount = evt.registered_count || 0;
            const capacity = evt.capacity || 0;
            const seatsLeft = capacity ? capacity - registeredCount : '∞';
            
            let isRegOpen = false;
            if (evt.status === 'published') {
                const now = new Date();
                const opensAt = evt.registration_opens_at ? new Date(evt.registration_opens_at) : null;
                const closesAt = evt.registration_closes_at ? new Date(evt.registration_closes_at) : null;
                if ((!opensAt || opensAt <= now) && (!closesAt || closesAt > now)) {
                    isRegOpen = true;
                }
            }
            
            const pctFilled = capacity ? Math.min(100, Math.round((registeredCount / capacity) * 100)) : 0;
            const fillMeterClass = pctFilled >= 90 ? 'danger' : (pctFilled >= 70 ? 'warning' : '');

            const learningPoints = Array.isArray(evt.learning_points) ? evt.learning_points : [];
            const agenda = Array.isArray(evt.agenda) ? evt.agenda : [];
            const resources = Array.isArray(evt.resources) ? evt.resources : [];

            // Calculate session status and completion
            let isCompleted = evt.status === 'completed';
            if (evt.end_at && new Date(evt.end_at) < new Date()) {
                isCompleted = true;
            }

            // Check if signed-in user is already registered for this session
            const isRegistered = (isSignedIn && evt.id) 
                ? await window.ZSphereDataService.isUserRegisteredForEvent(evt.id) 
                : false;

            // Determine Registration State & Action Buttons
            let regButtonHtml = '';

            if (isCompleted) {
                regButtonHtml = `
                    <button class="btn btn-secondary btn-full btn-disabled-state" disabled aria-disabled="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 6px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                        <span>Session Concluded</span>
                    </button>
                    <p class="text-muted text-xs text-center mt-2 mb-0">This session has been completed and registrations are closed.</p>
                `;
            } else if (isRegistered) {
                regButtonHtml = `
                    <div class="registration-confirmed-box p-3 mb-2" style="background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 12px; text-align: center;">
                        <div class="d-flex items-center justify-center gap-2 font-semibold" style="color: #065f46; font-size: 0.95rem; margin-bottom: 3px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            <span>Registration Confirmed</span>
                        </div>
                        <p class="text-xs mb-0" style="color: #047857;">Your seat is reserved for this session.</p>
                    </div>
                    <button type="button" class="btn btn-secondary btn-full btn-sm mt-2" id="cancel-registration-btn">Cancel Registration</button>
                `;
            } else if (capacity > 0 && seatsLeft <= 0) {
                regButtonHtml = `
                    <button class="btn btn-secondary btn-full btn-disabled-state" disabled aria-disabled="true">Session Full (${capacity}/${capacity} Seats)</button>
                    <p class="text-muted text-xs text-center mt-2 mb-0">All available seats for this session are currently reserved.</p>
                `;
            } else if (!isRegOpen) {
                regButtonHtml = `
                    <button class="btn btn-secondary btn-full btn-disabled-state" disabled aria-disabled="true">Registration Closed</button>
                    <p class="text-muted text-xs text-center mt-2 mb-0">Registrations for this session are currently closed.</p>
                `;
            } else if (!isSignedIn) {
                regButtonHtml = `
                    <a href="login.html" class="btn btn-primary btn-full" data-registration-login>Sign In to Register</a>
                    <p class="text-muted text-xs text-center mt-2 mb-0">An account is required to reserve your seat and access resources.</p>
                `;
            } else {
                regButtonHtml = `
                    <button type="button" class="btn btn-primary btn-full" id="direct-register-btn">Register for this Session</button>
                `;
                if (evt.registration_form_url) {
                    regButtonHtml += `
                        <div class="mt-2">
                            <a href="${window.ZSphereApp.sanitizeUrl(evt.registration_form_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-full btn-sm">Open External Form &nearr;</a>
                        </div>
                    `;
                }
            }

            if (!isCompleted && isSignedIn && evt.whatsapp_group_url) {
                regButtonHtml += `
                    <div class="mt-2">
                        <a href="${window.ZSphereApp.sanitizeUrl(evt.whatsapp_group_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-full">Join WhatsApp Group</a>
                    </div>
                `;
            }
            
            // Only display calendar add actions for upcoming/active sessions (not completed)
            if (!isCompleted) {
                regButtonHtml += `
                    <div class="calendar-action-wrap d-flex gap-2 justify-center flex-wrap mt-3">
                        <a href="${getGoogleCalendarUrl(evt)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm d-inline-flex items-center gap-1">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            <span>Google Calendar</span>
                        </a>
                        <button type="button" class="btn btn-secondary btn-sm d-inline-flex items-center gap-1" id="download-ics-btn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            <span>Download iCal (.ics)</span>
                        </button>
                    </div>
                `;
            }

            // Facilitator identity from team members or conducted_by fallback
            const facilitator = evt.facilitator || null;
            const facilitatorName = (facilitator && facilitator.name) || evt.conducted_by || 'Z Sphere Team Lead';
            const facilitatorRole = (facilitator && (facilitator.role_title || facilitator.role)) || `Workshop Facilitator · ${evt.category || 'Z Sphere Community'}`;
            const facilitatorPhotoUrl = (facilitator && facilitator.photo_path) ? window.ZSphereDataService.getPublicMediaUrl(facilitator.photo_path) : null;
            const facilitatorInitials = facilitatorName ? facilitatorName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ZS';
            const facilitatorBio = (facilitator && facilitator.bio) || 'Lead instructor delivering hands-on technical concepts, architecture design, and interactive engineering sessions.';
            const facilitatorLinkedin = facilitator && (facilitator.linkedin_url || facilitator.linkedin);
            const facilitatorGithub = facilitator && (facilitator.github_url || facilitator.github);

            detailContainer.innerHTML = `
                <nav class="breadcrumb" aria-label="Breadcrumb">
                    <span class="breadcrumb-item"><a href="../index2.html">Home</a></span>
                    <span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item"><a href="sessions.html">Sessions</a></span>
                    <span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item" aria-current="page">${window.ZSphereApp.escapeHtml(evt.title)}</span>
                </nav>

                <div class="event-hero-banner">
                    <img src="${coverUrl}" alt="${window.ZSphereApp.escapeHtml(evt.title)}" class="event-hero-cover" data-fallback-src="${fallbackBanner}">
                </div>

                <div class="event-detail-grid">
                    <div class="event-main-content">
                        <div class="tag-list mb-3">
                            <span class="badge ${isOnline ? 'badge-online' : 'badge-in-person'}">${isOnline ? 'ONLINE' : 'IN-PERSON'}</span>
                            <span class="badge badge-workshop">${(evt.event_type || 'workshop').toUpperCase()}</span>
                            <span class="tag">${window.ZSphereApp.escapeHtml(evt.category || 'General')}</span>
                        </div>

                        <h1 class="page-title mb-3">${window.ZSphereApp.escapeHtml(evt.title)}</h1>

                        <p class="body-text mb-4 text-base">${window.ZSphereApp.escapeHtml(evt.description || evt.summary || '')}</p>

                        ${learningPoints.length > 0 ? `
                            <div class="event-section">
                                <h2 class="event-section-title">What You'll Learn</h2>
                                <ul class="learning-points-list">
                                    ${learningPoints.map(pt => `
                                        <li class="learning-point-item">
                                            <span class="point-check" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
                                            <span>${window.ZSphereApp.escapeHtml(typeof pt === 'string' ? pt : pt.title || '')}</span>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}

                        ${agenda.length > 0 ? `
                            <div class="event-section">
                                <h2 class="event-section-title">Session Agenda & Schedule</h2>
                                <div class="agenda-list">
                                    ${agenda.map(item => `
                                        <div class="agenda-item">
                                            <div class="agenda-time">${window.ZSphereApp.escapeHtml(item.time || item.start || '')}</div>
                                            <div class="agenda-title">${window.ZSphereApp.escapeHtml(item.title || '')}</div>
                                            <div class="agenda-desc">${window.ZSphereApp.escapeHtml(item.desc || item.description || '')}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <div class="event-section">
                            <h2 class="event-section-title">Session Facilitator & Instructor</h2>
                            <div class="card-bordered d-flex items-start gap-4 flex-wrap" style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 22px;">
                                <div class="avatar-circle avatar-lg avatar-hero flex-center flex-shrink-0" style="overflow: hidden; width: 68px; height: 68px; border-radius: 50%; background: linear-gradient(135deg, #fce7f3, #fce7f3); color: #EA4C89; font-weight: 800; font-size: 1.4rem; border: 2px solid #ffffff; box-shadow: 0 4px 14px rgba(234, 76, 137, 0.12);">
                                    ${facilitatorPhotoUrl ? `<img src="${facilitatorPhotoUrl}" alt="${window.ZSphereApp.escapeHtml(facilitatorName)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" data-fallback-text="${facilitatorInitials}">` : facilitatorInitials}
                                </div>
                                <div style="flex: 1; min-width: 220px;">
                                    <div class="d-flex items-center justify-between flex-wrap gap-2 mb-1">
                                        <h3 class="card-title mb-0" style="font-size: 1.15rem; color: #1D1C39;">${window.ZSphereApp.escapeHtml(facilitatorName)}</h3>
                                        <div class="d-flex items-center gap-2">
                                            ${facilitatorLinkedin ? `<a href="${window.ZSphereApp.sanitizeUrl(facilitatorLinkedin)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="padding: 3px 10px; font-size: 0.75rem;">LinkedIn</a>` : ''}
                                            ${facilitatorGithub ? `<a href="${window.ZSphereApp.sanitizeUrl(facilitatorGithub)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="padding: 3px 10px; font-size: 0.75rem;">GitHub</a>` : ''}
                                        </div>
                                    </div>
                                    <div class="text-primary text-sm font-semibold mb-2" style="color: #EA4C89;">${window.ZSphereApp.escapeHtml(facilitatorRole)}</div>
                                    <p class="body-text text-sm mb-0" style="color: #525266; line-height: 1.55;">${window.ZSphereApp.escapeHtml(facilitatorBio)}</p>
                                </div>
                            </div>
                        </div>

                        ${resources.length > 0 ? `
                            <div class="event-section">
                                <h2 class="event-section-title">Workshop Resources & Code Files</h2>
                                <ul class="resources-list">
                                    ${resources.map(res => `
                                        <li>
                                            <a href="${window.ZSphereApp.sanitizeUrl(res.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm d-inline-flex items-center gap-1">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                                <span>${window.ZSphereApp.escapeHtml(res.label || res.title || 'Session Resource Link')}</span>
                                                <span>&rarr;</span>
                                            </a>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}

                        <div id="event-gallery-container"></div>
                    </div>

                    <div class="event-sidebar">
                        <aside class="registration-card" aria-label="Session Registration Overview">
                            <h3 class="card-title mb-3">Session Overview</h3>

                            <div class="reg-card-row">
                                <div>
                                    <strong class="d-block text-navy">Date & Time</strong>
                                    <span class="text-muted text-sm d-inline-flex items-center gap-1">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                        <span>${dateDisplay}</span>
                                    </span>
                                </div>
                            </div>

                            <div class="reg-card-row">
                                <div>
                                    <strong class="d-block text-navy">Venue / Format</strong>
                                    <span class="text-muted text-sm d-inline-flex items-center gap-1">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                        <span>${window.ZSphereApp.escapeHtml(evt.venue || 'TBA')}</span>
                                    </span>
                                </div>
                            </div>

                            <div class="reg-card-row">
                                <div>
                                    <strong class="d-block text-navy">Facilitator</strong>
                                    <span class="text-muted text-sm d-inline-flex items-center gap-2 mt-1">
                                        ${facilitatorPhotoUrl ? `<img src="${facilitatorPhotoUrl}" alt="${window.ZSphereApp.escapeHtml(facilitatorName)}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;">` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                                        <span>${window.ZSphereApp.escapeHtml(facilitatorName)}</span>
                                    </span>
                                </div>
                            </div>

                            <div class="reg-card-row">
                                <div class="w-full">
                                    <div class="seat-meter-header">
                                        <span>Seat Availability</span>
                                        <span>${registeredCount} / ${capacity || '∞'} Seats</span>
                                    </div>
                                    ${capacity > 0 ? `
                                        <div class="seat-meter-bar">
                                            <div class="seat-meter-fill ${fillMeterClass}" style="width: ${pctFilled}%;"></div>
                                        </div>
                                        <span class="text-muted text-xs d-block mt-1">${seatsLeft > 0 ? seatsLeft + ' seats remaining' : 'Fully booked'}</span>
                                    ` : `
                                        <span class="text-muted text-xs">Open registration</span>
                                    `}
                                </div>
                            </div>

                            <div class="mt-4" id="reg-action-area">
                                ${regButtonHtml}
                            </div>
                        </aside>
                    </div>
                </div>
            `;

            // Attach ics download listener
            const icsBtn = document.getElementById('download-ics-btn');
            if (icsBtn) {
                icsBtn.addEventListener('click', () => downloadIcsFile(evt));
            }

            const registrationLogin = detailContainer.querySelector('[data-registration-login]');
            if (registrationLogin) {
                registrationLogin.addEventListener('click', function () {
                    try {
                        sessionStorage.setItem('zsphere_redirect_after_login', `event.html?slug=${encodeURIComponent(slug)}`);
                    } catch (e) {}
                });
            }

            // Direct in-platform registration handler
            const directRegBtn = document.getElementById('direct-register-btn');
            if (directRegBtn) {
                directRegBtn.addEventListener('click', async function () {
                    directRegBtn.disabled = true;
                    directRegBtn.textContent = 'Registering...';

                    try {
                        await window.ZSphereDataService.registerForEvent(evt.id);
                        window.ZSphereUI.showToast('Registration successful! Your seat is reserved.', 'success');
                        loadEventPage();
                    } catch (err) {
                        directRegBtn.disabled = false;
                        directRegBtn.textContent = 'Register for this Session';
                        const msg = window.ZSphereDataService ? window.ZSphereDataService.mapError(err.message) : err.message;
                        window.ZSphereUI.showToast(msg, 'error');
                    }
                });
            }

            // Cancel registration handler
            const cancelRegBtn = document.getElementById('cancel-registration-btn');
            if (cancelRegBtn) {
                cancelRegBtn.addEventListener('click', function () {
                    window.ZSphereUI.showModal({
                        title: 'Cancel Registration',
                        body: `<p>Are you sure you want to cancel your registration for <strong>${window.ZSphereApp.escapeHtml(evt.title)}</strong>? Your reserved seat will be released.</p>`,
                        confirmText: 'Yes, Cancel Registration',
                        onConfirm: async function () {
                            try {
                                await window.ZSphereDataService.cancelRegistration(evt.id);
                                window.ZSphereUI.showToast('Your registration has been cancelled.', 'info');
                                loadEventPage();
                            } catch (err) {
                                const msg = window.ZSphereDataService ? window.ZSphereDataService.mapError(err.message) : err.message;
                                window.ZSphereUI.showToast(msg, 'error');
                            }
                        }
                    });
                });
            }

            // Load associated gallery album if exists
            const galleryContainer = document.getElementById('event-gallery-container');
            if (galleryContainer && evt.id) {
                const album = await window.ZSphereDataService.getGalleryAlbumByEventId(evt.id);
                if (album) {
                    const images = await window.ZSphereDataService.getGalleryImages(album.id);
                    if (images && images.length > 0) {
                        const isPages = window.ZSphereApp ? window.ZSphereApp.isPagesDir() : false;
                        const safeAlbumSlug = encodeURIComponent(album.slug || '');
                        const albumLink = isPages ? `gallery-album.html?album=${safeAlbumSlug}` : `pages/gallery-album.html?album=${safeAlbumSlug}`;
                        const displayImages = images.slice(0, 2);
                        
                        galleryContainer.innerHTML = `
                            <div class="event-section event-album-preview-section mt-5">
                                <div class="mb-3">
                                    <h2 class="event-section-title mb-0">Session Photo Gallery</h2>
                                    <span class="text-muted text-xs">${images.length} photos in album</span>
                                </div>
                                <div class="photo-grid-preview-2">
                                    ${displayImages.map((img) => {
                                        const imgUrl = img.storage_path ? window.ZSphereDataService.getPublicMediaUrl(img.storage_path) : '';
                                        return `
                                            <a href="${albumLink}" class="photo-preview-item" aria-label="View album photos">
                                                ${imgUrl ? `<img src="${imgUrl}" alt="${window.ZSphereApp.escapeHtml(img.alt_text || album.title)}" loading="lazy">` : ''}
                                                <div class="photo-preview-overlay">
                                                    <span class="photo-preview-badge">View in Album</span>
                                                </div>
                                            </a>
                                        `;
                                    }).join('')}
                                </div>
                                <div class="album-action-row text-center mt-3">
                                    <a href="${albumLink}" class="btn btn-secondary btn-full d-flex justify-center items-center gap-2 view-full-album-btn">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                        <span>View Full Album (${images.length} Photos)</span>
                                        <span aria-hidden="true">&rarr;</span>
                                    </a>
                                </div>
                            </div>
                        `;
                    }
                }
            }

        } catch (err) {
            console.error('Error loading event detail:', err);
            if (window.ZSphereUI) {
                window.ZSphereUI.renderErrorState(detailContainer, 'Could not load session details', 'Please check your internet connection and try again.', loadEventPage);
            }
        }
    }

    loadEventPage();
});
