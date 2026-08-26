import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator, loadDictionaries, normalizeLocale } from '../src/i18n.mjs';

test('normalizes simplified, traditional, and English locales', () => {
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  assert.equal(normalizeLocale('zh-TW'), 'zh-TW');
  assert.equal(normalizeLocale('zh-HK'), 'zh-TW');
  assert.equal(normalizeLocale('zh'), 'zh-CN');
  assert.equal(normalizeLocale('en-US'), 'en-US');
  assert.equal(normalizeLocale('fr-FR'), 'zh-CN');
});

test('translates and interpolates the cache status message', () => {
  assert.equal(createTranslator('zh-CN')('cache.installing', { progress: 42 }), '正在安装离线缓存：42%');
  assert.equal(createTranslator('zh-TW')('cache.installing', { progress: 42 }), '正在安裝離線快取：42%');
  assert.equal(createTranslator('en-US')('cache.installing', { progress: 42 }), 'Installing offline cache: 42%');
});

test('all locale dictionaries expose the same keys', () => {
  const dictionaries = loadDictionaries();
  const keys = Object.keys(dictionaries['zh-CN']).sort();
  assert.deepEqual(Object.keys(dictionaries['zh-TW']).sort(), keys);
  assert.deepEqual(Object.keys(dictionaries['en-US']).sort(), keys);
});

test('falls back to simplified Chinese for an unknown key', () => {
  assert.equal(createTranslator('en-US')('missing.key'), 'missing.key');
});
