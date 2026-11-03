# PS5 WebKit Remote Loader 收敛 + 插件加载 Host 设计

**Date:** 2026-11-04
**Status:** Design（方向 A 已拍板，待 review）
**Scope:** 本文是 PS5 `/jb` 路由改造的**设计文档**，不是实现计划。落点限定在
`ludora-jb-host` 仓库的 PS5 入口（现 `ps5-relapse/` 目录），不碰任何 PS4 引擎、共享文件
（`style.css` / `i18n.js` / `i18n/*.js` 只可能新增 key，不改已有内容）、`ludora-site`
的 `/jb` 打包逻辑。

---

## 1. 背景与目标

站长要求：把 PS5 的 WebKit 加载器项目定制到 `ludora.cc/jb` 的 PS5 路由，用于：

1. 加载一批 PS5 插件（ELF payload，见 §6 清单）；
2. 需要时自写插件，用来安装鲁哆啦 `ludora-ps5` 客户端；
3. 所有页面用统一 Ludora 品牌元素、页面与文案。

当前现状：本仓库 PS5 入口只有 `ps5-relapse/`——它 vendored 的是 `ntfargo/Relapse-Exploit`
（MIT，pin `22c56be`），是一条**纯 Relapse 链**：WebKit userland ARW + kernel R/W + 内置
`elfldr`（监听 9021）。它**没有 JS payload 运行时**——跑完 exploit 后只能靠外部工具向
9021 发 ELF，页面本身不能再执行任何逻辑。

## 2. 上游事实（两个候选项目）

用 `gh api` 核对（2026-11-04，`main` 分支）：

| 项目 | 仓库 | 许可 | 定位 |
|---|---|---|---|
| remote-loader | `itsPLK/ps5-webkit-remote-loader` | **MIT**（loader/PC host/client tools）；**GPL-3.0**（`installer/` 及 `installer/common` native helpers） | WebKit userland JS payload loader，监听 TCP **9027**；kernel exploit 是**可选 payload**，不是前置 |
| autoloader | `itsPLK/ps5-webkit-autoloader` | **GPL-3.0** | 离线桌面 App（基于 remote-loader，`.gitmodules` 引它），把 loader 装成 PS5 主屏快捷方式 |

remote-loader 关键事实（读 `README.md` / `docs/API.md` / `src/firmware.js` / 文件树所得）：

- **固件覆盖**：7.00–13.60，`src/firmware.js` 的 `supportedFirmware` 数组共 **35 个版本**。
  与现有 `ps5-relapse/src/firmware.js`（33 版）逐条比对，**remote-loader 多出 `9.05`（Poops
  链专用）与 `11.40` 两个版本**，其余完全一致。两者 Relapse 内核同源（都 adapted from
  `ntfargo` / `Sonic_Iso` 的 Relapse-Exploit），因此**收敛到 remote-loader 不会丢失任何现有
  固件覆盖，只会变多**。
- **payload 形态是 JS**：payload 在页面 realm 执行，入口是 `return async function (api)`，
  通过 `api.p`（内存原语）、`api.chain`（ROP syscall 批处理）、`api.krw`（kernel R/W handle）
  操作。ELF 加载仍走内置 `elfldr`（`shared/elfldr-ps5-v0.26.elf`，监听 9021），由
  `api.launchKexp()` 启动；`shared/kexp-v0.8-24cf6e5.bin` 是 kernel payload shellcode。
- **单文件构建**：`tools/build_standalone.py` 可把 loader + exploit + payload 打进一个
  自包含 HTML，支持 `--js`（注入启动脚本，exploit 前 await 执行）、`--css`（注入样式）、
  `--embed URL=FILE`（离线 fetch 内嵌资产）、`--elfldr`（覆盖内置 ELF loader）、
  `--no-kexp`、`--probe`；多页 host 自动把 9.05 / `?exploit=poops` 路由到 `poops.html`。

**结论：remote-loader 是现有 `ps5-relapse` 的超集。** 它 = Relapse 链（同源）+ JS payload
运行时（9027）+ 更全固件覆盖（+9.05/+11.40）+ 官方单文件构建与注入定制能力。

