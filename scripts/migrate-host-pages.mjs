import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['jb/test']);

function excluded(file) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  return [...SKIP].some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`));
}

function htmlFiles(directory = ROOT) {
  const files = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    if (excluded(current)) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') files.push(full);
    }
  }
  return files.sort();
}

function migrate(file) {
  let html = readFileSync(file, 'utf8');
  const relativeRoot = relative(dirname(file), ROOT).replaceAll('\\', '/');
  const prefix = relativeRoot ? `${relativeRoot}/` : '';
  if (!/src=["'][^"']*i18n\.js["']/i.test(html)) {
    const assets = [
      `${prefix}i18n/zh-CN.js`,
      `${prefix}i18n/zh-TW.js`,
      `${prefix}i18n/en-US.js`,
      `${prefix}i18n.js`,
    ].map((src) => `<script src="${src}"></script>`).join('\n');
    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (tag) => `${tag}\n<meta name="ludora-host" content="1">\n${assets}`)
      : `${assets}\n${html}`;
  }

  html = html.replace(/\s*<h1[^>]*>\s*(?:Special Thanks to:|Designed by:)[\s\S]*?<\/h1>/gi, '');
  html = html.replace(/Special Thanks to:[\s\S]*?(?=<\/body>)/gi, '<p data-i18n="footer.host">鲁哆啦 Ludora · PS4 / PS5 Web Access</p>');
  html = html.replace(/GamerHack93/gi, 'Ludora');
  html = html.replace(/GamerHack/gi, 'Ludora');
  html = html.replace(/\s+by\s+Ludora/gi, ' · Ludora');
  html = html.replace(/PS4\s*-\s*PS5\s+Exploit\s+Host\s+by\s+Ludora/gi, '鲁哆啦 Ludora · 主机工具');
  html = html.replace(/Host\s+by\s+Ludora/gi, 'Ludora Host');
  html = html.replace(/msgs\.innerHTML\s*=\s*(['"])[^'"\n]*Ludora[^'"\n]*\1/g, "msgs.innerHTML=LudoraI18n.t('brand.host')");
  html = html.replace(/Installing Offline Cache:\s*"\s*\+\s*Percent\s*\+\s*"%"/g, "LudoraI18n.t('cache.installing', {progress: Percent})");
  html = html.replace(/Cache Installed Successfully ✔/g, "'+LudoraI18n.t('cache.complete')+'");
  html = html.replace(/Now Close And Re-Open Your Browser \.\.\./g, "'+LudoraI18n.t('cache.reopen')+'");
  html = html.replace(/Error Installing Cache! - Clear and Re-Open Your Browser \.\.\./g, "'+LudoraI18n.t('cache.error')+'");
  html = html.replace(/LoadedMSG\s*=\s*["']Payload Loaded \.\.\.["']/g, "LoadedMSG = LudoraI18n.t('payload.loaded')");
  html = html.replace(/(<h1[^>]*id\s*=\s*['"]?msgs['"]?[^>]*)(>)(Loading GoldHEN[^<]*<\/h1>)/gi, "$1 data-i18n=\"payload.loading\"$2$3");
  html = html.replace(/window\.msgs\.innerHTML="LudoraI18n\.t\('cache\.installing', \{progress: Percent\}\);"/g, "window.msgs.innerHTML=LudoraI18n.t('cache.installing', {progress: Percent})");
  html = html.replace(/window\.msgs\.innerHTML="\+'?LudoraI18n\.t\('cache\.(complete|reopen|error)'\)\+'?"/g, "window.msgs.innerHTML=LudoraI18n.t('cache.$1')");
  html = html.replace(/window\.msgs\.innerHTML="LudoraI18n\.t\('cache\.installing', \{progress: Percent\}\);\}/g, "window.msgs.innerHTML=LudoraI18n.t('cache.installing', {progress: Percent});}");
  html = html.replace(/window\.msgs\.innerHTML="'\+LudoraI18n\.t\('cache\.(complete|reopen|error)'\)\+'";/g, "window.msgs.innerHTML=LudoraI18n.t('cache.$1');");
  html = html.replace(/window\.applicationCache\.addEventListener\("progress",DLProgress,false\);window\.applicationCache\.oncached=function\(e\)\{DisplayCacheProgress\(\);\};window\.applicationCache\.onupdateready=function\(e\)\{DisplayCacheProgress\(\);\};/g, 'if(window.applicationCache){window.applicationCache.addEventListener("progress",DLProgress,false);window.applicationCache.oncached=function(e){DisplayCacheProgress();};window.applicationCache.onupdateready=function(e){DisplayCacheProgress();};}');

  writeFileSync(file, html);
}

for (const file of htmlFiles()) migrate(file);
console.log(`Migrated ${htmlFiles().length} Host HTML pages.`);
