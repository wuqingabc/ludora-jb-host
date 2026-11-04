# PS5 无 PC 离线越狱入口（autoloader 品牌化）设计

**Date:** 2026-11-04
**Status:** Design（站长已拍板关键决策，待 review）
**Scope:** 本文是 [2026-11-04-ps5-webkit-remote-loader-host-design.md](./2026-11-04-ps5-webkit-remote-loader-host-design.md)
（下称「昨晚 spec」）的**补充**，只覆盖昨晚 spec 明确排除的场景：**无 PC 用户第一次越狱**。
昨晚 spec 的 L2/L3/L4 资产、插件 manifest、borrow 登记一律**复用**，本文不再重复。

---

## 1. 背景与目标

昨晚 spec 解决的问题是「PS5 有地址栏，直接访问 `ludora.cc/jb`」的**网页路由**场景（方向 A，
收敛到 remote-loader），并在 §10 否定了 autoloader（方向 B）——那个否定针对「网页路由」场景
是对的：有地址栏何必装主屏。

但存在另一类用户：**没有电脑、无法在 PS5 上直接敲网址、只会在 Settings 里点 User's Guide**。
他们的唯一 WebKit 入口是 User's Guide（固定访问 `manuals.playstation.net`），没有地址栏可输
`ludora.cc/jb`。要服务这类用户，必须：

1. 把 `manuals.playstation.net` 通过 DNS 劫持指向我们的 host；
2. host 用自签名证书（CN=manuals.playstation.net）在 443 提供 exploit 页；
3. exploit 装「主屏快捷方式」到 PS5，之后**离线**可用（这正是 autoloader 的职责）。

**目标**：把昨晚 ps5-loader 的品牌化资产（L2 呈现层 + L3 vendored remote-loader + elf-send
ELF sender + plugins.json 9 插件）打包成 **autoloader 的 offline chain page**，让无 PC 用户
装主屏后离线启动，看到的是鲁哆啦品牌 + 9 插件列表，而不是 upstream 的白板 Payload Manager。

## 2. 真机验证事实（2026-11-04 白天，固件 9.40）

用 upstream autoloader `webkit-autoloader-host_v0.6.2.py` 在真机 9.40 上验证了完整链路，**每一环都过**：

1. DNS 劫持：PS5 把 DNS 指向开发机（192.168.3.128:53），`manuals.playstation.net` 被解析到该 IP。
2. 自签名 HTTPS：PS5 接受 CN=manuals.playstation.net 的自签证书，TLS 1.3 握手成功。
3. 固件识别：UA `PlayStation 5/9.40` → 路由到 Relapse 链（`index.html`）。
4. WebKit exploit 运行成功 → 内核越狱。
5. autoloader 装主屏成功（"WebKit Autoloader" 图标出现）。
6. 重启后主屏启动 autoloader 可用（离线）。

**结论：无 PC 越狱链路在真机 9.40 完全可行。** 缺口只有一个：装出来的是 upstream 白板
（unified-autoloader / Payload Manager），不含我们 plugins.json 的 9 个 payload —— 这正是
品牌化要补的。

## 3. 决策记录（站长已拍板，2026-11-04）

1. **payload 预装形态 = 方案 1（预装列表 + URL 直载）**：复用昨晚 elf-send 的「页面内 ELF
   sender」，把 9 个插件的**列表**打进 chain page，用户点选时 elfldr(9021) 联网直载上游 ELF。
   不把 9 个 ELF 捆绑进页面（违背昨晚 spec §5 决策 3「不自托管、链接上游」，且页面会膨胀几十 MB）。
   「离线」指 exploit 链 + 页面不依赖我们的服务器；点选加载 ELF 那一刻 PS5 需联网。
2. **品牌化深度 = 完整品牌化（重编译 installer.elf）**：主屏 app 名改「鲁哆啦 Ludora」+ Ludora
   图标。不用 upstream 现成 installer.elf（否则主屏名仍是 "WebKit Autoloader"）。
3. **交付顺序 = 先本地跑通再上 VPS**：先 fork + 改构建 + 本地 host.py 真机验证品牌化版本，
   通了再部署共享 VPS（nginx SNI 分流 443 + 53 DNS）。
4. **主屏图标 = image2 生图**：不用 autoloader 原图标。image2（gpt-image）结合 ludora 图标 +
   autoloader 图标生成一个新图标，布局「ludora 大为主体、autoload 小图标右下角」。生成后转
   PS5 要求的 icon0.png 尺寸/格式塞进 installer 的 `assets/`。