## 3. 方向选择（已拍板：A）

**方向 A —— 收敛到 remote-loader**（本站长已确认）。

理由：

1. **引入 JS payload 运行时**是核心增量。现有纯 Relapse 链跑完只有 `elfldr`，无法在页面
   内执行任何自定义逻辑；remote-loader 的 payload API 让「自写插件安装鲁哆啦客户端」可以
   **用 JS 写**（复用 `api.launchKexp` 的 kernel 管道），不必走 ELF 编译/交叉编译链路。
2. **固件覆盖只增不减**（见 §2），且 Relapse 内核同源，迁移无回归风险。
3. **官方 `--css`/`--js`/`--embed` 注入**让 Ludora 品牌定制与资产内嵌走上游支持的正路，
   不必在 upstream 源文件里塞品牌（与本仓库 `ps5-relapse/ludora-bridge.js` 的「呈现层留在
   upstream 之外」哲学一致）。

被否定的方向 B（autoloader 桌面 App）作为 GPL-3.0 离线 App，其职责（主屏快捷方式安装）
依赖 remote-loader 且是另一形态（桌面 App），与「ludora.cc/jb 网页路由」不匹配，不采用。

## 4. 架构分层

从外到内四层，每层边界清晰、可独立测试：

```
┌─────────────────────────────────────────────────────────────┐
│ L1 路由/授权层（已存在，不改）                                  │
│   /jb → 手机扫码授权 → /jb/ps5/                               │
├─────────────────────────────────────────────────────────────┤
│ L2 呈现层（Ludora 自有，本次新增/改造）                          │
│   页面壳 + 品牌 + i18n + 插件选择 UI + 状态摘要                 │
│   （--css/--js 注入 或 ludora-bridge 观察 DOM，不碰 upstream）  │
├─────────────────────────────────────────────────────────────┤
│ L3 引擎层（vendored remote-loader，unmodified）                │
│   WebKit exploit（Relapse/Poops）+ JS payload 运行时(9027)     │
│   + kernel 管道（launchKexp → kexp + elfldr 9021）            │
├─────────────────────────────────────────────────────────────┤
│ L4 payload 层                                                │
│   JS payload（remote-loader 原生）                            │
│   ELF payload（经 elfldr 9021 加载，见 §7）                    │
└─────────────────────────────────────────────────────────────┘
```

- **L2 与 L3 的隔离是硬约束**：延续 `ps5-relapse` 的做法，remote-loader 的
  `src/*.js`、`offsets/*.js`、`shared/*.elf`、`payloads/*.js` **一律 unmodified vendored**，
  品牌/文案/状态摘要只加在 L2，不得改 L3 任何一行（否则上游升级时丢失定制）。
- **固件真源**：`src/firmware.js` 的 `supportedFirmware` 数组是唯一真源（35 版），不派生
  连续区间近似值，不在 L2 或 `ludora-site` 路由表里另写一份。

## 5. 决策记录（站长已拍板，2026-11-04）

1. **ELF 插件加载 = 页面内自写 ELF sender**（走「最终完美版本」，不走 PC sender）。页面内
   新增一个 JS payload：从上游 URL fetch ELF 字节，经扩展的 socket 能力直发 `elfldr`（9021）
   加载——用户在网页上点选插件即发，全程无需 PC 端工具。
2. **remote-loader vendor 方式 = 原样 vendor 源文件 + ludora-bridge 观察 DOM**，与现有
   `ps5-relapse` 一致、可 diff、可走 `npm run verify:*`；remote 模式（PC host + 9027）改造成
   static 托管可用。
3. **插件 ELF 不托管 = 页面链接上游**。10 个 ELF 不自托管到 ludora 服务器，页面内 sender
   直接 fetch 上游 URL（GitHub release / 百度网盘链接）。许可不纠结、直接用（见 §8）。

## 6. 插件 manifest（10 个 ELF）

全部已下载、`\x7fELF` 魔数校验通过、sha256 已核（来源：GitHub release / 百度网盘 + tekqart
帖主 `owendswang` 官方仓库）。

