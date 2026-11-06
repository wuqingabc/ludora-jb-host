# PS5 Host DNS 越狱入口「扫码授权门」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 host.py 的 DNS 越狱入口加一道手机扫码授权门，复用 ludora.cc/jb 已有的 device/pair 授权 + device_token 在线验证，未授权访问 manuals.playstation.net 一律 302 到扫码页。

**Architecture:** host.py（ludora-ps5-autoloader）作为「门」：DNS 放行 `www.ludora.cc`，HTTPS 对无有效 device_token 的请求 302 到 `/jb?next=<原URL>`，带 `?dt=` 的请求在线调 `/api/v2/policy` 验 200/401 后放行并记源 IP 授权记忆（TTL 5 分钟）。ludora-site 的 jb-console-client 在授权 bound 后，若 URL 带 `next`（host 为 manuals.playstation.net）则跳回 `next?dt=<device_token>`。后端 ludora-server 零改动。

**Tech Stack:** Python 3（host.py 标准库 urllib/http.server）、TypeScript（Astro 前端 + vitest）、无新增依赖。

**Spec:** [../specs/2026-11-06-ps5-host-dns-scan-authorization-design.md](../specs/2026-11-06-ps5-host-dns-scan-authorization-design.md)

## Global Constraints

- **ludora-server 零改动**：device/pair（`device.py`）、`/api/v2/policy`（`policy.py` + `auth.py`）均已上线，直接复用，一行不改。
- **ludora-jb-host 零改动**：`jb/index.html` + `jb-client.mjs`（`/api/jb/sessions`）是未部署死前端，不碰。
- **凭证 = 复用 device_token**：`device_token` 是随机 token（服务端只存哈希），**无法本地验签**，只能在线调 `/api/v2/policy` 判 200/401。不新造 entry_token、不新造后端端点。
- **next 白名单防 open-redirect**：跳回 `next` 前校验 host 必须是 `manuals.playstation.net`，其余一律忽略走默认入口。
- **日志脱敏 dt**：device_token 不得落盘、不得进日志/终端，query 里的 `dt` 值脱敏为 `***`。
- **授权记忆**：`dict[源IP] = 过期时间` 进程内存、TTL 5 分钟，不落盘、不持久化免扫。
- **面向用户文案简体中文**；本任务无新增 UI 文案，代码注释/commit message 用中文。
- **commit message 末尾**加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- **多 session 并发铁律**：绝不 `git add -A` / 裸 `git commit`；commit 前 `git diff --cached --name-only` 确认只有自己的文件。
- **真实运行验收铁律**：未在 ludora.cc 真机（或等价环境）走通 §5 时序前，不得标「完成」。

---

## 文件结构

| 文件 | 仓 | 责任 |
|---|---|---|
| `third_party/ps5-webkit-remote-loader/host.py` | ludora-ps5-autoloader | 授权门纯函数 + DNS 放行 + HTTPS 门 + 在线验证 + 授权记忆 + 日志脱敏 |
| `third_party/ps5-webkit-remote-loader/tools/host_auth_test.py` | ludora-ps5-autoloader | 授权门纯函数单测（纯脚本，非 pytest，跟随 `tools/*_test.py` 惯例） |
| `src/lib/jb-post-auth.ts` | ludora-site | 授权 bound 后的跳回目标计算纯函数（`next` 白名单 + `?dt=` 回跳） |
| `src/lib/jb-console-client.ts` | ludora-site | 接入 `resolvePostAuthorizationTarget`，bound 后按 next 跳回 |
| `src/lib/jb-post-auth.test.ts` | ludora-site | 跳回目标纯函数单测（vitest） |

---

## Task 1: host.py 授权门纯函数（ludora-ps5-autoloader）

**Files:**
- Modify: `third_party/ps5-webkit-remote-loader/host.py`（加纯函数 + 常量）
- Create: `third_party/ps5-webkit-remote-loader/tools/host_auth_test.py`

