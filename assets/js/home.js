document.documentElement.classList.add('js');

const homeHeader = document.getElementById('header');
const homeMenuToggle = document.querySelector('.menu-toggle');
const homeNavLinks = document.querySelector('.nav-links');
const reduceHomeMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const updateHomeScrollState = () => {
  homeHeader?.classList.toggle('is-scrolled', window.scrollY > 10);
};

updateHomeScrollState();
window.addEventListener('scroll', updateHomeScrollState, { passive: true });

const homeRevealElements = document.querySelectorAll('.reveal');
if (reduceHomeMotion.matches || !('IntersectionObserver' in window)) {
  homeRevealElements.forEach((element) => element.classList.add('active'));
} else {
  const revealOnScroll = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('active');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
  homeRevealElements.forEach((element) => revealOnScroll.observe(element));
}

const closeHomeMenu = () => {
  homeNavLinks?.classList.remove('is-open');
  homeMenuToggle?.setAttribute('aria-expanded', 'false');
  homeMenuToggle?.setAttribute('aria-label', 'Open navigation menu');
  document.body.classList.remove('menu-open');
};

homeMenuToggle?.addEventListener('click', () => {
  const isOpen = homeNavLinks?.classList.toggle('is-open') ?? false;
  homeMenuToggle.setAttribute('aria-expanded', String(isOpen));
  homeMenuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  document.body.classList.toggle('menu-open', isOpen);
});

homeNavLinks?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeHomeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeHomeMenu();
  homeMenuToggle?.focus();
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 1024) closeHomeMenu();
});
