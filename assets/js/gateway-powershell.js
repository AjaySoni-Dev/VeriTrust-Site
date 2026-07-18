(function initGatewayPowerShellGuide() {
  const copyStatus = document.getElementById('ps-copy-status');
  let statusTimer = null;

  function announce(message) {
    if (!copyStatus) return;
    copyStatus.textContent = message;
    copyStatus.classList.add('is-visible');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => copyStatus.classList.remove('is-visible'), 1800);
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Copy is unavailable.');
  }

  document.querySelectorAll('[data-copy-code]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.closest('.ps-code-card')?.querySelector('code')?.textContent || '';
      if (!code) return;
      try {
        await copyText(code);
        const original = button.textContent;
        button.textContent = 'Copied';
        button.classList.add('is-copied');
        announce('PowerShell block copied.');
        setTimeout(() => {
          button.textContent = original;
          button.classList.remove('is-copied');
        }, 1600);
      } catch {
        announce('Select the block and copy it manually.');
      }
    });
  });

  const links = [...document.querySelectorAll('.ps-guide-nav a')];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => link.classList.toggle('is-current', link.hash === `#${visible.target.id}`));
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.2, 0.6] });
    sections.forEach((section) => observer.observe(section));
  }
})();
