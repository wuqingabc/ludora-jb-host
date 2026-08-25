# Ludora Host i18n and Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with checkpoints.

**Goal:** Make every protected Ludora Host page use the Ludora website visual system, support `zh-CN`, `zh-TW`, and `en-US`, remove visible GamerHack branding, and package the complete Host tree without touching pkg or exploit payloads.

**Architecture:** Keep exploit and payload files unchanged. Add a small ES5-compatible local i18n runtime and three dictionaries to the Host root, use HTML data attributes plus a compatibility adapter for dynamic status strings, and make `ludora-site` package the complete Host tree with static validation. Copy the official Ludora tokens into Host CSS as local values so offline cache and PS4 WebKit do not depend on the Astro runtime.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, existing `ludora-site` Astro packaging script, Playwright verification where available.

**Spec:** `docs/superpowers/specs/2026-08-25-ludora-host-i18n-brand-design.md`

## Global Constraints

- Support `zh-CN`, `zh-TW`, and `en-US`; `zh-CN` remains the default `/jb` path.
- Resolve language from `?lang`, then Cookie/localStorage, then `navigator.language`, then `zh-CN`.
- Host runtime must remain ES5-compatible and local-only; no CDN, remote fonts, `fetch`, Promise, modules, or `Intl`.
- Do not modify pkg sources, payload binaries, exploit core logic, or GoldHEN files.
- Remove visible GamerHack branding while retaining necessary non-visible technical source comments.
- Preserve authorization Cookie, UA routing, GoldHEN/exploit timing, USB flow, and cache behavior.
- Match the Ludora website tokens from `ludora-site/src/styles/tokens.css`.

### Task 1: Establish failing i18n and repository-boundary tests

