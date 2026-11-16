#include <stddef.h>
#include <stdint.h>

#include "params.h"
#include "status.h"

/* ---- FreeBSD/PS4 syscall numbers (amd64) ---- */
#define SYS_read 3
#define SYS_write 4
#define SYS_open 5
#define SYS_close 6
#define SYS_unlink 10
#define SYS_socket 97
#define SYS_connect 98
#define SYS_rename 128
#define SYS_mkdir 136
#define SYS_nanosleep 240

/* ---- open(2) flags ---- */
#define O_RDONLY 0x0000
#define O_WRONLY 0x0001
#define O_CREAT 0x0200
#define O_TRUNC 0x0400

#define AF_INET 2
#define SOCK_STREAM 1
#define IPPROTO_TCP 6

/* 只下载、不装机:落盘到 ludora_autorun 期望的暂存路径 + 写一次性强制标记,
 * 装机/拉起交给 GoldHEN AutoRun 的 ludora_autorun.elf(系统级进程,不在浏览器进程里装,
 * 浏览器里同步调 sceAppInstUtilAppInstallPkg 会死锁 SceShellUI)。
 * 路径与 ludora-ps4/plugin/ludora_autorun/main.c 的 STAGE_PKG/FORCE_STAGED_MARK 对齐:
 * autorun 落盘目录是 /user/data/pkg(安装服务只认 /user/data,/data 与 /user/data 是
 * 同一物理目录),故此处写 /data/pkg 目录即等价 /user/data/pkg 目录;文件名统一 ludora.pkg。 */
#define PKG_PATH "/data/pkg/ludora.pkg"
#define PKG_TMP  "/data/pkg/ludora.pkg.tmp"
#define FORCE_STAGED_MARK "/data/.ludora_force_staged"

/* 已装机判据:装机成功后源 pkg 会被安装服务删掉(装完即删,见 itemzflow installpkg.cpp
 * "装完即删,腾出空间"),所以不能再拿"pkg 文件是否存在"当跳过信号 —— 那会让已装机的
 * 主机每次越狱都重新下载 49MB。改为检查 appmeta 目录(装机时即建立),与 ludora_autorun
 * 的 sceAppInstUtilAppExists(LUDO00001) 语义等价。
 * 注意:ludora 被用户移到扩展硬盘后,appmeta 会落在 /user/appmeta/external/<TID>
 * (itemzflow 自身图标 fallback 就同时查内/外两条路径),所以两条都要判,否则装扩展盘
 * 的主机仍会重复下载。 */
#define APP_INSTALLED_DIR "/user/appmeta/LUDO00001"
#define APP_INSTALLED_DIR_EXT "/user/appmeta/external/LUDO00001"

/* ---- raw syscall wrappers (no libc) ---- */
/* FreeBSD/Orbis 内核 syscall 失败 = carry 置位 + rax=正数 errno(非 -1)。
 * 裸 syscall 必须检查 carry:失败时 neg rax 转成负值,否则 `if (fd < 0)` 等
 * 失败检测全部失效 —— 例:open 不存在的文件返回 rax=ENOENT(2),被误判成"成功"。
 * 2026-11-16 真机复现:文件 550 不存在时 file_exists 仍返回 true 走 skip。 */
