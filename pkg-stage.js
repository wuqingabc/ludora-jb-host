(function (global) {
  "use strict";

  var PKG_URL = "/jb/host/pkg/ludora.pkg";
  var ELF_URL = "/jb/host/payload/ludora-web-pkg-stage.elf";
  var started = false;

  function text(key, fallback, values) {
    if (global.LudoraI18n && global.LudoraI18n.t) return global.LudoraI18n.t(key, values || {});
    return fallback;
  }

  function show(key, fallback, values, progress) {
    if (global.msgs) global.msgs.innerHTML = text(key, fallback, values);
    var bar = document.getElementById("cache-progress");
    if (bar && typeof progress === "number") {
      bar.style.width = progress + "%";
      if (bar.parentNode) bar.parentNode.classList.remove("indeterminate");
    }
  }

  function fail() {
    show("pkgStage.failed", "Ludora installation failed. Please restart and try again.");
  }

  function uploadPackage(buffer, hash) {
    var req = new XMLHttpRequest();
    req.open("POST", PKG_URL, true);
    req.setRequestHeader("Content-Type", "application/octet-stream");
    req.setRequestHeader("X-Ludora-PKG-SHA256", hash);
    req.upload.onprogress = function (event) {
      if (event.lengthComputable) show("pkgStage.transferring", "Transferring Ludora package: {progress}%", { progress: Math.round(event.loaded / event.total * 100) }, Math.round(event.loaded / event.total * 100));
    };
    req.onload = function () {
      if (req.status >= 200 && req.status < 300) show("pkgStage.starting", "Starting Ludora...");
      else fail();
    };
    req.onerror = fail;
    req.send(buffer);
  }

  function downloadPackage() {
    var req = new XMLHttpRequest();
    req.open("GET", PKG_URL, true);
    req.responseType = "arraybuffer";
    req.onprogress = function (event) {
      if (event.lengthComputable) show("pkgStage.downloading", "Preparing Ludora package: {progress}%", { progress: Math.round(event.loaded / event.total * 100) }, Math.round(event.loaded / event.total * 100));
    };
    req.onload = function () {
      var hash = req.getResponseHeader("X-Ludora-PKG-SHA256");
      if (req.status !== 200 || !req.response || !hash) return fail();
      show("pkgStage.verifying", "Package ready. Verifying...");
      uploadPackage(req.response, hash);
    };
    req.onerror = fail;
    req.send();
  }

  function sendReceiver() {
    var req = new XMLHttpRequest();
    req.open("POST", "/jb/host/payload/ludora-web-pkg-stage.elf", true);
    req.onload = function () {
      if (req.status < 200 || req.status >= 300) return fail();
      show("pkgStage.receiver", "Preparing Ludora package receiver...");
      setTimeout(downloadPackage, 1200);
    };
    req.onerror = fail;
    req.send("");
  }

  global.LudoraPkgStage = {
    start: function () {
      if (started) return;
      started = true;
      show("pkgStage.starting", "Starting Ludora package handoff...");
      setTimeout(sendReceiver, 2500);
    }
  };
}(window));
