document.addEventListener('DOMContentLoaded', () => {
  const bindMenu = (toggleSelector, linksSelector) => {
    const menuToggle = document.querySelector(toggleSelector);
    const navLinks = document.querySelector(linksSelector);
    if (!menuToggle || !navLinks) return;
    if (menuToggle.dataset.menuManaged === 'inline') return;

    menuToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.closest('header')?.classList.toggle('menu-open', isOpen);
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.closest('header')?.classList.remove('menu-open');
      });
    });
  };

  bindMenu('.menu-toggle', '.nav-links');
  bindMenu('.tool-menu-toggle', '.tool-header-links');

  const activeWorkspaceLink = document.querySelector('.workspace-nav a.active');
  const workspaceNav = activeWorkspaceLink?.closest('.workspace-nav');
  if (activeWorkspaceLink && workspaceNav) {
    requestAnimationFrame(() => {
      workspaceNav.scrollLeft = activeWorkspaceLink.offsetLeft
        - ((workspaceNav.clientWidth - activeWorkspaceLink.offsetWidth) / 2);
    });
  }

  const updateAuthNavigation = async () => {
    const isDashboard = /(^|\/)(dashboard|scans|api-access|billing|account)(?:\.html)?$/i.test(window.location.pathname);
    const authLinks = document.querySelectorAll('.tool-header-login, .login-link, .nav-actions a[href="auth.html"]');
    const dashboardLinks = document.querySelectorAll('.tool-header-dashboard, a[href="dashboard.html"]');
    const toolHeaderLinks = document.querySelector('.tool-header-links');

    const closeToolMenu = () => {
      const menuToggle = document.querySelector('.tool-menu-toggle');
      toolHeaderLinks?.classList.remove('is-open');
      menuToggle?.setAttribute('aria-expanded', 'false');
      menuToggle?.closest('header')?.classList.remove('menu-open');
    };

    const hideAuthLink = (link) => {
      link.hidden = true;
      link.setAttribute('aria-hidden', 'true');
      link.removeAttribute('href');
    };

    const showAuthLink = (link) => {
      link.hidden = false;
      link.removeAttribute('aria-hidden');
      link.href = 'auth.html';
      link.classList.remove('is-logout');
      link.textContent = link.classList.contains('login-link')
        ? 'Login / Sign Up'
        : link.classList.contains('tool-header-login')
          ? 'Log in'
          : 'Login';
    };

    const bindLogout = (link) => {
      link.hidden = false;
      link.removeAttribute('aria-hidden');
      link.href = '#sign-out';
      link.textContent = 'Logout';
      link.classList.add('is-logout');
      if (!link.dataset.logoutBound) {
        link.dataset.logoutBound = 'true';
        link.addEventListener('click', async (event) => {
          event.preventDefault();
          await window.VeriTrustSupabase.signOut();
          window.location.href = 'auth.html';
        });
      }
    };

    const ensureMobileMenuActions = (sessionActive = false) => {
      if (!toolHeaderLinks) return null;

      let wrap = toolHeaderLinks.querySelector('.tool-header-mobile-actions');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'tool-header-mobile-actions';
        toolHeaderLinks.appendChild(wrap);
      }

      let dashboardAction = wrap.querySelector('[data-mobile-dashboard-action]');
      const hasDashboardNavLink = Boolean(toolHeaderLinks.querySelector(':scope > a[href="dashboard.html"]'));
      if (hasDashboardNavLink && dashboardAction) {
        dashboardAction.remove();
      } else if (!hasDashboardNavLink && !dashboardAction) {
        dashboardAction = document.createElement('a');
        dashboardAction.href = 'dashboard.html';
        dashboardAction.textContent = 'Dashboard';
        dashboardAction.dataset.mobileDashboardAction = 'true';
        dashboardAction.addEventListener('click', closeToolMenu);
        wrap.appendChild(dashboardAction);
      }

      let authAction = wrap.querySelector('[data-mobile-auth-action]');
      if (!authAction) {
        authAction = document.createElement('a');
        authAction.dataset.mobileAuthAction = 'true';
        wrap.appendChild(authAction);
      }

      if (sessionActive && window.VeriTrustSupabase?.signOut) {
        bindLogout(authAction);
      } else {
        authAction.hidden = false;
        authAction.removeAttribute('aria-hidden');
        authAction.href = 'auth.html';
        authAction.textContent = 'Login / Sign Up';
        authAction.classList.remove('is-logout');
      }

      return wrap;
    };

    if (!window.VeriTrustSupabase?.isConfigured()) {
      ensureMobileMenuActions(false);
      return;
    }

    const session = await window.VeriTrustSupabase.getSession();

    if (session) {
      document.body.classList.add('vt-authenticated');
      document.body.classList.remove('vt-signed-out');

      authLinks.forEach((link) => {
        if (isDashboard && link.classList.contains('tool-header-login')) {
          bindLogout(link);
          return;
        }
        hideAuthLink(link);
      });

      dashboardLinks.forEach((link) => {
        if (link.classList.contains('tool-header-dashboard')) {
          link.textContent = 'Dashboard';
        }
      });
      ensureMobileMenuActions(true);
    } else {
      document.body.classList.remove('vt-authenticated');
      document.body.classList.add('vt-signed-out');
      authLinks.forEach(showAuthLink);
      ensureMobileMenuActions(false);
    }
  };

  updateAuthNavigation();

  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.authTab;
      document.querySelectorAll('[data-auth-tab]').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach((form) => form.classList.remove('active'));
      button.classList.add('active');
      const form = document.getElementById(target);
      if (form) form.classList.add('active');
    });
  });
});
