# PS5 无 PC 离线越狱入口（autoloader 品牌化）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把昨晚 ps5-loader 的品牌化资产（L2 呈现 + L3 vendored remote-loader + elf-send + plugins.json）打包成 autoloader 的 offline chain page，让无 PC 用户在真机 9.40 走 DNS 劫持 + User's Guide 装主屏「鲁哆啦」，离线启动后看到 9 插件列表。

**Architecture:** fork 上游 `itsPLK/ps5-webkit-autoloader` 成独立仓库 `ludora-ps5-autoloader`（GPL-3.0 与 MIT 隔离）；改 `make page` 的 payload 队列为 `[elfldr-check, chain, elf-send]`（去掉 autoload ELF 捆绑），用 `--css`/`--js` 注入昨晚的 `loader.css`/`ludora-bridge.js`/新建 `build-dom.js`；`installer.elf` 重编译（主屏名鲁哆啦 + image2 图标）；`make host` 出单文件 host.py。L2/L3/L4 内容一份不重做。

**Tech Stack:** Python3（build_standalone.py / build_host.py / gen_version.py）、Node（plugins-data 生成 + `--probe`）、C（installer.elf，prospero-clang via docker SDK）、GPL-3.0 上游。

**Spec:** `../specs/2026-11-04-ps5-offline-autoloader-entry-design.md`（本文据它展开，executor 两份一起读）

## Global Constraints

- **GPL-3.0**：本仓库是 GPL-3.0 fork，installer 及所涉 native helper 的源码义务随分发生效；不把 GPL 内容塞进 MIT 的 ludora-jb-host。
- **复用不改动**：`loader.css`/`ludora-bridge.js`/`elf-send.js`/`plugins.json` 的**内容**从 ludora-jb-host 原样复制（bridge 只加一行向后兼容分支，见 Task 2）；vendored remote-loader `src/*.js`/`offsets/*.js`/`shared/*.elf` 一律不改。
- **不托管插件 ELF**：plugins.json 里的 9 个 URL 指向上游 release，sha256 保留；本仓库不下载/内嵌任何插件 ELF。
- **真实运行验收**：Task 6 的真机 9.40 全链路是「完成」硬门，未跑通前不得标完成；`--probe` 与 `make test` 全绿不替代真机。
- **语言**：commit message / 文档用简体中文；技术标识符除外。
- **工具链**：Node ≥22、python3、docker；installer 编译必须进 SDK 容器（prospero-clang），不在本机裸装。
- **多 session 并发**：本仓库是新建独立仓库，但 ludora-jb-host 侧资产用「复制」不「引用」，避免跨仓库共享工作树冲突（见父规范「跨仓库共享代码」铁律）。

---

## 文件结构

新建仓库 `ludora-ps5-autoloader/`（fork 后增量）：

| 文件 | 职责 |
|---|---|
| `payloads/elf-send.js`（新增） | 从 ludora-jb-host 复制的页面内 ELF sender（URL 直载） |
| `frontend/autoloader/loader.css`（替换） | 从 ludora-jb-host 复制的品牌样式（覆盖 #console 全屏 + 品牌 DOM 样式） |
| `frontend/autoloader/ludora-bridge.js`（新增） | 复用 + 一行 `window.LUDORA_PLUGINS` 分支 |
| `frontend/autoloader/build-dom.js`（新增） | startup script：createElement 建品牌 DOM + 内联 `window.LUDORA_PLUGINS` |
| `frontend/autoloader/plugins.json`（新增） | 从 ludora-jb-host 复制的 9 插件清单 |
| `tools/build-plugins-data.mjs`（新增） | 把 plugins.json 生成 `build/plugins-data.js`（`window.LUDORA_PLUGINS = [...]`） |
| `Makefile`（改） | `page`/`host` 队列 + PAGE_CSS/PAGE_JS + 去 autoload ELF 捆绑 |
| `tools/download_deps.sh`（改） | 去掉 unified-autoloader 下载，只留 elfldr |
| `assets/param.json.template`（改） | titleName → 鲁哆啦 Ludora（主屏名） |
| `include/installer_config.h` / `include/wkali.h`（改） | APP_NAME / TITLE_ID 品牌化 |
| `tools/gen_version.py`（改） | `--title` → 鲁哆啦 |
| `assets/icon.svg` / `assets/icon0.png`（改） | image2 生图结果 |

