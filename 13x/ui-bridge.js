(function (window) {
  'use strict';
  function t(key, fallback) {
    return window.LudoraI18n && window.LudoraI18n.t ? window.LudoraI18n.t(key, {}) : fallback;
  }
  // jb.js (unmodified engine) reports state through document.body.className:
  // it sets "done", "fail", or "log" (?log=1 debug mode). jb.js also writes its
  // own English text into #msg before flipping the class; this observer fires
  // right after and overwrites it with the localized copy (see jb.html for the
  // done/fail display rules).
  function applyBodyState() {
    var body = document.body;
    if (!body) return;
    var className = body.className || '';
    if (/\bfail\b/.test(className)) {
      var msg = document.getElementById('msg');
      if (msg) msg.textContent = t('raw13x.failed', msg.textContent);
      return;
    }
    if (/\bdone\b/.test(className)) {
      var doneMsg = document.getElementById('msg');
      if (doneMsg) doneMsg.textContent = t('raw13x.payloadReady', doneMsg.textContent);
      // NOTE: the old LudoraPkgStage hook lived here. The downloader is now
      // injected directly by jb.js (?download=1), so "done" no longer kicks
      // off a dead dynamic-ELF stage.
    }
  }
  function boot() {
    if (!document.body) return;
    new MutationObserver(applyBodyState).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    applyBodyState();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.LudoraRaw13xUI = { refresh: applyBodyState };
}(window));
