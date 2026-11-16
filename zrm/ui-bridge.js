(function (window) {
  'use strict';
  function t(key, fallback, values) {
    return window.LudoraI18n && window.LudoraI18n.t ? window.LudoraI18n.t(key, values || {}) : fallback;
  }
  // exploit 阶段状态文案精确映射(英文原文 → i18n key),兜底正则仅用于越狱结果/引擎名。
  var STATE_KEYS = {
    'no offsets for this firmware': 'exploit.noOffsets',
    'running the primitive...': 'exploit.runningPrimitive',
    'FAILED -- see log': 'exploit.failedSeeLog',
    'sweeping...': 'exploit.sweeping',
    'setting up...': 'exploit.settingUp',
    'REBOOT FIRST -- this kernel is still poisoned': 'exploit.rebootFirst',
    'leaking a kqueue...': 'exploit.leakingKqueue',
    'kread_slow...': 'exploit.kreadSlow',
    'make_karw...': 'exploit.makeKarw',
    'sandbox escape...': 'exploit.sandboxEscape',
    'remove_uaf_file...': 'exploit.removeUafFile',
    'kernel patches...': 'exploit.kernelPatches',
    'payload...': 'exploit.payload',
    'post-probe...': 'exploit.postProbe',
    'a base looks wrong': 'exploit.baseLooksWrong',
    'gadget bytes did not match': 'exploit.gadgetBytesMismatch',
    'no pop r8': 'exploit.noPopR8',
    'scanning libkernel for syscall stubs...': 'exploit.scanningSyscallStubs',
    'missing syscall stubs': 'exploit.missingSyscallStubs',
    'backing stores failed': 'exploit.backingStoresFailed',
    'm_function moved under us': 'exploit.mFunctionMoved',
    'pivot failed': 'exploit.pivotFailed',
    'wiring the worker...': 'exploit.wiringWorker',
    'transfer did not preserve the store': 'exploit.transferNotPreserved',
    'walk failed -- run step 4b for the dump': 'exploit.walkFailedDump',
    'walk failed': 'exploit.walkFailed',
    'setting up the aio batches...': 'exploit.settingUpAio',
    'dry run: everything but the racing delete...': 'exploit.dryRun',
    'could not set up the server': 'exploit.couldNotSetUpServer',
    'could not pin -- refusing to arm': 'exploit.couldNotPin',
    'no worker tid': 'exploit.noWorkerTid',
    'cannot stand up the reclaim -- refusing to arm': 'exploit.cannotStandReclaim',
    'racing...': 'exploit.racing',
    'leaking kernel addresses...': 'exploit.leakingKernelAddresses',
    'stage 3: crafting the aio queue entry...': 'exploit.stage3Aio',
    'stage 4: kernel read...': 'exploit.stage4KernelRead',
    'stage 5: kernel write...': 'exploit.stage5KernelWrite',
    'stage 6: locating the kernel base...': 'exploit.stage6KernelBase',
    'building KernelView...': 'exploit.buildingKernelView',
    'stage 7: repairing the aliases...': 'exploit.stage7RepairAliases',
    'stage 8: jailbreak...': 'exploit.stage8Jailbreak',
    'stage 9: kernel patches...': 'exploit.stage9KernelPatches',
    'stage 10: loading the payload...': 'exploit.stage10LoadPayload',
    'FREED BUT NOT RECLAIMED -- REBOOT NOW': 'exploit.freedNotReclaimed',
    'see log': 'exploit.seeLog'
  };
  var STATE_PARAM = [
    [/^bringing up (\d+) workers\.\.\.$/, 'exploit.bringingUpWorkers', 'n'],
    [/^missing (.+)$/, 'exploit.missingNm', 'name'],
    [/^no win in (\d+) attempts$/, 'exploit.noWin', 'n']
  ];
  function state(text, className) {
    var value = String(text || '');
    var key = STATE_KEYS[value] || null;
    var values = null;
    if (!key) {
      for (var pi = 0; pi < STATE_PARAM.length; pi++) {
        var pm = STATE_PARAM[pi][0].exec(value);
        if (pm) { key = STATE_PARAM[pi][1]; values = {}; values[STATE_PARAM[pi][2]] = pm[1]; break; }
      }
    }
    if (!key) {
      key = /^ALL DONE$/i.test(value)
        ? 'zrm.payloadReady'
        : /REBOOT|poisoned/i.test(value) ? 'zrm.rebootRequired'
        : /FAILED|no commit/i.test(value) ? 'zrm.failed'
        : /payload/i.test(value) ? 'payload.loading'
        : /lapse/i.test(value) ? 'zrm.lapse'
        : /poops/i.test(value) ? 'zrm.poops' : null;
    }
    window.LudoraUI.state(key ? t(key, value, values) : value, className || '');
    // NOTE: the old LudoraPkgStage hook lived here. The downloader is now
    // injected directly by chain_poops.js (after the GoldHEN payload thread is up),
    // so "ALL DONE" no longer kicks off a dead dynamic-ELF stage.
  }
  function dlProgress(pct, metaText) {
    var value = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    window.LudoraUI.progress(value, metaText != null ? String(metaText) : null, value >= 100 ? 'done' : 'downloading');
  }
  function dlProgressHide() {
    window.LudoraUI.progress(0, '', 'stopped');
  }
  window.LudoraZrmUI = { state: state, dlProgress: dlProgress, dlProgressHide: dlProgressHide };
}(window));
