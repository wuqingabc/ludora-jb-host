import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
  const html = readFileSync(join(root, page), 'utf8');
  for (const [, ref] of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    if (/^(?:https?:|data:)/i.test(ref)) continue;
    if (!existsSync(join(root, page, '..', ref))) failures.push(`${page}: missing script ${ref}`);
  }
  const manifest = html.match(/manifest=["']([^"']+)["']/i)?.[1];
  if (manifest && !existsSync(join(root, page, '..', manifest))) failures.push(`${page}: missing manifest ${manifest}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`PASS: runtime script and manifest references resolve for ${pages.length} HTML pages.`);
