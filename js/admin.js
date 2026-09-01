/* Z Sphere - Admin Dashboard & Supabase CRUD Controller */

document.addEventListener('DOMContentLoaded', async function () {
    if (!window.ZSphereDataService) return;

    // Check if on an admin page before enforcing admin guard
    const path = window.location.pathname;
    if (path.includes('admin') || path.includes('admin-')) {
        const isAdmin = await window.ZSphereAuth.requireAdminAsync();
        if (!isAdmin) return;
    }

    // 1. ADMIN DASHBOARD OVERVIEW (admin.html)
    const statsContainer = document.querySelector('.admin-stats-grid');
    const overviewSessionsContainer = document.getElementById('overview-recent-sessions-container');
    if (path.includes('admin.html') || path.endsWith('/admin') || path.endsWith('/admin/')) {
        try {
            const stats = await window.ZSphereDataService.adminGetDashboardStats();
            if (statsContainer) {
                const statValues = statsContainer.querySelectorAll('.admin-stat-value');
                if (statValues.length >= 4) {
                    statValues[0].textContent = stats.events || '0';
                    statValues[1].textContent = stats.registrations || '0';
                    statValues[2].textContent = stats.announcements || '0';
                    statValues[3].textContent = stats.albums || '0';
                }
            }

            if (overviewSessionsContainer) {
                const events = await window.ZSphereDataService.adminGetEvents();
                if (!events || events.length === 0) {
                    overviewSessionsContainer.innerHTML = '<p class="text-muted text-sm my-2">No sessions scheduled yet. Click <strong>+ Create New Session</strong> above to publish your first workshop.</p>';
                } else {
                    const recentEvents = events.slice(0, 4);
                    overviewSessionsContainer.innerHTML = `
                        <div class="admin-table-wrap">
                            <table class="admin-table">
                                <thead>
                                    <tr>
                                        <th>Session Title</th>
                                        <th>Track</th>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th>Capacity</th>
                                        <th class="text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${recentEvents.map(e => {
                                        const dateDisplay = e.start_at ? window.ZSphereApp.formatDate(e.start_at) : 'TBA';
                                        let displayStatus = e.status || 'draft';
                                        if ((displayStatus === 'published' || displayStatus === 'upcoming') && e.end_at) {
                                            if (new Date(e.end_at) < new Date()) {
                                                displayStatus = 'completed';
                                            }
                                        }
                                        const badgeClass = (displayStatus === 'published' || displayStatus === 'upcoming') ? 'badge-open' : (displayStatus === 'completed' ? 'badge-completed' : 'badge-workshop');
                                        return `
                                            <tr>
                                                <td><strong>${window.ZSphereApp.escapeHtml(e.title)}</strong></td>
                                                <td><span class="tag">${window.ZSphereApp.escapeHtml(e.category || 'General')}</span></td>
                                                <td>${dateDisplay}</td>
                                                <td><span class="badge ${badgeClass}">${displayStatus.toUpperCase()}</span></td>
                                                <td>${e.capacity || '∞'}</td>
                                                <td class="text-right">
                                                    <a href="admin-event-form.html?slug=${encodeURIComponent(e.slug || '')}" class="btn btn-secondary btn-sm">Edit</a>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div class="admin-cards-mobile">
                            ${recentEvents.map(e => {
                                const dateDisplay = e.start_at ? window.ZSphereApp.formatDate(e.start_at) : 'TBA';
                                let displayStatus = e.status || 'draft';
                                if ((displayStatus === 'published' || displayStatus === 'upcoming') && e.end_at) {
                                    if (new Date(e.end_at) < new Date()) {
                                        displayStatus = 'completed';
                                    }
                                }
                                const badgeClass = (displayStatus === 'published' || displayStatus === 'upcoming') ? 'badge-open' : (displayStatus === 'completed' ? 'badge-completed' : 'badge-workshop');
                                return `
                                    <div class="admin-event-card-mobile">
                                        <div class="admin-event-card-mobile-head">
                                            <h3 class="admin-event-card-mobile-title">${window.ZSphereApp.escapeHtml(e.title)}</h3>
                                            <span class="badge ${badgeClass}">${displayStatus.toUpperCase()}</span>
                                        </div>
                                        <div class="admin-event-card-mobile-meta">
                                            <div class="admin-event-card-mobile-meta-item">
                                                <span><strong>Track:</strong> ${window.ZSphereApp.escapeHtml(e.category || 'General')}</span>
                                            </div>
                                            <div class="admin-event-card-mobile-meta-item">
                                                <span><strong>Date:</strong> ${dateDisplay}</span>
                                            </div>
                                        </div>
                                        <div class="admin-event-card-mobile-actions">
                                            <a href="admin-event-form.html?slug=${encodeURIComponent(e.slug || '')}" class="btn btn-secondary btn-sm">Edit Session</a>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }
            }
        } catch (e) {
            console.warn('Dashboard stats/sessions error:', e);
            if (overviewSessionsContainer) {
                overviewSessionsContainer.innerHTML = '<p class="text-muted text-sm">Failed to load active sessions.</p>';
            }
        }
    }

    // 2. ADMIN EVENTS LISTING (admin-events.html)
    const adminEventsTable = document.getElementById('admin-events-table-body');
    const adminEventsMobile = document.getElementById('admin-events-mobile-cards');
    const adminSearchInput = document.getElementById('admin-event-search');
    const adminStatusSelect = document.getElementById('admin-filter-status');

    if (adminEventsTable || adminEventsMobile) {
        async function renderAdminEvents() {
            if (adminEventsTable) adminEventsTable.innerHTML = '<tr><td colspan="7">Loading sessions...</td></tr>';

            try {
                const events = await window.ZSphereDataService.adminGetEvents();

                const query = adminSearchInput ? adminSearchInput.value.toLowerCase().trim() : '';
                const status = adminStatusSelect ? adminStatusSelect.value.toLowerCase() : 'all';

                const filtered = (events || []).filter(e => {
                    if (!e) return false;
                    const title = (e.title || '').toLowerCase();
                    const cat = (e.category || '').toLowerCase();
                    const venue = (e.venue || '').toLowerCase();
                    const summary = (e.summary || '').toLowerCase();
                    const matchQ = !query || title.includes(query) || cat.includes(query) || venue.includes(query) || summary.includes(query);

                    const rawStatus = (e.status || 'draft').toLowerCase();
                    let matchS = status === 'all';
                    if (!matchS) {
                        if (status === 'published') {
                            matchS = rawStatus === 'published' || rawStatus === 'upcoming';
                        } else if (status === 'completed') {
                            matchS = rawStatus === 'completed' || (e.end_at && new Date(e.end_at) < new Date());
                        } else {
                            matchS = rawStatus === status;
                        }
                    }
                    return matchQ && matchS;
                });

                if (filtered.length === 0) {
                    const isFiltered = query !== '' || status !== 'all';
                    const emptyMsg = isFiltered
                        ? 'No sessions match your search or filter criteria.'
                        : 'No sessions created yet. Click "+ Create New Session" to publish your first workshop.';

                    if (adminEventsTable) {
                        adminEventsTable.innerHTML = `
                            <tr>
                                <td colspan="7" class="text-center py-4">
                                    <div class="empty-state admin-events-empty my-2">
                                        <div class="empty-state-icon" aria-hidden="true">
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                        </div>
                                        <div class="empty-state-title">${isFiltered ? 'No Matching Sessions' : 'No Sessions Created Yet'}</div>
                                        <p class="empty-state-desc">${emptyMsg}</p>
                                        ${!isFiltered ? '<a href="admin-event-form.html" class="btn btn-primary btn-sm">+ Create New Session</a>' : ''}
                                    </div>
                                </td>
                            </tr>
                        `;
                    }
                    if (adminEventsMobile) {
                        adminEventsMobile.innerHTML = `
                            <div class="empty-state admin-events-empty admin-events-empty-mobile my-2">
                                <div class="empty-state-icon" aria-hidden="true">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                </div>
                                <div class="empty-state-title">${isFiltered ? 'No Matching Sessions' : 'No Sessions Created Yet'}</div>
                                <p class="empty-state-desc">${emptyMsg}</p>
                                ${!isFiltered ? '<a href="admin-event-form.html" class="btn btn-primary btn-sm btn-full">+ Create New Session</a>' : ''}
                            </div>
                        `;
                    }
                    return;
                }

                if (adminEventsTable) {
                    adminEventsTable.innerHTML = filtered.map(e => {
                        const dateDisplay = e.start_at ? window.ZSphereApp.formatDate(e.start_at) : 'TBA';
                        let displayStatus = e.status || 'draft';
                        if ((displayStatus === 'published' || displayStatus === 'upcoming') && e.end_at) {
                            if (new Date(e.end_at) < new Date()) {
                                displayStatus = 'completed';
                            }
                        }
                        const badgeClass = (displayStatus === 'published' || displayStatus === 'upcoming') ? 'badge-open' : (displayStatus === 'completed' ? 'badge-completed' : 'badge-workshop');

                        return `
                            <tr>
                                <td><strong>${window.ZSphereApp.escapeHtml(e.title)}</strong></td>
                                <td><span class="tag">${window.ZSphereApp.escapeHtml(e.category || 'General')}</span></td>
                                <td>${dateDisplay}</td>
                                <td>${window.ZSphereApp.escapeHtml(e.venue || 'TBA')}</td>
                                <td><span class="badge ${badgeClass}">${(displayStatus || 'DRAFT').toUpperCase()}</span></td>
                                <td>${e.capacity || '∞'}</td>
                                <td class="text-right">
                                    <div class="action-btns justify-end">
                                        <a href="admin-registrations.html?event_id=${encodeURIComponent(e.id)}" class="btn btn-secondary btn-sm" title="View & Export Registrations">Registrations</a>
                                        <a href="admin-event-form.html?slug=${encodeURIComponent(e.slug || '')}" class="btn btn-secondary btn-sm">Edit</a>
                                        <button class="btn btn-danger btn-sm admin-delete-evt-btn" data-id="${window.ZSphereApp.escapeHtml(e.id)}" data-title="${window.ZSphereApp.escapeHtml(e.title)}" aria-label="Delete session ${window.ZSphereApp.escapeHtml(e.title)}">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }

                if (adminEventsMobile) {
                    adminEventsMobile.innerHTML = filtered.map(e => {
                        const dateDisplay = e.start_at ? window.ZSphereApp.formatDate(e.start_at) : 'TBA';
                        let displayStatus = e.status || 'draft';
                        if ((displayStatus === 'published' || displayStatus === 'upcoming') && e.end_at) {
                            if (new Date(e.end_at) < new Date()) {
                                displayStatus = 'completed';
                            }
                        }
                        const badgeClass = (displayStatus === 'published' || displayStatus === 'upcoming') ? 'badge-open' : (displayStatus === 'completed' ? 'badge-completed' : 'badge-workshop');

                        return `
                            <div class="admin-event-card-mobile">
                                <div class="admin-event-card-mobile-head">
                                    <h3 class="admin-event-card-mobile-title">${window.ZSphereApp.escapeHtml(e.title)}</h3>
                                    <span class="badge ${badgeClass}">${(displayStatus || 'DRAFT').toUpperCase()}</span>
                                </div>
                                <div class="admin-event-card-mobile-meta">
                                    <div class="admin-event-card-mobile-meta-item">
                                        <span class="d-inline-flex items-center" aria-hidden="true">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                                        </span>
                                        <span><strong>Track:</strong> ${window.ZSphereApp.escapeHtml(e.category || 'General')}</span>
                                    </div>
                                    <div class="admin-event-card-mobile-meta-item">
                                        <span class="d-inline-flex items-center" aria-hidden="true">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                        </span>
                                        <span><strong>Date:</strong> ${dateDisplay}</span>
                                    </div>
                                    <div class="admin-event-card-mobile-meta-item">
                                        <span class="d-inline-flex items-center" aria-hidden="true">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                        </span>
                                        <span><strong>Venue:</strong> ${window.ZSphereApp.escapeHtml(e.venue || 'TBA')}</span>
                                    </div>
                                    <div class="admin-event-card-mobile-meta-item">
                                        <span class="d-inline-flex items-center" aria-hidden="true">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
                                        </span>
                                        <span><strong>Capacity:</strong> ${e.capacity || '∞'} Seats</span>
                                    </div>
                                </div>
                                <div class="admin-event-card-mobile-actions d-flex gap-2 flex-wrap">
                                    <a href="admin-registrations.html?event_id=${encodeURIComponent(e.id)}" class="btn btn-secondary btn-sm flex-1 text-center">Registrations</a>
                                    <a href="admin-event-form.html?slug=${encodeURIComponent(e.slug || '')}" class="btn btn-secondary btn-sm flex-1 text-center">Edit</a>
                                    <button class="btn btn-danger btn-sm admin-delete-evt-btn" data-id="${window.ZSphereApp.escapeHtml(e.id)}" data-title="${window.ZSphereApp.escapeHtml(e.title)}" aria-label="Delete session ${window.ZSphereApp.escapeHtml(e.title)}">Delete</button>
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                // Attach event delete listener
                document.querySelectorAll('.admin-delete-evt-btn').forEach(btn => {
                    btn.addEventListener('click', function () {
                        const id = btn.getAttribute('data-id');
                        const title = btn.getAttribute('data-title');

                        window.ZSphereUI.showModal({
                            title: 'Delete Session',
                            body: `<p>Are you sure you want to permanently delete <strong>${window.ZSphereApp.escapeHtml(title)}</strong>? This cannot be undone.</p>`,
                            confirmText: 'Delete Session',
                            onConfirm: async function () {
                                try {
                                    await window.ZSphereDataService.adminDeleteEvent(id);
                                    window.ZSphereUI.showToast('Session deleted successfully.', 'info');
                                    renderAdminEvents();
                                } catch (err) {
                                    console.error('Delete error:', err);
                                    window.ZSphereUI.showToast('Failed to delete session: ' + err.message, 'error');
                                }
                            }
                        });
                    });
                });

            } catch (err) {
                console.error('Error fetching admin events:', err);
                if (adminEventsTable) adminEventsTable.innerHTML = '<tr><td colspan="7" class="text-danger">Failed to load sessions.</td></tr>';
            }
        }

        if (adminSearchInput) {
            const debouncedRender = (window.ZSphereApp && typeof window.ZSphereApp.debounce === 'function')
                ? window.ZSphereApp.debounce(renderAdminEvents, 250)
                : renderAdminEvents;
            adminSearchInput.addEventListener('input', debouncedRender);
        }
        if (adminStatusSelect) adminStatusSelect.addEventListener('change', renderAdminEvents);
        renderAdminEvents();
    }

    // 3. ADMIN EVENT FORM HANDLER (admin-event-form.html)
    const eventForm = document.getElementById('admin-event-form');
    if (eventForm) {
        const editSlug = window.ZSphereApp.getParam('slug');
        let editingEventId = null;
        let editingEventPublishedAt = null;

        // Dynamic Row Adders
        const addLearningBtn = document.getElementById('add-learning-point-btn');
        const learningContainer = document.getElementById('learning-points-container');
        if (addLearningBtn && learningContainer) {
            addLearningBtn.addEventListener('click', function () {
                const row = document.createElement('div');
                row.className = 'dynamic-row';
                row.innerHTML = `
                    <input type="text" class="form-control dynamic-row-input" placeholder="New learning outcome" aria-label="Learning outcome" maxlength="180">
                    <button type="button" class="dynamic-row-remove-btn" aria-label="Remove learning outcome" data-dynamic-remove>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
                learningContainer.appendChild(row);
                row.querySelector('input').focus();
            });
        }

        const addAgendaBtn = document.getElementById('add-agenda-btn');
        const agendaContainer = document.getElementById('agenda-rows-container');
        if (addAgendaBtn && agendaContainer) {
            addAgendaBtn.addEventListener('click', function () {
                const row = document.createElement('div');
                row.className = 'dynamic-row';
                row.innerHTML = `
                    <input type="text" class="form-control agenda-time-input" placeholder="e.g. 15–30 min" aria-label="Agenda time slot" maxlength="60">
                    <input type="text" class="form-control dynamic-row-input" placeholder="Agenda topic description" aria-label="Agenda topic" maxlength="180">
                    <button type="button" class="dynamic-row-remove-btn" aria-label="Remove agenda row" data-dynamic-remove>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
                agendaContainer.appendChild(row);
                row.querySelector('input').focus();
            });
        }

        const addResourceBtn = document.getElementById('add-resource-btn');
        const resourcesContainer = document.getElementById('resources-rows-container');
        if (addResourceBtn && resourcesContainer) {
            addResourceBtn.addEventListener('click', function () {
                const row = document.createElement('div');
                row.className = 'dynamic-row';
                row.innerHTML = `
                    <input type="text" class="form-control dynamic-row-input" placeholder="Resource Title" aria-label="Resource title" maxlength="160">
                    <input type="text" class="form-control dynamic-row-input" placeholder="https://..." aria-label="Resource URL or relative link" maxlength="500" inputmode="url">
                    <button type="button" class="dynamic-row-remove-btn" aria-label="Remove resource link" data-dynamic-remove>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
                resourcesContainer.appendChild(row);
                row.querySelector('input').focus();
            });
        }

        // Delegate dynamic-row removal so newly-added rows work without inline event handlers.
        eventForm.addEventListener('click', function (event) {
            const removeButton = event.target.closest('[data-dynamic-remove]');
            if (!removeButton || !eventForm.contains(removeButton)) return;
            const row = removeButton.closest('.dynamic-row');
            if (row) row.remove();
        });

        // Facilitator / Instructor Selection from Team Members
        const facilitatorSelect = document.getElementById('evt-facilitator-select');
        async function initFacilitatorDropdown(selectedId = null, conductedByName = null) {
            if (!facilitatorSelect) return;
            try {
                const team = await window.ZSphereDataService.getTeamMembers();
                facilitatorSelect.innerHTML = '<option value="">-- Select Team Member (or type custom below) --</option>';
                team.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = `${m.name} (${m.role_title || m.role || 'Team Member'})`;
                    opt.dataset.name = m.name;
                    if (selectedId && m.id === selectedId) {
                        opt.selected = true;
                    } else if (!selectedId && conductedByName && m.name.toLowerCase() === conductedByName.toLowerCase()) {
                        opt.selected = true;
                    }
                    facilitatorSelect.appendChild(opt);
                });
            } catch (err) {
                console.warn('Error populating facilitator dropdown:', err);
            }
        }

        if (facilitatorSelect) {
            facilitatorSelect.addEventListener('change', function () {
                const selectedOpt = facilitatorSelect.options[facilitatorSelect.selectedIndex];
                const conductedInput = document.getElementById('evt-conducted');
                if (selectedOpt && selectedOpt.dataset.name && conductedInput) {
                    conductedInput.value = selectedOpt.dataset.name;
                }
            });
            initFacilitatorDropdown();
        }

        // Populate Form If Editing
        if (editSlug) {
            document.getElementById('form-title').textContent = 'Edit Session';
            window.ZSphereDataService.adminGetEventBySlug(editSlug).then(evt => {
                if (!evt) {
                    window.ZSphereUI.showToast('Event not found for editing.', 'error');
                    return;
                }
                editingEventId = evt.id;
                editingEventPublishedAt = evt.published_at || null;

                document.getElementById('evt-title').value = evt.title || '';
                document.getElementById('evt-slug').value = evt.slug || '';
                if (evt.category) document.getElementById('evt-category').value = evt.category;
                if (evt.event_type) document.getElementById('evt-type').value = evt.event_type;
                if (evt.mode) document.getElementById('evt-mode').value = evt.mode;
                document.getElementById('evt-venue').value = evt.venue || '';
                document.getElementById('evt-conducted').value = evt.conducted_by || '';
                initFacilitatorDropdown(evt.facilitator_id, evt.conducted_by);
                document.getElementById('evt-summary').value = evt.summary || '';
                document.getElementById('evt-description').value = evt.description || '';
                
                const regFormInput = document.getElementById('event-registration-form-url') || document.getElementById('evt-google-form');
                if (regFormInput) regFormInput.value = evt.registration_form_url || evt.google_form_link || '';
                
                const waGroupInput = document.getElementById('event-whatsapp-group-url') || document.getElementById('evt-whatsapp-link');
                if (waGroupInput) waGroupInput.value = evt.whatsapp_group_url || evt.whatsapp_group_link || '';

                document.getElementById('evt-capacity').value = evt.capacity !== null && evt.capacity !== undefined ? evt.capacity : 60;
                document.getElementById('evt-registered-count').value = evt.registered_count !== undefined ? evt.registered_count : 0;
                document.getElementById('evt-attendance-count').value = evt.attendance_count !== undefined ? evt.attendance_count : 0;
                document.getElementById('evt-feedback-summary').value = evt.feedback_summary || '';
                if (evt.status) document.getElementById('evt-status').value = evt.status;

                // Cover Photo Preview
                const previewContainer = document.getElementById('evt-cover-preview');
                if (previewContainer) {
                    if (evt.cover_path) {
                        const url = window.ZSphereDataService.getPublicMediaUrl(evt.cover_path);
                        previewContainer.innerHTML = `<p class="text-xs text-muted mb-1">Current Cover:</p><img src="${url}" alt="Current session cover preview" class="admin-cover-preview-img">`;
                    } else {
                        previewContainer.innerHTML = '<p class="text-xs text-muted">No cover photo currently uploaded.</p>';
                    }
                }

                // Dates
                if (evt.start_at) {
                    const d = new Date(evt.start_at);
                    document.getElementById('evt-start').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                }
                if (evt.end_at) {
                    const d = new Date(evt.end_at);
                    document.getElementById('evt-end').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                }

                // Learning Points
                if (Array.isArray(evt.learning_points) && evt.learning_points.length > 0 && learningContainer) {
                    learningContainer.innerHTML = '';
                    evt.learning_points.forEach(pt => {
                        const val = typeof pt === 'string' ? pt : pt.title || '';
                        const row = document.createElement('div');
                        row.className = 'dynamic-row';
                        row.innerHTML = `
                            <input type="text" class="form-control dynamic-row-input" value="${window.ZSphereApp.escapeHtml(val)}" aria-label="Learning outcome" maxlength="180">
                            <button type="button" class="dynamic-row-remove-btn" aria-label="Remove learning outcome" data-dynamic-remove>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        `;
                        learningContainer.appendChild(row);
                    });
                }

                // Agenda
                if (Array.isArray(evt.agenda) && evt.agenda.length > 0 && agendaContainer) {
                    agendaContainer.innerHTML = '';
                    evt.agenda.forEach(ag => {
                        const row = document.createElement('div');
                        row.className = 'dynamic-row';
                        row.innerHTML = `
                            <input type="text" class="form-control agenda-time-input" value="${window.ZSphereApp.escapeHtml(ag.time || '')}" aria-label="Agenda time slot" maxlength="60">
                            <input type="text" class="form-control dynamic-row-input" value="${window.ZSphereApp.escapeHtml(ag.title || '')}" aria-label="Agenda topic" maxlength="180">
                            <button type="button" class="dynamic-row-remove-btn" aria-label="Remove agenda row" data-dynamic-remove>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        `;
                        agendaContainer.appendChild(row);
                    });
                }

                // Resources
                if (Array.isArray(evt.resources) && evt.resources.length > 0 && resourcesContainer) {
                    resourcesContainer.innerHTML = '';
                    evt.resources.forEach(res => {
                        const row = document.createElement('div');
                        row.className = 'dynamic-row';
                        row.innerHTML = `
                            <input type="text" class="form-control dynamic-row-input" value="${window.ZSphereApp.escapeHtml(res.label || res.title || '')}" aria-label="Resource title" maxlength="160">
                            <input type="text" class="form-control dynamic-row-input" value="${window.ZSphereApp.escapeHtml(res.url || '')}" aria-label="Resource URL or relative link" maxlength="500" inputmode="url">
                            <button type="button" class="dynamic-row-remove-btn" aria-label="Remove resource link" data-dynamic-remove>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        `;
                        resourcesContainer.appendChild(row);
                    });
                }
            });
        }

        // Form Submit
        eventForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const title = document.getElementById('evt-title').value.trim();
            const slug = document.getElementById('evt-slug').value.trim();
            const startAt = document.getElementById('evt-start').value;
            const endAt = document.getElementById('evt-end').value;

            if (new Date(endAt) <= new Date(startAt)) {
                window.ZSphereUI.showToast('End date must be after the start date.', 'error');
                return;
            }

            if (!title || !slug || !startAt || !endAt) {
                window.ZSphereUI.showToast('Please fill all required fields.', 'error');
                return;
            }

            // Gather Dynamic Arrays
            const learningPoints = [];
            if (learningContainer) {
                learningContainer.querySelectorAll('.dynamic-row input').forEach(inp => {
                    if (inp.value.trim()) learningPoints.push(inp.value.trim());
                });
            }

            const agenda = [];
            if (agendaContainer) {
                agendaContainer.querySelectorAll('.dynamic-row').forEach(r => {
                    const timeInp = r.querySelector('.agenda-time-input');
                    const descInp = r.querySelector('.dynamic-row-input');
                    if (descInp && descInp.value.trim()) {
                        agenda.push({
                            time: timeInp ? timeInp.value.trim() : '',
                            title: descInp.value.trim()
                        });
                    }
                });
            }

            const resources = [];
            if (resourcesContainer) {
                resourcesContainer.querySelectorAll('.dynamic-row').forEach(r => {
                    const inputs = r.querySelectorAll('.dynamic-row-input');
                    if (inputs.length >= 2 && inputs[0].value.trim()) {
                        resources.push({
                            label: inputs[0].value.trim(),
                            url: inputs[1].value.trim()
                        });
                    }
                });
            }

            const regFormInp = document.getElementById('event-registration-form-url') || document.getElementById('evt-google-form');
            const waGroupInp = document.getElementById('event-whatsapp-group-url') || document.getElementById('evt-whatsapp-link');
            const capacityInp = document.getElementById('evt-capacity');
            const rawCapacity = capacityInp ? parseInt(capacityInp.value, 10) : null;
            const statusVal = document.getElementById('evt-status').value;

            const facilitatorIdVal = facilitatorSelect ? (facilitatorSelect.value || null) : null;

            const payload = {
                title: title,
                slug: slug,
                category: document.getElementById('evt-category').value,
                event_type: document.getElementById('evt-type').value,
                mode: document.getElementById('evt-mode').value,
                venue: document.getElementById('evt-venue').value.trim(),
                conducted_by: document.getElementById('evt-conducted').value.trim(),
                facilitator_id: facilitatorIdVal,
                summary: document.getElementById('evt-summary').value.trim(),
                description: document.getElementById('evt-description').value.trim(),
                registration_form_url: (regFormInp && regFormInp.value.trim()) ? regFormInp.value.trim() : null,
                whatsapp_group_url: (waGroupInp && waGroupInp.value.trim()) ? waGroupInp.value.trim() : null,
                capacity: (rawCapacity && rawCapacity > 0) ? rawCapacity : null,
                registered_count: parseInt(document.getElementById('evt-registered-count').value, 10) || 0,
                attendance_count: parseInt(document.getElementById('evt-attendance-count').value, 10) || 0,
                feedback_summary: document.getElementById('evt-feedback-summary').value.trim() || null,
                status: statusVal,
                start_at: new Date(startAt).toISOString(),
                end_at: new Date(endAt).toISOString(),
                learning_points: learningPoints,
                agenda: agenda,
                resources: resources
            };

            if (statusVal === 'published' && !editingEventPublishedAt) {
                payload.published_at = new Date().toISOString();
            }

            const coverFileInput = document.getElementById('evt-cover-file');
            const coverFile = (coverFileInput && coverFileInput.files && coverFileInput.files[0]) ? coverFileInput.files[0] : null;

            const submitBtn = eventForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving Session...';

            try {
                if (editingEventId) {
                    await window.ZSphereDataService.adminUpdateEvent(editingEventId, payload, coverFile);
                    window.ZSphereUI.showToast('Session updated successfully!', 'success');
                } else {
                    await window.ZSphereDataService.adminCreateEvent(payload, coverFile);
                    window.ZSphereUI.showToast('Session created successfully!', 'success');
                }

                setTimeout(() => {
                    window.location.href = 'admin-events.html';
                }, 1000);

            } catch (err) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save & Publish Session';
                window.ZSphereUI.showToast(err.message, 'error');
            }
        });
    }


    // 4. ADMIN REGISTRATIONS & EXCEL (.XLSX) EXPORT (admin-registrations.html)
    const adminRegTable = document.getElementById('admin-registrations-container');
    const adminRegMobile = document.getElementById('admin-registrations-mobile-cards');
    const adminRegEventSelect = document.getElementById('admin-reg-event-select');
    const adminRegSearch = document.getElementById('admin-reg-search');
    const adminRegStatusFilter = document.getElementById('admin-reg-status-filter');
    const adminExportXlsxBtn = document.getElementById('admin-export-xlsx-btn');
    const adminRegCountDisplay = document.getElementById('admin-reg-count-display');

    if (adminRegTable || adminRegMobile) {
        let allRegistrations = [];
        let allEventsList = [];

        // Load sessions into filter dropdown
        async function initRegistrationFilters() {
            try {
                allEventsList = await window.ZSphereDataService.adminGetEvents();
                if (adminRegEventSelect && allEventsList) {
                    adminRegEventSelect.innerHTML = '<option value="all">All Sessions (Roster Overview)</option>';
                    allEventsList.forEach(evt => {
                        const opt = document.createElement('option');
                        opt.value = evt.id;
                        const dateStr = evt.start_at ? new Date(evt.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                        opt.textContent = `${evt.title} ${dateStr ? '(' + dateStr + ')' : ''}`;
                        adminRegEventSelect.appendChild(opt);
                    });

                    // Check URL parameter for preselected event_id
                    const urlParams = new URLSearchParams(window.location.search);
                    const targetEventId = urlParams.get('event_id');
                    if (targetEventId) {
                        adminRegEventSelect.value = targetEventId;
                    }
                }
            } catch (err) {
                console.warn('Error loading event options for registrations filter:', err);
            }
        }

        async function loadAdminRegistrations() {
            if (adminRegTable) adminRegTable.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Loading registrations roster...</td></tr>';
            if (adminRegMobile) adminRegMobile.innerHTML = '<p class="text-center text-muted py-3">Loading registrations roster...</p>';

            try {
                const selectedEventId = adminRegEventSelect ? adminRegEventSelect.value : 'all';
                allRegistrations = await window.ZSphereDataService.adminGetRegistrations(selectedEventId);
                renderRegistrationsView();
            } catch (err) {
                console.error('Error fetching admin registrations:', err);
                if (adminRegTable) adminRegTable.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Failed to load registrations: ${window.ZSphereApp.escapeHtml(err.message)}</td></tr>`;
                if (adminRegMobile) adminRegMobile.innerHTML = `<p class="text-danger text-center py-3">Failed to load registrations: ${window.ZSphereApp.escapeHtml(err.message)}</p>`;
            }
        }

        function getFilteredRegistrations() {
            const query = adminRegSearch ? adminRegSearch.value.toLowerCase().trim() : '';
            const statusFilter = adminRegStatusFilter ? adminRegStatusFilter.value : 'all';
            const selectedEventId = adminRegEventSelect ? adminRegEventSelect.value : 'all';

            return allRegistrations.filter(reg => {
                if (!reg) return false;

                // Event filter
                if (selectedEventId !== 'all' && reg.event_id !== selectedEventId) {
                    return false;
                }

                // Status filter
                if (statusFilter !== 'all' && (reg.status || 'registered').toLowerCase() !== statusFilter.toLowerCase()) {
                    return false;
                }

                // Text search
                if (query) {
                    const student = reg.profiles || {};
                    const evt = reg.events || {};
                    const name = (student.full_name || '').toLowerCase();
                    const email = (student.email || '').toLowerCase();
                    const course = (student.course || '').toLowerCase();
                    const title = (evt.title || '').toLowerCase();
                    if (!name.includes(query) && !email.includes(query) && !course.includes(query) && !title.includes(query)) {
                        return false;
                    }
                }

                return true;
            });
        }

        function renderRegistrationsView() {
            const filtered = getFilteredRegistrations();

            if (adminRegCountDisplay) {
                adminRegCountDisplay.textContent = `${filtered.length} ${filtered.length === 1 ? 'Registration' : 'Registrations'}`;
            }

            if (filtered.length === 0) {
                const emptyHtml = `
                    <tr>
                        <td colspan="7" class="text-center py-5">
                            <div class="empty-state my-2">
                                <div class="empty-state-icon" aria-hidden="true">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                </div>
                                <div class="empty-state-title">No Registrations Found</div>
                                <p class="empty-state-desc">No student registrations match the selected session or filter criteria.</p>
                            </div>
                        </td>
                    </tr>
                `;
                if (adminRegTable) adminRegTable.innerHTML = emptyHtml;
                if (adminRegMobile) adminRegMobile.innerHTML = `<div class="empty-state py-4 text-center"><p class="text-muted mb-0">No student registrations found for this filter.</p></div>`;
                return;
            }

            // Desktop Table View
            if (adminRegTable) {
                adminRegTable.innerHTML = filtered.map((r, idx) => {
                    const student = r.profiles || {};
                    const evt = r.events || {};
                    const studentName = student.full_name || 'Anonymous Student';
                    const studentEmail = student.email || 'No email provided';
                    const courseName = student.course || '—';
                    const semVal = student.semester ? `Sem ${student.semester}` : '—';
                    const eventTitle = evt.title || 'General Session';
                    const regDate = r.registered_at ? window.ZSphereApp.formatDate(r.registered_at) : '—';
                    const status = (r.status || 'registered').toLowerCase();

                    let badgeClass = 'badge-open';
                    let statusLabel = 'REGISTERED';
                    if (status === 'attended') {
                        badgeClass = 'badge-completed';
                        statusLabel = 'ATTENDED';
                    } else if (status === 'cancelled') {
                        badgeClass = 'badge-warning';
                        statusLabel = 'CANCELLED';
                    }

                    return `
                        <tr>
                            <td>
                                <div>
                                    <strong class="text-navy">${window.ZSphereApp.escapeHtml(studentName)}</strong>
                                    <div class="text-xs text-muted">${window.ZSphereApp.escapeHtml(studentEmail)}</div>
                                </div>
                            </td>
                            <td>
                                <div class="font-medium text-sm text-navy max-w-xs" style="max-width: 240px; white-space: normal; line-height: 1.35;">
                                    ${window.ZSphereApp.escapeHtml(eventTitle)}
                                </div>
                            </td>
                            <td><span class="tag text-xs">${window.ZSphereApp.escapeHtml(courseName)}</span></td>
                            <td>${window.ZSphereApp.escapeHtml(semVal)}</td>
                            <td><span class="text-xs text-muted">${regDate}</span></td>
                            <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
                            <td class="text-right">
                                <div class="action-btns justify-end">
                                    <select class="form-control form-control-sm reg-status-select" data-id="${r.id}" style="width: auto; height: 30px; font-size: 0.78rem; padding: 2px 8px;" aria-label="Change registration status">
                                        <option value="registered" ${status === 'registered' ? 'selected' : ''}>Registered</option>
                                        <option value="attended" ${status === 'attended' ? 'selected' : ''}>Attended</option>
                                        <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                                    </select>
                                    <button type="button" class="btn btn-danger btn-sm admin-delete-reg-btn" data-id="${r.id}" data-name="${window.ZSphereApp.escapeHtml(studentName)}" aria-label="Delete registration for ${window.ZSphereApp.escapeHtml(studentName)}">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            // Mobile Cards View
            if (adminRegMobile) {
                adminRegMobile.innerHTML = filtered.map(r => {
                    const student = r.profiles || {};
                    const evt = r.events || {};
                    const studentName = student.full_name || 'Anonymous Student';
                    const studentEmail = student.email || 'No email provided';
                    const courseName = student.course || '—';
                    const semVal = student.semester ? `Sem ${student.semester}` : '—';
                    const eventTitle = evt.title || 'General Session';
                    const regDate = r.registered_at ? window.ZSphereApp.formatDate(r.registered_at) : '—';
                    const status = (r.status || 'registered').toLowerCase();

                    let badgeClass = 'badge-open';
                    let statusLabel = 'REGISTERED';
                    if (status === 'attended') {
                        badgeClass = 'badge-completed';
                        statusLabel = 'ATTENDED';
                    } else if (status === 'cancelled') {
                        badgeClass = 'badge-warning';
                        statusLabel = 'CANCELLED';
                    }

                    return `
                        <div class="admin-event-card-mobile">
                            <div class="admin-event-card-mobile-head">
                                <div>
                                    <h3 class="admin-event-card-mobile-title mb-0">${window.ZSphereApp.escapeHtml(studentName)}</h3>
                                    <div class="text-xs text-muted">${window.ZSphereApp.escapeHtml(studentEmail)}</div>
                                </div>
                                <span class="badge ${badgeClass}">${statusLabel}</span>
                            </div>
                            <div class="admin-event-card-mobile-meta mt-2">
                                <div class="admin-event-card-mobile-meta-item">
                                    <span><strong>Session:</strong> ${window.ZSphereApp.escapeHtml(eventTitle)}</span>
                                </div>
                                <div class="admin-event-card-mobile-meta-item">
                                    <span><strong>Course:</strong> ${window.ZSphereApp.escapeHtml(courseName)} (${window.ZSphereApp.escapeHtml(semVal)})</span>
                                </div>
                                <div class="admin-event-card-mobile-meta-item">
                                    <span><strong>Registered:</strong> ${regDate}</span>
                                </div>
                            </div>
                            <div class="admin-event-card-mobile-actions mt-3 d-flex gap-2 items-center">
                                <select class="form-control form-control-sm reg-status-select flex-1" data-id="${r.id}" aria-label="Change registration status">
                                    <option value="registered" ${status === 'registered' ? 'selected' : ''}>Status: Registered</option>
                                    <option value="attended" ${status === 'attended' ? 'selected' : ''}>Status: Attended</option>
                                    <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>Status: Cancelled</option>
                                </select>
                                <button type="button" class="btn btn-danger btn-sm admin-delete-reg-btn" data-id="${r.id}" data-name="${window.ZSphereApp.escapeHtml(studentName)}" aria-label="Delete registration">
                                    Delete
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // Attach status update change handlers
            document.querySelectorAll('.reg-status-select').forEach(sel => {
                sel.addEventListener('change', async function () {
                    const regId = sel.getAttribute('data-id');
                    const newStatus = sel.value;
                    sel.disabled = true;

                    try {
                        await window.ZSphereDataService.adminUpdateRegistrationStatus(regId, newStatus);
                        window.ZSphereUI.showToast(`Registration status updated to ${newStatus.toUpperCase()}`, 'success');
                        loadAdminRegistrations();
                    } catch (err) {
                        sel.disabled = false;
                        window.ZSphereUI.showToast(err.message, 'error');
                    }
                });
            });

            // Attach delete handlers
            document.querySelectorAll('.admin-delete-reg-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    const regId = btn.getAttribute('data-id');
                    const studentName = btn.getAttribute('data-name');

                    window.ZSphereUI.showModal({
                        title: 'Delete Registration',
                        body: `<p>Are you sure you want to delete the registration record for <strong>${window.ZSphereApp.escapeHtml(studentName)}</strong>? This will release their reserved seat.</p>`,
                        confirmText: 'Delete Record',
                        onConfirm: async function () {
                            try {
                                await window.ZSphereDataService.adminDeleteRegistration(regId);
                                window.ZSphereUI.showToast('Registration record deleted.', 'info');
                                loadAdminRegistrations();
                            } catch (err) {
                                window.ZSphereUI.showToast(err.message, 'error');
                            }
                        }
                    });
                });
            });
        }

        // Export to Excel (.xlsx) Handler
        function exportRegistrationsToXLSX() {
            const filtered = getFilteredRegistrations();

            if (filtered.length === 0) {
                window.ZSphereUI.showToast('No registrations available to export for this selection.', 'warning');
                return;
            }

            const exportRows = filtered.map((r, index) => {
                const student = r.profiles || {};
                const evt = r.events || {};
                return {
                    'S.No': index + 1,
                    'Student Full Name': student.full_name || 'N/A',
                    'Student Email': student.email || 'N/A',
                    'Course / Degree': student.course || 'N/A',
                    'Semester': student.semester ? `Semester ${student.semester}` : 'N/A',
                    'Session Title': evt.title || 'N/A',
                    'Track / Category': evt.category || 'General',
                    'Session Date': evt.start_at ? new Date(evt.start_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBA',
                    'Venue': evt.venue || 'TBA',
                    'Registered At': r.registered_at ? new Date(r.registered_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A',
                    'Status': (r.status || 'registered').toUpperCase()
                };
            });

            // Generate filename based on selected session & timestamp
            let sessionTag = 'All_Sessions';
            const selectedEventId = adminRegEventSelect ? adminRegEventSelect.value : 'all';
            if (selectedEventId !== 'all') {
                const foundEvt = allEventsList.find(e => e.id === selectedEventId);
                if (foundEvt && foundEvt.title) {
                    sessionTag = foundEvt.title.replace(/[^a-z0-9]/gi, '_').substring(0, 32);
                }
            }
            const dateStamp = new Date().toISOString().slice(0, 10);
            const fileName = `Z_Sphere_Registrations_${sessionTag}_${dateStamp}.xlsx`;

            // Use SheetJS (xlsx library) if available
            if (window.XLSX) {
                try {
                    const workbook = window.XLSX.utils.book_new();

                    // 1. Master Sheet with all matched registrations
                    const masterWorksheet = window.XLSX.utils.json_to_sheet(exportRows);
                    masterWorksheet['!cols'] = [
                        { wch: 6 },  // S.No
                        { wch: 26 }, // Student Full Name
                        { wch: 32 }, // Student Email
                        { wch: 20 }, // Course
                        { wch: 14 }, // Semester
                        { wch: 38 }, // Session Title
                        { wch: 22 }, // Track
                        { wch: 24 }, // Session Date
                        { wch: 20 }, // Venue
                        { wch: 24 }, // Registered At
                        { wch: 16 }  // Status
                    ];

                    const masterTabName = selectedEventId === 'all' ? 'All_Registrations' : 'Session_Roster';
                    window.XLSX.utils.book_append_sheet(workbook, masterWorksheet, masterTabName);

                    // 2. If 'all' is selected and multiple sessions exist, add dedicated tabs per session
                    if (selectedEventId === 'all') {
                        const groupedBySession = {};
                        filtered.forEach(r => {
                            const title = (r.events && r.events.title) ? r.events.title : 'General Session';
                            if (!groupedBySession[title]) groupedBySession[title] = [];
                            groupedBySession[title].push(r);
                        });

                        const sessionTitles = Object.keys(groupedBySession);
                        if (sessionTitles.length > 1) {
                            sessionTitles.forEach(sTitle => {
                                const sessionRows = groupedBySession[sTitle].map((r, idx) => {
                                    const student = r.profiles || {};
                                    return {
                                        'S.No': idx + 1,
                                        'Student Full Name': student.full_name || 'N/A',
                                        'Student Email': student.email || 'N/A',
                                        'Course / Degree': student.course || 'N/A',
                                        'Semester': student.semester ? `Semester ${student.semester}` : 'N/A',
                                        'Registered At': r.registered_at ? new Date(r.registered_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A',
                                        'Status': (r.status || 'registered').toUpperCase()
                                    };
                                });

                                const sessionWs = window.XLSX.utils.json_to_sheet(sessionRows);
                                sessionWs['!cols'] = [
                                    { wch: 6 },
                                    { wch: 26 },
                                    { wch: 32 },
                                    { wch: 20 },
                                    { wch: 14 },
                                    { wch: 24 },
                                    { wch: 16 }
                                ];
                                const cleanSheetName = sTitle.replace(/[:\\/?*\[\]]/g, '').substring(0, 30);
                                window.XLSX.utils.book_append_sheet(workbook, sessionWs, cleanSheetName);
                            });
                        }
                    }

                    window.XLSX.writeFile(workbook, fileName);
                    window.ZSphereUI.showToast(`Exported ${exportRows.length} registrations to ${fileName}`, 'success');
                    return;
                } catch (xlsxErr) {
                    console.warn('SheetJS error, using fallback CSV:', xlsxErr);
                }
            }

            // Fallback to UTF-8 CSV with Excel Byte Order Mark (BOM)
            try {
                const headers = Object.keys(exportRows[0]);
                const csvContent = '\uFEFF' + [
                    headers.join(','),
                    ...exportRows.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
                ].join('\r\n');

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.setAttribute('download', fileName.replace('.xlsx', '.csv'));
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.ZSphereUI.showToast(`Exported ${exportRows.length} registrations to CSV`, 'success');
            } catch (exportErr) {
                console.error('Export failed:', exportErr);
                window.ZSphereUI.showToast('Export failed: ' + exportErr.message, 'error');
            }
        }

        // Attach toolbar filter listeners
        if (adminRegEventSelect) adminRegEventSelect.addEventListener('change', loadAdminRegistrations);
        if (adminRegStatusFilter) adminRegStatusFilter.addEventListener('change', renderRegistrationsView);
        if (adminRegSearch) {
            const debouncedSearch = (window.ZSphereApp && typeof window.ZSphereApp.debounce === 'function')
                ? window.ZSphereApp.debounce(renderRegistrationsView, 200)
                : renderRegistrationsView;
            adminRegSearch.addEventListener('input', debouncedSearch);
        }
        if (adminExportXlsxBtn) {
            adminExportXlsxBtn.addEventListener('click', exportRegistrationsToXLSX);
        }

        // Initial setup
        initRegistrationFilters().then(() => {
            loadAdminRegistrations();
        });
    }

    // 5. ADMIN ANNOUNCEMENTS (admin-announcements.html)
    const adminAnnouncementsTable = document.getElementById('admin-announcements-table-body');
    const adminAnnForm = document.getElementById('admin-announcement-form');

    if (adminAnnouncementsTable) {
        async function loadAdminAnnouncements() {
            adminAnnouncementsTable.innerHTML = '<tr><td colspan="5">Loading announcements...</td></tr>';

            try {
                const announcements = await window.ZSphereDataService.getAnnouncements();

                if (announcements.length === 0) {
                    adminAnnouncementsTable.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No announcements posted yet.</td></tr>';
                    return;
                }

                adminAnnouncementsTable.innerHTML = announcements.map(a => {
                    const dateDisplay = a.published_at ? window.ZSphereApp.formatDate(a.published_at) : '';
                    return `
                        <tr>
                            <td><strong>${window.ZSphereApp.escapeHtml(a.title)}</strong></td>
                            <td><span class="tag">${a.audience === 'registered' ? 'Registered Members' : 'Public'}</span></td>
                            <td><span class="badge ${a.priority === 'important' ? 'badge-warning' : 'badge-open'}">${a.priority.toUpperCase()}</span></td>
                            <td>${dateDisplay}</td>
                            <td>
                                <button class="btn btn-danger btn-sm admin-delete-ann-btn" data-id="${window.ZSphereApp.escapeHtml(a.id)}" data-title="${window.ZSphereApp.escapeHtml(a.title)}" aria-label="Delete announcement ${window.ZSphereApp.escapeHtml(a.title)}">Delete</button>
                            </td>
                        </tr>
                    `;
                }).join('');

                adminAnnouncementsTable.querySelectorAll('.admin-delete-ann-btn').forEach(btn => {
                    btn.addEventListener('click', function () {
                        const id = btn.getAttribute('data-id');
                        const title = btn.getAttribute('data-title');

                        window.ZSphereUI.showModal({
                            title: 'Delete Announcement',
                            body: `<p>Are you sure you want to delete <strong>${window.ZSphereApp.escapeHtml(title)}</strong>?</p>`,
                            confirmText: 'Delete',
                            onConfirm: async function () {
                                try {
                                    await window.ZSphereDataService.adminDeleteAnnouncement(id);
                                    window.ZSphereUI.showToast('Announcement deleted.');
                                    loadAdminAnnouncements();
                                } catch (err) {
                                    window.ZSphereUI.showToast(err.message, 'error');
                                }
                            }
                        });
                    });
                });

            } catch (err) {
                console.error('Error loading admin announcements:', err);
                adminAnnouncementsTable.innerHTML = '<tr><td colspan="5" class="text-danger">Failed to load announcements.</td></tr>';
            }
        }

        if (adminAnnForm) {
            adminAnnForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const titleInp = document.getElementById('ann-title');
                const audienceSel = document.getElementById('ann-audience');
                const prioritySel = document.getElementById('ann-priority');
                const bodyInp = document.getElementById('ann-body');
                const submitBtn = adminAnnForm.querySelector('button[type="submit"]');

                if (!titleInp.value.trim() || !bodyInp.value.trim()) {
                    window.ZSphereUI.showToast('Please fill title and body.', 'error');
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = 'Posting...';

                try {
                    await window.ZSphereDataService.adminCreateAnnouncement({
                        title: titleInp.value.trim(),
                        body: bodyInp.value.trim(),
                        audience: audienceSel.value,
                        priority: prioritySel.value,
                        published_at: new Date().toISOString()
                    });

                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Post Announcement';
                    window.ZSphereUI.showToast('Announcement posted successfully!', 'success');
                    adminAnnForm.reset();
                    loadAdminAnnouncements();

                } catch (err) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Post Announcement';
                    window.ZSphereUI.showToast(err.message, 'error');
                }
            });
        }

        loadAdminAnnouncements();
    }

    // 6. ADMIN GALLERY (admin-gallery.html)
    const adminAlbumsList = document.getElementById('admin-albums-container');
    const adminAlbumForm = document.getElementById('admin-album-form');

    if (adminAlbumsList) {
        async function loadAdminAlbums() {
            adminAlbumsList.innerHTML = '<p>Loading photo albums...</p>';

            try {
                const albums = await window.ZSphereDataService.getGalleryAlbums();

                if (albums.length === 0) {
                    adminAlbumsList.innerHTML = '<p class="text-muted">No albums created yet.</p>';
                    return;
                }

                adminAlbumsList.innerHTML = albums.map(alb => {
                    const coverUrl = alb.cover_path ? window.ZSphereDataService.getPublicMediaUrl(alb.cover_path) : null;
                    const dateDisplay = alb.created_at ? window.ZSphereApp.formatDate(alb.created_at) : '';
                    const initials = alb.title ? alb.title.substring(0, 2).toUpperCase() : 'ZS';

                    return `
                        <div class="card-bordered mb-3 d-flex justify-between items-center flex-wrap gap-3">
                            <div class="d-flex gap-3 items-center">
                                <div class="avatar-circle avatar-md avatar-hero flex-center flex-shrink-0">
                                    ${coverUrl ? `<img src="${coverUrl}" class="w-full h-full avatar-circle" alt="${window.ZSphereApp.escapeHtml(alb.title)}">` : initials}
                                </div>
                                <div>
                                    <h3 class="card-title font-bold mb-0 admin-list-card-title">${window.ZSphereApp.escapeHtml(alb.title)}</h3>
                                    <div class="text-muted text-xs">${dateDisplay} ${alb.events ? '· ' + window.ZSphereApp.escapeHtml(alb.events.title) : ''}</div>
                                </div>
                            </div>
                            <div class="action-btns">
                                <a href="admin-album-images.html?album=${encodeURIComponent(alb.id || '')}" class="btn btn-secondary btn-sm">Manage Photos</a>
                                <a href="gallery-album.html?album=${encodeURIComponent(alb.slug || '')}" class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer">View Public</a>
                                <button class="btn btn-danger btn-sm admin-delete-album-btn" data-id="${window.ZSphereApp.escapeHtml(alb.id)}" data-title="${window.ZSphereApp.escapeHtml(alb.title)}" aria-label="Delete album ${window.ZSphereApp.escapeHtml(alb.title)}">Delete</button>
                            </div>
                        </div>
                    `;
                }).join('');

                adminAlbumsList.querySelectorAll('.admin-delete-album-btn').forEach(btn => {
                    btn.addEventListener('click', function () {
                        const id = btn.getAttribute('data-id');
                        const title = btn.getAttribute('data-title');

                        window.ZSphereUI.showModal({
                            title: 'Delete Photo Album',
                            body: `<p>Are you sure you want to delete album <strong>${window.ZSphereApp.escapeHtml(title)}</strong>? All associated photos will be detached.</p>`,
                            confirmText: 'Delete Album',
                            onConfirm: async function () {
                                try {
                                    await window.ZSphereDataService.adminDeleteAlbum(id);
                                    window.ZSphereUI.showToast('Album deleted.');
                                    loadAdminAlbums();
                                } catch (err) {
                                    window.ZSphereUI.showToast(err.message, 'error');
                                }
                            }
                        });
                    });
                });

            } catch (err) {
                console.error('Error loading admin albums:', err);
                adminAlbumsList.innerHTML = '<p class="text-danger">Failed to load albums.</p>';
            }
        }

        if (adminAlbumForm) {
            // Populate related event selector
            const evtSelect = document.getElementById('alb-event-id');
            if (evtSelect) {
                window.ZSphereDataService.adminGetEvents().then(events => {
                    events.forEach(e => {
                        const opt = document.createElement('option');
                        opt.value = e.id;
                        opt.textContent = e.title;
                        evtSelect.appendChild(opt);
                    });
                });
            }

            adminAlbumForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const titleInp = document.getElementById('alb-title');
                const slugInp = document.getElementById('alb-slug');
                const eventIdSel = document.getElementById('alb-event-id');
                const coverInp = document.getElementById('alb-cover-file');
                const submitBtn = adminAlbumForm.querySelector('button[type="submit"]');

                if (!titleInp.value.trim()) {
                    window.ZSphereUI.showToast('Please enter an album title.', 'error');
                    return;
                }

                const eventId = (eventIdSel && eventIdSel.value && eventIdSel.value !== 'none') ? eventIdSel.value : null;
                if (!eventId) {
                    window.ZSphereUI.showToast('Please select a related event for the photo album.', 'error');
                    return;
                }

                const slug = slugInp.value.trim() || titleInp.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
                const coverFile = (coverInp && coverInp.files && coverInp.files[0]) ? coverInp.files[0] : null;

                submitBtn.disabled = true;
                submitBtn.textContent = 'Creating Album...';

                try {
                    await window.ZSphereDataService.adminCreateAlbum({
                        title: titleInp.value.trim(),
                        slug: slug,
                        event_id: eventId
                    }, coverFile);

                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Album';
                    window.ZSphereUI.showToast('Photo album created successfully!', 'success');
                    adminAlbumForm.reset();
                    loadAdminAlbums();

                } catch (err) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Album';
                    window.ZSphereUI.showToast(err.message, 'error');
                }
            });
        }

        loadAdminAlbums();
    }

    // 6b. ADMIN ALBUM IMAGES (admin-album-images.html)
    const adminAlbumImagesContainer = document.getElementById('admin-album-images-container');
    const adminUploadPhotosForm = document.getElementById('admin-upload-photos-form');
    if (adminAlbumImagesContainer || adminUploadPhotosForm) {
        const albumId = window.ZSphereApp.getParam('album');
        if (!albumId) {
            window.ZSphereUI.showToast('Album ID not specified.', 'error');
            setTimeout(() => window.location.href = 'admin-gallery.html', 1500);
        } else {
            // Load Album Title
            window.supabaseClient.from('gallery_albums').select('title').eq('id', albumId).maybeSingle().then(({data}) => {
                if (data && document.getElementById('admin-album-title')) {
                    document.getElementById('admin-album-title').textContent = data.title;
                }
            });

            async function loadAlbumImages() {
                if (!adminAlbumImagesContainer) return;
                adminAlbumImagesContainer.innerHTML = '<p>Loading photos...</p>';
                try {
                    const images = await window.ZSphereDataService.adminGetAlbumImages(albumId);
                    if (images.length === 0) {
                        adminAlbumImagesContainer.innerHTML = '<p class="text-muted">No photos in this album yet.</p>';
                        return;
                    }

                    adminAlbumImagesContainer.innerHTML = images.map((img, idx) => {
                        const imgUrl = img.storage_path ? window.ZSphereDataService.getPublicMediaUrl(img.storage_path) : '';
                        return `
                            <div class="photo-item admin-photo-item">
                                <img src="${imgUrl}" alt="${window.ZSphereApp.escapeHtml(img.alt_text || '')}" loading="lazy">
                                <button class="btn btn-danger btn-sm admin-delete-img-btn admin-photo-delete-btn" data-id="${window.ZSphereApp.escapeHtml(img.id)}" data-path="${window.ZSphereApp.escapeHtml(img.storage_path || '')}">Delete</button>
                            </div>
                        `;
                    }).join('');

                    adminAlbumImagesContainer.querySelectorAll('.admin-delete-img-btn').forEach(btn => {
                        btn.addEventListener('click', function () {
                            const imgId = btn.getAttribute('data-id');
                            const path = btn.getAttribute('data-path');
                            window.ZSphereUI.showModal({
                                title: 'Delete Photo',
                                body: '<p>Are you sure you want to permanently delete this photograph? This cannot be undone.</p>',
                                confirmText: 'Delete Photo',
                                onConfirm: async function () {
                                    try {
                                        await window.ZSphereDataService.adminDeleteGalleryImage(imgId, path);
                                        window.ZSphereUI.showToast('Photo deleted.', 'info');
                                        loadAlbumImages();
                                    } catch (err) {
                                        window.ZSphereUI.showToast(err.message, 'error');
                                    }
                                }
                            });
                        });
                    });

                } catch (err) {
                    console.error(err);
                    adminAlbumImagesContainer.innerHTML = '<p class="text-danger">Failed to load photos.</p>';
                }
            }

            if (adminUploadPhotosForm) {
                adminUploadPhotosForm.addEventListener('submit', async function (e) {
                    e.preventDefault();
                    const fileInput = document.getElementById('upload-files');
                    const files = fileInput.files;
                    if (!files || files.length === 0) return;

                    const submitBtn = document.getElementById('upload-photos-btn');
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Uploading... (0/' + files.length + ')';

                    let successCount = 0;
                    let errorCount = 0;

                    for (let i = 0; i < files.length; i++) {
                        try {
                            submitBtn.textContent = 'Uploading... (' + (i + 1) + '/' + files.length + ')';
                            const file = files[i];
                            await window.ZSphereDataService.adminCreateGalleryImage(albumId, file, file.name, '', i);
                            successCount++;
                        } catch (err) {
                            console.error(err);
                            errorCount++;
                        }
                    }

                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Upload Selected Photos';
                    fileInput.value = '';

                    if (errorCount > 0) {
                        window.ZSphereUI.showToast(successCount + ' photos uploaded, ' + errorCount + ' failed.', 'error');
                    } else {
                        window.ZSphereUI.showToast('All photos uploaded successfully!', 'success');
                    }
                    loadAlbumImages();
                });
            }

            loadAlbumImages();
        }
    }

    // 7. ADMIN TEAM (admin-team.html)
    const adminTeamList = document.getElementById('admin-team-container');
    const adminTeamForm = document.getElementById('admin-team-form');

    if (adminTeamList) {
        async function loadAdminTeam() {
            adminTeamList.innerHTML = '<p>Loading team members...</p>';

            try {
                const team = await window.ZSphereDataService.getTeamMembers();

                if (team.length === 0) {
                    adminTeamList.innerHTML = '<p class="text-muted">No team members added yet.</p>';
                    return;
                }

                adminTeamList.innerHTML = team.map(m => {
                    const photoUrl = m.photo_path ? window.ZSphereDataService.getPublicMediaUrl(m.photo_path) : null;
                    const initials = m.name ? m.name.substring(0, 2).toUpperCase() : 'ZS';

                    return `
                        <div class="card-bordered mb-3 d-flex justify-between items-center flex-wrap gap-3">
                            <div class="d-flex gap-3 items-center">
                                <div class="avatar-circle avatar-md avatar-hero flex-center flex-shrink-0">
                                    ${photoUrl ? `<img src="${photoUrl}" class="w-full h-full avatar-circle" alt="${window.ZSphereApp.escapeHtml(m.name)}">` : initials}
                                </div>
                                <div>
                                    <h3 class="card-title font-bold mb-0 admin-list-card-title">${window.ZSphereApp.escapeHtml(m.name)}</h3>
                                    <div class="text-muted text-xs">${window.ZSphereApp.escapeHtml(m.role_title || 'Member')} · ${window.ZSphereApp.escapeHtml(m.group_name || 'core')}</div>
                                </div>
                            </div>
                            <div class="action-btns">
                                <button class="btn btn-danger btn-sm admin-delete-team-btn" data-id="${window.ZSphereApp.escapeHtml(m.id)}" data-name="${window.ZSphereApp.escapeHtml(m.name)}" aria-label="Remove team member ${window.ZSphereApp.escapeHtml(m.name)}">Remove Member</button>
                            </div>
                        </div>
                    `;
                }).join('');

                adminTeamList.querySelectorAll('.admin-delete-team-btn').forEach(btn => {
                    btn.addEventListener('click', function () {
                        const id = btn.getAttribute('data-id');
                        const name = btn.getAttribute('data-name');

                        window.ZSphereUI.showModal({
                            title: 'Remove Team Member',
                            body: `<p>Are you sure you want to remove <strong>${window.ZSphereApp.escapeHtml(name)}</strong> from the team directory?</p>`,
                            confirmText: 'Remove Member',
                            onConfirm: async function () {
                                try {
                                    await window.ZSphereDataService.adminDeleteTeamMember(id);
                                    window.ZSphereUI.showToast('Team member removed.');
                                    loadAdminTeam();
                                } catch (err) {
                                    window.ZSphereUI.showToast(err.message, 'error');
                                }
                            }
                        });
                    });
                });

            } catch (err) {
                console.error('Error loading admin team:', err);
                adminTeamList.innerHTML = '<p class="text-danger">Failed to load team members.</p>';
            }
        }

        if (adminTeamForm) {
            adminTeamForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const nameInp = document.getElementById('team-name');
                const roleInp = document.getElementById('team-role');
                const groupSel = document.getElementById('team-group');
                const bioInp = document.getElementById('team-bio');
                const linkedinInp = document.getElementById('team-linkedin');
                const githubInp = document.getElementById('team-github');
                const photoInp = document.getElementById('team-photo-file');
                const submitBtn = adminTeamForm.querySelector('button[type="submit"]');

                if (!nameInp || !nameInp.value.trim()) {
                    window.ZSphereUI.showToast('Please enter member name.', 'error');
                    return;
                }

                const payload = {
                    name: nameInp.value.trim(),
                    role_title: roleInp ? roleInp.value.trim() : 'Core Member',
                    group_name: groupSel ? groupSel.value : 'core',
                    bio: bioInp ? bioInp.value.trim() : '',
                    linkedin_url: linkedinInp ? linkedinInp.value.trim() : null,
                    github_url: githubInp ? githubInp.value.trim() : null,
                    is_active: true,
                    sort_order: 0
                };

                submitBtn.disabled = true;
                submitBtn.textContent = 'Saving Member...';

                try {
                    const photoFile = (photoInp && photoInp.files && photoInp.files[0]) ? photoInp.files[0] : null;
                    await window.ZSphereDataService.adminCreateTeamMember(payload, photoFile);
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Add Team Member';
                    window.ZSphereUI.showToast('Team member added successfully!', 'success');
                    adminTeamForm.reset();
                    loadAdminTeam();
                } catch (err) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Add Team Member';
                    window.ZSphereUI.showToast(err.message, 'error');
                }
            });
        }

        loadAdminTeam();
    }
});
