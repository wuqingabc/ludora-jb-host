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
    var requested = queryLocale() || cookieLocale() || storageLocale() || navigator.language || '';
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
      'Only for PS4 with Firmware 7.00 to 11.02': 'legacy.deviceOnly'
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
    nativeAlert.call(window, text);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(document); });
  else apply(document);
}(window, document));