**Interfaces:**
- Produces（Task 2 消费）:
  - 常量：`AUTHORIZE_REDIRECT_HOST = "www.ludora.cc"`、`AUTHORIZE_PATH = "/jb"`、`DEFAULT_LUDORA_API = "http://127.0.0.1:8600"`、`AUTHZ_TTL = 300`
  - `extract_dt(path: str) -> str | None`：从 `?dt=...` 解析 device_token，无则 None
  - `sanitize_dt(path: str) -> str`：把 query 里 `dt` 值脱敏为 `***`
  - `build_authorize_redirect(original_url: str) -> str`：构造 `https://www.ludora.cc/jb?next=<urlencoded>`
  - `device_token_is_valid(dt: str, api_base: str = DEFAULT_LUDORA_API, timeout: int = 8, opener=None) -> bool`
  - `class AuthorizationState(api_base, ttl)`，方法 `is_authorized(ip) -> bool`、`authorize(ip) -> None`

- [ ] **Step 1: 写失败测试**

创建 `third_party/ps5-webkit-remote-loader/tools/host_auth_test.py`：

```python
#!/usr/bin/env python3
"""host.py 授权门纯函数测试;python3 tools/host_auth_test.py 直接跑,非 pytest。

覆盖:device_token 在线验证三态(有效/无效/超时)、dt 解析、日志脱敏、
302 Location 构造、授权记忆 TTL 过期。
"""
import os
import sys
import time
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import host

checks = 0


def check(label, cond):
    global checks
    assert cond, label
    checks += 1
    print(f"  ok  {label}", flush=True)


class FakeResponse:
    def __init__(self, status):
        self._status = status

    def getcode(self):
        return self._status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeOpener:
    def __init__(self, status=None, exc=None):
        self.status = status
        self.exc = exc
        self.last_req = None

    def open(self, req, timeout=None):
        self.last_req = req
        if self.exc is not None:
            raise self.exc
        return FakeResponse(self.status)


def test_extract_dt():
    check("dt from query", host.extract_dt("/index.html?dt=abc123") == "abc123")
    check("no query -> None", host.extract_dt("/index.html") is None)
    check("query without dt -> None", host.extract_dt("/index.html?a=1") is None)


def test_sanitize_dt():
    check("masks dt", host.sanitize_dt("/index.html?dt=secret") == "/index.html?dt=***")
    check("masks dt among others",
          host.sanitize_dt("/index.html?a=1&dt=secret&b=2") == "/index.html?a=1&dt=***&b=2")
    check("no query unchanged", host.sanitize_dt("/index.html") == "/index.html")


def test_build_authorize_redirect():
    loc = host.build_authorize_redirect("https://manuals.playstation.net/document/en/ps5/index.html")
    check("points at /jb", loc.startswith("https://www.ludora.cc/jb?"))
    check("carries next", "next=" in loc and "manuals.playstation.net" in loc)


def test_device_token_is_valid():
    ok = host.device_token_is_valid("tok", opener=FakeOpener(status=200))
    check("200 -> valid", ok is True)

    unauthorized = urllib.error.HTTPError(
        "http://x/api/v2/policy", 401, "Unauthorized", {}, None)
    check("401 -> invalid",
          host.device_token_is_valid("tok", opener=FakeOpener(exc=unauthorized)) is False)

    check("timeout -> invalid",
          host.device_token_is_valid("tok", opener=FakeOpener(exc=TimeoutError())) is False)

    check("empty dt -> invalid",
          host.device_token_is_valid("", opener=FakeOpener(status=200)) is False)


def test_authorization_state():
    s = host.AuthorizationState(ttl=300)
    check("initially unauthorized", s.is_authorized("1.2.3.4") is False)
    s.authorize("1.2.3.4")
    check("authorized after authorize", s.is_authorized("1.2.3.4") is True)
    s._entries["1.2.3.4"] = time.time() - 1  # 强制过期
    check("expired -> unauthorized", s.is_authorized("1.2.3.4") is False)


if __name__ == "__main__":
    test_extract_dt()
    test_sanitize_dt()
    test_build_authorize_redirect()
    test_device_token_is_valid()
    test_authorization_state()
    print(f"\n{checks} checks passed", flush=True)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/qingwu/Development/Game/ludora-ps5-autoloader/third_party/ps5-webkit-remote-loader && python3 tools/host_auth_test.py`
