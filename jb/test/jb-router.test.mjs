import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUserAgent, nextView } from '../src/jb-router.mjs';

test('classifies a PS4 browser from its user agent', () => {
  assert.deepEqual(
    classifyUserAgent('Mozilla/5.0 (PlayStation 4 9.00) AppleWebKit/537.73'),
    { platform: 'ps4', supported: true },
  );
});

test('classifies a PS5 browser from its user agent', () => {
  assert.deepEqual(
    classifyUserAgent('Mozilla/5.0 (PlayStation 5 5.10) AppleWebKit/605.1.15'),
    { platform: 'ps5', supported: true },
  );
});

test('keeps the console on the waiting screen until authorization succeeds', () => {
  assert.equal(nextView({ authorized: false, platform: 'ps4' }), 'waiting');
  assert.equal(nextView({ authorized: true, platform: 'ps4' }), 'ps4-entry');
  assert.equal(nextView({ authorized: true, platform: 'ps5' }), 'ps5-entry');
});

test('rejects unknown browsers instead of exposing an exploit entry', () => {
  assert.deepEqual(classifyUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)'), {
    platform: 'unknown',
    supported: false,
  });
});
