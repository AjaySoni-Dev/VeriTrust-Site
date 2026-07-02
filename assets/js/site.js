document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      const isVisible = navLinks.style.display === 'flex';
      if (isVisible) {
        navLinks.style.display = '';
        navLinks.style.position = '';
        navLinks.style.flexDirection = '';
        navLinks.style.background = '';
        navLinks.style.top = '';
        navLinks.style.left = '';
        navLinks.style.right = '';
        navLinks.style.padding = '';
        navLinks.style.borderBottom = '';
      } else {
        navLinks.style.display = 'flex';
        navLinks.style.flexDirection = 'column';
        navLinks.style.position = 'absolute';
        navLinks.style.top = '100%';
        navLinks.style.left = '0';
        navLinks.style.right = '0';
        navLinks.style.background = 'var(--bg-surface)';
        navLinks.style.padding = '1.5rem';
        navLinks.style.borderBottom = '1px solid var(--border-subtle)';
      }
    });
  }

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
