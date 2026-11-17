#ifndef LUDORA_DL_PARAMS_H
#define LUDORA_DL_PARAMS_H

#include <stdint.h>

#define LUDORA_DL_PARAMS_MAGIC 0x4c445043u
#define LUDORA_DL_IP_MAX 64
#define LUDORA_DL_PATH_MAX 512
#define LUDORA_DL_SHA256_HEX 64

/*
 * 注入参数区。浏览器在 pthread_create 之前把这些字段写进
 * payload 映射基址 + LUDORA_DL_PARAMS_OFFSET(0x5000)。
 * 下载器在 crt0 用 RDI(base)写状态页(0x4000),这里读参数区(0x5000)。
 *
 * 两个下载目标共享 ip/port:
 *   path/sha256_hex  = pkg(下到 /data/pkg/ludora.pkg)
 *   path2/sha256_hex2 = autorun elf(下到 /data/payloads/ludora_autorun.elf)
 * path2_len == 0 表示未配置 elf(老引擎),下载器退化为只下 pkg。
 *
 * 与浏览器侧(chain_poops.js / 13x / 14x / g2all / css 各注入段)用相同偏移
 * 硬编码对齐,修改本结构必须同步改浏览器侧的写入偏移。
 * 结构总大小 0x4cc(原 0x28c);参数区偏移仍是 0x5000,浏览器 dsz 公式
 * (0x5000 + 0x4cc + 0xfff) & ~0xfff 仍 = 0x6000,dsz 不变。
 */
struct ludora_dl_params {
  uint32_t magic;                    /* +0x00 0x4c445043,参数区校验 */
  uint16_t port;                     /* +0x04 目标端口,主机字节序(80) */
  uint16_t ip_len;                   /* +0x06 ip 字符串长度 */
  uint16_t path_len;                 /* +0x08 pkg path 字符串长度 */
  uint16_t path2_len;                /* +0x0a elf path 字符串长度(原 reserved) */
  char ip[LUDORA_DL_IP_MAX];         /* +0x0c 点分十进制 IPv4,connect 用 */
  char path[LUDORA_DL_PATH_MAX];     /* +0x4c /jb/host/pkg/ludora.pkg */
  char sha256_hex[LUDORA_DL_SHA256_HEX]; /* +0x24c pkg 预期 SHA-256,小写 64 hex */
  char path2[LUDORA_DL_PATH_MAX];    /* +0x28c /jb/host/autorun/ludora_autorun.elf */
  char sha256_hex2[LUDORA_DL_SHA256_HEX]; /* +0x48c elf 预期 SHA-256,小写 64 hex */
};

#endif
