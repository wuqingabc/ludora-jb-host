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
    const expectedRevision = page === 'cache900.html' ? '9' : '8';
    assert.match(cacheHtml, new RegExp(`manifest=["'][^"']+\\?rev=${expectedRevision}["']`));
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

test('g2all exploit failures are surfaced instead of becoming unhandled rejections', () => {
  for (const relativePath of ['g2all/700/psfree.js', 'g2all/900/psfree.js']) {
    const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
    assert.match(source, /main\(\)\.catch\(/, relativePath);
    assert.match(source, /Exploit timing failed/, relativePath);
    assert.match(source, /payload\.timingFailed/, relativePath);
    assert.doesNotMatch(source, /msgs\.innerHTML\s*=\s*["']Exploit timing failed/, relativePath);
  }
  const psfree900 = readFileSync(new URL('../../g2all/900/psfree.js', import.meta.url), 'utf8');
  assert.match(psfree900, /maxRetries = 3/);
});

test('g2all UAF retries clean up failed attempts before retrying', () => {
  for (const relativePath of ['g2all/700/psfree.js', 'g2all/900/psfree.js']) {
    const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
    assert.match(source, /finally\s*\{/i, relativePath);
    assert.match(source, /removeEventListener\(['"]popstate['"]/i, relativePath);
    assert.match(source, /input\.remove\(\)/, relativePath);
    assert.match(source, /foo\.remove\(\)/, relativePath);
  }
});

test('g2all preserves the upstream exploit-loaded guard', () => {
  for (const relativePath of ['g2all/700/lapse.js', 'g2all/900/lapse.js']) {
    const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
    assert.match(source, /localStorage\.ExploitLoaded === ["']yes["']/, relativePath);
    assert.match(source, /sessionStorage\.ExploitLoaded != ["']yes["']/, relativePath);
    assert.match(source, /return new Promise\(\(\) => \{\}\)/, relativePath);
  }
});

test('GoldHEN payload XHR handlers are installed before requests are sent', () => {
  for (const relativePath of [
    'g2all/700/lapse.js',
    'g2all/900/lapse.js',
    '505goldhen/index.html',
    '672/index.html',
    '672/pl_loader.js',
    '672goldhen/exp_loader.js',
    '900goldhen/index.html',
    '900v2/index.html',
    '900v3/index.html',
    'restore/505goldhen/index.html',
    'restore/672/exp_loader.js',
    'restore/672goldhen/exp_loader.js',
    'restore/900goldhen/index.html',
    'restore/900v2/index.html',
    'restore/900v3/index.html',
  ]) {
    const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
    const runPayload = source.indexOf('function runPayload');
    const handler = source.indexOf('onreadystatechange', runPayload);
    const send = source.indexOf('.send();', runPayload);
    assert.ok(handler >= 0, `${relativePath}: missing payload XHR handler`);
    assert.ok(send > handler, `${relativePath}: payload XHR sent before handler registration`);
  }
});

test('all g2all user-facing runtime messages use the shared i18n dictionary', () => {
  const dictionaries = [
    readFileSync(new URL('../../i18n/en-US.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../../i18n/zh-CN.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../../i18n/zh-TW.js', import.meta.url), 'utf8'),
  ].join('\n');
  for (const key of [
    'payload.timingFailed',
    'payload.alreadyLoaded',
    'payload.configuring',
    'payload.jailbreakFailed',
    'payload.unsupported',
    'legacy.contentNotFound',
    'legacy.unsupportedFirmware',
  ]) assert.match(dictionaries, new RegExp(`['"]${key.replace('.', '\\.') }['"]`), key);

  const runtime = readFileSync(new URL('../../i18n.js', import.meta.url), 'utf8');
  assert.match(runtime, /payload\.timingFailed/);
  assert.match(runtime, /legacy\.contentNotFound/);
  assert.match(runtime, /payload\.unsupported/);
  for (const relativePath of [
    'g2all/700/lapse.js',
    'g2all/900/lapse.js',
    'g2all/css/main.js',
  ]) {
    const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
    assert.match(source, /LudoraI18n\.t\("payload\.(alreadyLoaded|configuring|failed|loaded)"\)/, relativePath);
    assert.doesNotMatch(source, /msgs\.innerHTML\s*=\s*["']GoldHEN is Already Loaded|msgs\.innerHTML\s*=\s*["']Failed to Load/, relativePath);
  }
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

test('zrm pages use the complete Ludora localization shell and expose safe engine states', () => {
  for (const relativePath of ['zrm/index.html', 'zrm/run_lapse.html', 'zrm/run_poops.html']) {
    const page = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
    assert.match(page, /i18n\/zh-CN\.js/ , relativePath);
    assert.match(page, /i18n\/zh-TW\.js/ , relativePath);
    assert.match(page, /i18n\/en-US\.js/ , relativePath);
    assert.match(page, /\.\.\/i18n\.js/ , relativePath);
    assert.doesNotMatch(page, /GamerHack|raw-game\.com/i, relativePath);
  }
  const index = readFileSync(new URL('../../zrm/index.html', import.meta.url), 'utf8');
  assert.match(index, /data-cache-total=["']22["']/);
  assert.match(index, /e\.loaded/);
  assert.match(index, /setTimeout\(go, 250\)/);
  const manifest = readFileSync(new URL('../../zrm/cache.appcache', import.meta.url), 'utf8');
  assert.match(manifest, /dual-engine-v1/);
  assert.match(manifest, /ui-bridge\.js/);
  assert.match(manifest, /\.\.\/pkg-stage\.js/);
  for (const relativePath of ['zrm/run_lapse.html', 'zrm/run_poops.html']) {
    const page = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
    assert.match(page, /id=["']cache-progress["']/ , relativePath);
    assert.match(page, /ui-bridge\.js/ , relativePath);
    assert.match(page, /pkg-stage\.js/ , relativePath);
  }
  const dictionaries = ['en-US.js', 'zh-CN.js', 'zh-TW.js']
    .map((name) => readFileSync(new URL(`../../i18n/${name}`, import.meta.url), 'utf8')).join('\n');
  for (const key of ['host.unsupported', 'cache.installing', 'cache.complete', 'payload.loading', 'payload.failed']) {
    assert.match(dictionaries, new RegExp(`['"]${key.replace('.', '\\.') }['"]`), key);
  }
});

test('zrm only starts the existing Ludora post-exploit stage after a clean payload state', () => {
  const bridge = readFileSync(new URL('../../zrm/ui-bridge.js', import.meta.url), 'utf8');
  assert.match(bridge, /payloadReady:\s*true/);
  assert.match(bridge, /LudoraPkgStage\.start/);
  assert.match(bridge, /\^ALL DONE\$/i);
  assert.match(bridge, /rebootRequired|zrm\.rebootRequired/);
  for (const relativePath of ['zrm/chain_lapse.js', 'zrm/chain_poops.js']) {
    const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
    assert.match(source, /LudoraZrmUI\.state/ , relativePath);
  }
  const stage = readFileSync(new URL('../../pkg-stage.js', import.meta.url), 'utf8');
  assert.match(stage, /LudoraPkgStage/);
  assert.doesNotMatch(stage, /GamerHack|raw-game\.com/i);
});

test('legacy g2all entry keeps the exploit-sensitive browser layout isolated from the Ludora UI layer', () => {
  const page = readFileSync(new URL('../../g2all/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');
  assert.match(page, /<html[^>]*class=["']ludora-legacy-document["']/);
  assert.match(page, /class=["']ludora-legacy-host["']/);
  assert.match(css, /html\.ludora-legacy-document[^}]*overflow:\s*hidden/s);
  assert.match(css, /ludora-legacy-host[^{]*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /body\.ludora-legacy-host[^}]*width:\s*auto/s);
  assert.match(css, /ludora-legacy-host\s+\*[^}]*box-sizing:\s*content-box\s*!important/s);
  assert.match(css, /ludora-legacy-host::before[^}]*display:\s*none/s);
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
    const manifest = readFileSync(file, 'utf8');
    assert.doesNotMatch(manifest, /\\/, relativePath);
    assert.doesNotMatch(manifest, /(?:^|\n)\.\.\/pkg\/ludora\.pkg(?:\n|$)/, relativePath);
    assert.doesNotMatch(manifest, /(?:^|\n)\.\.\/(?:pkg-stage\.js|ludora-web-pkg-stage\.elf|goldhen-config-stage\.elf)(?:\n|$)/, relativePath);
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
    if (relativePath === 'g2all/700.manifest' || relativePath === 'g2all/900.manifest' || relativePath === 'g2all/css.manifest') {
      assert.match(manifest, /progress-v8/, relativePath);
    } else {
      assert.match(manifest, /progress-v5/, relativePath);
    }
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
      if (!value || value.startsWith('#') || value === 'CACHE MANIFEST' || /^(CACHE|NETWORK|FALLBACK):/.test(value) || value === '*') return total;
      return total + 1;
    }, 0);
    // package-jb-host.mjs adds four shared i18n resources to every manifest.
    assert.match(page, new RegExp(`data-cache-total=["']${count + 4}["']`), pagePath);
  }
});
