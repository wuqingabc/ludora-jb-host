#ifndef LUDORA_DL_PARAMS_H
#define LUDORA_DL_PARAMS_H

#include <stdint.h>

#define LUDORA_DL_PARAMS_MAGIC 0x4c445043u
#define LUDORA_DL_IP_MAX 64
#define LUDORA_DL_PATH_MAX 512
#define LUDORA_DL_SHA256_HEX 64
#define LUDORA_DL_HOST_MAX 128

/*
 * 注入参数区。浏览器在 pthread_create 之前把这些字段写进
 * payload 映射基址 + LUDORA_DL_PARAMS_OFFSET。
 * 下载器在 crt0 用 RDI(base)写状态页,这里读参数区。
 *
 * 与浏览器侧(chain_poops.js / g2all lapse.js)用相同偏移硬编码对齐,
 * 修改本结构必须同步改浏览器侧的写入偏移。
 *
 * 字段偏移(与 JS 硬编码一致):
 *   magic      0x00 (4)
 *   port       0x04 (2)
 *   ip_len     0x06 (2)
 *   path_len   0x08 (2)
 *   host_len   0x0a (2)   ← 原 reserved,现存 host 字符串长度
 *   ip         0x0c (64)  点分十进制 IPv4,connect 用
 *   path       0x4c (512) URL path,如 /ludora/ludora-3.30.pkg
 *   sha256_hex 0x24c (64) 预期 SHA-256,小写 64 hex
 *   host       0x28c (128) TLS SNI + HTTP Host,如 ludora-media.tryme.la
 */
struct ludora_dl_params {
  uint32_t magic;
  uint16_t port;
  uint16_t ip_len;
  uint16_t path_len;
  uint16_t host_len;
  char ip[LUDORA_DL_IP_MAX];
  char path[LUDORA_DL_PATH_MAX];
  char sha256_hex[LUDORA_DL_SHA256_HEX];
  char host[LUDORA_DL_HOST_MAX];
};

#endif
