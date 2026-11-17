# PS4 Web Host:GoldHEN 之后「下载 + 安装 ludora.pkg」链路修复方案

**Date:** 2026-11-16
**Status:** 唯一未决项已由真机探针回答(原语存活、二次注入成立);下一步半 2 下载器
**Scope:** `ludora-jb-host`(浏览器侧)+ `ludora-jb-pkg-stage`(ELF/裸 payload 侧)+ `ludora-site`(服务端)

## 1. 现象

PS4 通过官网 `/jb` Web 解锁,GoldHEN(`goldhen_2.4b18.10.bin`)能成功加载,但「下载 `ludora.pkg` 并安装」这一步从来没真正跑起来。

## 2. 根因(五条,任一都致命,当前全中)

1. **端口错**:服务端把 payload push 到 `9021`(elfldr,PS5 专用),PS4 上不存在。PS4 GoldHEN 的 BinLoader 是 `9090`。
2. **数据流方向错**:`ludora-site` 用「服务端 → 控制台」connect-back,过不了 NAT。控制台能出站到 `www.ludora.cc`,反过来不行。
3. **浏览器无裸 TCP**:`pkg-stage.js` 只发 XHR(HTTP),触达不到 9090/9020/9021/9022 任何一个(全是裸 TCP/FTP)。
4. **`runPayload` 拒 ELF**:`g2all/900/lapse.js` 的 `runPayload` 硬挡 ELF,只吃 raw shellcode。
5. **🔴 stage ELF 是动态链接 Orbis 模块,裸注入路径根本带不动**(本轮新实锤,见 §3)。

## 3. 关键事实:stage ELF 是动态模块,不是裸 payload

`objdump -p/-R` 读 `ludora-jb-pkg-stage/pkg-stage/bin/ludora-web-pkg-stage.elf`(及 `ludora_autorun.elf`、`goldhen-config-stage.elf`,同一类):

```
start address: 0x400040                    ← 绝对地址,非 PIE
NEEDED  libSceAppInstUtil_stub.so / libSceLncUtil_stub.so / libSceNet_stub.so / libSceSystemService_stub.so / ...
R_X86_64_GLOB_DAT  dlopen/dlsym/socket/bind/accept/recv/sceLncUtilLaunchApp/...
R_X86_64_JUMP_SLOT  getpid/kill/atexit/__cxa_finalize/...
interpreter  /libexec/ld-elf.so.1
```

含义:这种 ELF **必须由 GoldHEN 的模块加载器(等价 `sceKernelLoadStartModule`)去解析 stub 模块、按 NID 解析导入、再套重定位**。它没法用浏览器现有 `runPayload` 的「mmap + copy + jump」注入,也没法用简单 JS ELF loader 加载(那等于在 JS 里重写 GoldHEN 的模块加载器)。这也是「加载了 GoldHEN 却没把这个 ELF 拉起来」的技术根因。

### 端口/协议事实表

| 端口 | 归属 | 协议 | 浏览器/服务端能否触达 |
|---|---|---|---|
| 9090 | GoldHEN 内置 BinLoader | 裸 TCP | ❌ 浏览器无裸 TCP;❌ 服务端 NAT |
| 9020 | BD-J/旧独立 binloader | 裸 TCP | ❌ 同上 |
| 9021 | elfldr(PS5 专用) | 裸 TCP | PS4 不存在 |
| 9022 | `ludora-web-pkg-stage.elf` 自建接收器 | 裸 TCP | 根本没被加载 |

## 4. 修正后的架构

**控制台出站 + 自包含裸 payload 注入。** 结论:

- **下载+安装+启动必须做成「自包含静态自重定位裸 payload(`.bin`)」**,和 GoldHEN 自己的 `goldhen_2.4b18.10.bin` 同一类,由浏览器现有 `runPayload`(mmap + pthread)原样注入。
- **pkg 投递走「控制台出站」**:注入后的 payload 主动 GET 官网 `ludora.pkg`(普通 HTTP,port 80),带授权 token。

### 现成的正确模板

`payloads/pre-goldhen-probe/` 已经是这套模式的完整参考实现,直接照抄即可:

- `crt0.s`:裸 `_start`,先把 magic/version/stage 写到 `[rdi + 0x1000]`(状态页,`rdi` 是浏览器传入的映射基址),再 `jmp _main`。
- `main.c`:freestanding C,全部用**裸 syscall**(`syscall1/3/4`),无 libc、无动态链接;已演示 file-write、module-load(syscall 594)、symbol-resolve(syscall 591)、notification。
- `Makefile`:`-ffreestanding -nostdlib -fpie -fPIC` + `linker.ld` + `objcopy -O binary` → 产平 `.bin`(verify 还断言产物不是 ELF)。

