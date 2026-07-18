const VeriTrustPageAccess = (() => {
  const pathname = window.location.pathname;
  const page = pathname.split('/').filter(Boolean).pop()?.toLowerCase() || 'index.html';
  const isLanding = page === 'index.html' || page === 'index';
  const isAuth = page === 'auth.html' || page === 'auth';
  const isPublic = isLanding || isAuth;

  const safeRedirect = (value, fallback = 'dashboard.html') => {
    if (!value) return fallback;
    try {
      const target = new URL(value, window.location.href);
      if (target.origin !== window.location.origin) return fallback;
      const targetPage = target.pathname.split('/').filter(Boolean).pop()?.toLowerCase() || '';
      if (['', 'index', 'index.html', 'auth', 'auth.html'].includes(targetPage)) return fallback;
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return fallback;
    }
  };

  const currentDestination = () => `${pathname}${window.location.search}${window.location.hash}`;
  document.documentElement.classList.add('vt-auth-checking');
  document.documentElement.setAttribute('aria-busy', 'true');

  const resolve = async () => {
    const client = window.VeriTrustSupabase;
    let session = null;
    let callback = null;
    let callbackError = null;
    if (client?.isConfigured()) {
      try {
        callback = client.consumeAuthCallback?.() || null;
        session = await client.getSession();
      } catch (error) {
        callbackError = error;
        session = null;
      }
    }

    const isRecovery = isAuth && callback?.type === 'recovery';
    if (session && isAuth && !isRecovery) {
      const params = new URLSearchParams(window.location.search);
      window.location.replace(safeRedirect(params.get('redirect')));
      return { allowed: false, session };
    }

    if (!isPublic && !session) {
      const redirect = encodeURIComponent(currentDestination());
      window.location.replace(`auth.html?redirect=${redirect}`);
      return { allowed: false, session: null };
    }

    document.documentElement.classList.remove('vt-auth-checking');
    document.documentElement.removeAttribute('aria-busy');
    return { allowed: true, callback, callbackError, isAuth, isLanding, session };
  };

  window.VeriTrustAuthFlow = { safeRedirect };
  return resolve();
})();

window.VeriTrustPageAccess = VeriTrustPageAccess;

document.addEventListener('DOMContentLoaded', async () => {
  const access = await VeriTrustPageAccess;
  if (!access.allowed) return;

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

  const normalizePrimaryNavigation = () => {
    const nav = document.querySelector('.tool-header-links');
    if (!nav) return;

    const currentPage = window.location.pathname
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.html$/i, '')
      .toLowerCase() || 'index';
    const activeSection = {
      index: 'index',
      detection: 'detection',
      deepfake: 'detection',
      phishing: 'detection',
      'link-check': 'detection',
      gateway: 'gateway',
      'gateway-powershell': 'developers',
      developers: 'developers',
      'model-performance': 'developers',
      docs: 'docs',
      privacy: 'docs',
      terms: 'docs',
      security: 'docs',
      disclaimer: 'docs'
    }[currentPage];
    const primaryItems = [
      ['index.html', 'Home', 'index'],
      ['detection.html', 'Detection', 'detection'],
      ['gateway.html', 'Gateway', 'gateway'],
      ['developers.html', 'Developers', 'developers'],
      ['docs.html', 'Docs', 'docs']
    ];
    const firstWorkspaceLink = nav.querySelector(':scope > .workspace-menu-link');

    nav.querySelectorAll(':scope > a:not(.workspace-menu-link)').forEach((link) => link.remove());
    const fragment = document.createDocumentFragment();
    primaryItems.forEach(([href, label, section]) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      if (section === activeSection) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
      fragment.appendChild(link);
    });
    nav.insertBefore(fragment, firstWorkspaceLink);

    const actions = nav.closest('.tool-header-inner')?.querySelector('.tool-header-actions');
    if (actions && !actions.querySelector('.tool-menu-toggle')) {
      const toggle = document.createElement('button');
      toggle.className = 'tool-menu-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Open page menu');
      toggle.setAttribute('aria-expanded', 'false');
      actions.appendChild(toggle);
    }
  };

  normalizePrimaryNavigation();

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
    const toolHeaderLinks = document.querySelector('.tool-header-links, #primary-navigation');

    const closeToolMenu = () => {
      const menuToggle = document.querySelector('.tool-menu-toggle, .menu-toggle');
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

    const session = access.session;

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

  await updateAuthNavigation();

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
