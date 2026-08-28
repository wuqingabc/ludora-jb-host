# Ludora Dual-Engine PS4 Host Design

**Date:** 2026-08-28  
**Status:** Approved in conversation; awaiting written-spec review  
**Scope:** Web host integration only. PKG source and released package contents are out of scope.

## Goal

Provide one Ludora-authorized PS4 host entry that selects the most appropriate jailbreak engine by firmware, while keeping the existing GamerHack PSFree/Lapse path for mature firmware and using the raw-game zrm path for newer firmware through a shared Ludora UI, i18n layer, cache lifecycle, and post-exploit installation chain.

## Decisions

1. Keep the existing GamerHack PSFree + Lapse implementation for PS4 7.00–9.60 and its current supported legacy ranges.
2. Use the existing local `zrm/` tree, derived from raw-game, for PS4 11.00–13.00 where its firmware offsets and kernel path are available.
3. Select Lapse for the raw-game firmware range through 12.02 and Poops for 12.50–13.00, matching the raw-game entry behavior and offset table.
4. Keep the Ludora authorization gate before either engine is reachable.
5. Keep the Ludora post-exploit sequence separate from the exploit engines: GoldHEN payload/configuration, `ludora-web-pkg-stage.elf`, and the existing PKG flow remain shared adapters.
6. Do not modify PKG source, released PKG files, exploit primitives, firmware offsets, kernel patches, or the internal algorithm of either engine.
7. Use separate cache namespaces/manifests for legacy PSFree and zrm so an AppCache update in one engine cannot serve stale files from the other.

## Firmware routing

The router must parse the PS4 browser user agent and firmware as a numeric version, reject unsupported or malformed versions, and produce one of these engine decisions:

| Firmware | Engine | Entry | Post-exploit path |
|---|---|---|---|
| 7.00–9.60 | GamerHack PSFree/Lapse | existing `g2all` route | existing Ludora GoldHEN/config/PKG adapter |
| 10.00–11.02 | GamerHack CSS/legacy route where currently supported | existing route | existing adapter, no engine rewrite |
| 11.00–12.02 | raw-game zrm Lapse | `zrm/run_lapse.html` | shared Ludora adapter |
| 12.50–13.00 | raw-game zrm Poops | `zrm/run_poops.html` | shared Ludora adapter |
| all other values | unsupported screen | no exploit entry | no payload execution |

Overlapping ranges must resolve deterministically to the selected raw-game route for 11.00–12.02. The old g2all route must remain reachable only for its explicitly assigned older ranges.

## Shared request and authorization flow

1. User opens `/jb`.
2. The server/client identifies PS4, PS5, or unsupported browser without attempting an exploit on unsupported clients.
3. The existing Ludora QR/session authorization flow creates or resumes a short-lived device session.
4. The TV/console page displays the QR code, authorization code, and expiry countdown in the selected locale.
5. The phone confirms the session and any required membership authorization code.
6. Only after authorization succeeds does the console page redirect to the firmware-selected engine entry.
7. The engine page never contains GamerHack/raw-game branding in visible UI; technical attribution remains in source/license documentation where already required.

## Engine adapter boundary

The two engines must be treated as black-box exploit runners with a narrow host adapter:

- `detectFirmware()` returns `{ console: 'ps4', firmware: number }` or an unsupported result.
- `selectEngine(firmware)` returns `{ kind: 'legacy' | 'zrm-lapse' | 'zrm-poops', entry: string }`.
- `startPostExploitAdapter(context)` is invoked only after the engine reports a successful kernel/payload handoff.
- `reportEngineState(state)` maps engine lifecycle events to localized UI status without changing exploit control flow.

The legacy adapter preserves its existing execution order. The zrm adapter consumes raw-game's state/result signals and must stop on a `rebootRequired`, incomplete cleanup, missing offsets, missing payload, or failed payload-thread state. It must not blindly continue to GoldHEN or PKG installation after a failed engine state.

## GoldHEN and installation sequence

The post-exploit sequence is shared but engine-owned files remain separate:

1. Engine establishes the required kernel state.
2. GoldHEN payload is loaded using the engine-compatible payload handoff already present for that route.
3. GoldHEN configuration ELF is invoked.
4. Ludora web package stage starts and obtains `ludora.pkg` through the existing server/package path.
5. Installation progress is reported in the Ludora page.
6. Success or failure is displayed in the selected locale.

The adapter must distinguish “kernel exploit completed” from “GoldHEN payload started” and “Ludora installation completed”. A generic kernel success event cannot be shown as GoldHEN success.

## UI and i18n

All engine pages use the Ludora visual language and shared local i18n dictionaries for simplified Chinese, traditional Chinese, and English. Dynamic strings must call the shared translation runtime; direct English assignment to visible status nodes is prohibited.

Required user-visible states include:

- preparing engine;
- installing offline cache with actual progress percentage;
- cache success/failure;
- exploit running;
- exploit failed and restart required;
- kernel state incomplete and reboot required;
- GoldHEN loading/configuration;
- GoldHEN loaded;
- Ludora package receiving/transferring/verifying/installing;
- unsupported firmware/device.

Technical logs may retain diagnostic English for debugging, but the visible status and alert wrapper must be localized.

## Cache and deployment

- Legacy g2all manifests remain separate from zrm's manifest.
- Every manifest has an explicit revision namespace and all referenced assets are local and verifiable.
- Cache progress uses actual AppCache `progress.loaded / progress.total` when available and a manifest-derived total as fallback.
- A cache failure must not redirect into an engine entry.
- The packaging script copies the selected host tree into the website artifact and records the exact host commit.
- Production deployment runs host audit, host tests, package verification, website tests, typecheck, build, and health checks.

## Error and recovery behavior

- On exploit failure, display a localized message that explicitly says to close the browser and fully restart the console before retrying.
- On raw-game `rebootRequired`, do not retry in the same browser process.
- On missing/invalid firmware offsets, display unsupported firmware and do not invoke a payload.
- On GoldHEN or package-stage failure, do not report overall success.
- Preserve diagnostic logs for the current page session; do not persist stale “GoldHEN loaded” success solely from a localStorage exploit marker.

The last point is a UI/status correctness requirement; implementing it must not alter exploit primitives or rerun behavior until separately approved against the upstream engine contract.

## Verification requirements

Automated checks must cover:

1. Firmware routing boundaries and unsupported values.
2. Legacy route preservation for 7.00–11.02.
3. zrm Lapse/Poops route selection and required assets.
4. No cross-manifest asset leakage.
5. Localized dynamic status/error messages in all three locales.
6. Cache progress with nonzero intermediate values and completion handling.
7. Engine failure states blocking post-exploit installation.
8. Package build and production route health.

Hardware validation remains required for final confidence because PS4 WebKit/AppCache and kernel exploit behavior cannot be reproduced faithfully in a desktop browser.

## Non-goals

- Modifying or rebuilding any PKG source or released PKG.
- Rewriting exploit primitives or firmware offsets.
- Increasing retry counts beyond upstream behavior.
- Hosting a second public raw-game domain.
- Removing the Ludora authorization gate.
