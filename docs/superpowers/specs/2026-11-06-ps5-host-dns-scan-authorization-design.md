# PS5 Host DNS 越狱入口「扫码授权门」设计

**Date:** 2026-11-06
**Status:** Design（已按「与授权流程一致、不重造轮子」重写，待 review）
**Scope:** 本文是 [2026-11-04-ps5-offline-autoloader-entry-design.md](./2026-11-04-ps5-offline-autoloader-entry-design.md)
（下称「offline spec」）的补充。落地范围限定：给 host.py 的 DNS 越狱入口加一道**手机扫码授权门**，
**复用 ludora.cc/jb 已有的 device/pair 授权 + device_token 在线验证**，不新增任何后端端点。
不碰 PS4 引擎、不碰 remote-loader vendored 源、不碰本地鲁哆啦折腾器（pldmgr / 主屏快捷方式）的
离线启动路径。

---

## 1. 背景与目标

offline spec 已把「无 PC 用户第一次越狱」走通：PS5 把 DNS 指向 ludora.cc → User's Guide 被
DNS 劫持到 host.py → 返回 exploit chain page → 装主屏。但这条入口目前**任何人点 User's Guide
就能直接进 exploit**，没有门槛。

ludora.cc/jb 的**网页路由**入口已有完整授权闭环（已上线）：`/jb`（`src/pages/jb/index.astro`）走
**device/pair**（登录态 + 手机输 6 位配对码），授权产物 `device_token` 落到 cookie
`ludora_jb_device`，`/jb/host/*` 用 `validJbDeviceToken` 调 `/api/v2/policy` 在线验证放行。

**目标**：

1. 给 host.py 的 DNS 越狱入口加**手机扫码授权门**：点 User's Guide → 先走 device/pair 授权 →
   授权通过（拿到有效 device_token）才进 exploit。
2. **复用 ludora.cc/jb 的 device/pair + device_token 在线验证**，不新造后端端点、不新造凭证。
3. **本地鲁哆啦折腾器（主屏快捷方式 / pldmgr 127.0.0.1:8084）不扫码** —— 已装机的老用户直接进。

---

## 2. 现状盘点（实现前已核实）

| 事实 | 结论 |
|---|---|
| ludora.cc/jb 授权 | `src/pages/jb/index.astro` + `jb-console-client.ts` → `startPairing`/`pollPairing`（`/api/device/pair/start`、`/poll`）+ `jb/authorize.astro` + `jb-authorize-client.ts` → `confirmPairing`（`/api/device/pair/confirm`，Bearer 登录态） |
| 授权产物 | `device_token = secrets.token_urlsafe(24)`（**随机 token**，服务端只存 `_hash_token(token)` 哈希，`device.py:174`） |
| 放行验证 | `validJbDeviceToken`（`src/lib/jb-device-auth.ts`）：拿 cookie `ludora_jb_device` 或 `x-device-token` 头，调 `/api/v2/policy`（X-Device-Token），`response.ok` = 有效 |
| `/api/v2/policy` 鉴权 | `resolve_pin_principal`（auth.py:95）：带 `X-Device-Token` → `current_device`，**无效 token 抛 401**，有效 → 200（device 作用域）。故 host.py 用「200/401」即可判有效/无效 |
| host.py DNS | `DNSHandler.handle` 只对 `manuals.playstation.net` 回 A 记录，其余**一律 NXDOMAIN**（host.py:198） |
| host.py HTTPS | `GuideHandler.send_head()` 直接 200 吐文件，无任何门 |
| 死前端 | ludora-jb-host 的 `jb/index.html` + `jb-client.mjs` 调 `/api/jb/sessions`（**后端从未实现、未部署**，ludora-site 的 `/jb` 是 `index.astro` 覆盖的）。**本方案不动它** |
| 本地折腾器 | autoloader 装的主屏快捷方式 = standalone chain page，本地启动不走 host.py；pldmgr 8084 是 payload 自己的 server。**天然不经过扫码门** |

---

## 3. 决策记录（站长已拍板，2026-11-06）

1. **接入方式 = 方案 B（host.py 302 到 ludora.cc/jb + 凭证跳回）**：授权页单一份（ludora.cc/jb），
   host.py 只做「门」。
2. **门槛 = 真手机授权握手**：手机扫码 + **登录态**（会员 cookie→Bearer）+ 输配对码。与
   ludora.cc/jb 一致，不是纯扫码、不是会员档位付费。
