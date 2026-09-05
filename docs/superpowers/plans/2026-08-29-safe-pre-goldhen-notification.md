# Safe Pre-GoldHEN Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the invalid pre-GoldHEN ELF probe with a firmware-compatible ROP notification call while preserving the original GoldHEN `runPayload()` chain.

**Architecture:** `runPayload()` remains a raw shellcode loader and rejects ELF input before allocation. The isolated probe first writes a small sentinel through the existing ROP syscall path, then resolves `sceKernelSendNotificationRequest` through syscall 591 and reports the write result; GoldHEN loading remains unchanged.

**Tech Stack:** PSFree JavaScript modules, existing firmware-specific ROP `Chain`, Node test runner, shell-based host audit.

**Spec:** Conversation requirement: investigate and implement a safe custom pre-GoldHEN notification, without changing the native jailbreak/GoldHEN path.

## Global Constraints

- Do not modify PKG or optical-disc source code.
- Do not add `rev` parameters, USB dependencies, or a new ELF loader.
- Do not run the probe unless the existing ROP chain is already initialized.
- Preserve the existing GoldHEN raw `.bin` invocation and callback ordering.
- Keep the probe isolated from `runPayload()`; invoke it before the default chain only after static validation passes.

### Task 1: Make the raw payload contract explicit

**Files:**
- Modify: `g2all/900/lapse.js`
- Modify: `g2all/700/lapse.js`
- Test: `jb/test/host-audit.test.mjs`

- [x] Add an ELF magic check before any payload mapping; report a clear log and return without executing it.
- [x] Keep raw `.bin` behavior byte-for-byte equivalent after the guard.
- [x] Update the audit to assert that ELF is rejected and GoldHEN remains the only default raw payload.

### Task 2: Implement the isolated notification probe

**Files:**
- Modify: `g2all/900/lapse.js`
- Modify: `g2all/700/lapse.js`
- Modify: `binloader-probe.js`
- Test: `jb/test/host-audit.test.mjs`

- [x] Resolve `sceKernelSendNotificationRequest` using `chain.sysi("dynlib_dlsym", 0x2001, name, out)`.
- [x] Write `/data/.ludora-web-write-probe` with `open`, `write`, and `close` before sending the notification.
- [x] Construct the 45-byte prefix plus 3075-byte message request and retain every backing buffer in `nogc`.
- [x] Invoke the resolved function with `(0, request, 0xc30, 0)` and continue even if the optional probe fails.
- [x] Remove the `.elf` execution call from the probe module and call the new isolated runtime function.

### Task 3: Verify without deployment

**Files:**
- Modify: `jb/test/host-audit.test.mjs`

- [x] Run the host audit and source-layout checks.
- [x] Run syntax checks for both lapse files and the probe script.
- [x] Confirm the default GoldHEN chain still uses only the original raw `.bin`; the optional notification probe is the only pre-GoldHEN addition.
