(function () {
  const zoomKeys = new Set(['+', '-', '=', '_', '0']);
  let lastTouchEnd = 0;

  function preventZoom(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && zoomKeys.has(event.key)) {
      preventZoom(event);
    }
  }, true);

  window.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) {
      preventZoom(event);
    }
  }, { passive: false, capture: true });

  document.addEventListener('touchmove', (event) => {
    if (event.touches && event.touches.length > 1) {
      preventZoom(event);
    }
  }, { passive: false });

  document.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      preventZoom(event);
    }
    lastTouchEnd = now;
  }, { passive: false });

  ['gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
    document.addEventListener(name, preventZoom, { passive: false });
  });
}());
