# PS5 Host DNS 越狱入口「扫码授权门」设计

**Date:** 2026-11-06
**Status:** Design（站长已拍板关键决策，待 review）
**Scope:** 本文是 [2026-11-04-ps5-offline-autoloader-entry-design.md](./2026-11-04-ps5-offline-autoloader-entry-design.md)
（下称「offline spec」）的补充。落地范围限定：给 host.py 的 DNS 越狱入口加一道**手机扫码授权门**，
并补齐 ludora.cc/jb 授权门**缺失的后端**（`/api/v2/jb/sessions`）。不碰 PS4 引擎、不碰 remote-loader
vendored 源、不碰本地鲁哆啦折腾器（pldmgr / 主屏快捷方式）的离线启动路径。

---

## 1. 背景与目标

offline spec 已把「无 PC 用户第一次越狱」走通：PS5 把 DNS 指向 ludora.cc → User's Guide 被
DNS 劫持到 host.py → 返回 exploit chain page → 装主屏。但这条入口目前**任何人点 User's Guide
就能直接进 exploit**，没有门槛。

ludora.cc/jb 的**网页路由**入口已有授权门（`jb/index.html` 扫码授权前端），但它调用的后端
`/api/jb/sessions` **尚未实现** —— 也就是说两条入口目前都「看得到门、关不上门」。

**目标**：

1. 给 host.py 的 DNS 越狱入口加**手机扫码授权门**：点 User's Guide → 先扫码授权 → 授权通过才进 exploit。
2. 扫码授权**复用 ludora.cc/jb 的机制**（手机扫码 + **登录态** + 输 6 位码），不另起一套门槛语义。
3. 补齐 `/api/v2/jb/sessions` 后端，让网页路由与 DNS 路由**共用同一份授权**。
4. **本地鲁哆啦折腾器（主屏快捷方式 / pldmgr 127.0.0.1:8084）不扫码** —— 已装机的老用户直接进。

---

## 2. 现状盘点（实现前已核实）

| 事实 | 结论 |
|---|---|
| ludora.cc/jb 授权前端 | `jb/index.html`（主机扫码页）+ `jb/authorize.html`（手机输码页）+ `jb/src/jb-client.mjs`/`authorize.mjs` 已存在，契约见 §4 |
| 授权后端 `/api/jb/sessions` | **ludora-server 里不存在**，本次补齐 |
| ludora-server 路由 | `_mount_api` 把每个 router 挂 `/api` 与 `/api/v2`；**`/api/*` 被 api_gateway 中间件整段 410 墓碑，只有 `/api/v2/*` 活着**（spec 2026-09-15-api-v2-cutover） |
| 登录态 | ludora.cc(Astro) 会员登录态 = **cookie + `POST /api/auth/refresh` 换 Bearer accessToken**（`src/lib/jb-pairing.ts` 的 `refreshBrowserAccessToken()` 是现成先例）；后端 `current_member`（membership.py:589）认 `Authorization: Bearer` |
| 签票密钥 | `jb_issue_api.py` 的 `_secret()` 复用进程 `token_secret`，`sign_ticket`/`verify_ticket` 用 HMAC + 过期 + `compare_digest` |
| host.py DNS | `DNSHandler.handle` 只对 `manuals.playstation.net` 回 A 记录，其余**一律 NXDOMAIN**（host.py:198） |
| host.py HTTPS | `_resolve()` 按 UA 固件路由到 `relapse.html`/`poops.html`，`send_head()` 直接 200 吐文件，无任何门 |
| 二维码 | ludora-server 依赖无 qrcode 库；前端 preview 模式已用 `data:image/svg+xml`（`segno` 纯 Python 可直接产出 SVG data URI） |
| 本地折腾器 | autoloader 装的主屏快捷方式 = standalone chain page，本地启动不走 host.py；pldmgr 8084 是 payload 自己的 server。**天然不经过扫码门** |

---

## 3. 决策记录（站长已拍板，2026-11-06）

1. **接入方式 = 方案 B（host.py 302 到 ludora.cc/jb + 凭证跳回）**：不内嵌第二份扫码页，
   授权页单一份（ludora.cc/jb），host.py 只做「门」。
2. **门槛 = 真手机授权握手**：手机扫码 + **登录态**（会员 cookie→Bearer）+ 输 6 位授权码。
   与 ludora.cc/jb 一致，不是纯扫码、不是会员档位付费。
3. **频率 = 每次越狱都扫码**：授权凭证短时效、host.py 无状态，不持久化「免扫」绑定。
4. **凭证验签 = 共享密钥本地验签，且复用登录态密钥 `token_secret`**：不为越狱授权另起一把密钥，
   host.py 打包时注入与 ludora-server 相同的 `token_secret`，本地 HMAC 验签、无网络回调。
