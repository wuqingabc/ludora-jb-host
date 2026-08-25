# Ludora JB Host Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign every user-facing page under `/jb/host` in the Ludora visual language while preserving the upstream exploit runtime, payloads, manifests, and PS4 WebKit compatibility.

**Architecture:** Keep exploit pages as static HTML with their original scripts and IDs. Introduce one conservative local presentation layer and shared semantic wrapper patterns, then update only copy/layout hooks around the existing runtime. Verification compares protected runtime files and manifest/script contracts before and after the visual changes.

**Tech Stack:** Static HTML, conservative CSS, Node.js scripts, existing Playwright checks.

**Spec:** `docs/superpowers/specs/2026-08-25-ludora-jb-host-pages-design.md`

## Global Constraints

- Do not modify payload binaries, exploit JavaScript, GoldHEN files, pkg files, or authorization API behavior.
- Keep all existing exploit script tags, IDs, manifest declarations, relative asset paths, and load order intact.
- Use local CSS only; no external fonts, CDN assets, or runtime dependencies.
- Avoid CSS Grid and browser features unavailable in the PS4 WebKit runtime.
- Keep status text functional when CSS fails and preserve controller-sized focus targets.

### Task 1: Capture runtime contracts before the redesign

**Files:**
- Create: `scripts/verify-host-runtime.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces a command `npm run verify:host-runtime` that records and checks protected host script, manifest, and binary contracts.

- [ ] **Step 1: Write the verifier**

  Walk `505`, `505goldhen`, `672`, `672goldhen`, `702`, `75x`, `900goldhen`, `900v2`, `900v3`, and `g2all`; assert every HTML script `src`, every manifest file line, and every `.bin`/`.elf`/`.js` runtime file hash is present and unchanged relative to `.host-runtime-baseline.json`.

- [ ] **Step 2: Generate the baseline and run it**

  Run `node scripts/verify-host-runtime.mjs --write-baseline`, then `npm run verify:host-runtime`; expected output is a list of checked routes and `PASS`.

- [ ] **Step 3: Commit the guardrail**

  Commit `scripts/verify-host-runtime.mjs`, `.host-runtime-baseline.json`, and the package script with message `test(jb): guard exploit runtime contracts`.

### Task 2: Replace the host selector presentation

**Files:**
- Modify: `index.html`
- Modify: `style.css`

**Interfaces:**
- Keeps every existing destination URL and donation/restore action.
- Produces controller-friendly firmware groups and explicit device/USB metadata.

- [ ] **Step 1: Add semantic firmware groups**

  Keep each existing destination, but wrap links in groups for `5.xx`, `6.xx`, `7.xx–11.02`, `9.00 legacy`, `restore`, and `PS5`; add plain text metadata such as `浏览器入口`, `9.00 专用 USB`, or `按固件自动匹配`.

- [ ] **Step 2: Add the Ludora shell and access rail**

  Add a compact header, reserved ad slot, main host panel, and three-stage rail. Keep the old `msgs`, `menu`, and `crypto` IDs so existing inline behavior remains functional.

- [ ] **Step 3: Style and verify**

  Use the shared indigo/gold tokens, 44px minimum button height, `:focus` states, and an explicit non-console note. Run `npm run verify:host-runtime` and open `/jb/host` in Playwright at desktop and `PlayStation 4` UA.

### Task 3: Unify firmware loading and cache pages

**Files:**
- Modify: `g2all/index.html`, `g2all/cache700.html`, `g2all/cache900.html`, `g2all/cachecss.html`
- Modify: `505/cache.html`, `505goldhen/cache.html`, `900goldhen/cache.html`, `900v3/cache.html`
- Modify: `505/index.html`, `505goldhen/index.html`, `672/index.html`, `672goldhen/index.html`, `702/index.html`, `75x/index.html`, `900goldhen/index.html`, `900v2/index.html`, `900v3/index.html`

**Interfaces:**
- Does not change script `src`, event handlers, cache events, manifest paths, or runtime IDs.
- Produces consistent loading, unsupported, USB-required, and completed states.

- [ ] **Step 1: Add shared presentation hooks around existing runtime**

  Preserve each inline runtime block byte-for-byte where possible; change only page title, visible heading, status copy, and wrapper classes. Keep `msgs` as the live status target.

- [ ] **Step 2: Normalize cache progress states**

  Keep existing `applicationCache` listeners and progress calculations, but ensure the visible status element has a fallback value of `正在安装离线缓存 · 0%` and the success/failure text is readable without the stylesheet.

- [ ] **Step 3: Add firmware metadata**

  Show detected platform and supported firmware range in static text. Mark `/900goldhen` as `PS4 9.00 · 专用 USB 入口`; mark `g2all` as the multi-firmware browser entry so 9.02 users are not misled.

- [ ] **Step 4: Verify runtime contracts**

  Run `npm run verify:host-runtime`; expected result is `PASS` with no changed runtime hash or script contract.

### Task 4: Add shared unsupported/error and restore presentation

**Files:**
- Modify: `restore/index.html`
- Modify: `restore/505/index.html`, `restore/505goldhen/index.html`, `restore/672/index.html`, `restore/672goldhen/index.html`, `restore/702/payload.html`, `restore/75x/payload.html`, `restore/900goldhen/index.html`, `restore/900v2/index.html`, `restore/900v3/index.html`
- Modify: `style.css`

**Interfaces:**
- Keeps restore payload paths and script references intact.
- Produces clear recovery guidance and an ad slot without blocking exploit controls.

- [ ] **Step 1: Normalize restore headings and guidance**

  Use Ludora copy for restore purpose, cache clearing, and retry guidance; keep the existing payload links and execution controls.

- [ ] **Step 2: Add no-console fallback**

  Use a static message that says `请使用 PS4/PS5 浏览器访问此页面` when the page is opened in a normal browser, without hiding the reserved ad area.

- [ ] **Step 3: Run route and asset checks**

  Verify every referenced stylesheet, image, manifest, script, and binary resolves relative to its original page.

### Task 5: Desktop and PS4 WebKit visual verification

**Files:**
- Create: `scripts/check-host-pages.mjs`
- Modify: `README.md`

**Interfaces:**
- Produces `npm run verify:host-pages` for static route/markup checks.

- [ ] **Step 1: Add static checks**

  Check all HTML under host and restore trees for a stylesheet link, a visible status element on runtime pages, no external font/CDN dependency, and no missing local asset references.

- [ ] **Step 2: Run Playwright review**

  Visit `/jb/host`, `/jb/host/g2all/index.html`, `/jb/host/900goldhen/index.html`, and `/jb/host/restore/index.html`; capture desktop screenshots and repeat with a PS4 UA. Confirm no horizontal overflow, readable 44px controls, and visible ad slot.

- [ ] **Step 3: Document cache refresh**

  Add PS4 cache refresh instructions to `README.md`, including clearing cookies/site data and reopening `/jb` after a host layout update.

- [ ] **Step 4: Commit the complete redesign**

  Run `npm run verify:host-runtime && npm run verify:host-pages`; commit with message `feat(jb): redesign protected host pages in Ludora style`.
