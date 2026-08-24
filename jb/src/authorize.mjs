const form = document.querySelector('[data-form]');
const codeInput = document.querySelector('[data-code]');
const message = document.querySelector('[data-message]');
const sessionId = new URLSearchParams(window.location.search).get('session');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!sessionId || !form.reportValidity()) return;
  message.textContent = '正在确认…';
  try {
    const response = await fetch(`/api/jb/sessions/${encodeURIComponent(sessionId)}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authorizationCode: codeInput.value }),
    });
    if (!response.ok) throw new Error('authorization failed');
    message.textContent = '授权成功，可以返回主机等待页面。';
    form.querySelector('button').disabled = true;
  } catch {
    message.textContent = '授权码错误或已过期，请重新扫码。';
  }
});