5. **本地折腾器不扫码**：天然成立（不走 host.py），只作边界确认，不写代码。

---

## 4. 授权前端契约（已存在，后端要对齐）

`jb/src/jb-client.mjs` / `authorize.mjs` 现调：

| 端点 | 方法 | 请求 | 响应 |
|---|---|---|---|
| `/api/jb/sessions` | POST | `{platform}` | `{id, authorizationCode(6位), mobileUrl, qrDataUrl}` |
| `/api/jb/sessions/:id` | GET | —（轮询，`cache: no-store`） | `{authorized}` |
| `/api/jb/sessions/:id/authorize` | POST | `{authorizationCode}` | 成功/失败 |

`jb-client.mjs` 授权后 `redirectToEntry()`：PS5 → `/jb/ps5/`，PS4 → `/jb/ps4/`（本次要支持 `next` 跳回）。

---

## 5. 组件设计

### 5.1 后端授权 API —— ludora-server 新增 `nasflow_server/jb_session_api.py`

路由挂 `/api/v2/jb/sessions`（v2 唯一活命名空间）。三个端点：

- **`POST /sessions`**（公开，不挂会员闸——会话创建阶段 PS5 端无登录态）
  - 生成 `session_id`（32 hex 随机）+ `authorization_code`（6 位数字）
  - `mobileUrl = https://www.ludora.cc/jb/authorize.html?session=<id>`
  - `qrDataUrl`：`segno.make(mobileUrl).svg_data_uri()`
  - 会话落库/缓存，TTL ~5 分钟；`Set-Cookie: ludora_jb_session=<id>` 绑定主机（PS5 浏览器兼容性列入真机验收项）
- **`GET /sessions/{id}`**（公开）：返回 `{authorized}`；若已授权，附带签发短期凭证
  `entry_token`（见 §5.3）与 `expires_in`。
- **`POST /sessions/{id}/authorize`**（挂 `current_member` 登录态）：
  - 校验 `Authorization: Bearer`（手机端 `/api/auth/refresh` 换来的 accessToken）→ 未登录 401
  - 校验 `authorizationCode` 与 session 匹配，错计数（≥5 次作废 session）
  - 通过后标记 `authorized = true`，记录授权会员 id（供审计）

参照 `jb_issue_api.py` 风格：短时效、限次、`audit` 记账、`compare_digest` 比对授权码。

### 5.2 host.py 门 —— ludora-ps5-autoloader 的 `host.py`

- **DNS 放行 `www.ludora.cc`**：`DNSHandler.handle` 的 `name == server.target` 判定改为「`manuals.playstation.net`
  或 `www.ludora.cc` 都回 A 记录，其余 NXDOMAIN」。否则 PS5 被自己的 DNS 锁死，够不到授权页与 API。
- **HTTPS 门**：`send_head()` 里，对 `manuals.playstation.net` 的请求先看是否带有效 `entry_token`
  （query `?jt=` 或 cookie）：
  - **无 / 无效** → 302 `Location: https://www.ludora.cc/jb?next=<本次请求的完整 URL>`
  - **有效** → 正常吐 `relapse.html`/`poops.html`
- **验签**：`verify_entry_token(secret, token)` 纯函数，HMAC(`token_secret`, `session_id|exp`)，
  `compare_digest` 定时比对 + 过期检查。密钥经部署配置注入（与 ludora-server 同一 `token_secret`），
  **不写进任何 commit**。

### 5.3 授权凭证 entry_token（复用登录态密钥）

- 授权成功（`authorize` 端点）时，后端把 `session_id` 标记 authorized 并记录 `authorized_member_id`。
- `GET /sessions/{id}` 检测到 authorized 后，用 `token_secret` 现签短期凭证，**token 本身携带明文
  供 host.py 重算比对**（对齐 `jb_issue_api.py` 的 `sign_ticket`/`verify_ticket`：主体明文单独传、签名只作校验）：

  ```
  entry_token = "<session_id>.<exp>.<sig>"
  sig = HMAC-SHA256(token_secret, f"{session_id}|{exp}")[:32]   # 十六进制
  ```

  TTL ~60s（足够 PS5 跳回一次）。
- host.py 验签：拆出 `session_id`/`exp`/`sig` → 重算 HMAC → `compare_digest` 定时比对 + 过期检查，
  **无需回调后端**。

### 5.4 前端改动 —— ludora-jb-host `jb/`

- `jb/src/jb-client.mjs`：
  - `sessionEndpoint` 改 `/api/v2/jb/sessions`；
  - `redirectToEntry()`：若 URL 带 `next`（host.py 传的），授权后跳 `next` 并附 `?jt=<entry_token>`；
    否则维持默认 `/jb/ps5/`。
