const test = require('node:test');
const assert = require('node:assert/strict');

const launcher = require('../../assets/js/scan-launcher.js');

test('scan launcher sends small and mobile environments directly to GUI', () => {
  assert.equal(launcher.shouldUseGui({ width: 767 }), true);
  assert.equal(launcher.shouldUseGui({ width: 1366, userAgentMobile: true }), true);
});

test('scan launcher permits the mode chooser on laptop and desktop widths', () => {
  assert.equal(launcher.shouldUseGui({ width: 768 }), false);
  assert.equal(launcher.shouldUseGui({ width: 1920 }), false);
});
