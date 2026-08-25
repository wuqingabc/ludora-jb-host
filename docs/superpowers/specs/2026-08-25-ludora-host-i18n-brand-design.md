# Ludora 主机 Host 全页面 i18n 与品牌统一规格

状态：待用户审阅
日期：2026-08-25
范围：`ludora-jb-host`、`ludora-site` 的 Host 打包适配

## 1. 目标

将 `/jb` 及其后的全部静态主机页面统一为 Ludora 官网的视觉与文案体系，并在 PS4/PS5 浏览器可承受的旧版 WebKit 环境中提供简体中文、繁体中文和英文 i18n。

本次只修改网站前端、静态 Host 页面和官网打包脚本；不修改 pkg 源码、payload 二进制、exploit 核心逻辑或已经分发的安装包。

## 2. 现状与约束

- 官网设计 token 以 `ludora-site/src/styles/tokens.css` 为唯一视觉基准。
- 官网品牌名固定为“鲁哆啦 Ludora”。
- 主机浏览器可能不支持现代 JavaScript、远程字体、CDN 和复杂构建运行时。
- Host 需要支持离线缓存，因此样式、字典和运行时脚本必须使用本地资源。
- `/jb` 的授权 Cookie、设备授权会话、PS4/PS5 UA 分流和现有跳转路径必须保持兼容。
- payload、GoldHEN 加载、USB 提示、离线缓存和 exploit 触发时序不能因为视觉改造改变。

## 3. i18n 设计

### 3.1 语言集合

第一阶段支持：

- `zh-CN`：简体中文，默认语言，现有 `/jb` 路径不变。
- `zh-TW`：繁体中文，通过 `?lang=zh-TW`、手机授权页选择或语言 Cookie 进入。
- `en-US`：英文，通过 `?lang=en-US`、手机授权页选择或语言 Cookie 进入。

不新增 `/en/jb` 或 `/tw/jb` 路径，避免破坏现有 Cookie、书签和服务器重定向。

### 3.2 语言解析顺序

```text
URL ?lang=xx
  -> Host Cookie / localStorage
  -> navigator.language
  -> zh-CN
```

语言只接受 `zh-CN`、`zh-TW`、`en-US`。`zh-HK`、`zh`、未知语言根据明确映射回退到 `zh-TW` 或 `zh-CN`；其他未知语言回退到 `zh-CN`。手机授权页选择的语言写入授权会话，主机获得授权后将语言参数带入最终 Host 入口。

### 3.3 静态运行时

Host 增加本地、ES5 兼容的运行时：

```text
i18n.js
i18n/zh-CN.js
i18n/zh-TW.js
i18n/en-US.js
```

运行时不得使用 `const`、`let`、箭头函数、`fetch`、Promise、模块导入、远程资源或 `Intl`。接口为：

```javascript
LudoraI18n.t(key, params)
LudoraI18n.apply(root)
LudoraI18n.locale()
LudoraI18n.setLocale(locale)
```

### 3.4 标记约定

静态文本使用：

```html
<h1 data-i18n="host.title">主机工具</h1>
```

属性使用：

```html
<img data-i18n-alt="qr.alt" />
<button data-i18n-title="actions.refresh"></button>
```

动态文案统一使用：

```javascript
msgs.innerHTML = LudoraI18n.t("cache.installing", { progress: progress });
```

所有用户可见的标题、菜单、按钮、二维码说明、授权状态、缓存进度、GoldHEN 状态、USB 提示、失败提示和完成提示必须进入三套字典。三套字典必须保持相同 key 集合；缺失 key 在打包阶段直接失败。技术注释和非用户可见的 payload 源码注释不纳入页面文案替换范围。

### 3.5 繁体中文规则

- `zh-TW` 使用台湾/繁体用字，不通过运行时简单替换简体字符。
- 按钮、状态、错误和 USB 指示使用完整繁体文案，避免简繁混排。
- 品牌名“鲁哆啦 Ludora”保持品牌规定写法；产品名 `GoldHEN`、`PS4`、`PS5` 保持不翻译。
- 语言选择显示“简体中文 / 繁體中文 / English”。

### 3.6 兼容旧页面

不重写 exploit 核心脚本。对现有 `LoadedMSG`、`msgs.innerHTML`、`alert()` 和状态节点增加 i18n 适配出口；页面仍可在没有 i18n 运行时的故障情况下显示默认简体中文文本，保证降级可用。

## 4. Ludora 品牌与视觉

### 4.1 品牌清理