## 4. 复用 vs 新增（硬边界）

| 复用（昨晚已做，一律不重做） | 新增（本文范围） |
|---|---|
| L2：`ludora-bridge.js`（236 行）/ `loader.css` / `plugins.json` 9 插件 | 构建层：把 L2+L3+L4 打包成 autoloader 的 **standalone chain page** |
| L3：vendored remote-loader（`src/*.js` + `offsets/` 35 版 + `shared/elfldr/kexp`），unmodified | `installer.elf` 重编译（品牌名 + image2 图标） |
| L4：`ludora-payloads/elf-send.js`（页面内 ELF sender，URL 直载） | `host.py` 打包（build_host.py，DNS 53 + HTTPS 443） |
| payload 队列 `[relapse/poops, elf-send]` + `window.STANDALONE` 机制 | （后置）VPS 共享部署 |
| 路由接线 + 35 固件真源（`src/firmware.js`） | |

**一句话**：昨晚做的是「同一套品牌化资产的网页交付」，本文做的是「同一套资产的离线交付」。
L2/L3/L4 的**内容**一份都不重做，只加「standalone 打包 + 安装 + host」这一层。

## 5. 技术方案（构建层）

### 5.1 上游事实

autoloader（`itsPLK/ps5-webkit-autoloader`，GPL-3.0）基于 remote-loader，`make page` 用
remote-loader 的 `tools/build_standalone.py` 把 payload 队列打包成单文件 standalone HTML：

```
build_standalone.py \
    payloads/elfldr-check.js payloads/<chain>.js payloads/autoload.js::<捆绑ELF> \
    --elfldr ... --css <品牌CSS> --js <品牌JS> --embed <虚拟URL>=<文件> -o <chain>.html
```

- `window.STANDALONE.payloads = [{name, path, args, source}]` 队列由 `src/standalone.js` 的
  `runPayloadQueue` 顺序执行；`api.args` 传参；krw（kernel R/W）跨 payload 共享 —— 与昨晚
  ps5-loader 的 `build-page.mjs` + `window.STANDALONE` 机制**完全同源**（我们就是复刻它）。
- `--js`（startup scripts）在 module graph 执行**前**按序 await 执行，可 `document.createElement`
  构建 DOM、通过 `window` 共享状态 —— 这是把 ludora-bridge 接进 standalone 的正路。
- `--embed URL=FILE` 让页面内 `fetch(URL)` 走 inline（remote-loader 的 `inlinefetch.js`），
  用于把 `plugins.json`、i18n、二维码等资产内联进单文件。
- `--elfldr` 覆盖内置 ELF loader 二进制（`shared/elfldr-ps5-v0.26.elf`，与昨晚 ps5-loader 同款）。

### 5.2 fork 与仓库归属

**fork 成独立仓库 `ludora-ps5-autoloader`**（GPL-3.0，含 remote-loader / elfldr /
unified-autoloader 三个 submodule），而非塞进 MIT 的 ludora-jb-host：昨晚 spec §8 已提示
「一旦引入 installer，GPL-3.0 传染/源码义务随之而来」，独立仓库可把 GPL-3.0 与 MIT 内容隔离。
（站长 2026-11-04 已拍板独立仓库。）

### 5.3 改 `make page`（品牌化 chain page）

payload 队列从 `[elfldr-check, chain, autoload::捆绑ELF]` 改为：

```
[elfldr-check, chain(relapse|poops), elf-send]
```

- **保留 `elfldr-check.js`**（autoloader 成熟设计）：先连 9021 探测已有 loader，有则
  `api.stopQueue()` 跳过后续，避免重复 kernel exploit（主屏快捷方式会被反复启动，重复
  exploit 有崩溃风险）。
- **去掉 `autoload.js` + `--embed 捆绑ELF`**：换成我们的 `elf-send.js`（URL 直载交互）。
- `elf-send.js` 直接取昨晚 `ludora-payloads/elf-send.js`（复用，`return async function(api)`）。
- `--css` 注入 `loader.css`；`--js` 注入品牌 DOM 构建脚本 + `ludora-bridge.js`（复用）。
- `--embed` 内联 `plugins.json`（让 bridge 的 `fetch("./plugins.json")` 走 inline）。

### 5.4 L2 资产的 standalone 适配（复用 + 最小改动，不重写）

昨晚 ps5-loader 是「网站多文件」形态，brand DOM 在 `index.html`、`plugins.json` 靠 `fetch`、
i18n/二维码引用父目录 `../`。autoloader 是「单文件 HTML」。适配点：

