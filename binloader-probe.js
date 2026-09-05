(function (global) {
  "use strict";

  var started = false;

  function enabled() {
    return true;
  }

  function message(key, fallback) {
    return global.LudoraI18n && global.LudoraI18n.t
      ? global.LudoraI18n.t(key)
      : fallback;
  }

  function show(key, fallback) {
    if (global.msgs) global.msgs.innerHTML = message(key, fallback);
  }

  global.LudoraBinloaderProbe = {
    enabled: enabled,
    start: function (done) {
      if (!enabled() || started) {
        if (typeof done === "function") done();
        return;
      }
      started = true;
      if (!global.LudoraRunNotificationProbe) {
        show("binloaderProbe.unavailable", "Custom payload loader is unavailable.");
        if (typeof done === "function") done();
        return;
      }
      show("binloaderProbe.starting", "Running the custom payload probe…");
      global.LudoraRunNotificationProbe(function (ok) {
        if (!ok) {
          show("binloaderProbe.unavailable", "Custom payload notification was not sent.");
          if (typeof done === "function") setTimeout(done, 50);
          return;
        }
        show("binloaderProbe.complete", "Custom payload probe completed.");
        if (typeof done === "function") setTimeout(done, 500);
      });
    }
  };
}(window));
