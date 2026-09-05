(function (global) {
  "use strict";
  var started = false;
  function text(key, fallback) {
    return global.LudoraI18n && global.LudoraI18n.t ? global.LudoraI18n.t(key) : fallback;
  }
  function show(key, fallback) {
    var message = text(key, fallback);
    if (global.msgs) global.msgs.innerHTML = message;
    var status = document.getElementById("pkg-stage-status");
    if (status) status.innerHTML = message;
  }
  global.LudoraConfigStage = {
    start: function (done) {
      if (started) return;
      started = true;
      if (!global.LudoraRunPayload) {
        show("configStage.unavailable", "GoldHEN configuration module is unavailable.");
        return;
      }
      show("configStage.starting", "Saving GoldHEN configuration...");
      global.LudoraRunPayload("../goldhen-config-stage.elf", function () {
        show("configStage.complete", "GoldHEN configuration saved.");
        if (typeof done === "function") setTimeout(done, 800);
      });
    }
  };
}(window));