**Files:**
- Create: `jb/test/i18n.test.mjs`
- Create: `jb/test/host-audit.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Tests will import `jb/src/i18n.mjs` after Task 2 and `scripts/audit-host-pages.mjs` after Task 3.
- The tests define the supported locale list, fallback behavior, interpolation, key parity, visible-brand policy, and protected-file policy.

- [ ] **Step 1: Write failing tests for locale behavior**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator, normalizeLocale } from '../src/i18n.mjs';

test('normalizes simplified, traditional, and English locales', () => {
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  assert.equal(normalizeLocale('zh-TW'), 'zh-TW');
  assert.equal(normalizeLocale('zh-HK'), 'zh-TW');
  assert.equal(normalizeLocale('en-US'), 'en-US');
  assert.equal(normalizeLocale('fr-FR'), 'zh-CN');
});

test('translates and interpolates a status message', () => {
  const t = createTranslator('zh-TW');
  assert.equal(t('cache.installing', { progress: 42 }), '正在安裝離線快取：42%');
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing module**

Run: `node --test jb/test/i18n.test.mjs`

Expected: FAIL because `jb/src/i18n.mjs` does not exist yet.

- [ ] **Step 3: Write failing tests for page audit and protected payload boundaries**

The audit test must enumerate every `.html` file under the Host root, require local i18n/style references, reject visible `GamerHack` text, require all three dictionary files, and compare Git object IDs for protected exploit/payload files before and after the migration. It must explicitly exclude `jb/test`, `docs`, and the i18n implementation from the visible-text scan.

- [ ] **Step 4: Run the audit test and record the expected failures**

Run: `node --test jb/test/host-audit.test.mjs`

Expected: FAIL on missing i18n assets, missing page markers, and existing visible GamerHack strings. These failures are the red baseline.

- [ ] **Step 5: Add test commands**

Add `test:host` as `node --test jb/test/*.test.mjs` while preserving `verify:host-pages` and `verify:host-runtime`.

### Task 2: Add ES5-compatible three-locale runtime and dictionaries

**Files:**
- Create: `i18n.js`
- Create: `i18n/zh-CN.js`
- Create: `i18n/zh-TW.js`
- Create: `i18n/en-US.js`
- Create: `jb/src/i18n.mjs`
- Modify: `jb/test/i18n.test.mjs`

**Interfaces:**
- Browser global: `window.LudoraI18n` with `t`, `apply`, `locale`, and `setLocale`.
- Node test helper: `normalizeLocale`, `createTranslator`, `loadDictionaries`.
- Dictionary keys are flat dot-separated keys, and all three dictionaries must have identical key sets.

- [ ] **Step 1: Implement the Node-testable locale helper**

Use plain ESM in `jb/src/i18n.mjs` for tests only. Export `normalizeLocale(value)`, `loadDictionaries()`, and `createTranslator(locale)`. `createTranslator` must return the key itself only when both the requested and default dictionary lack the key; otherwise it must interpolate every `{name}` placeholder with a string value.

- [ ] **Step 2: Run the focused tests and verify they pass**

Run: `node --test jb/test/i18n.test.mjs`

Expected: PASS for locale mapping, Traditional Chinese interpolation, fallback behavior, and dictionary key parity.

- [ ] **Step 3: Implement the browser runtime in ES5**

`i18n.js` must parse the query string without `URLSearchParams`, read/write a scoped Cookie with guarded `localStorage` access, map `zh`, `zh-HK`, and `zh-TW` correctly, and apply `[data-i18n]`, `[data-i18n-alt]`, `[data-i18n-title]`, and `[data-i18n-aria-label]`. It must expose `LudoraI18n.t(key, params)` for existing dynamic status code and set `document.documentElement.lang`.

- [ ] **Step 4: Verify the browser runtime syntax floor**

Run a static check that rejects `const`, `let`, `=>`, `fetch(`, `Promise`, `import `, and `Intl` in `i18n.js`.

### Task 3: Apply Ludora brand shell and migrate all HTML presentation text

**Files:**
- Modify: `style.css`
- Modify: every user-facing `*.html` under the Host root
- Modify: existing page-local presentation scripts only where they write user-visible status strings
- Create: `scripts/audit-host-pages.mjs`
- Modify: `jb/test/host-audit.test.mjs`

**Interfaces:**
- Every user-facing HTML page loads `../i18n.js` at the correct relative path before UI initialization and loads the shared local `style.css`.
- `scripts/audit-host-pages.mjs` exports `collectHostPages()`, `auditHostPage()`, and `auditHostTree()` for tests and CLI use.

- [ ] **Step 1: Make the audit script report all existing violations**

The script must resolve relative local assets, detect user-visible GamerHack text in titles/body/attributes/scripts that write UI, verify i18n markers or a page-specific compatibility adapter, and ignore binary payload content and technical comments.

- [ ] **Step 2: Run the audit and confirm it fails on the current tree**

Run: `node scripts/audit-host-pages.mjs`

Expected: non-zero exit with a deterministic list of missing i18n/style references and visible legacy-brand violations.

- [ ] **Step 3: Update the shared CSS from official Ludora tokens**

Replace Host-specific invented values with the static equivalents of the official background, surface, border, foreground, muted foreground, accent, radius, shadow, and spacing tokens. Preserve TV-sized focus targets and no external font dependency. Keep ad slots and unsupported-browser state in the same visual system.

- [ ] **Step 4: Migrate the root, authorization, cache, restore, and firmware pages**

Add stable `data-i18n` keys to every visible heading, button, label, footer, error, cache-progress message, GoldHEN status, USB instruction, and browser-support message. Replace visible GamerHack titles and credits with neutral Ludora product copy. Do not change exploit script bodies or binary filenames.

- [ ] **Step 5: Adapt dynamic status outputs**

Route existing progress/status writers through `LudoraI18n.t`. Keep default fallback text in the existing nodes so a failed i18n load does not leave the screen blank.

- [ ] **Step 6: Re-run audit and page tests**

Run: `node --test jb/test/host-audit.test.mjs && node scripts/audit-host-pages.mjs`

Expected: PASS with zero visible GamerHack matches and zero missing local assets.

### Task 4: Expand official-site packaging to the complete Host tree

**Files:**
- Modify: `/Users/qingwu/Development/Game/ludora-site/scripts/package-jb-host.mjs`
- Create or modify: `/Users/qingwu/Development/Game/ludora-site/scripts/package-jb-host.test.mjs`
- Modify: `/Users/qingwu/Development/Game/ludora-site/package.json` only if a test command is missing

**Interfaces:**
- Packaging uses `JB_HOST_SOURCE` and `JB_HOST_REF` as today.
- The packaged directory must contain the complete checked Host tree except repository metadata, tests, docs, and development-only files.
- The package manifest records the resolved commit and locale assets.

- [ ] **Step 1: Write a failing packaging manifest test**

Assert that the staged output contains root entry files, all firmware directories, all nested HTML routes, all three locale dictionaries, `i18n.js`, and local CSS; assert that no GamerHack visible copy reaches packaged HTML.

- [ ] **Step 2: Run the packaging test against the current sparse implementation**

Run: `node --test scripts/package-jb-host.test.mjs`

Expected: FAIL because the current script only sparse-checks four directories and omits multiple firmware and restore routes.

- [ ] **Step 3: Replace the sparse list with a controlled full-tree package**

Use a temporary clone of the pinned ref, copy all allowed Host assets with `cpSync`, skip `.git`, `node_modules`, tests, docs, and development metadata, and validate every copied HTML reference before publishing `.jb-host`. Preserve cache manifest revision stamping.

- [ ] **Step 4: Remove residual GamerHack copy from generated PS5 fallback**

The generated fallback must use Ludora copy and remain a simple local/redirect page compatible with current server routing.

- [ ] **Step 5: Run the packaging test and existing site checks**

Run from `ludora-site`: `node --test scripts/package-jb-host.test.mjs` and the existing site verification/build command used by the repository.

### Task 5: End-to-end verification and handoff

**Files:**
- Modify: `README.md` and `jb/README.md` with locale and packaging behavior
- Modify: `docs/superpowers/specs/2026-08-25-ludora-host-i18n-brand-design.md` status after completion

- [ ] **Step 1: Run all Host tests**

Run: `npm run test:host && npm run verify:host-pages && npm run verify:host-runtime`

- [ ] **Step 2: Verify protected behavior with Playwright**

Test desktop preview, PS4 UA, PS5 UA, no-cookie deep links, valid-cookie deep links, `zh-CN`, `zh-TW`, and `en-US`. Confirm unsupported desktop browsers see the explicit PS4/PS5 message and never receive an exploit entry.

- [ ] **Step 3: Compare protected exploit/payload files**

Use a manifest generated before Task 3 and after Task 5; require identical SHA-256 values for all exploit/payload/GoldHEN files and report any difference as a hard failure.

- [ ] **Step 4: Update documentation and record limitations**

Document cache invalidation expectations, language query examples, full package contents, and the fact that pkg files were not modified.

- [ ] **Step 5: Commit separately by concern**

Use commits for: i18n runtime/tests, Host presentation/brand migration, and official-site packaging/tests. Do not deploy until all verification output is green and the user separately authorizes deployment.
