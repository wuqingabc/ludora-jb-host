import { resolvePreviewPlatform, nextView } from './jb-router.mjs';

const POLL_INTERVAL_MS = 2500;
const sessionEndpoint = '/api/jb/sessions';

const state = {
  platform: resolvePreviewPlatform(navigator.userAgent, window.location.search),
  session: null,
  timer: null,
};

const $ = (selector) => document.querySelector(selector);

function show(view) {
  document.querySelectorAll('[data-view]').forEach((element) => {
    element.hidden = element.dataset.view !== view;
  });
}

function setMessage(message) {
  const element = $('[data-message]');
  if (element) element.textContent = message;
}

function showUnsupported() {
  show('unsupported');
  setMessage('请使用 PS4 或 PS5 浏览器打开此页面。');
}

function redirectToEntry() {
  const target = state.platform.platform === 'ps5' ? '/jb/ps5/' : '/jb/ps4/';
  window.location.assign(target);
}

async function createSession() {
  if (state.platform.preview) {
    const sessionId = 'preview-session';
    state.session = {
      id: sessionId,
      authorizationCode: '184206',
      mobileUrl: `${window.location.origin}/jb/authorize.html?session=${sessionId}`,
      qrDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><path d="M20 20h50v50H20zM130 20h50v50h-50zM20 130h50v50H20zM90 90h20v20H90zM130 100h20v20h-20zM100 140h50v20h-50z" fill="black"/></svg>')}`,
    };
    return;
  }
  const response = await fetch(sessionEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ platform: state.platform.platform }),
  });
  if (!response.ok) throw new Error(`session ${response.status}`);
  state.session = await response.json();
  $('[data-code]').textContent = state.session.authorizationCode;
  $('[data-qr]').src = state.session.qrDataUrl;
  $('[data-mobile-url]').textContent = state.session.mobileUrl;
}

async function pollAuthorization() {
  if (!state.session) return;
  const response = await fetch(`${sessionEndpoint}/${encodeURIComponent(state.session.id)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  const result = await response.json();
  if (result.authorized) {
    window.clearInterval(state.timer);
    show(nextView({ authorized: true, platform: state.platform.platform }));
    setMessage('授权成功，正在进入入口…');
    window.setTimeout(redirectToEntry, 600);
  }
}

async function boot() {
  if (!state.platform.supported) return showUnsupported();
  show('waiting');
  try {
    await createSession();
    state.timer = window.setInterval(() => pollAuthorization().catch(() => {}), POLL_INTERVAL_MS);
  } catch {
    show('error');
    setMessage('暂时无法建立授权会话，请刷新页面重试。');
  }
}

boot();
