import { classifyUserAgent, nextView } from './jb-router.mjs';

const POLL_INTERVAL_MS = 2500;
const sessionEndpoint = '/api/jb/sessions';

const state = {
  platform: classifyUserAgent(navigator.userAgent),
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
