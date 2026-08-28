import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { auditHostTree, collectHostPages } from '../../scripts/audit-host-pages.mjs';

test('discovers every user-facing HTML page in the Host tree', () => {
  const pages = collectHostPages();
  assert.ok(pages.length >= 40);
  assert.ok(pages.some((page) => page.endsWith('900v2/index.html')));
  assert.ok(pages.some((page) => page.endsWith('restore/900v3/index.html')));
});

test('Host audit requires local i18n resources and Ludora-only visible brand copy', () => {
  const result = auditHostTree();
  assert.deepEqual(result.errors, []);
});

test('the browser 9.00 entry does not require the pOOBs4 USB flow', () => {
  const html = readFileSync(new URL('../../g2all/index.html', import.meta.url), 'utf8');
  assert.match(html, /900\/alert\.js/);
  assert.doesNotMatch(html, /exfathax|Insert the USB|pOOBs4/i);
  for (const page of ['cache700.html', 'cache900.html', 'cachecss.html']) {
    const cacheHtml = readFileSync(new URL(`../../g2all/${page}`, import.meta.url), 'utf8');
    assert.doesNotMatch(cacheHtml, /PS4 7\.00 - 11\.02 FW GoldHEN Ludora Host/);
    assert.match(cacheHtml, /id=["']cache-progress["']/);
    assert.match(cacheHtml, /cache\.installing/);
    assert.match(cacheHtml, /location\.replace\(['"]index\.html['"]\)/);
  }
  const i18n = readFileSync(new URL('../../i18n.js', import.meta.url), 'utf8');
  assert.match(i18n, /installCacheProgress/);
  assert.match(i18n, /ludora-cache-progress/);
  assert.match(i18n, /cache\.installingUnknown/);
  assert.match(i18n, /manifestEntryCount/);
  assert.match(i18n, /event\.loaded/);
  assert.doesNotMatch(readFileSync(new URL('../../style.css', import.meta.url), 'utf8'), /ludora-cache-progress/);
});

test('the zrm browser chain includes every runtime asset and supported offset table', () => {
  const required = [
    'index.html',
    'run_lapse.html',
    'run_poops.html',
    'chain_lapse.js',
    'chain_poops.js',
    'core.js',
    'mem.js',
    'int64.js',
    'ps4_offsets.js',
    'rpc_worker.js',
    'cache.appcache',
    'zrm.css',
    'payload.bin',
    'patches/1100.bin',
    'patches/1150.bin',
    'patches/1200.bin',
    'patches/1250.bin',
    'patches/1300.bin',
  ];

  for (const relativePath of required) {
    assert.equal(existsSync(new URL(`../../zrm/${relativePath}`, import.meta.url)), true, relativePath);
  }

  const offsets = readFileSync(new URL('../../zrm/ps4_offsets.js', import.meta.url), 'utf8');
  for (const firmware of ['11.00', '11.50', '12.00', '12.50', '13.00']) {
    assert.match(offsets, new RegExp(`['"]${firmware}['"]`), firmware);
  }
});

test('every offline-cache page uses the shared localized progress runtime', () => {
  for (const file of collectHostPages()) {
    const html = readFileSync(file, 'utf8');
    if (!/manifest=["']/i.test(html)) continue;
    assert.match(html, /i18n\.js/i, file);
    assert.doesNotMatch(html, /Starting Cache Installation|Installing Offline Cache/i, file);
  }
  for (const relativePath of ['700.manifest', '900.manifest', 'css.manifest']) {
    const file = new URL(`../../g2all/${relativePath}`, import.meta.url);
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\\/, relativePath);
  }
});

test('every AppCache manifest is safe for real progress accounting', () => {
  const manifestFiles = readdirSync(new URL('../../', import.meta.url), { recursive: true })
    .filter((file) => file.endsWith('.manifest'));
  assert.equal(manifestFiles.length, 12);
  for (const relativePath of manifestFiles) {
    const manifest = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
    assert.match(manifest, /^CACHE MANIFEST\r?\n/, relativePath);
    assert.doesNotMatch(manifest, /\\/, relativePath);
    assert.match(manifest, /progress-v5/, relativePath);
  }
  const i18n = readFileSync(new URL('../../i18n.js', import.meta.url), 'utf8');
  assert.match(i18n, /var section = 'CACHE'/);
  const cachePages = {
    '505/cache.html': '505/cache.manifest',
    '505goldhen/cache.html': '505goldhen/cache.manifest',
    '672/index.html': '672/cache.manifest',
    '672goldhen/index.html': '672goldhen/cache.manifest',
    '702/index.html': '702/cache.manifest',
    '75x/index.html': '75x/cache.manifest',
    '900goldhen/cache.html': '900goldhen/cache.manifest',
    '900v2/index.html': '900v2/cache.manifest',
    '900v3/cache.html': '900v3/cache.manifest',
    'g2all/cache700.html': 'g2all/700.manifest',
    'g2all/cache900.html': 'g2all/900.manifest',
    'g2all/cachecss.html': 'g2all/css.manifest',
  };
  for (const [pagePath, manifestPath] of Object.entries(cachePages)) {
    const page = readFileSync(new URL(`../../${pagePath}`, import.meta.url), 'utf8');
    const manifest = readFileSync(new URL(`../../${manifestPath}`, import.meta.url), 'utf8');
    const count = manifest.split(/\r?\n/).reduce((total, line) => {
      const value = line.trim();
      if (!value || value.startsWith('#') || /^(CACHE|NETWORK|FALLBACK):/.test(value) || value === '*') return total;
      return total + 1;
    }, 0);
    assert.match(page, new RegExp(`data-cache-total=["']${count}["']`), pagePath);
  }
});