| # | 文件 | 大小 | sha256 | 来源（版本） | 许可 |
|---|---|---|---|---|---|
| 1 | OnionHEN.elf | 2357407 | 02b13aa43c1b25bc7fb2e751c6650cc34a2282bf6f5802fcc646fde56fdb345f | aydencharles/onionHEN v0.9.0 | GPL-3.0 |
| 2 | fps60.elf | 448008 | 5331ebf1b69cd272a0491f899b14ca5d59240adee2e69078631473070ddeca9b | eladharels/ps5-60FPS | **无 license** |
| 3 | kstuff-fpkg-1.13-dr-test6.elf | 1818680 | b1f60c1ec1685904d396da16710dc9d5676bf0880abf74c65459c886010b9443 | Darkmor kstuff（百度网盘，非 GitHub） | **闭源** |
| 4 | nanodns.elf | 132352 | fcfb7d47c3b295560ea1603dc015f7c4950353ef0faca16428bd425680ef1fc5 | drakmor/nanoDNS v0.4 | GPL-3.0 |
| 5 | pldmgr_v0.6.1.elf | 2074003 | e10f0c80f8b4a4bf1adcd21670296e71788995aa3744687aa7663d40d922d128 | itsPLK/pldmgr v0.6.1 | GPL-3.0 |
| 6 | ps4mount.elf | 1543448 | 30627513e950f6b7b6b0e5ca43c30e954cdd873a646b8beefe0a4a925ac28479 | gasb07/ps4mount v0.7.2 | GPL-3.0 |
| 7 | shadowmountplus.elf | 1309774 | c1cecf577c2e6a544e04b79c193c63eda37f62fe7a1a0aa44e64a39f2f264a6f | drakmor/ShadowMountPlus 1.7beta11 | GPL-3.0 |
| 8 | syslang-zh-Hans-v0.3.elf | 191840 | 9a5c270219aae9e3df64f03f487da2c3f1c5613026fb04ee6077cf75881874ba | owendswang/ps5-syslang v0.3 | GPL-3.0 |
| 9 | web-file-mgr-v1.13-rc2.elf | 591720 | 91f8e7f52183ce624651b779016bb48cbe7adaad278833a1191ad2e8fc6fbfe3 | owendswang/ps5-web-file-manager v1.13-rc2 | GPL-3.0 |
| 10 | webkit-autoloader-installer_v0.6.1.elf | 1930886 | df4380dd31098b788879191d72477a5062802cb8f41c288429ee22960f74b984 | itsPLK/ps5-webkit-autoloader v0.6.1 | GPL-3.0 |

**链接上游 & 升级源参考**：页面内 sender fetch 的 URL = 上表来源仓库的 release 直链（或
itsPLK 官方镜像站 `itsplk.github.io/ps5-payloads-mirror/` 的同版本直链）；实现期**锁定每个
ELF 的具体 URL 并附 sha256 校验**，任一不符即停。镜像站收录的更新版（`pldmgr_v0.6.3.elf`、
`WebKit-Autoloader-Installer_v0.6.2.elf`、`elfldr_v0.27.elf`；我们内置 elfldr v0.26）作为
后续升版/更新链接参考；`web-file-manager` 镜像收 rc1、我们下的是 rc2（rc2 更新）。这些差异
实现时以清单为准逐条核对，不在本设计展开。

排除项：`mPSSXPLOIT` —— 站长明确「不碰、不下载」。它是 Relapse 漏洞链本身，不是可加载插件。

## 7. 数据流

**主流程（页面 → exploit → kernel → 可执行态）：**

1. PS5 浏览器打开 `ludora.cc/jb` → 手机扫码授权 → 跳 `/jb/ps5/`（L1，已存在）。
2. L2 页面壳加载，L3 remote-loader 启动：WebKit userland ARW + ROP worker → kernel R/W。
3. `launchKexp` 管道：加载 `kexp.bin`（kernel payload）→ 启动 `elfldr`（9021）→ 此刻主机
   进入「可加载 payload」态。
4. **JS payload 路径**（remote-loader 原生）：L2 内嵌 JS payload，`api.chain` 做 ROP，
   `api.krw` 用 kernel R/W——自写「安装鲁哆啦客户端」插件与「页面内 ELF sender」都走这条。