下载器只需在此模板上补:raw `socket/connect/send/recv` 出站 HTTP GET → 流式写 `/user/data/pkg/ludora.pkg` → SHA-256 校验 → 复用 module-load + symbol-resolve 调 `sceAppInstUtilAppInstallPkg` + `sceLncUtilLaunchApp`。

## 5. 文件级改法清单

### 半 1 —— 浏览器侧(`ludora-jb-host`)

- `g2all/900/lapse.js`(镜像 `g2all/700/lapse.js`):`startLudoraStage()` 不再调 `LudoraPkgStage.start()`(XHR),改成 `runPayload('./ludora-web-downloader.bin', ...)` 注入下载器裸 payload。
- `pkg-stage.js` / `autorun-stage.js` / `config-stage.js` / `binloader-probe.js`:删除或停用(死代码,全走 XHR/connect-back)。
- `index.html`:移除死脚本引用。
- **不改** `runPayload` 的 raw-shellcode 路径(下载器就是裸 `.bin`)。

### 半 2 —— payload 侧(`ludora-jb-pkg-stage`)

- 新建 `downloader/`(照抄 `payloads/pre-goldhen-probe/` 的 Makefile/crt0.s/linker.ld/status.h 结构),把 `pkg-stage/main.c` 从「TCP 9022 接收器」重写为「出站 HTTP 下载器 + install + launch」的 freestanding 裸 payload。
- 删/废弃旧的动态 ELF `pkg-stage/`(以及 `config-stage`/`autorun-stage` 的动态 ELF,若不再用)。
- 同步 `protocol.md`、`docs/verification.md`。

### 半 3 —— 服务端(`ludora-site`)

- `src/pages/jb/host/[...path].ts`:删 `sendPayload(ip,9021)`、`sendPkgFile/sendPkgStream`(9022)、`sendAutorunFile` 三条 connect-back。
- `/jb/host/pkg/ludora.pkg` 改成可出站 GET 的资源;鉴权从 session cookie 改成 ELF/payload 携带的 token(注入时浏览器把 token 写进 payload 可读内存)。
- 配 80 端口明文路由(仅此 pkg 路由),供裸 payload 出站下载。
- `src/lib/jb-pkg-stage.ts` / `jb-autorun-stage.ts` / `jb-host-adapter.ts` 清死常量与死资产引用。

## 6. 唯一未决问题 + 探针(✅ 已由真机回答,2026-11-16)

**GoldHEN 起来之后,浏览器的 ROP/mmap/pthread + 内存读原语是否还活着,能否二次注入?** 现有设计刻意用 XHR 绕开内存操作,正是因为这个不确定。

真机(zrm 引擎,固件 12.52)`?postprobe=1` 探针结果 —— 状态页完整推进,原语存活:

| 探针日志 | 值 | 含义 |
|---|---|---|
| POSTPROBE-MAP | size=0x4000 rwx=0x201500000 | 二次 mmap RWX 成功 |
| POSTPROBE-PTHREAD-TABLE | agree=1 | pthread_create 符号地址一致 |
| POSTPROBE-CREATE | rc=0 handle=0x8803bbbe0 | pthread_create 成功,线程创建 |
| POSTPROBE-POLL | magic=0x4c445047 stage=0x7f(DONE) result=0 seq=8 | 状态页出现 magic,stage 推进到 DONE,无错误 |

**结论:二次注入 + 内存读都通 → 半 1 方案(同帧二次注入下载器)成立,不需要 GoldHEN AutoRun。**

> 观察方式:探针日志通过 XHR GET beacon(`/__beacon?t=...`)回传本地静态服务器,因为 PS4 老 WebKit 上 `new Image().src` 会被 GC 吞掉请求、XHR 才可靠。

## 7. 验收清单(真机)

1. `?diagnose=post`:GoldHEN 是否照常加载;探针状态页是否推进到 DONE;浏览器是否崩溃。
2. 按探针结论定半 2 形态后:注入下载器 → 出站下载 `ludora.pkg` → 落盘 → SHA-256 一致 → 安装完成 → `sceLncUtilLaunchApp` 拉起 Ludora 到前台。
3. 全程不出现 `CE-36329-3` / Disc Player 错误;FTP 回读 `/data/.ludora-*` marker 佐证 payload 真跑了。

> 真机验收前读各仓 `docs/claude/false-green-checklist.md`;下载器完成判定参考 bd-jb-1300 的 autorun 门禁(安装大小非零、前台 AppId 相等),不只看 `sceAppInstUtilAppExists`。
