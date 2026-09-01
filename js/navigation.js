/* Z Sphere - Mobile Navigation, Search Pill Controller & Canonical Link Synchronizer */

(function () {
    window.ZSphereNav = {
        // Canonical Public Navigation Data Source (UI-01)
        publicNavItems: [
            { label: 'Home', page: 'index2.html' },
            { label: 'Sessions', page: 'sessions.html' },
            { label: 'Learning Tracks', page: 'domains.html' },
            { label: 'Announcements', page: 'announcements.html' },
            { label: 'Gallery', page: 'gallery.html' },
            { label: 'Team', page: 'team.html' },
            { label: 'About', page: 'about.html' }
        ],

        // Active page calculation helper
        getCurrentPage: function () {
            const path = window.location.pathname;
            const filename = path.split('/').pop().split('?')[0] || 'index2.html';
            return filename;
        },

        // Compute correct relative link from current directory context
        getRelativeHref: function (targetPage) {
            const isPages = window.location.pathname.includes('/pages/');
            if (targetPage === 'index2.html') {
                return isPages ? '../index2.html' : 'index2.html';
            }
            return isPages ? targetPage : `pages/${targetPage}`;
        },

        // Synchronize desktop nav, drawer nav, and footer nav to prevent drift (UI-01, UI-02, UI-31)
        syncPublicNavigation: function () {
            const current = this.getCurrentPage();

            // Desktop Nav Sync
            const desktopNav = document.querySelector('.desktop-nav');
            if (desktopNav && !desktopNav.dataset.custom) {
                let html = '';
                this.publicNavItems.forEach(item => {
                    const href = this.getRelativeHref(item.page);
                    const active = (item.page === current || (item.page === 'domains.html' && current === 'domain.html') || (item.page === 'sessions.html' && current === 'event.html') || (item.page === 'gallery.html' && current === 'gallery-album.html')) ? 'active' : '';
                    html += `<a href="${href}" class="nav-link ${active}">${item.label}</a>`;
                });
                desktopNav.innerHTML = html;
            }

            // Drawer Nav Sync
            const drawerNav = document.querySelector('.drawer-nav');
            if (drawerNav && !drawerNav.dataset.custom) {
                let html = '';
                this.publicNavItems.forEach(item => {
                    const href = this.getRelativeHref(item.page);
                    const active = (item.page === current || (item.page === 'domains.html' && current === 'domain.html') || (item.page === 'sessions.html' && current === 'event.html') || (item.page === 'gallery.html' && current === 'gallery-album.html')) ? 'active' : '';
                    html += `<a href="${href}" class="drawer-nav-link ${active}">${item.label}</a>`;
                });
                drawerNav.innerHTML = html;
            }

            // Footer Nav Sync (Ensures public footer never exposes internal admin links - UI-31)
            const footerNav = document.querySelector('.footer-nav');
            if (footerNav && !footerNav.dataset.custom) {
                let html = '';
                this.publicNavItems.forEach(item => {
                    const href = this.getRelativeHref(item.page);
                    html += `<a href="${href}" class="footer-link">${item.label}</a>`;
                });
                footerNav.innerHTML = html;
            }
        },

        // Initialize Dribbble-Style Search Pill & Filter Dropdown
        initSearchPill: function () {
            const searchBar = document.querySelector('.header-search-bar');
            if (!searchBar) return;

            const input = searchBar.querySelector('.header-search-input');
            const btn = searchBar.querySelector('.header-search-btn');
            const filterTrigger = searchBar.querySelector('.header-search-filter');
            const filterMenu = searchBar.querySelector('.filter-dropdown-menu');
            const selectedText = searchBar.querySelector('.filter-selected-text');
            const dropdownItems = searchBar.querySelectorAll('.filter-dropdown-item');

            let currentFilter = 'shots';

            // Check URL parameters to pre-fill search if present
            const params = new URLSearchParams(window.location.search);
            const queryParam = params.get('q');
            if (queryParam && input) {
                input.value = queryParam;
            }

            // Toggle category filter dropdown
            if (filterTrigger && filterMenu) {
                filterTrigger.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const isOpen = filterMenu.classList.toggle('open');
                    filterTrigger.classList.toggle('open', isOpen);
                    filterTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                });

                filterTrigger.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const isOpen = filterMenu.classList.toggle('open');
                        filterTrigger.classList.toggle('open', isOpen);
                        filterTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                    }
                });

                // Select category item
                dropdownItems.forEach(item => {
                    item.addEventListener('click', function (e) {
                        e.stopPropagation();
                        dropdownItems.forEach(i => i.classList.remove('active'));
                        this.classList.add('active');
                        currentFilter = this.dataset.value || 'shots';
                        if (selectedText) {
                            selectedText.textContent = this.textContent.trim();
                        }
                        filterMenu.classList.remove('open');
                        filterTrigger.classList.remove('open');
                        filterTrigger.setAttribute('aria-expanded', 'false');
                        if (input) input.focus();
                    });
                });

                // Close dropdown on click outside
                document.addEventListener('click', function (e) {
                    if (!filterTrigger.contains(e.target)) {
                        filterMenu.classList.remove('open');
                        filterTrigger.classList.remove('open');
                        filterTrigger.setAttribute('aria-expanded', 'false');
                    }
                });
            }

            // Execute search helper
            const executeSearch = () => {
                if (!input) return;
                const query = input.value.trim();
                const isPages = window.location.pathname.includes('/pages/');
                const currentPage = this.getCurrentPage();

                if (currentPage === 'sessions.html') {
                    // Real-time filter synchronization on sessions page
                    const pageSearchInput = document.getElementById('sessions-search-input');
                    if (pageSearchInput) {
                        pageSearchInput.value = query;
                        pageSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                } else {
                    // Navigate to sessions or targeted page
                    let targetPage = 'sessions.html';
                    if (currentFilter === 'tracks') targetPage = 'domains.html';
                    if (currentFilter === 'announcements') targetPage = 'announcements.html';

                    const href = (isPages ? targetPage : `pages/${targetPage}`) + (query ? `?q=${encodeURIComponent(query)}` : '');
                    window.location.href = href;
                }
            };

            if (input) {
                input.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        executeSearch();
                    }
                });

                // Synchronize live search on sessions page while typing
                if (this.getCurrentPage() === 'sessions.html') {
                    input.addEventListener('input', function () {
                        const pageSearchInput = document.getElementById('sessions-search-input');
                        if (pageSearchInput) {
                            pageSearchInput.value = input.value;
                            pageSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    });
                }
            }

            if (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    executeSearch();
                });
            }
        },

        // Sync dynamic auth state for header Log In pill
        syncAuthState: function () {
            const authBtn = document.getElementById('header-auth-btn');
            if (!authBtn) return;

            try {
                // Check localStorage for active session or user
                const storedSession = localStorage.getItem('zsphere_session') || localStorage.getItem('supabase.auth.token');
                const isPages = window.location.pathname.includes('/pages/');
                const accountHref = isPages ? 'account.html' : 'pages/account.html';
                const loginHref = isPages ? 'login.html' : 'pages/login.html';

                if (storedSession) {
                    authBtn.textContent = 'Account';
                    authBtn.href = accountHref;
                } else {
                    authBtn.textContent = 'Log in';
                    authBtn.href = loginHref;
                }
            } catch (err) {
                // Default fallback
            }
        }
    };

    document.addEventListener('DOMContentLoaded', function () {
        // Sync public navigation markup, search pill & auth
        window.ZSphereNav.syncPublicNavigation();
        window.ZSphereNav.initSearchPill();
        window.ZSphereNav.syncAuthState();

        // Sticky Header scroll elevation
        const header = document.querySelector('.site-header');
        if (header) {
            const updateScroll = () => {
                if (window.scrollY > 12) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
            };
            window.addEventListener('scroll', updateScroll, { passive: true });
            updateScroll();
        }

        // Accessible Drawer Controller with Complete Focus Trap & Return (UI-04)
        const mobileToggle = document.querySelector('.mobile-toggle');
        const drawer = document.querySelector('.mobile-drawer');
        const backdrop = document.querySelector('.mobile-drawer-backdrop');
        const drawerClose = document.querySelector('.drawer-close');
        let focusReturnElement = null;

        if (mobileToggle) {
            mobileToggle.setAttribute('aria-expanded', 'false');
            mobileToggle.setAttribute('aria-controls', 'mobile-drawer-pane');
            mobileToggle.setAttribute('aria-label', 'Open navigation menu');
        }

        if (drawer) {
            drawer.setAttribute('id', 'mobile-drawer-pane');
        }

        function openDrawer(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (drawer && backdrop) {
                const currentScroll = window.scrollY || window.pageYOffset;
                focusReturnElement = document.activeElement;
                drawer.classList.add('active');
                backdrop.classList.add('active');
                document.body.classList.add('drawer-open');
                if (mobileToggle) {
                    mobileToggle.setAttribute('aria-expanded', 'true');
                }
                const focusTarget = drawer.querySelector('.drawer-close') || drawer.querySelector('button, [href], input, select, textarea');
                if (focusTarget) {
                    setTimeout(() => {
                        try {
                            focusTarget.focus({ preventScroll: true });
                        } catch (err) {
                            focusTarget.focus();
                        }
                        if ((window.scrollY || window.pageYOffset) !== currentScroll) {
                            window.scrollTo(0, currentScroll);
                        }
                    }, 50);
                }
            }
        }

        function closeDrawer(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (drawer && backdrop) {
                const currentScroll = window.scrollY || window.pageYOffset;
                drawer.classList.remove('active');
                backdrop.classList.remove('active');
                document.body.classList.remove('drawer-open');
                if (mobileToggle) {
                    mobileToggle.setAttribute('aria-expanded', 'false');
                }
                if (focusReturnElement && typeof focusReturnElement.focus === 'function') {
                    try {
                        focusReturnElement.focus({ preventScroll: true });
                    } catch (err) {
                        focusReturnElement.focus();
                    }
                    if ((window.scrollY || window.pageYOffset) !== currentScroll) {
                        window.scrollTo(0, currentScroll);
                    }
                }
            }
        }

        if (mobileToggle) {
            mobileToggle.addEventListener('click', openDrawer);
        }

        if (drawerClose) {
            drawerClose.addEventListener('click', closeDrawer);
        }

        if (backdrop) {
            backdrop.addEventListener('click', closeDrawer);
            backdrop.addEventListener('touchmove', function (e) {
                e.preventDefault();
            }, { passive: false });
        }

        // Accessible Keyboard Trap inside Drawer & ESC dismissal
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                const filterMenu = document.querySelector('.filter-dropdown-menu.open');
                const filterTrigger = document.querySelector('.header-search-filter.open');
                if (filterMenu) {
                    filterMenu.classList.remove('open');
                    if (filterTrigger) {
                        filterTrigger.classList.remove('open');
                        filterTrigger.setAttribute('aria-expanded', 'false');
                    }
                }
            }

            if (!drawer || !drawer.classList.contains('active')) return;

            if (e.key === 'Escape') {
                closeDrawer();
            } else if (e.key === 'Tab') {
                const focusable = Array.from(drawer.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
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
        });
    });
})();