Expected: `AttributeError: module 'host' has no attribute 'extract_dt'`（纯函数尚未定义）

- [ ] **Step 3: 实现纯函数**

在 `host.py` 第 30 行 `import urllib.parse` 后加一行 `import urllib.request`：

```python
import urllib.parse
import urllib.request
```

在 `host.py` 第 68-70 行（`DEFAULT_TARGET`/`DEFAULT_TTL`/`REPO_ROOT` 之后）插入纯函数与常量：

```python
# --- 授权门 (ludora fork) -------------------------------------------------
# 复用 ludora.cc/jb 的 device/pair 授权 + device_token 在线验证,给 DNS 越狱
# 入口加一道手机扫码门。device_token 是随机 token(服务端只存哈希),无法本地
# 验签,只能在线调 /api/v2/policy 判 200/401。

AUTHORIZE_REDIRECT_HOST = "www.ludora.cc"
AUTHORIZE_PATH = "/jb"
DEFAULT_LUDORA_API = "http://127.0.0.1:8600"
AUTHZ_TTL = 300  # 秒;覆盖一次越狱会话内的子资源与重试


def extract_dt(path):
    """从请求 path 的 query 解析 device_token (?dt=...);无则 None。"""
    if "?" not in path:
        return None
    qs = urllib.parse.parse_qs(path.split("?", 1)[1])
    vals = qs.get("dt", [None])
    return vals[0] if vals and vals[0] else None


def sanitize_dt(path):
    """把 query 里的 dt 值脱敏为 ***,避免 device_token 落进日志/终端。"""
    if "?" not in path:
        return path
    base, _, qs = path.partition("?")
    qs = re.sub(r"(^|[?&])dt=[^&]*", r"\1dt=***", qs)
    return base + "?" + qs


def build_authorize_redirect(original_url):
    """构造 302 到 ludora.cc/jb 的 Location,next=原请求完整 URL。"""
    target = f"https://{AUTHORIZE_REDIRECT_HOST}{AUTHORIZE_PATH}"
    q = urllib.parse.urlencode({"next": original_url})
    return f"{target}?{q}"


def device_token_is_valid(dt, api_base=DEFAULT_LUDORA_API, timeout=8, opener=None):
    """调 /api/v2/policy(X-Device-Token)在线验证;200=有效,否则无效。

    无效 token 会让 /api/v2/policy 抛 401(HTTPError),超时/网络异常也一律判
    无效。opener 可注入(测试用),默认用 ProxyHandler({}) 显式绕开系统代理。
    """
    if not dt:
        return False
    url = f"{api_base.rstrip('/')}/api/v2/policy"
    req = urllib.request.Request(url, headers={"X-Device-Token": dt})
    if opener is None:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=timeout) as resp:
            return resp.getcode() == 200
    except Exception:
        return False


class AuthorizationState:
    """授权门状态:进程内存 dict[源IP]=过期时间,TTL 短,不落盘。"""

    def __init__(self, api_base=DEFAULT_LUDORA_API, ttl=AUTHZ_TTL):
        self.api_base = api_base
        self.ttl = ttl
        self._entries = {}
        self._lock = threading.Lock()

    def is_authorized(self, ip):
        with self._lock:
            exp = self._entries.get(ip)
            if exp is None:
                return False
            if time.time() >= exp:
                self._entries.pop(ip, None)
                return False
            return True

    def authorize(self, ip):
        with self._lock:
            self._entries[ip] = time.time() + self.ttl
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/qingwu/Development/Game/ludora-ps5-autoloader/third_party/ps5-webkit-remote-loader && python3 tools/host_auth_test.py`
Expected: 全部 `ok`，结尾 `15 checks passed`

- [ ] **Step 5: Commit**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
git add third_party/ps5-webkit-remote-loader/host.py third_party/ps5-webkit-remote-loader/tools/host_auth_test.py
git diff --cached --name-only   # 只应有上面两个文件
git commit -m "feat(host): 授权门纯函数 + 单测(device_token 在线验证三态/脱敏/授权记忆)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2: host.py 接入门（DNS 放行 + HTTPS 门 + 日志脱敏）

