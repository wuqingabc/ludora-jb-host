# Borrow Map —— 借鉴/上游登记

本仓库的 Web 页面宿主机(`ludora-jb-host`)会 vendored 第三方 JS 引擎、payload 与二进制，
并在页面链接上游 ELF。本文登记每一处借用来源与许可，作为「借鉴新源必须登记」的单一真源。

## 引擎（vendored，unmodified）

| 目录 | 上游 | 许可 | 说明 |
|---|---|---|---|
| `ps5-relapse/` | [ntfargo/Relapse-Exploit](https://github.com/ntfargo/Relapse-Exploit)（pin `22c56be`） | MIT | 纯 Relapse 链：WebKit ARW + kernel R/W + 内置 elfldr(9021)，无 JS payload 运行时 |
| `ps5-loader/` | [itsPLK/ps5-webkit-remote-loader](https://github.com/itsPLK/ps5-webkit-remote-loader) | **MIT**（loader/PC host/client tools）；**GPL-3.0**（`installer/` 及 `installer/common`） | remote-loader：WebKit exploit（Relapse/Poops）+ JS payload 运行时（9027）+ kernel 管道（kexp → elfldr 9021）。**本仓库只 vendor loader 部分（MIT）**，未引入 `installer/` |

- `ps5-loader/src/*.js`、`ps5-loader/offsets/*.js`、`ps5-loader/payloads/relapse.js`/`poops.js`、
  `ps5-loader/shared/kexp-v0.8-24cf6e5.bin`、`ps5-loader/shared/elfldr-ps5-v0.26.elf` 均为
  unmodified vendored；`UPSTREAM-LICENSE` 保留 MIT 通知。
- remote-loader 的 Relapse 内核 adapted from [ntfargo](https://github.com/ntfargo/Relapse-Exploit)
  与 [soniciso1/relapse](https://github.com/soniciso1/relapse)，与 `ps5-relapse/` 同源。
- `shared/elfldr-ps5-v0.26.elf` 来自 [ps5-payload-dev/elfldr](https://github.com/ps5-payload-dev/elfldr) v0.26（GPLv3+）；
  `shared/kexp-v0.8-24cf6e5.bin` 来自 [itsPLK/ps5-kexp](https://github.com/itsPLK/ps5-kexp) v0.8。

## 插件 ELF（页面链接上游，不自托管）

站长决策（2026-11-04）：**链接上游、不自托管、许可不纠结直接用**。页面内 ELF sender 只把
上游 URL 发给 elfldr(9021)，由 elfldr 进程自行下载加载，ELF 字节不经过本仓库服务器。
`sha256` 为下载核对时的真值（见设计 §6）。

| # | 插件 | 上游（版本） | 许可 | 页面 URL |
|---|---|---|---|---|
| 1 | OnionHEN.elf | aydencharles/onionHEN v0.9.0 | GPL-3.0 | `github.com/aydencharles/onionHEN/releases/download/v0.9.0/OnionHEN.elf` |
| 2 | fps60.elf | eladharels/ps5-60FPS v1.0.0 | **无 license** | `github.com/eladharels/ps5-60FPS/releases/download/v1.0.0/fps60.elf` |
| 3 | kstuff-fpkg-1.13-dr-test6.elf | Darkmor kstuff（百度网盘，非 GitHub） | **闭源** | 🔴 无 elfldr 可直载的稳定直链，**暂不纳入页面列表** |
| 4 | nanodns.elf | drakmor/nanoDNS v0.4 | GPL-3.0 | `github.com/drakmor/nanoDNS/releases/download/0.4/nanodns.elf` |
| 5 | pldmgr_v0.6.1.elf | itsPLK/ps5-payload-manager v0.6.1 | GPL-3.0 | `github.com/itsPLK/ps5-payload-manager/releases/download/v0.6.1/pldmgr_v0.6.1.elf` |
| 6 | ps4mount.elf | gasb07/ps4mount v0.7.2 | GPL-3.0 | `github.com/gasb07/ps4mount/releases/download/v0.7.2/ps4mount.elf` |
| 7 | shadowmountplus.elf | drakmor/ShadowMountPlus 1.7beta11 | GPL-3.0 | `github.com/drakmor/ShadowMountPlus/releases/download/1.7beta11/shadowmountplus.elf` |
| 8 | syslang-zh-Hans-v0.3.elf | owendswang/ps5-syslang v0.3 | GPL-3.0 | `github.com/owendswang/ps5-syslang/releases/download/v0.3/syslang-zh-Hans-v0.3.elf` |
| 9 | web-file-mgr-v1.13-rc2.elf | owendswang/ps5-web-file-manager v1.13-rc2 | GPL-3.0 | `github.com/owendswang/ps5-web-file-manager/releases/download/v1.13-rc2/web-file-mgr-v1.13-rc2.elf` |
| 10 | webkit-autoloader-installer_v0.6.1.elf | itsPLK/ps5-webkit-autoloader v0.6.1 | GPL-3.0 | `github.com/itsPLK/ps5-webkit-autoloader/releases/download/v0.6.1/webkit-autoloader-installer_v0.6.1.elf` |

**排除项**：`mPSSXPLOIT` —— 站长明确「不碰、不下载」（它是 Relapse 漏洞链本身，非可加载插件）。

## kstuff 待定说明

`kstuff-fpkg-1.13-dr-test6.elf`（Darkmor，闭源）原始分发为百度网盘分享，无 elfldr 可用的
HTTP 直链（Discord CDN 直链会过期、百度网盘需转存+cookie）。因此暂不放进 `plugins.json`
页面列表。若要支持，可选：① 站长改判自托管；② 找到长期有效的镜像直链。达成前保持「记录、
不加载」。
