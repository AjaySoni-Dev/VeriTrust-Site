document.addEventListener('DOMContentLoaded', () => {
  const bindMenu = (toggleSelector, linksSelector) => {
    const menuToggle = document.querySelector(toggleSelector);
    const navLinks = document.querySelector(linksSelector);
    if (!menuToggle || !navLinks) return;

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

  const updateAuthNavigation = async () => {
    if (!window.VeriTrustSupabase?.isConfigured()) return;
    const session = await window.VeriTrustSupabase.getSession();
    const loginLinks = document.querySelectorAll('.tool-header-login, .login-link, .nav-actions a[href="auth.html"]');
    const dashboardLinks = document.querySelectorAll('.tool-header-dashboard, a[href="dashboard.html"]');

    if (session) {
      loginLinks.forEach((link) => {
        link.textContent = 'Sign out';
        link.href = '#sign-out';
        link.addEventListener('click', async (event) => {
          event.preventDefault();
          await window.VeriTrustSupabase.signOut();
          window.location.href = 'auth.html';
        }, { once: true });
      });
      dashboardLinks.forEach((link) => {
        if (link.classList.contains('tool-header-dashboard')) {
          link.textContent = 'Dashboard';
        }
      });
    } else {
      loginLinks.forEach((link) => {
        link.textContent = link.classList.contains('login-link') ? 'Login / Sign Up' : 'Log in';
        link.href = 'auth.html';
      });
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
