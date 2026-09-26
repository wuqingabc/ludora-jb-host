(function (window) {
  'use strict';
  var started = false;
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
      if (!started && window.LudoraPkgStage) {
        started = true;
        var match = /PlayStation\s+4[\/ ](\d+\.\d+)/i.exec(navigator.userAgent || '');
        window.LudoraPkgStage.start({
          engine: 'raw13x',
          firmware: match ? Number(match[1]) : null,
          payloadReady: true
        });
      }
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
