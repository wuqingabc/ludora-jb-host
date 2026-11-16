(function (window, document) {
  'use strict';

  var DEFAULT_LOCALE = 'zh-CN';
  var SUPPORTED = { 'zh-CN': true, 'zh-TW': true, 'en-US': true };
  var dictionaries = window.LudoraI18nDictionaries || {};
  var locale = DEFAULT_LOCALE;

  function normalize(value) {
    var raw = String(value || '').replace('_', '-').toLowerCase();
    if (raw === 'zh-tw' || raw === 'zh-hk' || raw.indexOf('zh-hant') === 0) return 'zh-TW';
    if (raw === 'en' || raw.indexOf('en-') === 0) return 'en-US';
    if (raw === 'zh' || raw === 'zh-cn' || raw.indexOf('zh-hans') === 0) return 'zh-CN';
    return DEFAULT_LOCALE;
  }

  function queryLocale() {
    var match = /(?:^|[?&])lang=([^&#]+)/i.exec(window.location.search || '');
    return match ? decodeURIComponent(match[1]) : '';
  }

  function cookieLocale() {
    var match = /(?:^|; )ludora_locale=([^;]+)/.exec(document.cookie || '');
    return match ? decodeURIComponent(match[1]) : '';
  }

  function storageLocale() {
    try { return window.localStorage.getItem('ludora_locale') || ''; } catch (error) { return ''; }
  }

  function chooseLocale() {
    var explicit = queryLocale() || cookieLocale() || storageLocale() || '';
    // PS4/PS5 WebKit does not reliably expose the console system language.
    // Keep console visits Chinese by default, while preserving explicit locale
    // selection for previews and future language controls.
    var playStation = /PlayStation\s*[45]/i.test((navigator && navigator.userAgent) || '');
    var requested = explicit || (playStation ? DEFAULT_LOCALE : ((navigator && navigator.language) || ''));
    locale = normalize(requested);
    if (!SUPPORTED[locale]) locale = DEFAULT_LOCALE;
  }

  function dictionary() {
    return dictionaries[locale] || dictionaries[DEFAULT_LOCALE] || {};
  }

  function translate(key, params) {
    var value = dictionary()[key] || (dictionaries[DEFAULT_LOCALE] || {})[key] || key;
    var name;
    params = params || {};
    for (name in params) {
      if (Object.prototype.hasOwnProperty.call(params, name)) {
        value = value.replace(new RegExp('\\{' + name + '\\}', 'g'), String(params[name]));
      }
    }
    return value;
  }

  function apply(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-i18n]') : [];
    var i;
    for (i = 0; i < nodes.length; i += 1) nodes[i].innerHTML = translate(nodes[i].getAttribute('data-i18n'));
    nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-i18n-alt]') : [];
    for (i = 0; i < nodes.length; i += 1) nodes[i].alt = translate(nodes[i].getAttribute('data-i18n-alt'));
    nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-i18n-title]') : [];
    for (i = 0; i < nodes.length; i += 1) nodes[i].title = translate(nodes[i].getAttribute('data-i18n-title'));
    nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-i18n-aria-label]') : [];
    for (i = 0; i < nodes.length; i += 1) nodes[i].setAttribute('aria-label', translate(nodes[i].getAttribute('data-i18n-aria-label')));
    applyLegacyText(scope);
    document.documentElement.lang = locale;
  }

  function applyLegacyText(scope) {
    var map = {
      'Loading... Please Wait': 'legacy.loading',
      'Main Payloads': 'legacy.mainPayloads',
      'Payloads': 'legacy.payloads',
      'Online Payloads': 'legacy.onlinePayloads',
      'Linux Payloads': 'legacy.linuxPayloads',
      'Select Your Firmware': 'legacy.selectFirmware',
      '选择主机固件': 'legacy.selectFirmware',
      'Return': 'legacy.return',
      '返回': 'legacy.return',
      'Restore Host': 'legacy.restore',
      'Restore host entry': 'legacy.restore',
      '鲁哆啦 Ludora · 主机入口': 'legacy.rootTitle',
      '鲁哆啦 Ludora · 主機入口': 'legacy.rootTitle',
      'For Donations (Only in Cryptocurrencies)': 'legacy.donation',
      'Only for PS4 with Firmware 7.00 to 11.02': 'legacy.deviceOnly',
      'Content not Found! - Clear Browser Data and Re-Install Cache ...': 'legacy.contentNotFound'
    };
    var all = scope.getElementsByTagName ? scope.getElementsByTagName('*') : [];
    var i;
    for (i = 0; i < all.length; i += 1) {
      var element = all[i];
      if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.childNodes.length !== 1) continue;
      var textNode = element.firstChild;
      if (!textNode || textNode.nodeType !== 3) continue;
      var text = textNode.nodeValue.replace(/^\s+|\s+$/g, '');
      if (map[text]) textNode.nodeValue = textNode.nodeValue.replace(text, translate(map[text]));
    }
    if (document.title) document.title = document.title.replace(/\s+by\s+Ludora/gi, ' · Ludora');
  }

  // ===== 全站统一进度 UI(内核来自 ludora-ps5-autoloader)=====
  // 三类进展来源(离线缓存 / 下载 / 日志)统一走 LudoraUI.progress,落到唯一的
  // #progressContainer > #progressBar(宽度)+ #progressLabel(框内文字,「进展框放入进展」)。
  // state 取值:running(默认)/ error / done / stopped / installing,由 style.css 换色。
  function ensureProgressContainer() {
    var container = document.getElementById('progressContainer');
    if (container) return container;
    var anchor = document.getElementById('wrap') || document.getElementById('msgs') || document.getElementById('progress') || document.body.firstElementChild;
    if (!anchor || !anchor.parentNode) return null;
    container = document.createElement('div');
    container.id = 'progressContainer';
    container.setAttribute('role', 'progressbar');
    container.setAttribute('aria-valuemin', '0');
    container.setAttribute('aria-valuemax', '100');
    container.setAttribute('aria-valuenow', '0');
    var bar = document.createElement('div');
    bar.id = 'progressBar';
    var label = document.createElement('div');
    label.id = 'progressLabel';
    container.appendChild(bar);
    container.appendChild(label);
    anchor.parentNode.insertBefore(container, anchor.nextSibling);
    return container;
  }
  window.LudoraUI = {
    progress: function (pct, message, state) {
      var container = ensureProgressContainer();
      if (!container) return null;
      var value = Math.max(0, Math.min(100, Number(pct) || 0));
      var bar = document.getElementById('progressBar');
      var label = document.getElementById('progressLabel');
      if (bar) bar.style.width = value + '%';
      if (label) label.textContent = message == null ? (Math.round(value) + '%') : String(message);
      container.setAttribute('aria-valuenow', String(Math.round(value)));
      container.setAttribute('aria-valuetext', message == null ? '' : String(message));
      if (state) container.setAttribute('data-state', state);
      return container;
    },
    state: function (text, cls) {
      var node = document.getElementById('state');
      if (!node) return null;
      if (text != null) node.textContent = String(text);
      node.className = cls ? String(cls) : '';
      return node;
    },
    det: function (text) {
      var node = document.getElementById('det');
      if (!node) return null;
      if (text != null) node.textContent = String(text);
      return node;
    },
    // 日志框消息传递:版本 JS 只调 log(text, cls) 追加一行,壳层统一落到
    // #console / #out(style.css 的日志框样式),不再各自手写日志 DOM。
    log: function (text, cls) {
      var out = document.getElementById('console') || document.getElementById('out');
      if (!out) {
        var anchor = document.getElementById('wrap');
        if (!anchor) return null;
        out = document.createElement('div');
        out.id = 'console';
        anchor.appendChild(out);
      }
      var line = document.createElement('div');
      if (cls) line.className = String(cls);
      line.textContent = String(text == null ? '' : text);
      out.appendChild(line);
      return line;
    },
    clear: function () {
      var out = document.getElementById('console') || document.getElementById('out');
      if (out) while (out.firstChild) out.removeChild(out.firstChild);
      return out;
    }
  };

  function installCacheProgress() {
    if (!window.applicationCache || !document.documentElement.hasAttribute('manifest')) return;
    var progress = 0;
    var hasTotal = false;
    var manifestTotal = Number(document.documentElement.getAttribute('data-cache-total')) || 0;
    var loadedEntries = 0;
    function manifestEntryCount(text) {
      // AppCache uses CACHE as the default section after the manifest header.
      var section = 'CACHE';
      var count = 0;
      String(text || '').split(/\r?\n/).forEach(function (line) {
        line = line.replace(/^\s+|\s+$/g, '');
        if (!line || line.charAt(0) === '#') return;
        if (/^(CACHE|NETWORK|FALLBACK):/.test(line)) { section = line.split(':', 1)[0]; return; }
        if (section === 'CACHE' && line !== '*') count += 1;
      });
      return count;
    }
    function readManifestTotal() {
      if (manifestTotal > 0) return;
      var manifest = document.documentElement.getAttribute('manifest');
      if (!manifest || !window.XMLHttpRequest) return;
      try {
        var request = new XMLHttpRequest();
        request.open('GET', manifest, true);
        request.onreadystatechange = function () {
          if (request.readyState === 4 && (request.status === 200 || request.status === 0)) {
            manifestTotal = manifestEntryCount(request.responseText);
            if (manifestTotal > 0 && !hasTotal) update((loadedEntries / manifestTotal) * 100, true);
          }
        };
        request.send(null);
      } catch (error) {}
    }
    function update(value, totalKnown) {
      hasTotal = totalKnown;
      progress = Math.max(0, Math.min(100, Number(value) || 0));
      var message = hasTotal
        ? translate('cache.installing', { progress: Math.round(progress) })
        : translate('cache.installingUnknown');
      window.LudoraUI.progress(hasTotal ? progress : 0, message, 'installing');
    }
    function complete() {
      hasTotal = true;
      window.LudoraUI.progress(100, translate('cache.complete'), 'done');
    }
    window.applicationCache.addEventListener('checking', function () { update(0, manifestTotal > 0); }, false);
    window.applicationCache.addEventListener('downloading', function () { update(0, manifestTotal > 0); }, false);
    window.applicationCache.addEventListener('progress', function (event) {
      loadedEntries = Math.max(loadedEntries, Number(event && event.loaded) || 0);
      var total = Number(event && event.total) || manifestTotal;
      update(total > 0 ? (loadedEntries / total) * 100 : 0, total > 0);
    }, false);
    window.applicationCache.addEventListener('cached', complete, false);
    window.applicationCache.addEventListener('updateready', complete, false);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { update(progress, hasTotal); });
    else update(progress, hasTotal);
    readManifestTotal();
  }

  chooseLocale();
  window.LudoraI18n = {
    t: translate,
    apply: apply,
    locale: function () { return locale; },
    setLocale: function (next) {
      locale = normalize(next);
      try { window.localStorage.setItem('ludora_locale', locale); } catch (error) {}
      document.cookie = 'ludora_locale=' + encodeURIComponent(locale) + '; path=/; max-age=31536000';
      apply(document);
    }
  };
  var nativeAlert = window.alert;
  window.alert = function (message) {
    var text = String(message || '');
    if (/Insert the USB now/i.test(text)) text = translate('usb.insert');
    else if (/Jailbreak Done/i.test(text)) text = translate('usb.jailbreakDone');
    else if (/webkit exploit failed/i.test(text)) text = translate('payload.failed');
    else if (/Exploit timing failed/i.test(text)) text = translate('payload.timingFailed');
    else if (/Unsupported Firmware/i.test(text)) text = translate('payload.unsupported');
    else if (/Jailbreak failed/i.test(text)) text = translate('payload.jailbreakFailed');
    else if (/Must be 16 characters/i.test(text)) text = translate('payload.psnIdFormat');
    else if (/Waiting for Payload\.\.\. Send it/i.test(text)) text = translate('payload.waitingForPayload');
    else if (/PSN ID set successfully/i.test(text)) text = translate('payload.psnIdSet');
    else {
      var allSetMatch = /Total Time (\d+) minutes? and (\d+) seconds?/i.exec(text);
      if (allSetMatch) text = translate('payload.allSet', { minutes: allSetMatch[1], seconds: allSetMatch[2] });
    }
    nativeAlert.call(window, text);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(document); });
  else apply(document);
  installCacheProgress();
}(window, document));
