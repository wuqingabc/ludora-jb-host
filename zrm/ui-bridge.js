(function (window) {
  'use strict';
  var started = false;
  function t(key, fallback, values) {
    return window.LudoraI18n && window.LudoraI18n.t ? window.LudoraI18n.t(key, values || {}) : fallback;
  }
  function state(text, className) {
    var value = String(text || '');
    var key = /ALL DONE|payload/i.test(value) && !/FAILED|NO REBOOT|REBOOT/i.test(value)
      ? 'zrm.payloadReady'
      : /REBOOT|poisoned|kernel.*needed/i.test(value) ? 'zrm.rebootRequired'
      : /FAILED|no commit|no offsets/i.test(value) ? 'zrm.failed'
      : /lapse/i.test(value) ? 'zrm.lapse'
      : /poops/i.test(value) ? 'zrm.poops' : null;
    var node = document.getElementById('state');
    if (node) { node.textContent = key ? t(key, value) : value; node.className = className || ''; }
    var status = document.getElementById('msgs');
    if (status && key) status.textContent = t(key, value);
    if (key === 'zrm.payloadReady' && !started && window.LudoraPkgStage) {
      started = true;
      var match = /PlayStation\s+4[\/ ](\d+\.\d+)/i.exec(navigator.userAgent || '');
      window.LudoraPkgStage.start({
        engine: /run_poops/i.test(location.pathname) ? 'zrm-poops' : 'zrm-lapse',
        firmware: match ? Number(match[1]) : null,
        payloadReady: true
      });
    }
  }
  window.LudoraZrmUI = { state: state };
}(window));
