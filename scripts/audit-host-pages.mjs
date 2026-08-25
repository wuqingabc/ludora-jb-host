import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDED = new Set(['jb/test']);
const LEGACY_BRAND = /GamerHack|GamerHack93|PS4\s*-\s*PS5\s+Exploit\s+Host/i;

function isExcluded(file) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  return [...EXCLUDED].some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`));
}

export function collectHostPages(directory = ROOT) {
  const pages = [];
  const stack = [resolve(directory)];
  while (stack.length) {
    const current = stack.pop();
    if (isExcluded(current)) continue;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') pages.push(full);
    }
  }
  return pages.sort();
}

function localReferenceErrors(file, html) {
  const errors = [];
  const source = relative(ROOT, file).replaceAll('\\', '/');
  const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/gi)].map((match) => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|data:|javascript:|#)/i.test(ref)) continue;
    const target = resolve(dirname(file), ref);
    if (!existsSync(target)) errors.push(`${source}: missing ${ref}`);
  }
  return errors;
}

export function auditHostPage(file) {
  const html = readFileSync(file, 'utf8');
  const source = relative(ROOT, file).replaceAll('\\', '/');
  const errors = localReferenceErrors(file, html);
  if (!/i18n\.js/i.test(html)) errors.push(`${source}: missing local i18n.js`);
  if (!/styles?\.css/i.test(html)) errors.push(`${source}: missing local local styles.css`);
  if (LEGACY_BRAND.test(html)) errors.push(`${source}: visible legacy GamerHack brand`);
  return errors;
}

export function auditHostTree() {
  const pages = collectHostPages();
  const errors = pages.flatMap(auditHostPage);
  for (const asset of ['i18n.js', 'i18n/zh-CN.js', 'i18n/zh-TW.js', 'i18n/en-US.js', 'style.css']) {
    if (!existsSync(join(ROOT, asset))) errors.push(`missing shared asset ${asset}`);
  }
  return { pages, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = auditHostTree();
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`PASS: audited ${result.pages.length} Host HTML pages.`);
  }
}