static long syscall1(long number, long arg1) {
  long result;
  __asm__ volatile("syscall\n\t"
                   "jnc 1f\n\t"
                   "negq %%rax\n\t"
                   "1:"
                   : "=a"(result) : "a"(number), "D"(arg1) : "rcx", "r11", "memory");
  return result;
}
static long syscall2(long number, long arg1, long arg2) {
  long result;
  __asm__ volatile("syscall\n\t"
                   "jnc 1f\n\t"
                   "negq %%rax\n\t"
                   "1:"
                   : "=a"(result) : "a"(number), "D"(arg1), "S"(arg2) : "rcx", "r11", "memory");
  return result;
}
static long syscall3(long number, long arg1, long arg2, long arg3) {
  long result;
  __asm__ volatile("syscall\n\t"
                   "jnc 1f\n\t"
                   "negq %%rax\n\t"
                   "1:"
                   : "=a"(result) : "a"(number), "D"(arg1), "S"(arg2), "d"(arg3) : "rcx", "r11", "memory");
  return result;
}
/* ---- small helpers ---- */
static void zero(void *p, unsigned long n) {
  unsigned char *b = (unsigned char *)p;
  while (n--) *b++ = 0;
}
static unsigned long strlen_s(const char *s) {
  const char *p = s;
  while (*p) p++;
  return (unsigned long)(p - s);
}
static void append_s(char *buf, int *len, const char *s) {
  while (*s) buf[(*len)++] = *s++;
}
static void append_n(char *buf, int *len, const char *s, int n) {
  int i;
  for (i = 0; i < n; i++) buf[(*len)++] = s[i];
}
static int memcmp_s(const unsigned char *a, const unsigned char *b, int n) {
  int i;
  for (i = 0; i < n; i++) {
    if (a[i] != b[i]) return (int)a[i] - (int)b[i];
  }
  return 0;
}

static void update(struct ludora_dl_status *status, uint32_t stage, int32_t result, uint32_t detail0, uint32_t detail1) {
  status->stage = stage;
  status->result = result;
  status->detail0 = detail0;
  status->detail1 = detail1;
  status->sequence++;
}
static void fail(struct ludora_dl_status *status, uint32_t failed_stage, int32_t result, uint32_t detail0) {
  update(status, LUDORA_DL_STAGE_FAILED, result, failed_stage, detail0);
}

/* ---- SHA-256 (self-contained, no libc) — copied from pkg-stage/main.c ---- */
typedef struct { uint32_t h[8]; uint64_t bits; unsigned char block[64]; size_t used; } sha256_t;
static uint32_t rotr(uint32_t x, unsigned n) { return (x >> n) | (x << (32 - n)); }
static const uint32_t K[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
};
static void sha256_block(sha256_t *s) {
  uint32_t w[64], a, b, c, d, e, f, g, h, t1, t2;
  size_t i;
  for (i = 0; i < 16; i++)
    w[i] = (uint32_t)s->block[i * 4] << 24 | (uint32_t)s->block[i * 4 + 1] << 16 |
           (uint32_t)s->block[i * 4 + 2] << 8 | s->block[i * 4 + 3];
  for (i = 16; i < 64; i++) {
    uint32_t x = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t y = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + x + w[i - 7] + y;
  }
  a = s->h[0]; b = s->h[1]; c = s->h[2]; d = s->h[3];
  e = s->h[4]; f = s->h[5]; g = s->h[6]; h = s->h[7];
  for (i = 0; i < 64; i++) {
    uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    uint32_t ch = (e & f) ^ ((~e) & g);
    uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
    t1 = h + S1 + ch + K[i] + w[i];
    t2 = S0 + maj;
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  s->h[0] += a; s->h[1] += b; s->h[2] += c; s->h[3] += d;
  s->h[4] += e; s->h[5] += f; s->h[6] += g; s->h[7] += h;
}
static void sha256_init(sha256_t *s) {
  static const uint32_t init[8] = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };
  int i;
  for (i = 0; i < 8; i++) s->h[i] = init[i];
  s->bits = 0; s->used = 0;
}
static void sha256_update(sha256_t *s, const unsigned char *p, size_t n) {
  while (n--) {
    s->block[s->used++] = *p++;
    s->bits += 8;
    if (s->used == 64) { sha256_block(s); s->used = 0; }
  }
}
static void sha256_final(sha256_t *s, unsigned char out[32]) {
  size_t i;
  uint64_t bits = s->bits;
  s->block[s->used++] = 0x80;
  while (s->used != 56) {
    if (s->used == 64) { sha256_block(s); s->used = 0; }
    s->block[s->used++] = 0;
  }
  for (i = 0; i < 8; i++) s->block[56 + i] = (unsigned char)(bits >> (56 - i * 8));
  sha256_block(s);
  for (i = 0; i < 8; i++) {
    out[i * 4] = (unsigned char)(s->h[i] >> 24);
    out[i * 4 + 1] = (unsigned char)(s->h[i] >> 16);
    out[i * 4 + 2] = (unsigned char)(s->h[i] >> 8);
    out[i * 4 + 3] = (unsigned char)(s->h[i]);
  }
}

