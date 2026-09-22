# Unified Loading/Status UI Across All Firmware Hosts

**Date:** 2026-09-22
**Status:** Approved in conversation, spec written for review
**Scope:** Presentation layer only (brand bar, status/progress reporting, ad slot).
No exploit script, offset table, kernel patch, or payload binary is touched.

## Goal

Every firmware-branch entry directory currently renders its "loading /
installing cache / running exploit / done / failed" feedback with its own
bespoke markup and styling. Three incompatible generations exist side by
side (plain-text `#msgs` swap, text+progress-bar, and the zrm/13x card UI
with an ad slot). Consolidate all of them onto one shared presentation layer
so every entry gets the same branding, i18n, and ad placement, without
touching or re-verifying any engine's exploit logic.

## Current state (audit, 2026-09-22)

| Group | Directories | Current UI |
|---|---|---|
| Single-flow card candidates | `505goldhen/`, `672goldhen/`, `900goldhen/`, `g2all/`(+`cache700.html`/`cache900.html`/`cachecss.html`) | plain `#msgs` swap or text+progress-bar, no card, no ad slot |
| Menu pages | `505/`, `672/`, `702/`, `75x/`, `900v2/`, `900v3/` | multi-button menu (Game-Dumper/FTP/App2USB/...); `#msgs` is a one-line hover-preview footer, not a linear flow |
| Card UI (already newest) | `zrm/index.html`, `13x/index.html` | grid card: state/detail/cache-progress/ad-slot, own `ui-bridge.js` |
| Log UI | `zrm/run_lapse.html`, `zrm/run_poops.html` | card family + extra `#out` terminal-log box, overridden by inline `<style>` back to a stacked (non-grid) layout |
| Spinner UI | `13x/jb.html` | spinner only; `#state`/`#out` hidden unless `?log=1`; driven by `body.className` (`done`/`fail`/`log`), because `jb.js` is an unmodified upstream engine |
| Restore/uninstall | `restore/505/`, `restore/505goldhen/`, `restore/672/`, `restore/672goldhen/`, `restore/702/`, `restore/75x/`, `restore/900goldhen/`, `restore/900v2/`, `restore/900v3/` | same plain `#msgs` swap as the main-flow old pages |

**Verified fact, not assumption:** every old page (menu and single-flow
alike, main flow and `restore/*` alike) writes its status text into an
element with `id="msgs"`, either via bare `msgs.innerHTML = "..."` or
`document.getElementById("msgs").innerHTML = "..."`. Confirmed by direct
grep across `505/`, `672/`, `702/`, `75x/`, `900goldhen/`, `900v2/`,
`900v3/`, `g2all/`, `restore/505/`, `restore/900v2/`. Some pages also have
decorative `#msgs2`/`#msgs3`/`#msgs-mods` section headers for button
groups (e.g. "Backup and Restore", "Games Mods") — those are static
labels, not state text, and are left untouched.

