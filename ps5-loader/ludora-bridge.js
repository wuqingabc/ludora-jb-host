/* Ludora presentation bridge for the vendored, unmodified PS5 remote-loader
 * (`src/*.js`, `src/utils/*.js`, `offsets/*.js`, `payloads/*.js`).
 *
 * This file does not call into, import, or alter any upstream file. It has two
 * jobs, both in the L2 presentation layer only:
 *
 *   1. Observe the DOM node the vendored `src/site.js` writes its own log lines
 *      into (`#console`, id fixed by upstream) and mirror those lines into the
 *      Ludora brand headline (`#state`) and detail line (`#det`). The raw log is
 *      always left visible underneath.
 *   2. Render the plugin list (fetched from `plugins.json`) and hand the user's
 *      picks to the Ludora `elf-send` payload through window globals — this page
 *      is a standalone queue (`window.STANDALONE`), so the payload runs inline
 *      and awaits `window.__ludoraNextRequest()`.
 *
 * Success/failure classification uses the exact literal strings the vendored
 * remote-loader emits today (read from its source, not guessed):
 *   - `writeLog(msg, "error")` -> line starts with "[-] "
 *   - `src/firmware.js` `rejection()` returns one of "PlayStation 5 Required",
 *     "FW version not found", or "FW {v} is not supported" -> distinct
 *     "unsupported" state, not a failure.
 *   - `payloads/relapse.js` logs "elfldr is listening on port 9021" only after
 *     the kernel exploit resolves and `api.launchKexp()` returned a truthy
 *     result — the only point this bridge treats as success.
 * If upstream ever changes those strings, this bridge falls back to the neutral
 * "running" state and the raw log remains the source of truth.
 */
(function () {
  "use strict";

  var consoleEl = document.getElementById("console");
  var stateEl = document.getElementById("state");
  var detEl = document.getElementById("det");
  var pluginsEl = document.getElementById("plugins");
  var pluginsHintEl = document.getElementById("plugins-hint");

  function tr(key, fallback) {
    return window.LudoraI18n && window.LudoraI18n.t ? window.LudoraI18n.t(key) : fallback;
  }

  function setState(text, cls) {
    if (!stateEl) return;
    stateEl.textContent = text;
    stateEl.className = cls || "";
  }

  // ---- #console observation ------------------------------------------------

  var seenSuccess = false;
  var seenFailure = false;

  var UNSUPPORTED_MESSAGES = [
    "PlayStation 5 Required",
    "FW version not found",
  ];
  var UNSUPPORTED_SUFFIX = " is not supported";
  var SUCCESS_SUBSTRINGS = [
    "elfldr is listening on port 9021",
  ];

  function isUnsupportedMessage(message) {
    if (UNSUPPORTED_MESSAGES.indexOf(message) !== -1) return true;
    return message.length > UNSUPPORTED_SUFFIX.length &&
      message.slice(-UNSUPPORTED_SUFFIX.length) === UNSUPPORTED_SUFFIX;
  }

  function handleLine(rawLine) {
    var message = String(rawLine || "").replace(/^\[.\]\s*/, "");
    var isErrorMarker = /^\[-\]/.test(rawLine);

    if (!seenSuccess && !seenFailure && isUnsupportedMessage(message)) {
      setState(tr("relapse.unsupported", "当前主机或固件版本不受支持"), "warn");
    } else if (isErrorMarker) {
      seenFailure = true;
      setState(tr("relapse.failed", "越狱失败，请重新加载页面重试"), "bad");
    } else {
      for (var i = 0; i < SUCCESS_SUBSTRINGS.length; i++) {
        if (message.indexOf(SUCCESS_SUBSTRINGS[i]) !== -1) {
          seenSuccess = true;
          break;
        }
      }
      if (seenSuccess) {
        setState(tr("relapse.success", "越狱成功，加载器已在监听"), "ok");
      } else if (!seenFailure) {
        setState(tr("relapse.running", "正在执行漏洞利用，请勿离开此页面"), "");
      }
    }

    if (detEl) detEl.textContent = message;
  }

  // ---- plugin list ----------------------------------------------------------

  var plugins = [];
  var sendQueue = [];
  var waiters = [];
  var ready = false;

  // elf-send payload awaits this; resolve with the next { name, url } the user picks.
  window.__ludoraNextRequest = function () {
    return new Promise(function (resolve) {
      if (sendQueue.length) {
        resolve(sendQueue.shift());
        return;
      }
      waiters.push(resolve);
    });
  };

  // elf-send payload calls this once elfldr is up (after relapse completes).
  window.__ludoraSetReady = function (flag) {
    ready = !!flag;
    if (pluginsHintEl) {
      pluginsHintEl.textContent = ready
        ? tr("loader.ready", "加载器已就绪，点选下方插件即可加载")
        : tr("loader.waiting", "等待越狱完成…");
    }
    if (!pluginsEl) return;
    var buttons = pluginsEl.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = !ready;
  };

  // elf-send payload calls this with the result of each send attempt.
  window.__ludoraReport = function (name, status) {
    if (!pluginsEl) return;
    var buttons = pluginsEl.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute("data-name") === name) {
        buttons[i].className = status === "sent" ? "plugin-done" : "plugin-fail";
      }
    }
  };

  function shortSha(hash) {
    return hash ? String(hash).slice(0, 8) : "";
  }

  function enqueue(name, url) {
    var req = { name: name, url: url };
    if (waiters.length) {
      waiters.shift()(req);
    } else {
      sendQueue.push(req);
    }
  }

  function renderPlugins(list) {
    if (!pluginsEl) return;
    pluginsEl.textContent = "";
    if (!list || !list.length) {
      pluginsEl.appendChild((function () {
        var p = document.createElement("div");
        p.className = "plugin-empty";
        p.textContent = tr("loader.empty", "没有可用的插件");
        return p;
      })());
      return;
    }

    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.disabled = true;
      btn.setAttribute("data-name", item.name || "");
      btn.className = "plugin";

      var name = document.createElement("strong");
      name.textContent = item.name || "插件";

      var meta = document.createElement("span");
      meta.className = "plugin-meta";
      meta.textContent = [item.license, shortSha(item.sha256)].filter(Boolean).join(" · ");

      var desc = document.createElement("small");
      desc.className = "plugin-desc";
      desc.textContent = item.desc || "";

      btn.appendChild(name);
      if (meta.textContent) btn.appendChild(meta);
      if (desc.textContent) btn.appendChild(desc);

      (function (n, u) {
        btn.addEventListener("click", function () {
          if (!ready) return;
          btn.className = "plugin-sending";
          enqueue(n, u);
        });
      })(item.name, item.url);

      pluginsEl.appendChild(btn);
    }
  }

  function loadPlugins() {
    fetch("./plugins.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        plugins = Array.isArray(data) ? data : (data.plugins || []);
        renderPlugins(plugins);
      })
      .catch(function (e) {
        if (pluginsEl) {
          pluginsEl.textContent = "";
          var p = document.createElement("div");
          p.className = "plugin-empty";
          p.textContent = tr("loader.loadFailed", "插件清单加载失败") + "：" + e.message;
          pluginsEl.appendChild(p);
        }
      });
  }

  // ---- boot ----------------------------------------------------------------

  if (stateEl && consoleEl) {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var text = added[j].textContent;
          if (text) handleLine(text);
        }
      }
    });
    observer.observe(consoleEl, { childList: true });
  }

  if (pluginsHintEl) {
    pluginsHintEl.textContent = tr("loader.waiting", "等待越狱完成…");
  }
  loadPlugins();
})();