**Files:**
- Modify: `third_party/ps5-webkit-remote-loader/host.py`

**Interfaces:**
- Consumes: Task 1 的全部纯函数与常量（`AUTHORIZE_REDIRECT_HOST` / `extract_dt` / `sanitize_dt` / `build_authorize_redirect` / `device_token_is_valid` / `AuthorizationState` / `DEFAULT_LUDORA_API`）
- Produces: `GuideHandler._authorized()`、`GuideHandler._send_authorize_redirect()`、`build_server(..., authz=None)`、`--ludora-api` / `--no-authz` 命令行参数

- [ ] **Step 1: DNS 放行 www.ludora.cc**

修改 `DNSHandler.handle`（约 198 行）的判定，让 `www.ludora.cc` 也回 A 记录（否则 PS5 被自己的 DNS 锁死，够不到授权页）：

```python
        if name == server.target or name == AUTHORIZE_REDIRECT_HOST:
            if server.verbose:
                say(style(f"[DNS]  {name} -> {server.ip}", 36))
            sock.sendto(
                build_response(qid, question_bytes, server.ip), self.client_address
            )
```

- [ ] **Step 2: 加 GuideHandler 门方法**

在 `GuideHandler` 类里、`_host_allowed` 方法之后（约 338 行）插入两个方法：

```python
    def _authorized(self):
        """授权门三态:IP 在授权记忆内→放行;?dt= 在线验证有效→记 IP+放行;否则拒绝。"""
        authz = getattr(self.server, "authz", None)
        if authz is None:
            return True  # 未启用门(dev / 本地直连)
        src_ip = self.client_address[0]
        if authz.is_authorized(src_ip):
            return True
        dt = extract_dt(self.path)
        if dt and device_token_is_valid(dt, authz.api_base):
            authz.authorize(src_ip)
            return True
        return False

    def _send_authorize_redirect(self):
        """302 到 ludora.cc/jb,next=原请求完整 URL。返回 None 表示无 body。"""
        host = self.headers.get("Host", "manuals.playstation.net")
        location = build_authorize_redirect(f"https://{host}{self.path}")
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self._log(f"{self.command} {self.path.split('?', 1)[0]} -> 302 (authorize)")
        return None
```

- [ ] **Step 3: send_head 接入门**

在 `send_head` 里、`_host_allowed()` 检查之后、`self._resolve()` 之前（约 346 行）插入：

```python
        if not self._authorized():
            return self._send_authorize_redirect()
```

- [ ] **Step 4: 日志脱敏 dt**

修改 `log_request`（约 240-248 行），把打印的 `self.path` 换成脱敏后的：

```python
    def log_request(self, code="-", size="-"):
        """Always log the request line, even when not verbose."""
        agent = self.headers.get("User-Agent", "-")
        safe_path = sanitize_dt(self.path)
        say(style(f"[HTTP] {self.command} {safe_path} -> {code}  UA: {agent[:60]}", 36))
```

- [ ] **Step 5: build_server 挂 authz**

修改 `build_server`（约 393 行）加 `authz` 参数并挂到 `httpd`：

```python
def build_server(host, port, allowed_host, status, quiet, authz=None):
    handler = lambda *a, **kw: GuideHandler(*a, allowed_host=allowed_host, **kw)
    httpd = ThreadingHTTPServer((host, port), handler)
    httpd.daemon_threads = True
    httpd.status = status
    httpd.quiet = quiet
    httpd.authz = authz
    return httpd
```

- [ ] **Step 6: 命令行参数 + main 启用**

在 `parse_args`（约 567 行 `--no-color` 之后）加两个参数：

```python
    p.add_argument("--ludora-api", default=DEFAULT_LUDORA_API,
                   help=f"Ludora API base URL for device-token check (default: {DEFAULT_LUDORA_API}).")
    p.add_argument("--no-authz", action="store_true",
                   help="Disable the scan-authorization gate (serve exploit directly).")
```