3. **频率 = 每次越狱都扫码**：每次 DNS 越狱都是一次新的 device/pair 会话（`pair_start` 生成新
   `device_code`/`user_code`，手机每次都要确认）。host.py 的「源 IP 授权记忆」进程内存 + 短 TTL
   （5 分钟，仅覆盖一次越狱会话内的子资源与重试），不落盘、不持久化免扫。
4. **凭证验证 = 复用 device_token + `/api/v2/policy` 在线验证**（`validJbDeviceToken` 同款）。
   🔴 device_token 是随机 token、服务端只存哈希，**无法本地验签** —— 不另造 entry_token 密钥，
   直接沿用现成的「调 /api/v2/policy 判 200/401」。
5. **后端零改动**：device/pair、`/api/v2/policy` 均已上线，ludora-server 一行不改。
6. **本地折腾器不扫码**：天然成立（不走 host.py），只作边界确认，不写代码。

---

## 4. 组件设计

### 4.1 host.py 门 —— ludora-ps5-autoloader 的 `host.py`

- **DNS 放行 `www.ludora.cc`**：`DNSHandler.handle` 的 `name == server.target` 判定改为
  「`manuals.playstation.net` 或 `www.ludora.cc` 都回 A 记录，其余 NXDOMAIN」。否则 PS5 被自己的
  DNS 锁死，够不到授权页与 API。
- **HTTPS 门**：`send_head()` 里，对 `manuals.playstation.net` 的请求按以下顺序判定：
  1. **源 IP 在授权记忆内（未过期）** → 直接吐 exploit（覆盖 exploit 页加载子资源 js/offsets 的
     场景——子资源请求不带 `dt`，靠 IP 记忆放行）。
  2. **query 带 `dt=<device_token>` 且在线验证有效** → 把源 IP 记入授权记忆（TTL 5 分钟）→ 吐 exploit。
  3. **其余（无 / 无效）** → 302 `Location: https://www.ludora.cc/jb?next=<本次请求的完整 URL>`。
- **在线验证**：host.py 用标准库 `urllib.request` 调 `http://<ludora-server>/api/v2/policy`
  （头 `X-Device-Token: <dt>`，超时 8s，**显式绕开系统代理**——host.py 跑在 ludora.cc 生产机，
  回环/内网调用不得走代理），**200 = 有效，401/异常 = 无效**。ludora-server 地址部署时配置
  （默认 `http://127.0.0.1:8600`，与 nginx 反代同机）。
- **授权记忆**：`dict[源IP] = 过期时间`，进程内存即可，TTL **~5 分钟**。不依赖 PS5 的
  cookie/header 行为——那些在真机上不可靠。
- **日志脱敏**：host.py 的 `log_request` 会打印 `self.path`（含 `?dt=`），须把 query 里的 `dt`
  值脱敏（`?dt=***`），避免 device_token 落进日志/终端。

### 4.2 前端改动 —— ludora-site `src/lib/jb-console-client.ts`

授权成功（`pollPairing` 返回 `bound`）后，现在写死跳 `route.target`（`/jb/host/*`）。改为：**若 URL
带 `next`（host.py 传的），跳回 `next` 并附 `?dt=<device_token>`**；否则维持原逻辑。

- `next` 从 `window.location.search` 读取。
- **跳回前校验 `next` 的 host 必须是 `manuals.playstation.net`**（防 open-redirect）；不合法则忽略
  `next`，走原 `/jb/host/*` 逻辑。
- 跳回 URL：`new URL(next)` → `searchParams.set("dt", result.deviceToken)` → `location.assign`。

### 4.3 ludora-server —— 零改动

device/pair（`device.py`）与 `/api/v2/policy`（`policy.py` + `auth.py`）均已上线，host.py 直接复用。

### 4.4 ludora-jb-host —— 零改动

`jb/index.html` + `jb-client.mjs`（`/api/jb/sessions`）是未部署的死前端，本方案不碰。

---

## 5. 数据流（DNS 越狱入口，完整时序）

