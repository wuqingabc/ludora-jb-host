/* Ludora presentation bridge for the vendored, unmodified PS5 Relapse
 * exploit chain (`src/*.js`, `src/utils/*.js`, `offsets/*.js`). This file
 * does not call into, import, or alter any upstream file. It only observes
 * the DOM node the upstream `src/site.js` already writes its own log lines
 * into (`#console`, id fixed by upstream — see `relapse.css` header note)
 * and mirrors that text into the Ludora brand headline (`#state`) and
 * detail line (`#det`). The raw, untranslated log is always left visible
 * in `#console` underneath — this bridge only ever adds a summary on top,
 * it never hides or replaces upstream output.
 *
 * Success/failure classification is intentionally based on the exact
 * literal strings the vendored `src/site.js` / `src/main.js` emit today
 * (copied by reading those files, not guessed):
 *   - `writeLog(msg, "error")`  -> line starts with "[-] "
 *   - `firmware.rejection()` returns one of three fixed strings, thrown by
 *     `run()` in `src/site.js` and surfaced as a "[-] " line -> distinct
 *     "unsupported" state, not a failure, per Ludora's decision doc
 *     rule that the page must not claim jailbreak success OR failure
 *     before the payload itself reports one.
 *   - `src/main.js`'s `main()` logs the literal strings
 *     "elfldr is listening on port 9021" and
 *     "kernel chain complete: root and sandbox escape are active" only
 *     after `runKernelExploit()` resolves with `result.done` — that is
 *     the only point this bridge treats as success.
 * If upstream ever changes those exact strings, this bridge falls back to
 * the neutral "running" state and the raw log remains the source of truth
 * (fail-closed on the summary, not fail-hidden on the log).
 */
(function () {
  "use strict";

  var consoleEl = document.getElementById("console");
  var stateEl = document.getElementById("state");
  var detEl = document.getElementById("det");
  if (!consoleEl || !stateEl) return;

  function tr(key, fallback) {
    return window.LudoraI18n && window.LudoraI18n.t ? window.LudoraI18n.t(key) : fallback;
  }

  function setState(text, cls) {
    stateEl.textContent = text;
    stateEl.className = cls || "";
  }

  var seenSuccess = false;
  var seenFailure = false;

  var UNSUPPORTED_MESSAGES = [
    "PlayStation 5 Required",
    "FW version not found",
  ];
  var UNSUPPORTED_SUFFIX = " is not supported";
  var SUCCESS_SUBSTRINGS = [
    "elfldr is listening on port 9021",
    "root and sandbox escape are active",
  ];

  function isUnsupportedMessage(message) {
    if (UNSUPPORTED_MESSAGES.indexOf(message) !== -1) return true;
    return message.length > UNSUPPORTED_SUFFIX.length &&
      message.slice(-UNSUPPORTED_SUFFIX.length) === UNSUPPORTED_SUFFIX;
  }

  function handleLine(rawLine) {
    var message = rawLine.replace(/^\[.\]\s*/, "");
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
})();
