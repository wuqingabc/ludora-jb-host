import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
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
  assert.match(i18n, /indeterminate/);
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
});
