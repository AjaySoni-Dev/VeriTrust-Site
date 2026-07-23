const test = require('node:test');
const assert = require('node:assert/strict');

const cli = require('../../assets/js/cli-core.js');

test('tokenize preserves quoted and escaped command content', () => {
  assert.deepEqual(
    cli.tokenize('scan phishing "Line one\\nLine two" --model cortex'),
    ['scan', 'phishing', 'Line one\nLine two', '--model', 'cortex']
  );
  assert.deepEqual(cli.tokenize("scan link 'https://example.com/a b'"), ['scan', 'link', 'https://example.com/a b']);
});

test('tokenize reports unfinished quotes', () => {
  assert.throws(() => cli.tokenize('scan phishing "unfinished'), /Unterminated double quote/);
});

test('parse handles repeatable, equals, and order-independent boolean flags', () => {
  const parsed = cli.parse('scan gateway --json hello --url=https://a.test --url https://b.test --no-wait');
  assert.equal(parsed.name, 'scan');
  assert.deepEqual(parsed.args, ['gateway', 'hello']);
  assert.deepEqual(cli.flagValues(parsed, 'url'), ['https://a.test', 'https://b.test']);
  assert.equal(cli.hasFlag(parsed, 'json'), true);
  assert.equal(cli.hasFlag(parsed, 'no-wait'), true);
});

test('aliases normalize into scan commands', () => {
  assert.deepEqual(cli.normalizeCommand(cli.parse('phish "verify account"')).args, ['phishing', 'verify account']);
  assert.deepEqual(cli.normalizeCommand(cli.parse('unified --text message')).args, ['gateway']);
});

test('numeric flags and supported flags are validated', () => {
  assert.equal(cli.integerFlag(cli.parse('history --limit 25'), 'limit', 10, { min: 1, max: 50 }), 25);
  assert.throws(() => cli.integerFlag(cli.parse('history --limit nope'), 'limit', 10), /must be an integer/);
  assert.doesNotThrow(() => cli.assertAllowedFlags(cli.parse('history --json'), ['limit', 'json']));
  assert.throws(() => cli.assertAllowedFlags(cli.parse('history --limt 5'), ['limit', 'json']), /Unsupported flag: --limt/);
});

test('mobile policy uses either device classification or a narrow viewport', () => {
  assert.equal(cli.isMobileEnvironment({ width: 390 }), true);
  assert.equal(cli.isMobileEnvironment({ width: 1440, userAgentMobile: true }), true);
  assert.equal(cli.isMobileEnvironment({ width: 1024, userAgentMobile: false }), false);
});