**Debunked claim, do not carry forward:** `13x/13x.css`'s header comment
("avoids flexbox and CSS Grid ... for the oldest-firmware safety margin;
see Game/CLAUDE.md's CSS-compat history") references a document section
that does not exist anywhere in `Game/CLAUDE.md` or any repo doc (checked
by grep across all `Game/*/CLAUDE.md` and `Game/*/docs`). It was
introduced in commit `a2bf249` with no supporting evidence, and is
factually backwards anyway — `13x` targets newer firmware (13.02–13.52)
than `zrm` (11.50–13.00), so there is no "13x needs more conservative CSS
for older firmware" argument to make. The unified stylesheet uses
flexbox/grid freely, matching `zrm.css`, which is already shipped and
proven on adjacent (older) firmware in production.

## Decisions

1. Add a new top-level `ui/` directory, parallel to the existing `i18n/`
   pattern (self-contained runtime files referenced via relative paths
   from every engine directory; no build step, no bundler — same
   constraint the rest of this repo already runs under).
2. `ui/loading-shell.css` merges `zrm.css` and `13x.css` into one
   visual system, keeping the grid-based card layout from `zrm.css` as
   the base. `13x.css`'s "no flex/grid" self-imposed constraint is
   dropped per the debunked-claim finding above.
3. `ui/loading-shell.js` exposes `window.LudoraLoadingUI`, a small
   imperative API operating on conventional element ids that already
   exist in the current zrm/13x markup (`#brand`, `#state`, `#det`,
   `#cache` + `.cache-progress > span`, `#out`, `#spin`, `#msg`,
   `.ad-slot`). It is a generalization of the pattern already proven by
   `zrm/ui-bridge.js` and `13x/ui-bridge.js`, not a new pattern.
4. `ui/legacy-bridge.js` is a single, engine-agnostic adapter: a
   `MutationObserver` on `#msgs` that forwards its text into
   `LudoraLoadingUI.setState()`, and best-effort extracts a `NN%`
   substring (already present in some messages via
   `LudoraI18n.t('cache.installing', {progress})`) to also drive the
   progress bar. It requires zero per-engine logic and is used
   identically by every old directory (menu or single-flow, main-flow or
   `restore/*`).
5. `zrm/ui-bridge.js` and `13x/ui-bridge.js` are refactored, not
   replaced: their engine-specific state *detection* stays (`#state`
   text regex for zrm; `MutationObserver` on `body.className` for 13x,
   because `jb.js` is unmodified upstream and cannot be touched), but the
   DOM-writing half of each is replaced with calls into
   `LudoraLoadingUI`.
6. Five presentation modes share the same CSS/JS, selected per directory
   by which markup blocks a page includes:
   - **Chrome-only** (brand bar + status footer + ad slot; page content
     untouched): the 6 menu pages.
   - **Card** (state/detail/cache-progress + ad slot): `505goldhen/`,
     `672goldhen/`, `900goldhen/`, `g2all/` (all 4 of its HTML pages),
     `zrm/index.html`, `13x/index.html`, and all 9 `restore/*` entries.
   - **Log** (card + `#out` terminal box): `zrm/run_lapse.html`,
     `zrm/run_poops.html`.
   - **Spinner** (`#spin`, hidden state/out except `?log=1`):
     `13x/jb.html`.
7. Each directory's `cache.appcache` is edited independently to add the
   2–3 new shared-file lines it needs. No global/shared manifest is
   introduced — confirmed hard requirement from
   `docs/superpowers/specs/2026-08-28-dual-engine-host-design.md`:
   engines must keep independent AppCache namespaces so that updating one
   engine can never serve another engine's stale files.
8. Out of scope, must not be touched by any task in either phase:
   `ps4_offsets.js`, `constants.js`, `patches/*.bin`, `kpatch/*.elf`,
   `goldhen.bin`/`payload2.bin`/`payload.bin`, `lapse/*.js`, `rop/*.js`,
   `module/*.js`, and `13x/jb.js` (explicitly unmodified upstream engine
   body — only its *observed* `body.className` may be read).

## Shared API surface (`ui/loading-shell.js`)

```js
window.LudoraLoadingUI = {
  // mode: "chrome" | "card" | "log" | "spinner" — determines which
  // optional DOM blocks (#det, #cache, #out, #spin) this page wires up.
  // Missing elements are no-ops, never thrown errors.
  init(mode),
  setState(text, opts),      // opts: { i18nKey, className }
  setDetail(text),           // #det
  setCacheProgress(percent, opts), // opts: { ok: boolean }; 0-100, clamps
  appendLog(line),           // #out, only meaningful in "log"/"spinner?log=1"
  setLogVisible(visible),
  setSpinning(spinning),     // #spin
  showFailure(text),         // #msg banner, "spinner" mode
};
```

## Data flow per page

1. Page `<head>` adds `<link rel="stylesheet" href="../ui/loading-shell.css">`
   and `<script src="../ui/loading-shell.js"></script>` (path depth varies
   by directory nesting, e.g. `restore/505/` uses `../../ui/...`).
2. Page body keeps (or gains, for old menu/single-flow pages) the shared
   markup skeleton: `#brand`, `.eyebrow`, `#state`, optionally `#det`,
   `#cache` + `.cache-progress`, optionally `#out`, `.ad-slot`.
3. Just before `</body>`, the page adds either:
   - `<script src="../ui/legacy-bridge.js"></script>` (old pages — zero
     per-engine code), or
   - its own (refactored) `ui-bridge.js` (zrm, 13x).
4. `cache.appcache` in that directory gains lines for every new shared
   file the page now references (hash-comment convention already used by
   every manifest in this repo).

## Testing (no physical PS4/PS5 available)

- Playwright, local: spoof `navigator.userAgent` per target firmware,
  load each migrated page, screenshot, and assert the shared brand
  bar / ad slot / status line render; dispatch synthetic mutations to
  the page's own `#msgs`/`#state`/`body.className` (whichever that
  engine already writes) and assert `LudoraLoadingUI` reflects them.
- Extend `scripts/check-host-pages.mjs` / `scripts/verify-host-runtime.mjs`
  (already run in CI-equivalent `npm run verify:*`) with a new assertion:
  every `ui/*` file a page's `<head>`/`<body>` references must also
  appear in that directory's own `cache.appcache`.
- Real-device sampling is done by the user, not by this agent (no
  hardware access). Phase 1 explicitly produces one directory per mode
  so a single real-device pass per mode is enough to validate the whole
  approach before Phase 2 repeats it mechanically.

## Phasing

**Phase 1 (this cycle — plan + implement):** build `ui/` shared layer,
then migrate exactly one directory per mode to prove the pattern
end-to-end:
- Chrome-only: `672/`
- Card (old-generation): `505goldhen/`
- Card (g2all cache page): `g2all/cache900.html`
- Log + card (full zrm family, validates the log mode and the
  refactor of an existing bespoke bridge): `zrm/` (`index.html`,
  `run_lapse.html`, `run_poops.html`)
- Spinner + card (full 13x family, validates the spinner mode and the
  second bespoke-bridge refactor): `13x/` (`index.html`, `jb.html`)
- Restore/chrome: one `restore/*` directory (`restore/672/`, matching
  the Phase-1 `672/` pair for easy before/after comparison)

**Phase 2 (separate plan, written after Phase 1 has a real-device pass):**
mechanically repeat the Phase-1 pattern across the remaining ~16
directories (`505`, `702`, `75x`, `900v2`, `900v3`, `900goldhen`,
`672goldhen`, `g2all/cache700.html`, `g2all/cachecss.html`,
`g2all/index.html`, `g2all/diagnose.html`, and the remaining 8
`restore/*` entries). Not detailed further in this spec — it is the same
recipe applied to different directories, and per the writing-plans
"no placeholder" rule its tasks get written out in full once Phase 1's
pattern is confirmed correct on real hardware, not assumed correct now.