5. **ELF payload 路径**：页面内自写 ELF sender fetch 上游 ELF 字节，经 socket 直发 `elfldr`
   （9021）加载（见 §5 决策 1）。

**状态呈现（L2）**：沿用 `ludora-bridge.js` 的 `MutationObserver` 手法，观察 L3 引擎写进
`#console`/状态节点的文本，镜像成 Ludora 品牌摘要（`relapse.success` / `.failed` /
`.unsupported` / `.running`），成功/失败分类只依据 vendored 引擎自己输出的字面串，绝不
在 payload 报告前替它下结论；raw 日志不隐藏。

**错误处理**：`supportedFirmware` 数组之外 → 「unsupported」态；exploit 失败 → 「failed」态；
上游改了字面串 → 摘要 fail-open 回中立「running」态，raw 日志仍为真源。

## 8. 许可与 borrow 登记

- **引擎 remote-loader**：loader/PC host/client tools 为 **MIT**，`installer/` 及
  `installer/common` native helpers 为 **GPL-3.0**（顶层 `shared/` 的 `elfldr`/`kexp`
  二进制属 loader，MIT）。若只用 loader 部分（不用 installer 装主屏快捷方式），只需保留
  MIT 通知；一旦引入 installer，GPL-3.0 的传染/源码义务随之而来，须单独评估。
- **10 个插件 ELF**（§6）：9 个 GPL-3.0、`fps60.elf` **无 license（默认 All Rights Reserved）**、
  `kstuff` **闭源**。站长已拍板：**不自托管、页面链接上游**，许可不纠结、直接用（§5 决策 3）。
  许可事实仅记录备查，不再据此做托管取舍。
- 借鉴新源须登记 `docs/borrow-map.md`（本仓库尚无此文件，本次一并创建），登记
  remote-loader（MIT/GPL-3.0）、relapse（MIT，已 pin `22c56be`）、10 个插件的上游出处与许可。

## 9. 验收标准

- `npm run verify:host-pages` / `npm run verify:host-runtime` / `npm run test:host` 全绿
  （L2 页面壳的 `src=`/`href=` 引用、无 manifest 误挂、现有引擎无关测试）。
- L3 引擎 unmodified：`git diff` 应显示 vendored 的 remote-loader 源文件与原版字节一致，
  只有 L2 自有文件（`index.html`/`ludora-bridge.js`/`remote-loader.css`）与新增 i18n key。
- **真实运行验收（铁律）**：至少跑通一次「真进程起页面 + 真实请求打通」，不能只靠组件测试
  / build。PS5 真机验证（WebKit exploit、elfldr 9021 实发 ELF、JS payload 实跑）是本仓库
  一贯的「无硬件待验」边界——**未真机验证前不得标「完成」**，须在验收记录里写明未覆盖项。
- 逐个插件对照 §6 manifest 的 sha256，任一不符即停，不得用「大小对」冒充内容对。

## 10. 明确不做 / 待真机验证

- 不碰 PS4 引擎、`ps5/`（旧 GamerHack 占位）、共享文件、`ludora-site` 打包逻辑。
- 不引入 autoloader 桌面 App（方向 B）。
- 不下载 mPSSXPLOIT（站长明确排除）。
- 真机验证清单（无 PS5 硬件时保留为 open item）：exploit 链真实跑通、elfldr 9021 实发 ELF、
  JS payload 实跑、PS5 浏览器是否仍需旧 WebKit 风格 CSS 兼容（与 `ps5-relapse` spec 同款
  open item）、AppCache/离线缓存是否需要（remote-loader 用 `--embed` 内嵌而非 AppCache）。

---

## 交付顺序（进入实现后）

1. （已拍板）见 §5 决策记录。
2. 创建 `docs/borrow-map.md` + vendor remote-loader 源文件 + L2 页面壳/bridge。
3. 落地插件 manifest（上游 URL 清单 + sha256 校验脚本），10 个 ELF 全部链接上游、不自托管。
4. 自写「页面内 ELF sender」JS payload（§5 决策 1）+「安装鲁哆啦客户端」JS payload。
5. 真实运行验收 + 真机边界记录。
