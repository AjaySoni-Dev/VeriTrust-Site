/* Z Sphere - Reusable UI Primitives (Accessible Modals, Toasts, Lightbox, Async States) */

(function () {
    window.ZSphereUI = {
        // Toast Notification System (UI-17)
        showToast: function (message, type = 'info') {
            let container = document.querySelector('.toast-container');
            if (!container) {
                container = document.createElement('div');
                container.className = 'toast-container';
                container.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
                container.setAttribute('aria-atomic', 'true');
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            const safeMsg = window.ZSphereApp ? window.ZSphereApp.escapeHtml(message) : message;
            toast.innerHTML = `
                <span>${safeMsg}</span>
                <button class="toast-close" aria-label="Dismiss notification">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;

            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', function () {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                toast.style.transition = 'all 0.25s ease';
                setTimeout(() => toast.remove(), 250);
            });

            container.appendChild(toast);

            // Persistent errors (10s) vs standard notices (4s)
            const duration = type === 'error' ? 10000 : 4000;
            setTimeout(function () {
                if (toast.parentElement) {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateY(10px)';
                    toast.style.transition = 'all 0.25s ease';
                    setTimeout(() => toast.remove(), 250);
                }
            }, duration);
        },

        // Modal System with Accessible Focus Trap, Light-Dismiss & Focus Restoration (UI-05)
        showModal: function (options) {
            const title = options.title || 'Notification';
            const body = options.body || '';
            const confirmText = options.confirmText || 'Confirm';
            const cancelText = options.cancelText || 'Cancel';
            const onConfirm = options.onConfirm || null;
            const hideCancel = options.hideCancel || false;
            const previouslyFocused = document.activeElement;

            let backdrop = document.getElementById('zsphere-global-modal');
            if (backdrop) {
                backdrop.remove();
            }

            const titleId = 'zsphere-modal-title-' + Math.random().toString(36).substr(2, 9);

            backdrop = document.createElement('div');
            backdrop.id = 'zsphere-global-modal';
            backdrop.className = `modal-backdrop ${options.modalClass || ''}`;
            backdrop.innerHTML = `
                <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
                    <div class="modal-header">
                        <h3 class="modal-title" id="${titleId}">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(title) : title}</h3>
                        <button class="modal-close" aria-label="Close dialog">&times;</button>
                    </div>
                    <div class="modal-body">${body}</div>
                    <div class="modal-footer">
                        ${!hideCancel ? `<button class="btn btn-secondary modal-cancel-btn">${cancelText}</button>` : ''}
                        <button class="btn btn-primary modal-confirm-btn">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);
            document.body.style.overflow = 'hidden';

            requestAnimationFrame(function () {
                backdrop.classList.add('active');
                const focusable = backdrop.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
                if (focusable.length) {
                    focusable[0].focus();
                }
            });

            function closeModal() {
                backdrop.classList.remove('active');
                document.body.style.overflow = '';
                document.removeEventListener('keydown', keyHandler);
                setTimeout(() => {
                    backdrop.remove();
                    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                        previouslyFocused.focus();
                    }
                }, 250);
            }

            // Keyboard Focus Trap & ESC dismissal
            function keyHandler(e) {
                if (e.key === 'Escape') {
                    closeModal();
                } else if (e.key === 'Tab') {
                    const focusable = Array.from(backdrop.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
                    if (!focusable.length) return;
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        last.focus();
                        e.preventDefault();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        first.focus();
                        e.preventDefault();
                    }
                }
            }
            document.addEventListener('keydown', keyHandler);

            const closeBtn = backdrop.querySelector('.modal-close');
            if (closeBtn) closeBtn.addEventListener('click', closeModal);

            const cancelBtn = backdrop.querySelector('.modal-cancel-btn');
            if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

            const confirmBtn = backdrop.querySelector('.modal-confirm-btn');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', function () {
                    if (typeof onConfirm === 'function') {
                        onConfirm();
                    }
                    closeModal();
                });
            }

            backdrop.addEventListener('click', function (e) {
                if (e.target === backdrop) {
                    closeModal();
                }
            });
        },

        // Accessible Gallery Lightbox Viewer with Next/Prev Keyboard Navigation (UI-18)
        showGalleryLightbox: function (images, initialIndex = 0, albumTitle = 'Gallery Album') {
            if (!Array.isArray(images) || images.length === 0) return;
            let currentIndex = initialIndex;

            const previouslyFocused = document.activeElement;
            const modalId = 'zsphere-gallery-lightbox';
            let backdrop = document.getElementById(modalId);
            if (backdrop) backdrop.remove();

            backdrop = document.createElement('div');
            backdrop.id = modalId;
            backdrop.className = 'modal-backdrop lightbox-modal';
            
            function renderLightboxContent() {
                const img = images[currentIndex];
                const imgUrl = img.storage_path ? window.ZSphereDataService.getPublicMediaUrl(img.storage_path) : (img.url || '');
                const titleText = img.alt_text || img.caption || `${albumTitle} - Photo ${currentIndex + 1}`;
                const captionText = img.caption || img.alt_text || '';

                backdrop.innerHTML = `
                    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Photo Lightbox Viewer">
                        <div class="modal-header">
                            <h3 class="modal-title">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(albumTitle) : albumTitle}</h3>
                            <button class="modal-close" aria-label="Close photo viewer">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="lightbox-image-wrap">
                                <img src="${imgUrl}" alt="${window.ZSphereApp.escapeHtml(titleText)}" class="lightbox-img" loading="eager">
                            </div>
                            <div class="lightbox-controls">
                                <button class="lightbox-nav-btn" id="lightbox-prev-btn" aria-label="Previous photograph" ${currentIndex === 0 ? 'disabled' : ''}>
                                    ← Previous
                                </button>
                                <div class="lightbox-caption text-center">
                                    <span>${window.ZSphereApp.escapeHtml(captionText)}</span>
                                    <div class="lightbox-counter mt-1">Photo ${currentIndex + 1} of ${images.length}</div>
                                </div>
                                <button class="lightbox-nav-btn" id="lightbox-next-btn" aria-label="Next photograph" ${currentIndex === images.length - 1 ? 'disabled' : ''}>
                                    Next →
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                // Re-bind listeners
                backdrop.querySelector('.modal-close').addEventListener('click', closeLightbox);
                
                const prevBtn = backdrop.querySelector('#lightbox-prev-btn');
                if (prevBtn && currentIndex > 0) {
                    prevBtn.addEventListener('click', () => {
                        currentIndex--;
                        renderLightboxContent();
                    });
                }

                const nextBtn = backdrop.querySelector('#lightbox-next-btn');
                if (nextBtn && currentIndex < images.length - 1) {
                    nextBtn.addEventListener('click', () => {
                        currentIndex++;
                        renderLightboxContent();
                    });
                }
            }

            renderLightboxContent();
            document.body.appendChild(backdrop);
            document.body.style.overflow = 'hidden';

            requestAnimationFrame(() => {
                backdrop.classList.add('active');
                const closeBtn = backdrop.querySelector('.modal-close');
                if (closeBtn) closeBtn.focus();
            });

            function closeLightbox() {
                backdrop.classList.remove('active');
                document.body.style.overflow = '';
                document.removeEventListener('keydown', keyNavHandler);
                setTimeout(() => {
                    backdrop.remove();
                    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                        previouslyFocused.focus();
                    }
                }, 250);
            }

            function keyNavHandler(e) {
                if (e.key === 'Escape') {
                    closeLightbox();
                } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
                    currentIndex--;
                    renderLightboxContent();
                } else if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
                    currentIndex++;
                    renderLightboxContent();
                }
            }
            document.addEventListener('keydown', keyNavHandler);

            backdrop.addEventListener('click', function (e) {
                if (e.target === backdrop) {
                    closeLightbox();
                }
            });
        },

        // Universal Async State Renderers (UI-09)
        renderLoadingSkeleton: function (container, count = 3, type = 'card') {
            if (!container) return;
            let html = '';
            for (let i = 0; i < count; i++) {
                if (type === 'card') {
                    html += `<div class="skeleton skeleton-card mb-4" aria-hidden="true"></div>`;
                } else {
                    html += `
                        <div class="mb-4" aria-hidden="true">
                            <div class="skeleton skeleton-title"></div>
                            <div class="skeleton skeleton-text"></div>
                            <div class="skeleton skeleton-text w-full"></div>
                        </div>
                    `;
                }
            }
            container.innerHTML = `<div class="loading-state-wrap" aria-label="Loading content...">${html}</div>`;
        },

        renderEmptyState: function (container, title, description, actionText, actionHref, actionOnClick) {
            if (!container) return;
            let actionHtml = '';
            if (actionText && actionHref) {
                actionHtml = `<a href="${actionHref}" class="btn btn-primary mt-3">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(actionText) : actionText}</a>`;
            } else if (actionText && typeof actionOnClick === 'function') {
                actionHtml = `<button type="button" class="btn btn-primary mt-3 empty-state-action-btn">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(actionText) : actionText}</button>`;
            }

            container.innerHTML = `
                <div class="empty-state" role="status">
                    <div class="empty-state-icon" aria-hidden="true">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    </div>
                    <h3 class="empty-state-title">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(title) : title}</h3>
                    <p class="empty-state-desc">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(description) : description}</p>
                    ${actionHtml}
                </div>
            `;

            if (typeof actionOnClick === 'function') {
                const actionButton = container.querySelector('.empty-state-action-btn');
                if (actionButton) actionButton.addEventListener('click', actionOnClick);
            }
        },

        renderErrorState: function (container, title, message, retryAction) {
            if (!container) return;
            let retryHtml = '';
            if (typeof retryAction === 'function') {
                retryHtml = `<button type="button" class="btn btn-secondary btn-sm mt-3 error-retry-btn">Try again</button>`;
            }
            container.innerHTML = `
                <div class="error-state" role="alert">
                    <h4 class="error-state-title">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(title) : title}</h4>
                    <p class="error-state-desc mb-0">${window.ZSphereApp ? window.ZSphereApp.escapeHtml(message) : message}</p>
                    ${retryHtml}
                </div>
            `;
            if (typeof retryAction === 'function') {
                const btn = container.querySelector('.error-retry-btn');
                if (btn) {
                    btn.addEventListener('click', function (e) {
                        e.preventDefault();
                        retryAction();
                    });
                }
            }
        },
        // Dynamic Reveal Observer for initial and async-loaded content
        initRevealObserver: function () {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                document.querySelectorAll('.reveal').forEach(el => el.classList.add('active'));
                return;
            }

            if (!('IntersectionObserver' in window)) {
                document.querySelectorAll('.reveal').forEach(el => el.classList.add('active'));
                return;
            }

            document.documentElement.classList.add('js-reveal-active');

            if (!window._zsphereRevealObserver) {
                window._zsphereRevealObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('active');
                            window._zsphereRevealObserver.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0.05, rootMargin: '0px 0px -10px 0px' });
            }

            const unobserved = document.querySelectorAll('.reveal:not(.active)');
            unobserved.forEach(el => window._zsphereRevealObserver.observe(el));
        },

        // Interactive Cookie Preferences Banner Handler
        initCookieConsent: function () {
            const banner = document.getElementById('cookie-preferences-banner');
            if (!banner) return;

            const consent = localStorage.getItem('zs_cookie_consent');
            if (consent) {
                banner.style.display = 'none';
                return;
            }

            const acceptBtn = document.getElementById('cookie-accept-btn');
            const declineBtn = document.getElementById('cookie-decline-btn');

            if (acceptBtn) {
                acceptBtn.addEventListener('click', function () {
                    localStorage.setItem('zs_cookie_consent', 'accepted');
                    banner.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                    banner.style.transform = 'translateY(100%)';
                    banner.style.opacity = '0';
                    setTimeout(() => banner.remove(), 300);
                });
            }

            if (declineBtn) {
                declineBtn.addEventListener('click', function () {
                    localStorage.setItem('zs_cookie_consent', 'declined');
                    banner.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                    banner.style.transform = 'translateY(100%)';
                    banner.style.opacity = '0';
                    setTimeout(() => banner.remove(), 300);
                });
            }
        }
    };

    // Progressive Reveal Observer & Cookie Consent Init (UI-06, UI-16)
    document.addEventListener('DOMContentLoaded', function () {
        window.ZSphereUI.initRevealObserver();
        window.ZSphereUI.initCookieConsent();

        // Debounced MutationObserver to watch for async-loaded DOM elements without lag
        if ('MutationObserver' in window) {
            let mutationRaf = null;
            const domObserver = new MutationObserver(() => {
                if (mutationRaf) return;
                mutationRaf = requestAnimationFrame(() => {
                    window.ZSphereUI.initRevealObserver();
                    mutationRaf = null;
                });
            });
            domObserver.observe(document.body, { childList: true, subtree: true });
        }
    });
})();