static void hex_encode(const unsigned char *bin, char *hex, int n) {
  static const char t[] = "0123456789abcdef";
  int i;
  for (i = 0; i < n; i++) {
    hex[i * 2] = t[bin[i] >> 4];
    hex[i * 2 + 1] = t[bin[i] & 15];
  }
  hex[n * 2] = 0;
}

/* ---- IPv4 dotted-quad -> network-order uint32 ---- */
static int parse_ipv4_net(const char *s, uint32_t *out) {
  int o[4], n = 0, cur = 0, has = 0;
  const char *p;
  for (p = s;; p++) {
    char c = *p;
    if (c >= '0' && c <= '9') {
      cur = cur * 10 + (c - '0');
      if (cur > 255) return -1;
      has = 1;
    } else if (c == '.' || c == 0) {
      if (!has || n >= 4) return -1;
      o[n++] = cur;
      cur = 0;
      has = 0;
      if (c == 0) break;
    } else {
      return -1;
    }
  }
  if (n != 4) return -1;
  *out = (uint32_t)o[0] | ((uint32_t)o[1] << 8) | ((uint32_t)o[2] << 16) | ((uint32_t)o[3] << 24);
  return 0;
}

/* ---- HTTP response header parsing ---- */
static int find_header_end(const char *buf, int n) {
  int i;
  for (i = 0; i + 3 < n; i++) {
    if (buf[i] == '\r' && buf[i + 1] == '\n' && buf[i + 2] == '\r' && buf[i + 3] == '\n') return i;
  }
  return -1;
}
static int parse_status(const char *header, int n, long *code) {
  int i, digits = 0;
  long c = 0;
  if (n < 12) return -1;
  if (header[0] != 'H' || header[1] != 'T' || header[2] != 'T' || header[3] != 'P' || header[4] != '/') return -1;
  i = 5;
  while (i < n && header[i] != ' ') i++;
  i++;
  while (i < n && header[i] >= '0' && header[i] <= '9') {
    c = c * 10 + (header[i] - '0');
    i++;
    digits++;
  }
  if (digits != 3) return -1;
  *code = c;
  return 0;
}
static int parse_content_length(const char *header, int n, long *out) {
  int i;
  for (i = 0; i + 14 < n; i++) {
    if (header[i] == 'C' && header[i + 1] == 'o' && header[i + 2] == 'n' && header[i + 3] == 't' &&
        header[i + 4] == 'e' && header[i + 5] == 'n' && header[i + 6] == 't' && header[i + 7] == '-' &&
        header[i + 8] == 'L' && header[i + 9] == 'e' && header[i + 10] == 'n' && header[i + 11] == 'g' &&
        header[i + 12] == 't' && header[i + 13] == 'h' && header[i + 14] == ':') {
      const char *p = header + i + 15;
      long v = 0;
      while (*p == ' ' || *p == '\t') p++;
      while (*p >= '0' && *p <= '9') {
        v = v * 10 + (*p - '0');
        p++;
      }
      *out = v;
      return 0;
    }
  }
  return -1;
}

/* ---- FreeBSD sockaddr_in (has sin_len) ---- */
struct sockaddr_in {
  uint8_t sin_len;
  uint8_t sin_family;
  uint16_t sin_port;
  uint32_t sin_addr;
  uint8_t sin_zero[8];
};
struct timespec { int64_t tv_sec; long tv_nsec; };

static void sleep_1s(void) {
  struct timespec ts;
  ts.tv_sec = 1;
  ts.tv_nsec = 0;
  syscall2(SYS_nanosleep, (long)&ts, 0);
}