```
PS5           host.py(ludora.cc)        ludora.cc/jb(astro+API)        手机
 │  User's Guide                                   │                    │
 │─────manuals.playstation.net──────────▶│         │                    │
 │        (无 dt, IP 未授权)              │         │                    │
 │◀── 302 → www.ludora.cc/jb?next=<原URL>─│         │                    │
 │───────────────────────GET /jb?next=…───────────▶│                    │
 │◀────────── index.astro(扫码页)──────────────────│                    │
 │──── POST /api/v2/device/pair/start──────────────▶│                    │
 │◀──── {device_code, user_code}───────────────────│                    │
 │◀══════════════ 二维码 + 配对码 ═════════════════│                    │
 │                                                    │◀──手机扫码 /jb/authorize──│
 │                                                    │   (authorize.astro:登录态→未登录重定向登录) │
 │                                                    │◀──POST /api/v2/device/pair/confirm (Bearer+code)──│
 │                                                    │◀──{ok}──│
 │──── POST /api/v2/device/pair/poll (轮询)──────────▶│                    │
 │◀──── {status:"bound", device_token}───────────────│                    │
 │  (jb-console-client:带 next → 跳 next?dt=<token>)  │                    │
 │─────manuals.playstation.net?dt=<token>───────────▶│                    │
 │        (host.py 调 /api/v2/policy 验 200)          │                    │
 │◀──────────── relapse.html/poops.html(exploit)─────│                    │
```

---

## 6. 安全

- **授权门槛**：device/pair 的 `confirm` 挂 `current_member`（Bearer 登录态），未登录 401；配对码
  短时效、一次性消费（`device_pair` 表 `status pending→confirmed→consumed`）。
- **凭证验证**：host.py 调 `/api/v2/policy` 判 200/401，与 `validJbDeviceToken` 同款；device_token
  不在 host.py 落盘，仅当次请求内存用一下。
- **防绕过**：302 门覆盖 `manuals.playstation.net` 下所有路径（含直接敲 `relapse.html`），无有效
  device_token、且源 IP 不在授权记忆内的一律 302，不因「猜 URL」绕开。
- **授权记忆取舍**：绑定源 IP、TTL 5 分钟，同局域网内另一台设备在 TTL 内可蹭授权——局域网场景
  （用户自己的网络）下可接受的取舍，换取「不依赖 PS5 cookie/header 行为」的可靠性。
- **device_token 进 URL**：跳回时 `?dt=<device_token>` 会进 host.py 日志与浏览器历史。host.py 日志
  已脱敏 `dt`；device_token 本身是「设备身份凭证」，泄漏面 = 冒充这台设备调 API（设备场景风险
  可控），且只在一次越狱跳回的瞬间出现。
- **open-redirect**：`next` 只允许 `manuals.playstation.net`，其余 host 一律忽略走默认入口。

---

## 7. 生产部署（ludora.cc 单机）

- **53 DNS**：`manuals.playstation.net` → 本机 IP；`www.ludora.cc` → 本机 IP；其余 NXDOMAIN。
- **443 nginx SNI 分流**：`manuals.playstation.net` → host.py；`www.ludora.cc` → ludora-site（Astro）
  + ludora-server API（`/api/v2/*` 反代）。
- **host.py 调 ludora-server**：内网/回环直连 `http://127.0.0.1:8600/api/v2/policy`（部署配置注入），
  显式绕开系统代理。

---

## 8. 验收标准（真实运行验收，铁律）

- 组件测试：host.py 的「device_token 在线验证」做成纯函数（注入验证回调即可测），单测覆盖
  有效（200）/无效（401）/网络异常（超时→判无效）三态；`next` 白名单校验单测（合法/跨域/无 next）。
- **真实运行（ludora.cc 真机或等价环境）**：走一遍 §5 完整时序——PS5 点 User's Guide → 302 到
  `/jb` → 手机扫码（未登录被拦 → 登录）→ 输配对码 → PS5 轮询 bound → 跳回 host.py 带 dt →
  host.py 验 `/api/v2/policy` 200 → 吐 exploit。不授权时直接访问
  `manuals.playstation.net/relapse.html` 必须 302。
- **本地折腾器不扫码**：装主屏后，主屏快捷方式启动 standalone chain page 全程无授权页；pldmgr 8084 同。
- 未真机验证前不得标「完成」；PS5 浏览器对 302 / `?dt=` 回跳的实际支持列入 open item，真机确认。

---

## 9. 明确不做 / open items

- 不做会员档位/付费门槛（门槛 = 登录态 + 输配对码，与 ludora.cc/jb 一致）。
- 不新造后端端点（`/api/jb/sessions`）、不新造凭证（entry_token）、不另起密钥。
- 不持久化「授权一次长期免扫」（每次越狱 = 一次新的 device/pair 会话，手机每次确认）。
- 不动 ludora-jb-host 的死前端 `jb/index.html`。
- open items：PS5 浏览器对 302 / `?dt=` 回跳、`urllib` 回环调用绕代理的实际支持；host.py 打包
  （`build_host.py`）是否需注入 ludora-server 地址配置。