---

### Task 1: fork 建仓 + 初始化 submodule

**Files:**
- Create: `/Users/qingwu/Development/Game/ludora-ps5-autoloader/`（整个仓库）

**Interfaces:**
- Produces: 可构建的 autoloader fork，3 个 submodule 就位。

- [ ] **Step 1: 克隆上游（含 submodule）**

```bash
cd /Users/qingwu/Development/Game
git clone --recurse-submodules https://github.com/itsPLK/ps5-webkit-autoloader.git ludora-ps5-autoloader
```

若 submodule 拉取失败（国内网络），先裸 clone 后单独代理预取，参考 memory `reference_forwarder_build_hacbrewpack_proxy.md`：

```bash
cd ludora-ps5-autoloader
env ALL_PROXY=socks5://127.0.0.1:10808 git submodule update --init --recursive
```

- [ ] **Step 2: 建 gitee 私有仓并推分支**

用 memory `reference_gitee_token_and_repo_creation.md` 的 token（`~/.winamz/secrets/gitee-token.env`，`wuqingabc_admin`，v5 API）建空仓 `ludora-ps5-autoloader`，然后：

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
source ~/.winamz/secrets/gitee-token.env   # 提供 GITEE_TOKEN
git remote add gitee "https://wuqingabc_admin:${GITEE_TOKEN}@gitee.com/<owner>/ludora-ps5-autoloader.git"
git push -u gitee main
```

- [ ] **Step 3: 验证**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
git submodule status          # 三个 submodule 各显示一个 commit hash
ls third_party/ps5-webkit-remote-loader/tools/build_standalone.py   # 应存在
make print-version            # 打印 0.6.2-dev-<hash> 之类，不报错
```