1. **品牌 DOM**：昨晚的 `#brand/#state/#det/#plugins/#plugins-hint/#console` 等 DOM 结构，
   改由 `--js` 注入的 startup script 用 `document.createElement` 重建（`#console` 必须保留
   verbatim，vendored `src/site.js` 在 module load 时 `getElementById("console")`）。
   `ludora-bridge.js` 的观察/渲染/交互逻辑**原样复用**，只把「假设 DOM 已存在」改成「DOM
   由前置 startup script 先建好」。
2. **plugins.json**：`--embed plugins.json`，bridge 的 `fetch("./plugins.json")` 走 inline fetch。
3. **i18n**：昨晚三语言（zh-CN/zh-TW/en-US）内联；若内联成本高，standalone 先简体中文单语言
   （open item，实现期定）。
4. **store-qr.png（鲁哆啦在线下载二维码）**：内联保留（越狱后引导装 app 的场景仍适用）。

### 5.5 installer.elf 重编译（品牌名 + 图标）

- 改 autoloader `include/installer_config.h` 的 app 名 / title ID / log 前缀 → 鲁哆啦。
- 图标：`assets/icon.svg` → image2 生图结果（ludora 大 + autoload 小右下角）转 SVG/PNG，
  `tools/gen_icons.py` 派生 icon0.png 等。
- 编译用 PS5 SDK（prospero-clang）：复用 **ludora-ps5 的 docker SDK**（`docker/` +
  `scripts/fetch-sdk.sh`），不在本机裸装 SDK。

### 5.6 host.py 打包

`make host HOST_PAYLOAD=<installer.elf>` → `build_host.py` 把两个 chain page（Relapse 默认
`index.html`、Poops `poops.html`）内嵌成单文件 `ludora-ps5-autoloader-host.py`，`--name`
改为「鲁哆啦」。运行时监听 DNS 53 + HTTPS 443（自签 CN=manuals.playstation.net），其余域名
NXDOMAIN（防 PS5 联网上报/更新）。

## 6. 交付阶段

1. **品牌化 chain page**（`ludora-ps5-autoloader`）：fork + 改 `make page` + L2 资产 standalone
   适配 + `make page` 产出鲁哆啦版 `relapse.html`/`poops.html`。
2. **installer.elf 重编译**：品牌名 + image2 图标（ludora-ps5 docker SDK）。
3. **host.py 打包 + 本地真机验证**：`make host` 出单文件 host.py，开发机跑起来，真机 9.40 走
   DNS 劫持 + User's Guide，验证「装主屏 → 主屏名鲁哆啦 → 离线启动 → 9 插件列表可选」。
4. **VPS 共享部署（后置）**：nginx SNI 分流 443（`manuals.playstation.net` → host 内容，
   `www.ludora.cc` → 现有网站）+ 53 DNS。细节等阶段 1-3 跑通后另文展开。

## 7. 验收标准

- 复用资产不改动：`git diff` 应显示昨晚的 `ludora-bridge.js`/`loader.css`/`plugins.json`/
  `elf-send.js` **内容**一致（standalone 适配只增前置 DOM 构建脚本，不改 bridge 逻辑）；vendored
  remote-loader `src/*.js`/`offsets/*.js`/`shared/*.elf` 与原版字节一致。
- `make page` 产出 standalone HTML，`build_standalone.py` 自带 `--probe`（`probe_standalone.js` +
  `boot_probe.js`）通过。
- **真实运行验收（铁律）**：真机 9.40 完整走一遍 DNS 劫持 → User's Guide → exploit → 装主屏 →
   **主屏名 = 鲁哆啦** → 重启 → 离线启动 → 9 插件列表可见可点选 → 点选至少一个插件 ELF 由
  elfldr 实发实载。未真机验证前不得标「完成」，验收记录写明未覆盖项。
- installer 图标为 image2 生成结果（ludora 大 + autoload 小右下角），非 upstream 原图标。
- 逐个插件对照昨晚 spec §6 manifest 的 sha256，任一不符即停。

## 8. 明确不做 / open items

- 不重复昨晚 spec 已定的 L2/L3/L4 内容、插件 manifest、borrow 登记。
- 不托管任何插件 ELF（延续「链接上游」）。
- open items：i18n 内联方式（单语言 vs 三语言内联）、
  elfldr-check 在真机上「跳过重复 exploit」是否如预期、image2 图标在 PS5 主屏的实际观感。
