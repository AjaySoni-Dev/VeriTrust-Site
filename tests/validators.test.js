const test = require('node:test');
const assert = require('node:assert/strict');

const { detectImageType, validateImageUpload } = require('../lib/validators');

test('VT-025 rejects declared MIME that disagrees with image signature', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal(detectImageType(png), 'image/png');
  assert.throws(() => validateImageUpload({ buffer: png, size: png.length, mimeType: 'image/jpeg' }), /signature/i);
});

test('VT-026 rejects unknown and empty image payloads', () => {
  assert.throws(() => validateImageUpload({ buffer: Buffer.from('not-an-image'), size: 12, mimeType: 'image/png' }), /signature/i);
  assert.throws(() => validateImageUpload({ buffer: Buffer.alloc(0), size: 0, mimeType: 'image/png' }), /empty/i);
});