删除所有页面可见的 GamerHack 标题、页脚、开发者署名、Special Thanks、捐赠说明及其可点击链接。统一替换为 Ludora：

- `鲁哆啦 Ludora · 主机工具`
- `PS4 / PS5 Web Access`
- `GoldHEN 加载器`
- `设备授权`

不声称 Ludora 是上游 exploit 或 payload 的作者；技术文件中的必要来源注释保持不变。

### 4.2 视觉 token

Host CSS 使用官网现有 token 的静态副本，核心值来自：

- 页面背景：`#0a0d1c`
- 次级背景：`#10142a`
- 卡片表面：`#141936`
- 主文字：`#edf0fc`
- 次级文字：`#a4abcd`
- Ludora 强调色：`#f3b942`
- 边框、圆角、阴影、间距：与官网 token 同步

Host 不在运行时 import 官网 CSS，避免离线缓存和 PS4 浏览器出现跨路径依赖。

### 4.3 页面结构

所有 Host 页面按同一信息层级组织：

```text
Ludora 品牌栏
  -> 页面路径 / 固件标识
  -> 设备或缓存状态
  -> 主操作区域
  -> 广告位
  -> 运行状态 / 错误提示
  -> Ludora 页脚
```

页面仍保留适合电视浏览器的较大焦点区域、明确的状态文本和低动画依赖。广告位使用官网 `/jb` 的广告占位规则，不遮挡主操作和错误信息。

## 5. 页面覆盖范围

打包必须覆盖 Host 源目录中全部用户入口和其依赖页面，包括：

- 根入口与设备授权页
- `505`、`505goldhen`
- `672`、`672goldhen`
- `702`、`75x`
- `900goldhen`、`900v2`、`900v3`
- `g2all`
- `restore` 下的全部入口
- 每个目录中的 `index.html`、`cache.html`、`cachecss.html`、状态页和本地资源

`ludora-site/scripts/package-jb-host.mjs` 改为显式完整清单或受控递归清单，并对缺失页面、缺失 CSS、缺失 i18n 资源和资源引用错误直接失败。

## 6. 不变的运行行为

以下行为必须通过回归测试证明没有改变：

- 非 PS4/PS5 浏览器显示设备要求页面。
- 未授权或 Cookie 过期时回到 `/jb` 扫码页。
- 授权成功后按 PS4/PS5 UA 进入对应 Host。
- GoldHEN 和 exploit 触发时序不变。
- 离线缓存进度可以继续更新，不再固定显示 `0%`。
- USB 插入提示、等待、失败和成功状态保持原始逻辑。
- 所有原有 Host 路径仍可访问，旧路径不产生错误的 `bad host path`。

## 7. 验证方案

### 静态验证

- 全部 HTML 页面均加载本地 `style.css`、`i18n.js` 和三套字典。
- 用户可见文本中不出现 `GamerHack`、旧开发者署名或旧站点标题。
- 所有字典 key 在简体、繁体和英文词典中都有值。
- 所有本地 `src`、`href`、脚本和样式路径存在。
- Host 运行时代码不引入现代语法或外部网络依赖。
- 官网打包结果包含完整 Host 页面集合。

### 浏览器验证

- Chromium 桌面浏览器：三种语言、普通浏览器设备提示。
- PS4 UA：授权页、Host 首页、缓存状态、错误状态、三种语言参数。
- PS5 UA：授权页、对应分流、三种语言参数。
- 清空 Cookie 后访问深层 Host：必须回到授权页。
- 有效 Cookie 访问深层 Host：必须进入对应页面。

### 现有回归测试

继续运行并扩展：

```text
npm run verify:host-pages
npm run verify:host-runtime
node --test jb/test/*.test.mjs
```

新增 i18n、品牌清理、完整打包和资源引用检查。

## 8. 交付顺序

1. 在 Host 仓库增加三套字典、ES5 i18n 运行时和共享品牌样式。
2. 批量迁移全部页面的可见文案与状态出口。
3. 清理 GamerHack 可见品牌信息。
4. 完整化官网 Host 打包清单和校验。
5. Playwright 验证桌面、PS4、PS5 UA 与 Cookie 分流。
6. 通过测试后再提交 Git；部署前单独确认，不自动修改 pkg。

## 9. 明确不做

- 不修改 pkg 源码或已经发行的 pkg。
- 不修改 payload 二进制、exploit 核心逻辑或 GoldHEN 文件。
- 不发布 GamerHack fork host 独立域名。
- 不引入 CDN、远程字体、React、Vue 或官网现代运行时到 Host 离线页面。
- 不在未经验证的情况下声称线上部署完成。
