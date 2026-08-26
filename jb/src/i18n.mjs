import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en-US'];
export const DEFAULT_LOCALE = 'zh-CN';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DICTIONARY_FILES = {
  'zh-CN': 'i18n/zh-CN.js',
  'zh-TW': 'i18n/zh-TW.js',
  'en-US': 'i18n/en-US.js',
};

function readDictionary(locale) {
  const source = readFileSync(join(ROOT, DICTIONARY_FILES[locale]), 'utf8');
  const match = /window\.LudoraI18nDictionaries\[[^\]]+\]\s*=\s*([\s\S]*)/.exec(source);
  if (!match) throw new Error(`Invalid dictionary file: ${locale}`);
  const body = match[1].replace(/;\s*$/, '');
  return Function(`return (${body});`)();
}

export function loadDictionaries() {
  return {
    'zh-CN': readDictionary('zh-CN'),
    'zh-TW': readDictionary('zh-TW'),
    'en-US': readDictionary('en-US'),
  };
}

export function normalizeLocale(value) {
  const raw = String(value || '').replace('_', '-').toLowerCase();
  if (raw === 'zh-tw' || raw === 'zh-hk' || raw.indexOf('zh-hant') === 0) return 'zh-TW';
  if (raw === 'en' || raw.indexOf('en-') === 0) return 'en-US';
  if (raw === 'zh' || raw === 'zh-cn' || raw.indexOf('zh-hans') === 0) return 'zh-CN';
  return DEFAULT_LOCALE;
}

export function createTranslator(locale) {
  const dictionaries = loadDictionaries();
  const selected = dictionaries[normalizeLocale(locale)];
  const fallback = dictionaries[DEFAULT_LOCALE];
  return function translate(key, params) {
    let value = selected[key] || fallback[key] || key;
    Object.keys(params || {}).forEach((name) => {
      value = value.replace(new RegExp('\\{' + name + '\\}', 'g'), String(params[name]));
    });
    return value;
  };
}
