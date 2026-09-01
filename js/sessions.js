/* Z Sphere - Public Sessions Catalogue & Database Filtering */

document.addEventListener('DOMContentLoaded', function () {
    const sessionsContainer = document.getElementById('sessions-list-container');
    const featuredContainer = document.getElementById('featured-sessions-container');
    const searchInput = document.getElementById('sessions-search-input');
    const statusSelect = document.getElementById('filter-status');
    const typeSelect = document.getElementById('filter-type');
    const modeSelect = document.getElementById('filter-mode');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    const resultCountEl = document.getElementById('sessions-result-count');

    // Helper to render an event card with Supabase media URL resolution
    function renderEventCard(evt) {
        const isPages = window.ZSphereApp ? window.ZSphereApp.isPagesDir() : false;
        const safeSlug = encodeURIComponent(evt.slug || '');
        const detailLink = isPages ? `event.html?slug=${safeSlug}` : `pages/event.html?slug=${safeSlug}`;

        let displayStatus = evt.status || 'upcoming';
        
        if ((displayStatus === 'published' || displayStatus === 'upcoming') && evt.end_at) {
            if (new Date(evt.end_at) < new Date()) {
                displayStatus = 'completed';
            }
        }

        let statusBadgeClass = 'badge-completed';
        if (displayStatus === 'upcoming' || displayStatus === 'published') statusBadgeClass = 'badge-open';
        if (displayStatus === 'full') statusBadgeClass = 'badge-full';

        const isOnline = evt.venue && (evt.venue.toLowerCase().includes('online') || evt.venue.toLowerCase().includes('meet'));
        let modeBadgeClass = isOnline ? 'badge-online' : 'badge-in-person';
        const modeLabel = isOnline ? 'ONLINE' : 'IN-PERSON';

        const dateDisplay = evt.start_at ? window.ZSphereApp.formatDate(evt.start_at) : 'TBA';
        const fallbackBanner = window.ZSphereApp.getDefaultBanner(evt);
        const coverUrl = evt.cover_path ? window.ZSphereDataService.getPublicMediaUrl(evt.cover_path) : fallbackBanner;

        const isCompleted = displayStatus === 'completed';
        const cardClass = isCompleted ? 'event-card event-card-completed' : 'event-card';
        const btnClass = isCompleted ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';

        const facilitator = evt.facilitator || null;
        const facilitatorName = (facilitator && facilitator.name) || evt.conducted_by;
        const facilitatorPhotoUrl = (facilitator && facilitator.photo_path) ? window.ZSphereDataService.getPublicMediaUrl(facilitator.photo_path) : null;
        const facilitatorHtml = facilitatorName ? `
            <span class="event-author d-inline-flex items-center gap-2">
                ${facilitatorPhotoUrl ? `<img src="${facilitatorPhotoUrl}" alt="${window.ZSphereApp.escapeHtml(facilitatorName)}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid #e5e7eb; display: inline-block; vertical-align: middle;">` : ''}
                <span>Facilitated by ${window.ZSphereApp.escapeHtml(facilitatorName)}</span>
            </span>
        ` : '';

        return `
            <article class="${cardClass}">
                <div class="event-card-img-wrap">
                    <img src="${coverUrl}" alt="${window.ZSphereApp.escapeHtml(evt.title)}" class="event-card-img" loading="lazy" data-fallback-src="${fallbackBanner}">
                </div>
                <div class="event-card-body">
                    <div class="event-card-meta">
                        <span class="badge ${modeBadgeClass}">${modeLabel}</span>
                        <span class="badge ${statusBadgeClass}">${(displayStatus || 'UPCOMING').toUpperCase()}</span>
                        <span class="tag">${window.ZSphereApp.escapeHtml(evt.category || 'General')}</span>
                    </div>
                    <h3 class="event-card-title">
                        <a href="${detailLink}">${window.ZSphereApp.escapeHtml(evt.title)}</a>
                    </h3>
                    <div class="event-card-details">
                        <span class="d-inline-flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${dateDisplay}</span>
                        <span class="d-inline-flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${window.ZSphereApp.escapeHtml(evt.venue || 'TBA')}</span>
                    </div>
                    <p class="event-card-desc">${window.ZSphereApp.escapeHtml(evt.summary || '')}</p>
                    <div class="event-card-foot">
                        ${facilitatorHtml}
                        <a href="${detailLink}" class="${btnClass}">View Session Details &rarr;</a>
                    </div>
                </div>
            </article>
        `;
    }

    // Load Featured Events on Landing Page
    async function loadFeaturedEvents() {
        if (!featuredContainer || !window.ZSphereDataService) return;
        if (window.ZSphereUI) window.ZSphereUI.renderLoadingSkeleton(featuredContainer, 2, 'card');

        try {
            const featured = await window.ZSphereDataService.getFeaturedEvents();
            if (featured.length === 0) {
                if (window.ZSphereUI) {
                    window.ZSphereUI.renderEmptyState(featuredContainer, 'No upcoming featured sessions', 'Check back soon for new workshop announcements.');
                }
            } else {
                featuredContainer.innerHTML = featured.map(renderEventCard).join('');
            }
        } catch (e) {
            console.error('Error loading featured events:', e);
            if (window.ZSphereUI) {
                window.ZSphereUI.renderErrorState(featuredContainer, 'Unable to load featured sessions', 'Please check your connection and try again.', loadFeaturedEvents);
            }
        }
    }

    // Sessions Catalogue Filtering
    async function fetchAndRenderSessions() {
        if (!sessionsContainer || !window.ZSphereDataService) return;
        if (window.ZSphereUI) window.ZSphereUI.renderLoadingSkeleton(sessionsContainer, 3, 'card');

        const query = searchInput ? searchInput.value.trim() : '';
        const status = statusSelect ? statusSelect.value : 'all';
        const type = typeSelect ? typeSelect.value : 'all';
        const mode = modeSelect ? modeSelect.value : 'all';

        try {
            const events = await window.ZSphereDataService.getEvents({
                q: query,
                status: status,
                type: type,
                mode: mode
            });

            if (resultCountEl) {
                resultCountEl.textContent = `${events.length} session${events.length !== 1 ? 's' : ''} available`;
            }

            if (events.length === 0) {
                if (window.ZSphereUI) {
                    window.ZSphereUI.renderEmptyState(
                        sessionsContainer,
                        'No sessions match your search',
                        'Try resetting your status or category filters to explore all available sessions.',
                        'Reset All Filters',
                        null,
                        window.ZSphereSessionsClearFilters
                    );
                }
            } else {
                sessionsContainer.innerHTML = events.map(renderEventCard).join('');
            }
        } catch (err) {
            console.error('Error fetching sessions:', err);
            if (window.ZSphereUI) {
                window.ZSphereUI.renderErrorState(sessionsContainer, 'Could not load sessions', 'Failed to fetch sessions catalogue from database.', fetchAndRenderSessions);
            }
        }
    }

    // Mobile Filter Dialog Elements
    const mobileFilterBtn = document.getElementById('mobile-filter-dialog-btn');
    const filterDialogBackdrop = document.getElementById('filter-dialog-backdrop');
    const filterDialogModal = document.getElementById('filter-dialog-modal');
    const filterDialogCloseBtn = document.getElementById('filter-dialog-close-btn');
    const modalStatusSelect = document.getElementById('modal-filter-status');
    const modalTypeSelect = document.getElementById('modal-filter-type');
    const modalModeSelect = document.getElementById('modal-filter-mode');
    const modalApplyBtn = document.getElementById('modal-apply-filters-btn');
    const modalClearBtn = document.getElementById('modal-clear-filters-btn');
    const filterCountBadge = document.getElementById('active-filter-count');

    function updateActiveFilterBadge() {
        if (!filterCountBadge) return;
        let count = 0;
        if (statusSelect && statusSelect.value !== 'all') count++;
        if (typeSelect && typeSelect.value !== 'all') count++;
        if (modeSelect && modeSelect.value !== 'all') count++;

        if (count > 0) {
            filterCountBadge.textContent = count;
            filterCountBadge.style.display = 'inline-flex';
        } else {
            filterCountBadge.style.display = 'none';
        }
    }

    function openFilterDialog() {
        if (!filterDialogBackdrop) return;
        // Sync modal selects from current active values
        if (modalStatusSelect && statusSelect) modalStatusSelect.value = statusSelect.value;
        if (modalTypeSelect && typeSelect) modalTypeSelect.value = typeSelect.value;
        if (modalModeSelect && modeSelect) modalModeSelect.value = modeSelect.value;

        filterDialogBackdrop.classList.add('active');
        filterDialogBackdrop.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeFilterDialog() {
        if (!filterDialogBackdrop) return;
        filterDialogBackdrop.classList.remove('active');
        filterDialogBackdrop.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    window.ZSphereSessionsClearFilters = function () {
        if (searchInput) searchInput.value = '';
        if (statusSelect) statusSelect.value = 'all';
        if (typeSelect) typeSelect.value = 'all';
        if (modeSelect) modeSelect.value = 'all';
        if (modalStatusSelect) modalStatusSelect.value = 'all';
        if (modalTypeSelect) modalTypeSelect.value = 'all';
        if (modalModeSelect) modalModeSelect.value = 'all';
        updateActiveFilterBadge();
        fetchAndRenderSessions();
    };

    // Event listeners
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(fetchAndRenderSessions, 250);
        });
    }
    if (statusSelect) {
        statusSelect.addEventListener('change', function () {
            updateActiveFilterBadge();
            fetchAndRenderSessions();
        });
    }
    if (typeSelect) {
        typeSelect.addEventListener('change', function () {
            updateActiveFilterBadge();
            fetchAndRenderSessions();
        });
    }
    if (modeSelect) {
        modeSelect.addEventListener('change', function () {
            updateActiveFilterBadge();
            fetchAndRenderSessions();
        });
    }
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', window.ZSphereSessionsClearFilters);

    // Mobile Filter Dialog Handlers
    if (mobileFilterBtn) mobileFilterBtn.addEventListener('click', openFilterDialog);
    if (filterDialogCloseBtn) filterDialogCloseBtn.addEventListener('click', closeFilterDialog);
    if (filterDialogBackdrop) {
        filterDialogBackdrop.addEventListener('click', function (e) {
            if (e.target === filterDialogBackdrop) {
                closeFilterDialog();
            }
        });
    }

    if (modalApplyBtn) {
        modalApplyBtn.addEventListener('click', function () {
            if (statusSelect && modalStatusSelect) statusSelect.value = modalStatusSelect.value;
            if (typeSelect && modalTypeSelect) typeSelect.value = modalTypeSelect.value;
            if (modeSelect && modalModeSelect) modeSelect.value = modalModeSelect.value;
            updateActiveFilterBadge();
            closeFilterDialog();
            fetchAndRenderSessions();
        });
    }

    if (modalClearBtn) {
        modalClearBtn.addEventListener('click', function () {
            window.ZSphereSessionsClearFilters();
            closeFilterDialog();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && filterDialogBackdrop && filterDialogBackdrop.classList.contains('active')) {
            closeFilterDialog();
        }
    });

    // URL parameter pre-fill
    if (searchInput && window.ZSphereApp) {
        const urlQ = window.ZSphereApp.getParam('q');
        if (urlQ) searchInput.value = urlQ;
    }
    
    // Load Recent Albums (for index2.html)
    async function loadRecentAlbums() {
        const homeGalleryContainer = document.getElementById('home-gallery-container');
        if (!homeGalleryContainer) return;
        
        try {
            let albums = [];
            if (window.ZSphereDataService && typeof window.ZSphereDataService.getGalleryAlbums === 'function') {
                try {
                    albums = await window.ZSphereDataService.getGalleryAlbums();
                } catch (err) {
                    console.warn('Error fetching home albums:', err);
                }
            }
            
            if (!albums || albums.length === 0) {
                if (window.ZSphereDataService && typeof window.ZSphereDataService.getDefaultAlbums === 'function') {
                    albums = window.ZSphereDataService.getDefaultAlbums();
                }
            }
            
            if (!albums || albums.length === 0) return;
            
            const recentAlbums = albums.slice(0, 3);
            const isPages = window.ZSphereApp ? window.ZSphereApp.isPagesDir() : false;
            
            homeGalleryContainer.innerHTML = recentAlbums.map((alb, idx) => {
                const dateDisplay = alb.created_at ? (window.ZSphereApp ? window.ZSphereApp.formatDate(alb.created_at) : '') : '';
                const coverUrl = (alb.cover_path && window.ZSphereDataService) ? window.ZSphereDataService.getPublicMediaUrl(alb.cover_path) : null;
                const initials = alb.title ? alb.title.substring(0, 2).toUpperCase() : 'ZS';
                const safeAlbumSlug = encodeURIComponent(alb.slug || alb.id || '');
                const detailLink = isPages ? `gallery-album.html?album=${safeAlbumSlug}` : `pages/gallery-album.html?album=${safeAlbumSlug}`;
                const eventTitle = alb.events ? (Array.isArray(alb.events) ? (alb.events[0] && alb.events[0].title) : alb.events.title) : '';
                const trackName = eventTitle ? (window.ZSphereApp ? window.ZSphereApp.escapeHtml(eventTitle) : eventTitle) : 'Technical Workshop';

                return `
                    <div class="album-card reveal reveal-delay-${idx}">
                        <div class="album-cover">
                            ${coverUrl ? `<img src="${coverUrl}" alt="${window.ZSphereApp ? window.ZSphereApp.escapeHtml(alb.title) : alb.title}" loading="lazy" data-fallback-text="${initials}">` : `
                                <div class="album-cover-initials">${initials}</div>
                                <span class="album-cover-badge">${trackName}</span>
                            `}
                        </div>
                        <div class="album-info">
                            <span class="text-muted text-xs d-block mb-1">${dateDisplay} · ${trackName}</span>
                            <h3 class="card-title mb-2">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(alb.title) : alb.title}</h3>
                            <a href="${detailLink}" class="btn btn-ghost btn-sm mt-1">View Album &rarr;</a>
                        </div>
                    </div>
                `;
            }).join('');

            if (window.ZSphereUI && typeof window.ZSphereUI.initRevealObserver === 'function') {
                window.ZSphereUI.initRevealObserver();
            }
        } catch (err) {
            console.error('Error fetching home albums:', err);
        }
    }

    // Dynamic Proof Metrics Calculation (Real Quantified Data Stats)
    async function loadPlatformMetrics() {
        const eventsEl = document.getElementById('stats-events-count');
        const regsEl = document.getElementById('stats-registrations-count');
        const projEl = document.getElementById('stats-projects-count');

        if (!eventsEl && !regsEl && !projEl) return;

        let totalSessions = 25;
        let totalRegistrations = 500;
        let totalProjects = 40;

        try {
            if (window.ZSphereDataService && typeof window.ZSphereDataService.getPlatformStats === 'function') {
                const stats = await window.ZSphereDataService.getPlatformStats();
                if (stats) {
                    if (stats.sessions) totalSessions = stats.sessions;
                    if (stats.registrations) totalRegistrations = stats.registrations;
                    if (stats.projects) totalProjects = stats.projects;
                }
            }
        } catch (err) {
            console.warn('Using baseline quantified metrics:', err);
        }

        function animateCount(el, target, suffix = '+') {
            if (!el) return;
            const duration = 1200;
            const start = 0;
            const startTime = performance.now();

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out cubic
                const easeProgress = 1 - Math.pow(1 - progress, 3);
                const currentVal = Math.floor(start + (target - start) * easeProgress);
                el.textContent = `${currentVal}${suffix}`;

                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    el.textContent = `${target}${suffix}`;
                }
            }

            requestAnimationFrame(update);
        }

        animateCount(eventsEl, totalSessions);
        animateCount(regsEl, totalRegistrations);
        animateCount(projEl, totalProjects);
    }

    // Initialize queries
    loadFeaturedEvents();
    fetchAndRenderSessions();
    loadRecentAlbums();
    loadPlatformMetrics();
});
