import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
function htmlFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    const rel = join(prefix, entry.name);
    if (entry.isDirectory()) return htmlFiles(path, rel);
    return entry.name.endsWith('.html') ? [rel] : [];
  });
}
const pages = htmlFiles(root);
const failures = [];

for (const page of pages) {
  const file = join(root, page);
  const html = readFileSync(file, 'utf8');
  if (!html.match(/<link[^>]+stylesheet[^>]+href=/i)) failures.push(`${page}: missing local stylesheet`);
  if (/<link[^>]+(?:fonts\.|googleapis|unpkg|jsdelivr)/i.test(html)) failures.push(`${page}: external style dependency`);
  const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/gi)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(?:https?:|data:|javascript:|mailto:|#)/i.test(ref)) continue;
    const target = join(root, page, '..', ref);
    if (!existsSync(target)) failures.push(`${page}: missing ${ref}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`PASS: ${pages.length} HTML pages have local styles and resolvable static references.`);
