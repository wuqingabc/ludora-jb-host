(function (global) {
  "use strict";
  var ELF_URL = "/jb/host/payload/ludora-web-autorun-receiver.elf";
  var FILE_URL = "/jb/host/autorun/ludora_autorun.elf";
  var started = false;

  function text(key, fallback, values) {
    return global.LudoraI18n && global.LudoraI18n.t ? global.LudoraI18n.t(key, values || {}) : fallback;
  }
  function show(key, fallback, values) {
    if (global.msgs) global.msgs.innerHTML = text(key, fallback, values);
    var status = document.getElementById("pkg-stage-status");
    if (status) status.innerHTML = text(key, fallback, values);
  }
  function fail() { show("autorunStage.failed", "AutoRun payload setup failed."); }
  function sendFile() {
    var req = new XMLHttpRequest();
    req.open("POST", FILE_URL, true);
    req.onload = function () { if (req.status >= 200 && req.status < 300) show("autorunStage.complete", "AutoRun payload is ready."); else fail(); };
    req.onerror = fail;
    req.send("");
  }
  function sendReceiver() {
    var req = new XMLHttpRequest();
    req.open("POST", ELF_URL, true);
    req.onload = function () { if (req.status < 200 || req.status >= 300) return fail(); show("autorunStage.receiver", "Preparing AutoRun payload receiver..."); setTimeout(sendFile, 800); };
    req.onerror = fail;
    req.send("");
  }
  global.LudoraAutorunStage = { start: function () { if (started) return; started = true; show("autorunStage.starting", "Preparing Ludora AutoRun..."); setTimeout(sendReceiver, 1200); } };
}(window));
