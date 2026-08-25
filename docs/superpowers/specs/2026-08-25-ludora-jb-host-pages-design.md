# Ludora JB Host Pages Design

## Goal

Redesign every user-facing page under `/jb/host` in the Ludora visual language while preserving the upstream exploit runtime, payloads, manifests, and PS4 WebKit compatibility.

## Scope

- Firmware selection page and its grouped firmware cards.
- Host loading pages, cache installation pages, unsupported-firmware messages, and restore pages.
- Shared local CSS and copy used by those pages.
- Build/verification checks that prove exploit assets and script order are unchanged.

## Non-goals

- No changes to payload binaries, exploit JavaScript, GoldHEN files, pkg files, or authorization API behavior.
- No external fonts, CDN assets, or runtime dependencies.
- No modern browser-only CSS or JavaScript required by the exploit runtime.

## Visual direction

Use Ludora's deep indigo background, warm gold action color, quiet blue-violet surfaces, thin borders, and compact brand header. The host selector should feel like a controlled device console: firmware range, recommended entry, USB requirement, and current step are explicit. The memorable element is a vertical “access rail” that links authorization → firmware match → exploit launch, with the active stage highlighted in gold.

## Compatibility rules

- Keep all existing exploit script tags, IDs, manifest declarations, relative asset paths, and load order intact.
- Use local CSS only, basic selectors, fixed/percentage sizing, and conservative flex/inline-block layouts.
- Do not depend on CSS Grid, external fonts, fetch-based UI state, or animation for functional feedback.
- Preserve native browser focus and large hit areas for controller navigation.
- Keep progress and status text visible even when CSS fails.

## Acceptance criteria

1. `/jb/host` and every existing firmware/restore HTML route renders with Ludora styling.
2. Non-PS4/PS5 visitors receive a direct device requirement message and still see the reserved advertising area.
3. PS4 9.02 is not routed into the 9.00 USB-specific page; the supported multi-firmware entry is labeled accordingly.
4. Cache pages show determinate progress, success, failure, and retry states without changing cache events.
5. Existing exploit files, binary hashes, manifest entries, and script ordering remain unchanged.
6. Desktop Playwright review passes and static compatibility checks pass for all host HTML.
