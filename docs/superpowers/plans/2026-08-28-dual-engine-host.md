# Ludora Dual-Engine PS4 Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route supported PS4 firmware to the appropriate legacy GamerHack or raw-game zrm engine while sharing Ludora authorization, UI, i18n, cache, GoldHEN, and package-stage integration.

**Architecture:** Keep the existing `g2all` tree as an isolated legacy engine. Treat the local `zrm` tree as an isolated raw-game engine, with a small Ludora adapter around its Lapse/Poops state and post-exploit handoff. Keep firmware selection and authorization in `ludora-site`, while `ludora-jb-host` owns engine assets and engine-compatible pages.

**Tech Stack:** TypeScript, Astro, Vitest, Node test runner, static HTML/JavaScript, PS4 WebKit AppCache, existing Ludora package/deployment scripts.

**Spec:** `docs/superpowers/specs/2026-08-28-dual-engine-host-design.md`

## Global Constraints

- Do not modify PKG source or released PKG files.
- Do not rewrite exploit primitives, firmware offsets, kernel patches, or engine algorithms.
- Preserve the original GamerHack PSFree/Lapse path for its assigned legacy firmware ranges.
- Do not increase retry counts beyond upstream behavior.
- Keep all visible engine UI under Ludora branding with Simplified Chinese, Traditional Chinese, and English translations.
- Do not redirect console users to GitHub Pages or the raw-game domain.
- Do not allow a failed engine state to start GoldHEN or PKG installation.
- Every implementation task must add or update a focused automated test before production code.

---

### Task 1: Freeze the current engine and routing baseline

**Repository:** `/Users/qingwu/Development/Game/ludora-site`

**Files:**
- Modify: `src/lib/jb-host-adapter.ts`
- Modify: `src/lib/jb-router.ts`
- Test: `src/lib/jb-host-adapter.test.ts`
- Test: `src/lib/jb-router.test.ts`

**Interfaces:**
- Consumes: `nativeHostTarget(platform, firmware)` and `isNativeHostPathAllowed(host, platform, firmware)`.
- Produces: deterministic route decisions for legacy g2all and zrm without changing PS5 routing.

- [ ] **Step 1: Write failing boundary tests**

  Add tests asserting:

  ```ts
  expect(nativeHostTarget("ps4", 11.00)).toBe(JB_HOST_TARGETS.ps4_zrm);
  expect(nativeHostTarget("ps4", 11.02)).toBe(JB_HOST_TARGETS.ps4_zrm);
  expect(nativeHostTarget("ps4", 12.02)).toBe(JB_HOST_TARGETS.ps4_zrm);
  expect(nativeHostTarget("ps4", 12.50)).toBe(JB_HOST_TARGETS.ps4_zrm);
  expect(nativeHostTarget("ps4", 13.00)).toBe(JB_HOST_TARGETS.ps4_zrm);
  expect(nativeHostTarget("ps4", 11.02)).not.toBe(JB_HOST_TARGETS.ps4_g2all);
  ```

- [ ] **Step 2: Run the focused tests and verify the expected failure**

  Run from `ludora-site`:

  ```bash
  pnpm vitest run src/lib/jb-host-adapter.test.ts src/lib/jb-router.test.ts
  ```

  Expected: the 11.00–11.02 assertions fail because the current zrm range starts at 11.50.

- [ ] **Step 3: Implement the minimal routing correction**

  Change only the zrm lower bound in both `nativeHostTarget` and `isNativeHostPathAllowed` from `11.5` to `11.0`. Leave the existing 7.00–11.02 g2all condition ordered after the zrm condition so 11.00–11.02 resolves to zrm.