Expected: submodule 三个 hash 齐全；`make print-version` 无报错。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "chore: fork itsPLK/ps5-webkit-autoloader 为 ludora-ps5-autoloader

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push gitee main
```

---

### Task 2: 落 L2/L4 资产（复制 + 最小适配）

**Files:**
- Create: `ludora-ps5-autoloader/payloads/elf-send.js`（复制）
- Create: `ludora-ps5-autoloader/frontend/autoloader/loader.css`（复制，覆盖同名上游文件）
- Create: `ludora-ps5-autoloader/frontend/autoloader/ludora-bridge.js`（复制 + 一行分支）
- Create: `ludora-ps5-autoloader/frontend/autoloader/plugins.json`（复制）

**Interfaces:**
- Consumes: ludora-jb-host 的 `ps5-loader/{loader.css, ludora-bridge.js, plugins.json, ludora-payloads/elf-send.js}`
- Produces: 待 Task 3 接线的前端资产；`ludora-bridge.js` 新增 `window.LUDORA_PLUGINS` 数据通道（Task 3 的 build-dom.js 会填这个全局）。

- [ ] **Step 1: 复制四个文件**

```bash
SRC=/Users/qingwu/Development/Game/ludora-jb-host/ps5-loader
DST=/Users/qingwu/Development/Game/ludora-ps5-autoloader/frontend/autoloader
cp "$SRC/loader.css"        "$DST/loader.css"
cp "$SRC/plugins.json"      "$DST/plugins.json"
cp "$SRC/ludora-bridge.js"  "$DST/ludora-bridge.js"
cp "$SRC/ludora-payloads/elf-send.js" /Users/qingwu/Development/Game/ludora-ps5-autoloader/payloads/elf-send.js
```

- [ ] **Step 2: ludora-bridge.js 加 `window.LUDORA_PLUGINS` 分支**

`loadPlugins()` 里，在 `fetch("./plugins.json", ...)` 之前加一个短路分支（唯一改动，向后兼容网站多文件形态）：

```js
  function loadPlugins() {
    if (window.LUDORA_PLUGINS) {
      plugins = Array.isArray(window.LUDORA_PLUGINS) ? window.LUDORA_PLUGINS : [];
      renderPlugins(plugins);
      return;
    }
    fetch("./plugins.json", { cache: "no-store" })
```

（其余 `loadPlugins` 原样保留。为什么加这一行：standalone 下 `fetch("./plugins.json")` 在 inline fetch 安装**之前**执行——`installInlineFetch` 由 `src/site.js` 在 module boot 时安装，而 bridge 是 `--js` startup script，先于 boot 运行，原生 fetch 会失败。数据改由 Task 3 的 build-dom.js 经 `window.LUDORA_PLUGINS` 注入。）

- [ ] **Step 3: 验证四个文件与源 diff 一致（bridge 只多 Step 2 那一行）**

```bash
SRC=/Users/qingwu/Development/Game/ludora-jb-host/ps5-loader
DST=/Users/qingwu/Development/Game/ludora-ps5-autoloader/frontend/autoloader
diff "$SRC/loader.css"   "$DST/loader.css"    && echo "loader.css 一致"
diff "$SRC/plugins.json" "$DST/plugins.json"  && echo "plugins.json 一致"
diff "$SRC/ludora-payloads/elf-send.js" /Users/qingwu/Development/Game/ludora-ps5-autoloader/payloads/elf-send.js && echo "elf-send.js 一致"
diff <(grep -v 'if (window.LUDORA_PLUGINS)' "$SRC/ludora-bridge.js") \
     <(grep -v 'if (window.LUDORA_PLUGINS)' "$DST/ludora-bridge.js") && echo "bridge 仅多 LUDORA_PLUGINS 分支"
```

Expected: 前三个 diff 空；最后一个 diff 空（说明 bridge 除新增分支外逐字节一致）。

- [ ] **Step 4: 提交**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
git add payloads/elf-send.js frontend/autoloader/loader.css frontend/autoloader/ludora-bridge.js frontend/autoloader/plugins.json
git commit -m "feat(ps5-loader): 落 L2/L4 品牌资产（loader.css/ludora-bridge/elf-send/plugins.json）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push gitee main
```

---

### Task 3: 构建接线（Makefile + build-dom.js + plugins-data + download_deps）

**Files:**
- Create: `frontend/autoloader/build-dom.js`
- Create: `tools/build-plugins-data.mjs`
- Modify: `Makefile`（`PAGE_CSS`/`PAGE_JS`/`PAGE_CONFIG`、`page`/`host`/`dev` target、`payload-deps`）
- Modify: `tools/download_deps.sh`

**Interfaces:**
- Consumes: Task 2 的 `loader.css`/`ludora-bridge.js`/`elf-send.js`/`plugins.json`；上游 `payloads/{elfldr-check.js,relapse.js,poops.js}`（submodule 内）。
- Produces: `make page` 产出 `build/autoloader/{relapse,poops}.html`，`--probe` 通过；`window.STANDALONE.payloadNames = ["elfldr-check", "relapse", "elf-send"]`；`window.LUDORA_PLUGINS` 携带 9 插件。

- [ ] **Step 1: 写 `tools/build-plugins-data.mjs`**

```js
// 把 frontend/autoloader/plugins.json 内联成 build/plugins-data.js 的
// window.LUDORA_PLUGINS（standalone 下 ludora-bridge.js 不经 fetch 直接读它）。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(join(root, "frontend/autoloader/plugins.json"), "utf8"));
const plugins = Array.isArray(src) ? src : (src.plugins || []);
const out = "window.LUDORA_PLUGINS = " + JSON.stringify(plugins, null, 2) + ";\n";
const dest = join(root, "build/plugins-data.js");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, out);
console.log("wrote " + dest + " (" + plugins.length + " plugins)");
```

- [ ] **Step 2: 写 `frontend/autoloader/build-dom.js`**

复刻昨晚 `ps5-loader/index.html` body 的品牌 DOM（`#brand`/`#wrap`/`#state`/`#det`/`#plugins-hint`/`#plugins`；**不建** `#console`——它在 remote-loader `index.html` 里已有，必须保留 verbatim；广告位 `.ad-slot` 因 store-qr.png 内联成本高，本版跳过，记 open item）：

```js
// startup script：在 module boot 前用 createElement 建品牌 DOM（standalone body
// 只有 #console），并暴露 window.LUDORA_PLUGINS 给 ludora-bridge.js。
(function () {
  'use strict';
  var body = document.body;
  function el(tag, id, cls) {
    var n = document.createElement(tag);
    if (id) n.id = id;
    if (cls) n.className = cls;
    body.appendChild(n);
    return n;
  }
  var brand = el('div', 'brand');
  var mark = el('span', null, 'brand-mark'); mark.textContent = 'L';
  var name = el('b', null, null); name.textContent = '鲁哆啦 Ludora';
  var kicker = el('span', null, 'brand-kicker'); kicker.textContent = '主机工具';
  brand.appendChild(mark); brand.appendChild(name); brand.appendChild(kicker);

  var wrap = el('div', 'wrap');
  var eyebrow = el('div', null, 'eyebrow'); eyebrow.textContent = '主机工具';
  var state = el('div', 'state'); state.textContent = '正在执行漏洞利用，请勿离开此页面';
  var det = el('div', 'det');
  var hint = el('div', 'plugins-hint'); hint.textContent = '等待越狱完成…';
  var plugins = el('div', 'plugins');
  wrap.appendChild(eyebrow); wrap.appendChild(state); wrap.appendChild(det);
  wrap.appendChild(hint); wrap.appendChild(plugins);
})();
```

（`loader.css` 已针对这些 id/class 写样式，结构与昨晚 index.html 对齐即可直接复用。）

- [ ] **Step 3: 改 `Makefile`**

`PAGE_CSS`/`PAGE_JS` 块改为指向品牌资产（保留 `PAGE_CONFIG` 前置，它生成 `window.WKAL_PAGE`，供版本显示）：

```make
PAGE_CSS ?= frontend/autoloader/loader.css
PAGE_JS ?= frontend/autoloader/build-dom.js frontend/autoloader/ludora-bridge.js
PAGE_CONFIG := build/page-config.js
```

`page` target 的 `$(BUILDER)` 行改为（去掉 autoload.js + `--embed autoload.elf`，换成 elf-send.js + `--embed plugins.json`，并在 build 前先跑 plugins-data）：

```make
page: payload-deps
	@mkdir -p build/autoloader
	$(PYTHON) tools/gen_version.py --page-config $(PAGE_CONFIG)
	node tools/build-plugins-data.mjs
	@for chain in $(CHAINS); do \
	    echo "$(BUILDER) payloads/$$chain.js -> build/autoloader/$$chain.html"; \
	    $(BUILDER) $(CURDIR)/payloads/elfldr-check.js payloads/$$chain.js $(CURDIR)/payloads/elf-send.js \
	        --title "$(BUILD_TITLE)" $(PAGE_FLAGS) \
	        --embed plugins.json=$(CURDIR)/frontend/autoloader/plugins.json \
	        -o $(CURDIR)/build/autoloader/$$chain.html || exit 1; \
	done
```

`host` target 的两条 `$(BUILDER)` 行同样把 `$(CURDIR)/payloads/autoload.js::$(HOST_PAYLOAD_VIRTUAL)` 与 `--embed $(HOST_PAYLOAD_VIRTUAL)=$(HOST_PAYLOAD)` 换成 `$(CURDIR)/payloads/elf-send.js` 与 `--embed plugins.json=$(CURDIR)/frontend/autoloader/plugins.json`（`--name` 参数在 Task 5 改）。

> 说明：`--embed plugins.json=...` 的虚拟 URL 是 `plugins.json`，而 bridge 里 `fetch("./plugins.json")` 的 url `"./plugins.json"` 经 `inlinefetch.js` 的 `matchEmbedded` 用 `url.indexOf("/" + path)` 后缀匹配命中——不过 Task 2 已让 bridge 走 `window.LUDORA_PLUGINS`，`--embed` 只是双保险，避免 bridge 分支失效时页面仍能兜住。

- [ ] **Step 4: 改 `tools/download_deps.sh`（去掉 unified-autoloader）**

删除 `PAYLOAD_SUBMODULE`/`PAYLOAD_REPO`/`PAYLOAD_DEST`/`PAYLOAD_TAG` 相关变量，删掉结尾 `download_release "$PAYLOAD_REPO" ...` 一行，删掉 `if [ ! -e "$PAYLOAD_SUBMODULE/.git" ]` 那段校验。只保留 elfldr 的下载与校验。

- [ ] **Step 5: 跑 `make page` 并验证**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
make page
python3 third_party/ps5-webkit-remote-loader/tools/build_standalone.py \
  payloads/relapse.js --check   # 冒烟：单链 check（不应报问题）
```

Expected: 产出 `build/autoloader/relapse.html`、`build/autoloader/poops.html`；`--check` 无 "check failed"。

- [ ] **Step 6: 用 `--probe` 验证 standalone 结构**

```bash
python3 third_party/ps5-webkit-remote-loader/tools/build_standalone.py \
  payloads/elfldr-check.js payloads/relapse.js payloads/elf-send.js \
  --title "鲁哆啦 Ludora" \
  --elfldr shared/elfldr-ps5-v0.26.elf=build/deps/elfldr.elf \
  --css frontend/autoloader/loader.css \
  --js frontend/autoloader/build-dom.js --js frontend/autoloader/ludora-bridge.js \
  --embed plugins.json=frontend/autoloader/plugins.json \
  -o /tmp/probe-relapse.html --probe
```

Expected: `probe_standalone.js` 与 `boot_probe.js` 均 0 失败；输出里 `window.STANDALONE.payloadNames` 含 `elfldr-check`/`relapse`/`elf-send`，`window.LUDORA_PLUGINS` 有 9 项。

- [ ] **Step 7: 提交**

```bash
git add frontend/autoloader/build-dom.js tools/build-plugins-data.mjs Makefile tools/download_deps.sh
git commit -m "feat(ps5-loader): 接 standalone 品牌化构建（elf-send 队列 + build-dom + plugins-data）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push gitee main
```

---

### Task 4: installer.elf 品牌化（主屏名 + image2 图标）

**Files:**
- Modify: `assets/param.json.template`
- Modify: `include/installer_config.h`
- Modify: `include/wkali.h`
- Modify: `tools/gen_version.py`
- Modify: `assets/icon.svg` / `assets/icon0.png`（image2 生图落地）

**Interfaces:**
- Consumes: 上游 `src/{main.c,http_server.c}` + `third_party/ps5-webkit-remote-loader/installer/common/*`
- Produces: `installer.elf`，主屏 app 名「鲁哆啦 Ludora」、图标为 image2 生图。

- [ ] **Step 1: 改主屏名（param.json.template）**

`localizedParameters.en-US.titleName` 改为鲁哆啦：

```json
    "localizedParameters": {
        "defaultLanguage": "en-US",
        "en-US": {
            "titleName": "鲁哆啦 Ludora"
        }
    }
```

（去掉 `v[[VERSION_PLACEHOLDER]]`，主屏名就是「鲁哆啦 Ludora」；`deeplinkUri`/`titleId` 不变。）

- [ ] **Step 2: 改 native 侧品牌标识**

`include/installer_config.h`：

```c
#define INSTALLER_APP_NAME "鲁哆啦 Ludora"
```

`include/wkali.h` 的 title id 改为自用（避免与 upstream 冲突）：

```c
#define WKAL_TITLE_ID "LUDO00001"
```

`tools/gen_version.py` 的 `--title` 分支：

```python
        print(f"鲁哆啦 Ludora v{info['full']} (built {info['build_time']})")
```

- [ ] **Step 3: image2 生图（ludora 大 + autoload 小右下角）**

用 image2（CIOS gpt-image，codex 订阅通道，见 memory `reference_game_poster_content_pipeline_cioss.md`）生成 **1024×1024 PNG**：主体鲁哆啦 Ludora 图标，右下角叠加 autoloader 原图标（`/tmp/autoloader-src/assets/icon.svg` 的蓝色径向球）。产出存 `/tmp/ludora-autoload-icon.png`。生图规则：中文真文字一律不压在图上（主屏图标无文字，仅图形），Image2 只出图形。

- [ ] **Step 4: 落地图标（绕开 gen_icons.py 的 SVG 依赖）**

image2 出位图，`tools/gen_icons.py` 只吃 SVG 且假设「无背景透明球」，直接喂会解析失败。改为直接产出 `icon0.png` 并同步替换 `icon.svg`（避免 `make icons` 回退到旧图）：

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
sips -z 512 512 /tmp/ludora-autoload-icon.png --out assets/icon0.png
# 让 icon0.png 新于 icon.svg，make 不会重跑 gen_icons.py
touch assets/icon0.png
# 备份旧图后，把 image2 的图也写一份 1024 到 icon.svg 同义占位（用 image 包装，仅供存档）
cp /tmp/ludora-autoload-icon.png assets/icon.1024.png
```

> open item：`assets/icon.ico`（Windows exe 图标）本仓库不产出（不发 Windows exe），可忽略。

- [ ] **Step 5: 编译 installer.elf（docker SDK）**

优先用 autoloader 自带 `build_release.sh`（其 `ps5-webkit-autoloader-sdk` 镜像含 libmicrohttpd + rsvg-convert）；镜像不存在则先 build（首次 `git clone` SDK + `build_deps.sh`，需代理，见 memory `reference_forwarder_build_hacbrewpack_proxy.md`）：

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
BUILD_TYPE=dev ./build_release.sh
```

Expected: 产出 `webkit-autoloader-installer_v<ver>.elf`（或 `installer.elf`），无编译错误。

- [ ] **Step 6: 验证产物（静态：主屏名 + 图标已进产物）**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
# 主屏名字符串应能在 ELF 里找到（param.json 被编译进 file_registry）
strings installer.elf 2>/dev/null | grep -a "鲁哆啦" || strings webkit-autoloader-installer_v*.elf | grep -a "鲁哆啦"
# icon0.png 非空且为 512x512
file assets/icon0.png
```

Expected: 能 grep 到「鲁哆啦」；`icon0.png` 为 PNG 512x512。**注意**：ELF 里 param.json 若经压缩/编码可能 grep 不到中文，此时以「param.json 已按 Step 1 改 + 编译无错」为准，真机看主屏名（Task 6）是最终判据。

- [ ] **Step 7: 提交（不含 ELF/图标二进制，走 .gitignore 或单独归档）**

```bash
git add assets/param.json.template include/installer_config.h include/wkali.h tools/gen_version.py
git commit -m "feat(installer): 品牌化主屏名鲁哆啦 + image2 图标

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push gitee main
```

> `installer.elf`/`icon0.png` 等二进制产物按仓库惯例进 `_builds/ludora-ps5-autoloader/<日期>/` 归档，不提交进仓库（父规范 `_builds` 约定）。

---

### Task 5: host.py 打包

**Files:**
- Create: `ludora-ps5-autoloader-host.py`（构建产物）

**Interfaces:**
- Consumes: Task 3 的 `build/autoloader/{relapse,poops}.html`、Task 4 的 `installer.elf`。
- Produces: 单文件 `ludora-ps5-autoloader-host.py`（DNS 53 + HTTPS 443，`--name 鲁哆啦`）。

- [ ] **Step 1: 改 Makefile `host` target 的 `--name`**

`host` target 里 `build_host.py` 的 `--name "PS5 WEBKIT AUTOLOADER"` 与 `--output webkit-autoloader-host.py` 改为：

```make
	$(PYTHON) $(LOADER)/tools/build_host.py \
	    --page index.html=$(HOST_RELAPSE) \
	    --page poops.html=$(HOST_POOPS) \
	    --version $(BUILD_VERSION) --name "鲁哆啦 Ludora" --output ludora-ps5-autoloader-host.py
```

- [ ] **Step 2: 跑 `make host`**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
make host HOST_PAYLOAD=$(ls webkit-autoloader-installer_v*.elf 2>/dev/null || echo installer.elf)
```

Expected: 产出 `ludora-ps5-autoloader-host.py`，`python3 -c "import py_compile; py_compile.compile('ludora-ps5-autoloader-host.py', doraise=True)"` 不报错。

- [ ] **Step 3: 验证单文件自足（内置页面 + 证书 + name）**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
grep -a "鲁哆啦" ludora-ps5-autoloader-host.py | head -1        # HOST_NAME 已改
grep -a "manuals.playstation.net" ludora-ps5-autoloader-host.py | head -1   # 证书 CN
python3 ludora-ps5-autoloader-host.py --help 2>&1 | head -20    # 能启动/打印用法，不 import 崩
```

Expected: 前两条 grep 有命中；第三条能打印帮助或监听信息。

- [ ] **Step 4: 提交（host.py 产物不提交，仅提交 Makefile 改动）**

```bash
git add Makefile
git commit -m "feat(host): build_host 打包为鲁哆啦 host.py

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push gitee main
```

---

### Task 6: 本地真机验证（无 PC 全链路，完成硬门）

**Files:** 无新文件（验收记录写进 `_docs/` 或本 plan 的验收备注）。

**Interfaces:**
- Consumes: Task 5 的 `ludora-ps5-autoloader-host.py` + 真机 PS5 9.40。

- [ ] **Step 1: 开发机起 host.py（绕开系统代理）**

```bash
cd /Users/qingwu/Development/Game/ludora-ps5-autoloader
# 53/443 需 root；用之前验证过的 sudo 姿势，且不把密码写进任何文件
sudo env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  python3 ludora-ps5-autoloader-host.py --port 53 --https-port 443
```

记录监听 IP（`ipconfig getifaddr en0` 之类，取局域网地址）。

- [ ] **Step 2: 真机设 DNS + 进 User's Guide**

真机 9.40：Settings → Network → 设 DNS 为开发机 IP → 打开 User's Guide（自动访问 `manuals.playstation.net` → 被劫持到 host）。

- [ ] **Step 3: 逐条对照 spec §7 验收**

1. exploit 链跑通（host 日志出现固件识别 + elfldr listening）。
2. installer 装主屏成功。
3. **主屏 app 名 = 鲁哆啦 Ludora**（非 "WebKit Autoloader"）。
4. 图标为 image2 生图（ludora 大 + autoload 小右下角）。
5. 重启 → 主屏启动 → **离线**可用（断网/无 host 也能打开）。
6. 9 插件列表可见可点选 → 点选一个插件 → elfldr 实发实载（host 侧或 PS5 侧日志看到 ELF 下载）。

- [ ] **Step 4: 记录未覆盖项**

若任一环节未过（尤其 elf-send 的 `api.isFailure`/`api.describe` 在真机的表现、elfldr-check 跳过重复 exploit、图标实际观感），如实记录「未覆盖」，不标完成。

---

## Self-Review

**Spec 覆盖：** spec §6 四阶段 = 本 plan Task 3（chain page）→ Task 4（installer.elf）→ Task 5+6（host.py + 真机）→ VPS（spec 注明后置、另文展开，不在本 plan）。spec §5.2 独立仓库 = Task 1；§5.3 改 make page = Task 3；§5.4 L2 适配 = Task 2+3；§5.5 installer = Task 4；§5.6 host.py = Task 5。§7 验收 = Task 6。

**Placeholder 扫描：** 无 TBD/TODO；所有命令/代码给全。两处显式 open item（广告位 store-qr、icon.ico）已在文中标注为「本版跳过/忽略」，不是未决实现。

**Type/命名一致：** `window.LUDORA_PLUGINS`（Task 2 消费、Task 3 build-dom.js 产出）一致；`build/plugins-data.js` 由 Task 3 Step 1 脚本产出、Step 3 Makefile 调用，一致；`payloads/elf-send.js`（Task 2 复制、Task 3 Makefile 引用）一致；`frontend/autoloader/{build-dom.js,ludora-bridge.js,loader.css,plugins.json}` 三处引用一致。

**一个已知风险（已标注不掩盖）：** Task 4 Step 6 的 `strings | grep 鲁哆啦` 可能因 param.json 被压缩/编码而假红，已写明「以真机主屏名为最终判据」。Task 6 才是主屏名/图标/9 插件的真验。
