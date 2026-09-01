/* Z Sphere - Announcements & Updates Controller */

document.addEventListener('DOMContentLoaded', function () {
    const announcementsContainer = document.getElementById('announcements-container');
    const filterButtons = document.querySelectorAll('.announcement-filter-btn');

    if (!announcementsContainer || !window.ZSphereDataService) return;

    let activeFilter = 'all';

    async function fetchAndRenderAnnouncements() {
        if (window.ZSphereUI) window.ZSphereUI.renderLoadingSkeleton(announcementsContainer, 2, 'card');

        try {
            const allItems = await window.ZSphereDataService.getAnnouncements();

            const items = allItems.filter(item => {
                if (activeFilter === 'all') return true;
                if (activeFilter === 'important') return item.priority === 'important';
                return item.category ? item.category.toLowerCase() === activeFilter.toLowerCase() : (item.priority === activeFilter);
            });

            if (items.length === 0) {
                if (window.ZSphereUI) {
                    window.ZSphereUI.renderEmptyState(announcementsContainer, 'No announcements in this category', 'Select another category to explore Z Sphere updates.', 'View All Announcements', null, window.ZSphereResetAnnouncements);
                }
                return;
            }

            const user = window.ZSphereAuthState ? window.ZSphereAuthState.user : null;

            announcementsContainer.innerHTML = items.map(item => {
                const dateDisplay = item.published_at ? window.ZSphereApp.formatDate(item.published_at) : (item.created_at ? window.ZSphereApp.formatDate(item.created_at) : '');
                const isUnread = user && !item.is_read;

                const relatedEvent = item.events ? (Array.isArray(item.events) ? item.events[0] : item.events) : null;

                return `
                    <article class="announcement-card ${item.priority === 'important' ? 'priority-important' : ''} ${isUnread ? 'unread' : ''}">
                        <div class="d-flex justify-between items-start mb-2 flex-wrap gap-2">
                            <div class="d-flex items-center gap-2">
                                <span class="tag">${item.audience === 'registered' ? 'Registered Members' : 'Public Announcement'}</span>
                                ${item.priority === 'important' ? '<span class="badge badge-warning">IMPORTANT</span>' : ''}
                                ${isUnread ? '<span class="badge badge-open">NEW</span>' : ''}
                            </div>
                            <span class="text-muted text-xs d-inline-flex items-center gap-1">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                <span>${dateDisplay}</span>
                            </span>
                        </div>
                        <h2 class="card-title mb-2">${window.ZSphereApp.escapeHtml(item.title)}</h2>
                        <p class="text-body mb-3">${window.ZSphereApp.escapeHtml(item.body)}</p>
                        
                        <div class="d-flex justify-between items-center flex-wrap gap-2">
                            ${relatedEvent && relatedEvent.title ? `
                                <a href="event.html?slug=${encodeURIComponent(relatedEvent.slug || '')}" class="btn btn-ghost btn-sm p-0 text-primary">Related Session: ${window.ZSphereApp.escapeHtml(relatedEvent.title)} &rarr;</a>
                            ` : '<span></span>'}
                            
                            ${user ? `
                                <button class="btn btn-secondary btn-sm toggle-read-btn" data-id="${window.ZSphereApp.escapeHtml(item.id)}" data-read="${item.is_read}">
                                    ${item.is_read ? 'Mark as Unread' : 'Mark as Read'}
                                </button>
                            ` : ''}
                        </div>
                    </article>
                `;
            }).join('');

            // Attach read toggle listeners for authenticated students
            if (user) {
                announcementsContainer.querySelectorAll('.toggle-read-btn').forEach(btn => {
                    btn.addEventListener('click', async function () {
                        const id = btn.getAttribute('data-id');
                        const isRead = btn.getAttribute('data-read') === 'true';

                        btn.disabled = true;

                        try {
                            if (isRead) {
                                await window.ZSphereDataService.markAnnouncementUnread(id);
                                window.ZSphereUI.showToast('Marked announcement as unread.', 'info');
                            } else {
                                await window.ZSphereDataService.markAnnouncementRead(id);
                                window.ZSphereUI.showToast('Marked announcement as read.', 'success');
                            }
                            fetchAndRenderAnnouncements();
                        } catch (err) {
                            btn.disabled = false;
                            window.ZSphereUI.showToast(err.message, 'error');
                        }
                    });
                });
            }

        } catch (err) {
            console.error('Error loading announcements:', err);
            if (window.ZSphereUI) {
                window.ZSphereUI.renderErrorState(announcementsContainer, 'Could not load announcements', 'Failed to retrieve updates from database.', fetchAndRenderAnnouncements);
            }
        }
    }

    window.ZSphereResetAnnouncements = function () {
        activeFilter = 'all';
        filterButtons.forEach(b => {
            const isAll = b.getAttribute('data-filter') === 'all';
            b.classList.toggle('active', isAll);
            b.setAttribute('aria-selected', isAll ? 'true' : 'false');
        });
        fetchAndRenderAnnouncements();
    };

    filterButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            filterButtons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');

            activeFilter = btn.getAttribute('data-filter');
            fetchAndRenderAnnouncements();
        });
    });

    fetchAndRenderAnnouncements();
});