- `jb/src/authorize.mjs` + `jb/authorize.html`：
  - 进入时调 `/api/auth/refresh`（`credentials: include`）判断登录态：失败 → 展示「请先登录」+ 跳
    ludora.cc 登录页（登录后回 `authorize.html?session=...`）；成功 → 显示输码框。
  - `POST /authorize` 带 `Authorization: Bearer <accessToken>`。

---

## 6. 数据流（DNS 越狱入口，完整时序）

```
PS5           host.py(ludora.cc)        ludora.cc/jb(静态+API)        手机
 │  User's Guide                                   │                    │
 │─────manuals.playstation.net──────────▶│         │                    │
 │        (无 entry_token)                 │         │                    │
 │◀──────── 302 → www.ludora.cc/jb?next=…─│         │                    │
 │───────────────────────────────GET /jb─────────▶│                    │
 │◀────────────── jb/index.html(扫码页)─────────────│                    │
 │──── POST /api/v2/jb/sessions {platform}──────────▶│                    │
 │◀──── {id, code, mobileUrl, qrDataUrl}────────────│                    │
 │◀══════════════ 二维码 + 6位码 ═══════════════════│                    │
 │                                                    │◀──手机扫码──        │
 │                                                    │◀──GET authorize.html──│
 │                                                    │   (检查登录态→未登录引导登录) │
 │                                                    │◀──POST /authorize (Bearer+code)──│
 │                                                    │◀──{ok} 标记 authorized──│
 │──── GET /sessions/{id} (轮询)─────────────────────▶│                    │
 │◀──── {authorized:true, entry_token, exp}──────────│                    │
 │─────manuals.playstation.net?jt=<entry_token>─────▶│                    │
 │        (验签通过)                                 │                    │
 │◀──────────── relapse.html/poops.html(exploit)─────│                    │
```

---

## 7. 安全

- **会话**：5 分钟 TTL；`session_id` 32 hex 随机（防猜）；`Set-Cookie` 绑主机（防抢 session）。
- **授权码**：6 位数字，错 5 次作废；`compare_digest` 比对。
- **登录态**：`authorize` 端点挂 `current_member`，未登录 401；授权会员 id 记审计。
- **entry_token**：60s TTL、HMAC 绑 session、`compare_digest` 验签；密钥不进 commit。
- **防绕过**：host.py 的 302 门覆盖 `manuals.playstation.net` 下所有路径（含直接敲 `relapse.html`），
  无有效 token 一律 302，不因「猜 URL」绕开。
- **不泄露**：二维码/授权码/entry_token 均不含 exploit 资产；exploit 只在验签后吐。

---

## 8. 生产部署（ludora.cc 单机）

- **53 DNS**：`manuals.playstation.net` → 本机 IP；`www.ludora.cc` → 本机 IP；其余 NXDOMAIN。
- **443 nginx SNI 分流**：`manuals.playstation.net` → host.py；`www.ludora.cc` → ludora-jb-host 静态站
  + ludora-server API（`/api/v2/*` 反代）。
- **密钥注入**：host.py 的 `token_secret` 与 ludora-server 的 `token_secret` 同一值，部署配置注入，
  不写 commit；轮换时两端同步（沿用 jb_issue_api 的「少一处密钥」原则）。

---

## 9. 验收标准（真实运行验收，铁律）

- 组件测试：后端 `jb_session_api.py` 的三端点单测（会话创建/轮询/授权/限次/过期/登录态 401）全绿；
  host.py 的 `verify_entry_token` 纯函数单测（合法/过期/篡改/密钥错）全绿。
- **真实运行（ludora.cc 真机或等价环境）**：走一遍 §6 完整时序——PS5 点 User's Guide → 302 到扫码页 →
  手机扫码（未登录被拦 → 登录）→ 输码 → PS5 轮询到 authorized → 带 token 跳回 → host.py 吐 exploit。
  不授权时直接访问 `manuals.playstation.net/relapse.html` 必须 302。
- **本地折腾器不扫码**：装主屏后，主屏快捷方式启动 standalone chain page 全程无授权页；pldmgr 8084 同。
- 未真机验证前不得标「完成」；PS5 浏览器对 `Set-Cookie` / 302 / `data:image/svg+xml` 二维码的实际支持
  列入 open item，真机逐个确认。

---

## 10. 明确不做 / open items

- 不做会员档位/付费门槛（门槛 = 登录态 + 输码，与 ludora.cc/jb 一致）。
- 不持久化「授权一次长期免扫」（每次越狱都扫码，host.py 无状态）。
- 不内嵌第二份扫码页到 host.py（单一份授权前端）。
- open items：PS5 浏览器 cookie/302/SVG 二维码兼容性、`segno` 依赖引入与体积、`next` 回跳 URL 的
  编码与域名白名单校验（防 open-redirect）。
