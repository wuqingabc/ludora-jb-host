// Ludora 自写 payload —— 页面内 ELF sender（§5 决策 1：不走 PC sender）。
//
// 队列顺序约定：本 payload 之前 `relapse.js` 已执行，elfldr 守护进程正监听
// 127.0.0.1:9021。协议采用 elfldr v0.26 的「URL 直载」：connect 后写入一个
// 上游 ELF 直链（换行结束），elfldr 进程自行下载并加载。因此本 payload 只发
// URL 字符串，不把 ELF 字节拉进 WebProcess —— kernel exploit 之后 WebProcess
// 的网络栈已死，但 elfldr 是独立进程，网络仍活（这正是「链接上游、不自托管」
// 的最简实现，见设计 §5 决策 3）。
//
// 与 L2 呈现层（ludora-bridge.js）通过 window 全局通信：
//   window.__ludoraSetReady(bool)    — 通知 bridge 启用插件列表
//   window.__ludoraNextRequest()     — await 用户在列表里的一次点选 { name, url }
//   window.__ludoraReport(name, st)  — 回报某插件的发送结果（"sent" | "error"）
// 这些函数由 bridge 在页面 realm 定义；本 payload 不碰 DOM、不碰 i18n，
// 只消费 bridge 给的数据并发到 elfldr。

const AF_INET = 2;
const SOCK_STREAM = 1;
const SYS_SOCKET = 0x061;   // socket
const SYS_CONNECT = 0x062;  // connect
const SYS_WRITE = 0x004;    // write
const SYS_CLOSE = 0x006;    // close
const ELFLDR_PORT = 9021;
const ELFLDR_HOST = [127, 0, 0, 1];

// 把 ASCII 字符串转成字节数组（URL 纯 ASCII，避免依赖 PS5 WebKit 的 TextEncoder）。
function strBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

// 与 vendored net.js 的 pushBytes 同款：按 4 字节 dword 写入 ARW 缓冲。
function pushBytes(p, buf, data) {
  const n = data.length;
  const dwords = n >> 2;
  for (let i = 0; i < dwords; i++) {
    const o = i * 4;
    p.write4(buf.add32(o),
      (data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24)) >>> 0);
  }
  for (let i = dwords * 4; i < n; i++) p.write1(buf.add32(i), data[i]);
  return n;
}

async function sendUrl(api, url) {
  const scratch = api.p.malloc(0x100, 1);
  const sockaddr = scratch;

  const sRv = await api.chain.syscall(SYS_SOCKET, AF_INET, SOCK_STREAM, 0);
  if (api.isFailure(sRv) || (sRv.low >>> 0) >= 0x80000000)
    throw new Error("socket() failed: " + api.describe(sRv));
  const sock = sRv.low;

  // sockaddr_in（16 字节）：sin_len=16, sin_family=AF_INET, sin_port=9021,
  // sin_addr=127.0.0.1, sin_zero=0 —— 与 vendored payloads/netstat.js 探 9021 的写法一致。
  api.p.write1(sockaddr, 16);
  api.p.write1(sockaddr.add32(1), AF_INET);
  api.p.write1(sockaddr.add32(2), (ELFLDR_PORT >> 8) & 0xff);
  api.p.write1(sockaddr.add32(3), ELFLDR_PORT & 0xff);
  for (let i = 0; i < 4; i++) api.p.write1(sockaddr.add32(4 + i), ELFLDR_HOST[i]);
  for (let i = 8; i < 16; i++) api.p.write1(sockaddr.add32(i), 0);

  const cRv = await api.chain.syscall(SYS_CONNECT, sock, sockaddr, 16);
  if (api.isFailure(cRv) || (cRv.low >>> 0) !== 0)
    throw new Error("connect(9021) failed: " + api.describe(cRv));

  const data = strBytes(url + "\n");
  const buf = api.p.malloc(data.length + 4, 1);
  pushBytes(api.p, buf, data);

  const wRv = await api.chain.syscall(SYS_WRITE, sock, buf, data.length);
  await api.chain.syscall(SYS_CLOSE, sock);
  if (api.isFailure(wRv))
    throw new Error("write() failed: " + api.describe(wRv));

  return wRv.low >>> 0;
}

return async function (api) {
  // 常驻：等用户在插件列表里反复点选，不受 10 分钟默认超时约束。
  api.setPayloadTimeout(0);

  if (typeof window.__ludoraSetReady === "function") window.__ludoraSetReady(true);
  await api.log("加载器已就绪：请在插件列表中点选要加载的插件", "success");

  for (;;) {
    let req = null;
    try {
      req = await window.__ludoraNextRequest();
    } catch (e) {
      await api.log("插件选择界面不可用：" + (e && e.message ? e.message : e), "error");
      return;
    }
    if (!req || !req.url) {
      await api.log("没有更多加载请求，结束", "info");
      return;
    }

    const label = req.name || "插件";
    try {
      const n = await sendUrl(api, req.url);
      await api.log("已发送 " + label + " → elfldr（" + n + " 字节）", "success");
      if (typeof window.__ludoraReport === "function") window.__ludoraReport(req.name, "sent");
    } catch (e) {
      await api.log("发送 " + label + " 失败：" + (e && e.message ? e.message : e), "error");
      if (typeof window.__ludoraReport === "function") window.__ludoraReport(req.name, "error");
    }
  }
};
