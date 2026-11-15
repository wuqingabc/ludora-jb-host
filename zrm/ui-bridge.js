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
    var node = document.getElementById('state');
    if (node) { node.textContent = key ? t(key, value) : value; node.className = className || ''; }
    var status = document.getElementById('msgs');
    if (status && key) status.textContent = t(key, value);
    // NOTE: the old LudoraPkgStage hook lived here. The downloader is now
    // injected directly by chain_poops.js (after the GoldHEN payload thread is up),
    // so "ALL DONE" no longer kicks off a dead dynamic-ELF stage.
  }
  function dlProgress(pct, metaText) {
    var bar = document.getElementById('dl-progress');
    var wrap = document.getElementById('dl-progress-wrap');
    var meta = document.getElementById('dl-meta');
    if (bar) bar.style.width = Math.max(0, Math.min(100, Math.round(Number(pct) || 0))) + "%";
    if (wrap) wrap.hidden = false;
    if (meta) {
      if (metaText != null) meta.textContent = String(metaText);
      meta.hidden = false;
    }
  }
  function dlProgressHide() {
    var wrap = document.getElementById('dl-progress-wrap');
    var meta = document.getElementById('dl-meta');
    if (wrap) wrap.hidden = true;
    if (meta) { meta.textContent = ""; meta.hidden = true; }
  }
  window.LudoraZrmUI = { state: state, dlProgress: dlProgress, dlProgressHide: dlProgressHide };
}(window));
