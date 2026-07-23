const VeriTrustPageAccess = (() => {
  const pathname = window.location.pathname;
  const page = pathname.split('/').filter(Boolean).pop()?.replace(/\.html$/i, '').toLowerCase() || 'index';
  const isLanding = page === 'index';
  const isAuth = page === 'auth';
  const publicPages = new Set([
    'index',
    'auth',
    'detection',
    'developers',
    'docs',
    'gateway-powershell',
    'model-performance',
    'privacy',
    'terms',
    'security',
    'disclaimer',
  ]);
  const isPublic = publicPages.has(page);

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
        callback = await client.consumeAuthCallback?.() || null;
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

const VeriTrustSiteChrome = (() => {
  const PAGE_CONTEXT = Object.freeze({
    index: 'Home',
    auth: 'Account access',
    detection: 'Detection',
    deepfake: 'Image review',
    phishing: 'Message review',
    'link-check': 'Link intelligence',
    gateway: 'Unified gateway',
    cli: 'Command console',
    dashboard: 'Workspace overview',
    scans: 'Scan history',
    'api-access': 'API access',
    billing: 'Billing',
    account: 'Account',
    developers: 'Developer API',
    'gateway-powershell': 'PowerShell guide',
    docs: 'Documentation',
    'model-performance': 'Model performance',
    privacy: 'Privacy',
    terms: 'Terms',
    security: 'Security',
    disclaimer: 'Disclaimer',
  });

  const currentPage = () => window.location.pathname
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.html$/i, '')
    .toLowerCase() || 'index';

  const directChild = (tagName) => [...document.body.children]
    .find((node) => node.tagName === tagName.toUpperCase()) || null;

  const createHeader = (page) => {
    const header = document.createElement('header');
    header.className = 'tool-header-shell vt-page-header vt-site-header';
    header.dataset.siteHeader = 'true';
    header.innerHTML = `
      <div class="tool-header-inner">
        <div class="tool-header-brand-group">
          <a href="index.html" class="tool-header-brand" aria-label="VeriTrust home">
            <img src="logo.png" alt="" class="tool-header-mark">
            <img src="brand.png" alt="VeriTrust" class="tool-header-word">
          </a>
          <span class="tool-header-context"></span>
        </div>
        <nav class="tool-header-links" aria-label="Primary navigation">
          <a href="index.html">Home</a>
          <a href="detection.html">Detection</a>
          <a href="gateway.html">Gateway</a>
          <a href="developers.html">Developers</a>
          <a href="docs.html">Docs</a>
        </nav>
        <div class="tool-header-actions">
          <a href="auth.html" class="tool-header-login">Log in</a>
          <a href="dashboard.html" class="tool-header-dashboard">Dashboard</a>
          <button class="tool-menu-toggle" aria-label="Open page menu" aria-expanded="false" type="button">
            <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
          </button>
        </div>
      </div>
    `;
    header.querySelector('.tool-header-context').textContent = PAGE_CONTEXT[page] || 'Platform';
    if (['dashboard', 'scans', 'api-access', 'billing', 'account'].includes(page)) {
      header.querySelector('.tool-header-dashboard')?.classList.add('active');
      header.querySelector('.tool-header-dashboard')?.setAttribute('aria-current', 'page');
    }
    if (page === 'auth') {
      header.querySelector('.tool-header-login')?.classList.add('active');
      header.querySelector('.tool-header-login')?.setAttribute('aria-current', 'page');
    }
    return header;
  };

  const createFooter = () => {
    const footer = document.createElement('footer');
    footer.className = 'vt-site-footer';
    footer.dataset.siteFooter = 'true';
    footer.innerHTML = `
      <div class="vt-site-footer-inner">
        <section class="vt-site-footer-brand" aria-label="VeriTrust">
          <a href="index.html" class="tool-header-brand" aria-label="VeriTrust home">
            <img src="logo.png" alt="" class="tool-header-mark">
            <img src="brand.png" alt="VeriTrust" class="tool-header-word">
          </a>
          <p>AI-assisted image, message, URL, and gateway review for cautious security triage.</p>
        </section>
        <nav class="vt-site-footer-groups" aria-label="Footer navigation">
          <section><h2>Review</h2><a href="detection.html">Detection modules</a><a href="deepfake.html">Image review</a><a href="phishing.html">Message review</a><a href="link-check.html">Link intelligence</a><a href="gateway.html">Unified gateway</a></section>
          <section><h2>Workspace</h2><a href="dashboard.html">Overview</a><a href="scans.html">Scan history</a><a href="api-access.html">API access</a><a href="billing.html">Billing</a><a href="account.html">Account</a></section>
          <section><h2>Resources</h2><a href="docs.html">Documentation</a><a href="developers.html">Developer API</a><a href="cli.html">Web CLI</a><a href="gateway-powershell.html">PowerShell guide</a><a href="model-performance.html">Model performance</a></section>
          <section><h2>Trust</h2><a href="security.html">Security</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="disclaimer.html">Disclaimer</a></section>
        </nav>
      </div>
      <div class="vt-site-footer-bottom"><span>&copy; 2026 VeriTrust. All rights reserved.</span><span>AI-assisted results require human review.</span></div>
    `;
    return footer;
  };

  const render = () => {
    const page = currentPage();
    document.body.dataset.page = page;
    document.body.classList.add('vt-unified-chrome');
    document.querySelector('.auth-back-button')?.remove();
    document.querySelectorAll('main .doc-content > footer.doc-section').forEach((footer) => footer.remove());

    const header = createHeader(page);
    const existingHeader = directChild('header');
    if (existingHeader) existingHeader.replaceWith(header);
    else document.body.prepend(header);

    const nestedAuthFooter = document.querySelector('.auth-footer');
    if (nestedAuthFooter) nestedAuthFooter.remove();
    const footer = createFooter();
    const existingFooter = directChild('footer');
    if (existingFooter) existingFooter.replaceWith(footer);
    else document.body.appendChild(footer);
  };

  return { currentPage, render };
})();

document.addEventListener('DOMContentLoaded', async () => {
  VeriTrustSiteChrome.render();
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
      cli: 'detection',
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
    const authLinks = document.querySelectorAll('.tool-header-login, .login-link, .nav-actions a[href="auth.html"]');
    const dashboardLinks = document.querySelectorAll('.tool-header-dashboard, a[href="dashboard.html"]');
    const toolHeaderLinks = document.querySelector('.tool-header-links, #primary-navigation');

    const closeToolMenu = () => {
      const menuToggle = document.querySelector('.tool-menu-toggle, .menu-toggle');
      toolHeaderLinks?.classList.remove('is-open');
      menuToggle?.setAttribute('aria-expanded', 'false');
      menuToggle?.closest('header')?.classList.remove('menu-open');
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

      authLinks.forEach(bindLogout);

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