在 `main` 里、`status = Status()` 之后（约 615 行）构造 `authz`，并把两处 `build_server` 调用传上 `authz`：

```python
    authz = None if args.no_authz else AuthorizationState(args.ludora_api)
```

- `httpsd = build_server("0.0.0.0", args.https_port, args.target if args.strict_host else None, status, not args.verbose, authz)`（约 634 行）
- `httpd = build_server("0.0.0.0", args.http_port, None, status, not args.verbose, authz)`（约 704 行）

- [ ] **Step 7: 语法 + 打包 + 直连回归验证**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader/third_party/ps5-webkit-remote-loader
python3 host.py --help                 # 显示 --ludora-api / --no-authz,exit 0
python3 tools/build_host.py --output /tmp/host-built.py   # 打包成功(embed_payload/embed_version/embed_server_cert 不报缺占位符)
python3 /tmp/host-built.py --help      # 打包产物同样带新参数
```
Expected: 三条命令都 exit 0；`--help` 输出含 `--ludora-api` 与 `--no-authz`。`--no-authz` 时直连 exploit 仍工作（门未启用）。

- [ ] **Step 8: Commit**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
git add third_party/ps5-webkit-remote-loader/host.py
git diff --cached --name-only   # 只应有 host.py
git commit -m "feat(host): 接入扫码授权门(DNS 放行/HTTPS 门/在线验证/日志脱敏)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3: ludora-site 授权 bound 后 next 跳回

**Files:**
- Create: `src/lib/jb-post-auth.ts`
- Modify: `src/lib/jb-console-client.ts`
- Create: `src/lib/jb-post-auth.test.ts`

**Interfaces:**
- Consumes: `EntryRoute` 类型（来自 `./jb-router`，`{ kind: "native"; target: string } | { kind: "provision"; platform; firmware }`）
- Produces:
  - `isAllowedNextHost(next: string) -> boolean`：host 必须是 `manuals.playstation.net`
  - `resolvePostAuthorizationTarget(deviceToken: string, route: EntryRoute, next: string | null, origin: string) -> string`

- [ ] **Step 1: 写失败测试**

创建 `src/lib/jb-post-auth.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import { isAllowedNextHost, resolvePostAuthorizationTarget } from "./jb-post-auth";
import type { EntryRoute } from "./jb-router";

const native: EntryRoute = { kind: "native", platform: "ps5", target: "/jb/host/ps5-loader/" };
const provision: EntryRoute = { kind: "provision", platform: "ps5", firmware: 12.02 };

describe("isAllowedNextHost", () => {
  it("accepts manuals.playstation.net", () => {
    expect(isAllowedNextHost("https://manuals.playstation.net/document/en/ps5/index.html")).toBe(true);
  });
  it("rejects cross-origin hosts", () => {
    expect(isAllowedNextHost("https://evil.example/x")).toBe(false);
  });
  it("rejects invalid URLs", () => {
    expect(isAllowedNextHost("not a url")).toBe(false);
  });
});