- [ ] **Step 4: Run the focused and related tests**

  ```bash
  pnpm vitest run src/lib/jb-host-adapter.test.ts src/lib/jb-router.test.ts src/lib/jb-host-path.test.ts
  ```

  Expected: all focused tests pass and PS5 routes remain unchanged.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/jb-host-adapter.ts src/lib/jb-router.ts src/lib/jb-host-adapter.test.ts src/lib/jb-router.test.ts
  git commit -m "fix: route new PS4 firmware to zrm host"
  ```

### Task 2: Add a zrm engine adapter contract without changing zrm algorithms

**Repository:** `/Users/qingwu/Development/Game/ludora-site`

**Files:**
- Create: `src/lib/jb-engine.ts`
- Modify: `src/lib/jb-router.ts`
- Test: `src/lib/jb-engine.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type JbEngineKind = "legacy" | "zrm-lapse" | "zrm-poops";
  type JbEngineState = "idle" | "cache" | "running" | "kernel" | "payload" | "reboot-required" | "failed" | "complete";
  function selectJbEngine(platform: "ps4" | "ps5", firmware: number | null): { kind: JbEngineKind; entry: string } | null;
  function canStartPostExploit(state: JbEngineState): boolean;
  ```
- Consumes: firmware context and the existing native host target constants.

- [ ] **Step 1: Write failing tests**

  Cover legacy firmware, zrm Lapse firmware, zrm Poops firmware, unsupported firmware, and the rule that only `payload`/`complete` states may proceed to the post-exploit adapter.

- [ ] **Step 2: Run the focused test and verify failure**

  ```bash
  pnpm vitest run src/lib/jb-engine.test.ts
  ```

  Expected: module/function-not-found failure.

- [ ] **Step 3: Implement the pure adapter functions**

  Keep this module free of DOM, fetch, localStorage, and exploit calls. Return `zrm/index.html` as the zrm entry and let the zrm page select Lapse/Poops from its own firmware table.

- [ ] **Step 4: Run focused tests and typecheck**

  ```bash
  pnpm vitest run src/lib/jb-engine.test.ts
  pnpm exec tsc --noEmit -p tsconfig.test.json
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/jb-engine.ts src/lib/jb-engine.test.ts src/lib/jb-router.ts
  git commit -m "feat: define jailbreak engine adapter"
  ```

### Task 3: Normalize zrm firmware selection and localized host UI

**Repository:** `/Users/qingwu/Development/Game/ludora-jb-host`

**Files:**
- Modify: `zrm/index.html`
- Modify: `zrm/run_lapse.html`
- Modify: `zrm/run_poops.html`
- Modify: `zrm/zrm.css`
- Modify: `i18n/en-US.js`
- Modify: `i18n/zh-CN.js`
- Modify: `i18n/zh-TW.js`
- Test: `jb/test/host-audit.test.mjs`

**Interfaces:**
- Consumes: existing `zrm/ps4_offsets.js`, `chain_lapse.js`, `chain_poops.js`, shared `LudoraI18n`.
- Produces: localized Ludora status rendering for zrm without modifying chain internals.

- [ ] **Step 1: Add failing source-audit assertions**

  Assert that zrm pages load all three dictionaries and `i18n.js`, expose a localized state node, contain no visible GamerHack/raw-game branding, and map unsupported/reboot-required/cache/payload states to translation keys.

- [ ] **Step 2: Run the host audit and verify failure**

  ```bash
  cd /Users/qingwu/Development/Game/ludora-jb-host
  node --test jb/test/host-audit.test.mjs
  ```

  Expected: new zrm i18n/state assertions fail.

- [ ] **Step 3: Implement the UI-only adapter**

  Add a small translation helper in the zrm page shell and use it for firmware detection, cache status, engine selection, reboot-required, payload start, payload failure, and completion messages. Keep `chain_lapse.js` and `chain_poops.js` algorithm code unchanged; only connect their existing state/report callbacks where the source already exposes them.

- [ ] **Step 4: Run host tests and syntax checks**

  ```bash
  pnpm verify:host-runtime
  node --test jb/test/host-audit.test.mjs
  ```

  Also run `node --check` on any extracted inline script files or use the existing host runtime verifier for HTML-embedded scripts.

- [ ] **Step 5: Commit**

  ```bash
  git add zrm i18n jb/test/host-audit.test.mjs
  git commit -m "feat: localize zrm host interface"
  ```

### Task 4: Implement zrm cache isolation and real progress reporting

**Files:**
- Modify: `ludora-jb-host/zrm/cache.appcache`
- Modify: `ludora-jb-host/zrm/index.html`
- Modify: `ludora-jb-host/zrm/run_lapse.html`
- Modify: `ludora-jb-host/zrm/run_poops.html`
- Modify: `ludora-jb-host/zrm/zrm.css`
- Modify: `ludora-site/scripts/package-jb-host.mjs`
- Modify: `/Users/qingwu/Development/Game/ludora-site/scripts/node-tests/package-jb-host.node-test.mjs`
- Test: `ludora-jb-host/jb/test/host-audit.test.mjs`

**Interfaces:**
- Consumes: AppCache progress events and the packaging script's manifest injection.
- Produces: an independently versioned zrm cache with actual intermediate progress and no g2all asset crossover.

- [ ] **Step 1: Add failing cache assertions**

  Assert that the zrm manifest contains a unique revision, includes all zrm runtime assets plus shared i18n, excludes g2all exploit assets, and that the zrm shell renders `loaded / total` progress when AppCache exposes both values.

- [ ] **Step 2: Run focused tests and verify failure**

  ```bash
  cd /Users/qingwu/Development/Game/ludora-jb-host
  node --test jb/test/host-audit.test.mjs
  cd /Users/qingwu/Development/Game/ludora-site
  pnpm test -- scripts/node-tests/package-jb-host.node-test.mjs
  ```

- [ ] **Step 3: Implement separate zrm revision/progress handling**

  Keep `zrm/cache.appcache` independent. Use `Math.round(loaded / total * 100)` for known totals, show an indeterminate state only when the browser supplies no total, and never route into the engine before `cached`, `noupdate`, or a deliberate user recovery action.

- [ ] **Step 4: Verify packaging**

  ```bash
  cd /Users/qingwu/Development/Game/ludora-site
  pnpm package:jb-host
  pnpm verify:jb-host
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/qingwu/Development/Game/ludora-jb-host
  git add zrm jb/test/host-audit.test.mjs
  git commit -m "fix: isolate zrm cache and report progress"

  cd /Users/qingwu/Development/Game/ludora-site
  git add scripts/package-jb-host.mjs scripts/node-tests/package-jb-host.node-test.mjs
  git commit -m "test: verify zrm host packaging"
  ```

### Task 5: Connect zrm success states to the existing Ludora post-exploit adapter

**Repository:** `/Users/qingwu/Development/Game/ludora-jb-host`

**Files:**
- Modify: `zrm/run_lapse.html`
- Modify: `zrm/run_poops.html`
- Modify: `pkg-stage.js`
- Test: `jb/test/host-audit.test.mjs`

**Interfaces:**
- Consumes: zrm's existing `payloadRunning`, `rebootRequired`, `kpatched`, and completion state signals.
- Produces: one post-exploit handoff call with `{ engine, firmware, payloadReady }`, followed by the existing GoldHEN/config/PKG adapter.

- [ ] **Step 1: Add failing adapter tests**

  Assert that `rebootRequired`, missing payload, failed payload thread, and incomplete cleanup do not start `LudoraPkgStage`; assert that a successful payload state starts the existing adapter exactly once.

- [ ] **Step 2: Run tests and verify failure**

  ```bash
  cd /Users/qingwu/Development/Game/ludora-jb-host
  node --test jb/test/host-audit.test.mjs
  ```

- [ ] **Step 3: Add the narrow handoff bridge**

  Use the existing zrm state reporting boundary. Do not change race loops, offset reads, cleanup, or kernel patch logic. The bridge must guard against duplicate callbacks and must call the existing PKG stage only after the zrm payload-running condition is true and `rebootRequired` is false.

- [ ] **Step 4: Run all host/site tests**

  ```bash
  cd /Users/qingwu/Development/Game/ludora-jb-host && node --test jb/test/*.test.mjs
  cd /Users/qingwu/Development/Game/ludora-site && pnpm test && pnpm typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add zrm pkg-stage.js
  git commit -m "feat: connect zrm success to Ludora post-exploit flow"
  ```

### Task 6: Complete cross-engine verification and production deployment

**Repositories:** `/Users/qingwu/Development/Game/ludora-site`, `/Users/qingwu/Development/Game/ludora-jb-host`

**Files:**
- Modify: `/Users/qingwu/Development/Game/ludora-site/src/lib/jb-router.test.ts`
- Modify: `/Users/qingwu/Development/Game/ludora-site/src/lib/jb-host-adapter.test.ts`
- Modify: `/Users/qingwu/Development/Game/ludora-jb-host/jb/test/host-audit.test.mjs`
- Modify: `/Users/qingwu/Development/Game/ludora-site/CLAUDE.md` only when the final routing/deployment contract requires documentation changes

**Interfaces:**
- Consumes: all preceding routing, engine, cache, and adapter interfaces.
- Produces: a production artifact with a recorded host commit and verified health endpoint.

- [ ] **Step 1: Run complete local verification**

  ```bash
  cd /Users/qingwu/Development/Game/ludora-jb-host
  node --test jb/test/*.test.mjs
  cd /Users/qingwu/Development/Game/ludora-site
  pnpm test
  pnpm typecheck
  pnpm package:jb-host
  pnpm verify:jb-host
  pnpm build
  ```

- [ ] **Step 2: Run route smoke checks**

  Verify `/jb` on desktop preview, PS4 UA 9.00, PS4 UA 11.00, PS4 UA 12.02, PS4 UA 12.52, PS4 UA 13.00, unsupported desktop, and PS5 UA. Confirm only the expected route is emitted and no engine script runs before authorization.

- [ ] **Step 3: Deploy with the existing production script**

  ```bash
  unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY
  export JB_HOST_SOURCE=/Users/qingwu/Development/Game/ludora-jb-host
  export JB_PKG_STAGE_ELF=/Users/qingwu/Development/Game/ludora-jb-pkg-stage/pkg-stage/bin/ludora-web-pkg-stage.elf
  export JB_GOLDHEN_CONFIG_STAGE_ELF=/Users/qingwu/Development/Game/ludora-jb-pkg-stage/config-stage/bin/goldhen-config-stage.elf
  export LUDORA_JB_PKG_FILE=/Users/qingwu/Development/Game/bd-jb-1300/upstream/henloader_lp/HenLoader/bd-metadata/official-lapse-poops/ludora.pkg
  export LUDORA_JB_PKG_SHA256=$(shasum -a 256 "$LUDORA_JB_PKG_FILE" | awk '{print $1}')
  bash scripts/deploy.sh
  ```

- [ ] **Step 4: Verify production**

  ```bash
  unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY
  ssh root@mail.winamz.com "systemctl is-active ludora-site; curl --fail --silent --show-error http://127.0.0.1:8700/healthz"
  ```

  Also confirm the deployed `.jb-host/manifest.json` records the expected host commit and that zrm/g2all manifests have different revisions.

- [ ] **Step 5: Commit verification documentation**

  ```bash
  git add src/lib/jb-router.test.ts src/lib/jb-host-adapter.test.ts
  git commit -m "test: verify dual-engine host routing"
  ```
