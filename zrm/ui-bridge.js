(function (window) {
  'use strict';
  function t(key, fallback, values) {
    return window.LudoraI18n && window.LudoraI18n.t ? window.LudoraI18n.t(key, values || {}) : fallback;
  }
  function state(text, className) {
    var value = String(text || '');
    var key = /^ALL DONE$/i.test(value)
      ? 'zrm.payloadReady'
      : /REBOOT|poisoned|kernel.*needed/i.test(value) ? 'zrm.rebootRequired'
      : /FAILED|no commit|no offsets/i.test(value) ? 'zrm.failed'
      : /payload/i.test(value) ? 'payload.loading'
      : /lapse/i.test(value) ? 'zrm.lapse'
      : /poops/i.test(value) ? 'zrm.poops' : null;
    window.LudoraUI.state(key ? t(key, value) : value, className || '');
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