describe("resolvePostAuthorizationTarget", () => {
  it("returns next with ?dt= appended when next is allowed", () => {
    const next = "https://manuals.playstation.net/document/en/ps5/index.html";
    expect(resolvePostAuthorizationTarget("tok123", native, next, "https://www.ludora.cc"))
      .toBe("https://manuals.playstation.net/document/en/ps5/index.html?dt=tok123");
  });
  it("ignores cross-origin next and falls back to native target", () => {
    expect(resolvePostAuthorizationTarget("tok123", native, "https://evil.example/x", "https://www.ludora.cc"))
      .toBe(native.target);
  });
  it("ignores missing next and uses native target", () => {
    expect(resolvePostAuthorizationTarget("tok123", native, null, "https://www.ludora.cc"))
      .toBe(native.target);
  });
  it("falls back to provision route when no next and route is provision", () => {
    expect(resolvePostAuthorizationTarget("tok123", provision, null, "https://www.ludora.cc"))
      .toBe("https://www.ludora.cc/jb/provision?platform=ps5&firmware=12.02");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/qingwu/Development/Game/ludora-site && pnpm vitest run src/lib/jb-post-auth.test.ts`
Expected: FAIL — `Cannot find module './jb-post-auth'`

- [ ] **Step 3: 实现纯函数**

创建 `src/lib/jb-post-auth.ts`：

```ts
import type { EntryRoute } from "./jb-router";

const NEXT_ALLOWED_HOST = "manuals.playstation.net";

export function isAllowedNextHost(next: string): boolean {
  try {
    return new URL(next).host.toLowerCase() === NEXT_ALLOWED_HOST;
  } catch {
    return false;
  }
}

export function resolvePostAuthorizationTarget(
  deviceToken: string,
  route: EntryRoute,
  next: string | null,
  origin: string,
): string {
  if (next && isAllowedNextHost(next)) {
    const target = new URL(next);
    target.searchParams.set("dt", deviceToken);
    return target.toString();
  }
  if (route.kind === "native") {
    return route.target;
  }
  const target = new URL("/jb/provision", origin);
  target.searchParams.set("platform", route.platform);
  target.searchParams.set("firmware", String(route.firmware));
  return target.toString();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/qingwu/Development/Game/ludora-site && pnpm vitest run src/lib/jb-post-auth.test.ts`
Expected: PASS（4 个 `it` 全绿）

- [ ] **Step 5: 接入 jb-console-client.ts**

在 `src/lib/jb-console-client.ts` 顶部 import（现有 import 之后）：

```ts
import { resolvePostAuthorizationTarget } from "./jb-post-auth";
```

把 bound 分支（约 75-88 行）改为统一走 `resolvePostAuthorizationTarget`：

```ts
      if (result.status === "bound") {
        if (countdownTimer !== undefined) window.clearInterval(countdownTimer);
        window.sessionStorage.setItem("ludora_jb_device_token", result.deviceToken);
        document.cookie = `ludora_jb_device=${encodeURIComponent(result.deviceToken)}; Path=/jb; Max-Age=600; Secure; SameSite=Lax`;
        const target = resolvePostAuthorizationTarget(
          result.deviceToken,
          route,
          new URLSearchParams(window.location.search).get("next"),
          window.location.origin,
        );
        setStatus("授权成功，正在进入入口…");
        window.location.assign(target);
        return;
      }
```

- [ ] **Step 6: 全量单测 + typecheck**

Run: `cd /Users/qingwu/Development/Game/ludora-site && pnpm test && pnpm typecheck`
Expected: 全量 vitest 通过（含新增 jb-post-auth.test.ts）、`tsc --noEmit` + `astro check` 通过

- [ ] **Step 7: Commit**

```bash
cd /Users/qingwu/Development/Game/ludora-site
git add src/lib/jb-post-auth.ts src/lib/jb-post-auth.test.ts src/lib/jb-console-client.ts
git diff --cached --name-only   # 只应有上面三个文件
git commit -m "feat(jb): 授权 bound 后按 next 跳回 host.py 入口(?dt= 回跳)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## 完成后的真实运行验收（跨任务，未通过前不得标「完成」）

按 spec §8，组件测试全绿后仍须真实跑通（ludora.cc 真机或等价环境）：

1. PS5 把 DNS 指向 ludora.cc → 点 User's Guide → 302 到 `/jb` → 手机扫码（未登录被拦 → 登录）→ 输配对码 → PS5 轮询 bound → 跳回 host.py 带 `?dt=` → host.py 调 `/api/v2/policy` 200 → 吐 exploit。
2. 不授权时直接访问 `manuals.playstation.net/relapse.html` 必须 302（不因猜 URL 绕开）。
3. 本地折腾器不扫码：主屏快捷方式 + pldmgr 127.0.0.1:8084 全程无授权页。
4. host.py 日志中 `?dt=` 值已脱敏为 `***`。
5. open items（spec §9）：PS5 浏览器对 302 / `?dt=` 回跳、`urllib` 回环绕代理的实际支持；`build_host.py` 打包产物在 ludora.cc 上注入 `--ludora-api` 的部署配置。