static void write_file(const char *path, const char *text) {
  long fd = syscall3(SYS_open, (long)path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
  if (fd < 0) return;
  syscall3(SYS_write, fd, (long)text, (long)strlen_s(text));
  syscall1(SYS_close, fd);
}

static void write_marker(const char *text) {
  write_file("/data/.ludora-downloader", text);
}

/* 文件存在性检查:open(O_RDONLY) 成功即存在。只判存在,不做大小/sha 校验 ——
 * PKG_PATH 只由本下载器在 sha256 校验通过后 rename 写入,存在即代表完整可信。 */
static int file_exists(const char *path) {
  long fd = syscall3(SYS_open, (long)path, O_RDONLY, 0);
  if (fd < 0) return 0;
  syscall1(SYS_close, fd);
  return 1;
}

/* 写 ludora_autorun 的一次性强制标记:告诉它优先用硬盘暂存包(而非碟上旧版 pkg)。 */
static void write_force_staged(void) {
  write_file(FORCE_STAGED_MARK, "1\n");
}

/* /data/pkg 不是系统自带目录,首次落盘前必须自建(对齐 autorun 的 nf_ensure_package_dirs)。
 * 目录已存在(EEXIST)按成功处理,其余错误才算失败。裸 syscall 失败返回负 errno。 */
static int ensure_pkg_dir(void) {
  long r = syscall2(SYS_mkdir, (long)"/data/pkg", 0755);
  if (r != 0 && r != -17) return (int)r; /* -17 = -EEXIST */
  return 0;
}

/* 装机/拉起逻辑已移除:浏览器进程里同步调 sceAppInstUtilAppInstallPkg 会死锁
 * SceShellUI(PS4 整机卡死)。下载器现在只负责下载 + SHA-256 校验 + 落盘 + 写强制标记,
 * 装机交给 GoldHEN AutoRun 的 ludora_autorun.elf(系统级 diagnostic_program 进程)。
 * 参见 nasflow-archive/ps4/plugin/ludora_autorun/main.c 与
 * docs/research/2026-07-21-first-install-architecture.md §四。 */

/* ---- outbound HTTP GET -> stream to disk + SHA-256 ---- */
static int http_download(struct ludora_dl_status *status, struct ludora_dl_params *params) {
  uint32_t ip_net = 0;
  struct sockaddr_in addr;
  int fd = -1, out = -1;
  long cr;
  char req[1024];
  int rl = 0, sent = 0;
  char hdr[4096];
  int hdr_len = 0, header_done = 0;
  long content_length = -1, body_received = 0;
  unsigned char recv_buf[4096];
  sha256_t hash;
  unsigned char actual[32];
  char actual_hex[65];

  if (parse_ipv4_net(params->ip, &ip_net) != 0) {
    fail(status, LUDORA_DL_STAGE_PARAM, -2, 0);
    return -1;
  }
  /* 防御性复查:请求行 = "GET "(4) + path + " HTTP/1.1\r\nHost: "(16) + ip
   * + "\r\nConnection: close\r\n\r\n"(24)。_main 已限 path_len<512、ip_len<64,
   * 理论上 ≤618 < sizeof(req)=1024;此处再守一次,防止将来放宽校验后溢出。 */
  if (params->path_len + params->ip_len > (int)sizeof(req) - 48) {
    fail(status, LUDORA_DL_STAGE_PARAM, -4, 0);
    return -1;
  }

  update(status, LUDORA_DL_STAGE_SOCKET, 0, 0, 0);
  /* 诊断:给浏览器轮询留出时间,否则下载器线程几 ms 内跑到 socket 崩溃,
   * 浏览器 CREATE 之后来不及 POLL 就整进程被杀,无法定位崩溃点。 */
  sleep_1s();
  /* protocol 显式传 TCP(6):505 已验证 raw socket 需显式协议,0 在 Orbis 上不可靠。 */
  fd = (int)syscall3(SYS_socket, AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (fd < 0) {
    fail(status, LUDORA_DL_STAGE_SOCKET, fd, 0);
    return (int)fd;
  }

  zero(&addr, sizeof(addr));
  addr.sin_len = sizeof(addr);
  addr.sin_family = AF_INET;
  addr.sin_port = (uint16_t)((params->port >> 8) | (params->port << 8)); /* htons */
  addr.sin_addr = ip_net;

  update(status, LUDORA_DL_STAGE_CONNECT, 0, (uint32_t)fd, (uint32_t)params->port);
  cr = syscall3(SYS_connect, fd, (long)&addr, sizeof(addr));
  if (cr < 0) {
    fail(status, LUDORA_DL_STAGE_CONNECT, (int32_t)cr, (uint32_t)fd);
    syscall1(SYS_close, fd);
    return (int)cr;
  }

  append_s(req, &rl, "GET ");
  append_n(req, &rl, params->path, params->path_len);
  append_s(req, &rl, " HTTP/1.1\r\nHost: ");
  append_n(req, &rl, params->ip, params->ip_len);
  append_s(req, &rl, "\r\nConnection: close\r\n\r\n");

  update(status, LUDORA_DL_STAGE_SEND, 0, 0, 0);
  while (sent < rl) {
    long w = syscall3(SYS_write, fd, (long)(req + sent), rl - sent);
    if (w <= 0) {
      fail(status, LUDORA_DL_STAGE_SEND, (int32_t)w, 0);
      syscall1(SYS_close, fd);
      return -1;
    }
    sent += (int)w;
  }

  out = (int)syscall3(SYS_open, (long)PKG_TMP, O_WRONLY | O_CREAT | O_TRUNC, 0600);
  if (out < 0) {
    fail(status, LUDORA_DL_STAGE_BODY, out, 0);
    syscall1(SYS_close, fd);
    return (int)out;
  }
  sha256_init(&hash);

  update(status, LUDORA_DL_STAGE_BODY, 0, 0, 0);
  for (;;) {
    long n = syscall3(SYS_read, fd, (long)recv_buf, sizeof(recv_buf));
    char *p = (char *)recv_buf;
    long remaining;
    if (n == 0) break; /* EOF */
    if (n < 0) {
      fail(status, LUDORA_DL_STAGE_BODY, (int32_t)n, 0);
      goto done_fail;
    }
    remaining = n;

    if (!header_done) {
      int to_copy = (int)remaining;
      int sep;
      if (hdr_len + to_copy > (int)sizeof(hdr)) {
        fail(status, LUDORA_DL_STAGE_RESP_HEAD, -1, 0);
        goto done_fail;
      }
      {
        int i;
        for (i = 0; i < to_copy; i++) hdr[hdr_len + i] = p[i];
      }
      hdr_len += to_copy;
      sep = find_header_end(hdr, hdr_len);
      if (sep >= 0) {
        long code = 0;
        int body_start = sep + 4;
        int body_prefix;
        update(status, LUDORA_DL_STAGE_RESP_HEAD, 0, 0, 0);
        if (parse_status(hdr, sep, &code) != 0 || code != 200) {
          fail(status, LUDORA_DL_STAGE_RESP_HEAD, -2, (uint32_t)code);
          goto done_fail;
        }
        if (parse_content_length(hdr, sep, &content_length) != 0 || content_length <= 0) {
          fail(status, LUDORA_DL_STAGE_RESP_HEAD, -3, (uint32_t)content_length);
          goto done_fail;
        }
        body_prefix = hdr_len - body_start;
        if (body_prefix > 0) {
          int body_left = (int)(content_length - body_received);
          int n2 = body_prefix;
          long w;
          if (n2 > body_left) n2 = body_left;
          w = syscall3(SYS_write, out, (long)(hdr + body_start), n2);
          if (w != n2) goto done_fail;
          sha256_update(&hash, (const unsigned char *)(hdr + body_start), (size_t)n2);
          body_received += n2;
        }
        header_done = 1;
      }
    } else {
      int body_left = (int)(content_length - body_received);
      int n2 = (int)remaining;
      long w;
      if (n2 > body_left) n2 = body_left;
      if (n2 > 0) {
        w = syscall3(SYS_write, out, (long)p, n2);
        if (w != n2) goto done_fail;
        sha256_update(&hash, (const unsigned char *)p, (size_t)n2);
        body_received += n2;
      }
    }

    if (header_done) {
      /* 下载进度:detail0=已收字节, detail1=总字节。浏览器侧据此渲染百分比。 */
      update(status, LUDORA_DL_STAGE_BODY, 0,
             (uint32_t)body_received, (uint32_t)content_length);
    }
    if (header_done && body_received >= content_length) break;
  }

  syscall1(SYS_close, out);
  out = -1;
  syscall1(SYS_close, fd);
  fd = -1;

  if (content_length <= 0 || body_received != content_length) {
    fail(status, LUDORA_DL_STAGE_BODY, -2, (uint32_t)body_received);
    goto done_fail;
  }

  sha256_final(&hash, actual);
  hex_encode(actual, actual_hex, 32);
  update(status, LUDORA_DL_STAGE_HASH, 0, 0, 0);
  if (memcmp_s((const unsigned char *)actual_hex, (const unsigned char *)params->sha256_hex, 64) != 0) {
    fail(status, LUDORA_DL_STAGE_HASH, -1, 0);
    goto done_fail;
  }

  /* sha256 一致,临时文件原子 rename 成 final 路径。 */
  if (syscall2(SYS_rename, (long)PKG_TMP, (long)PKG_PATH) != 0) {
    fail(status, LUDORA_DL_STAGE_HASH, -2, 0);
    goto done_fail;
  }

  return 0;

done_fail:
  if (out >= 0) syscall1(SYS_close, out);
  if (fd >= 0) syscall1(SYS_close, fd);
  syscall1(SYS_unlink, (long)PKG_TMP);
  return -1;
}

int _main(void *payload_base) {
  struct ludora_dl_status *status = (struct ludora_dl_status *)((uint8_t *)payload_base + LUDORA_DL_STATUS_OFFSET);
  struct ludora_dl_params *params = (struct ludora_dl_params *)((uint8_t *)payload_base + LUDORA_DL_PARAMS_OFFSET);

  write_marker("START\n");

  update(status, LUDORA_DL_STAGE_PARAM, 0, params->magic, 0);
  if (params->magic != LUDORA_DL_PARAMS_MAGIC) {
    fail(status, LUDORA_DL_STAGE_PARAM, -1, params->magic);
    return -1;
  }
  if (params->ip_len == 0 || params->ip_len >= LUDORA_DL_IP_MAX ||
      params->path_len == 0 || params->path_len >= LUDORA_DL_PATH_MAX) {
    fail(status, LUDORA_DL_STAGE_PARAM, -3, 0);
    return -1;
  }

  /* 下载前先查是否真的需要下载:
   *   - ludora 已装 → 什么都不用下(装后源 pkg 已被安装服务删掉,仅靠"pkg 是否存在"
   *     判断会误判成"未装"而重复下载);直接判 DONE。内/外盘 appmeta 都要判,覆盖
   *     ludora 被移到扩展硬盘的情况。
   *   - pkg 已落盘(上次下载完还没重启装机)→ 写强制标记,autorun 会优先用 HDD 包。
   * detail0=1 表示"已存在/已装,跳过下载",供浏览器侧区分展示。 */
  if (file_exists(APP_INSTALLED_DIR) || file_exists(APP_INSTALLED_DIR_EXT)) {
    write_marker("SKIP-INSTALLED\n");
    update(status, LUDORA_DL_STAGE_DONE, 0, 1, 0);
    return 0;
  }
  if (file_exists(PKG_PATH)) {
    write_force_staged();
    write_marker("SKIP\n");
    update(status, LUDORA_DL_STAGE_DONE, 0, 1, 0);
    return 0;
  }

  /* /data/pkg 可能不存在(全新机首次越狱),先确保目录再落盘。 */
  {
    int mkrc = ensure_pkg_dir();
    if (mkrc != 0) {
      fail(status, LUDORA_DL_STAGE_BODY, -4, (uint32_t)mkrc);
      return -1;
    }
  }

  if (http_download(status, params) != 0) {
    return -1;
  }

  write_force_staged();
  write_marker("OK\n");
  update(status, LUDORA_DL_STAGE_DONE, 0, 0, 0);
  return 0;
}
