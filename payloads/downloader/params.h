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
 * 与浏览器侧(chain_poops.js / g2all lapse.js)用相同偏移硬编码对齐,
 * 修改本结构必须同步改浏览器侧的写入偏移。
 */
struct ludora_dl_params {
  uint32_t magic;                    /* 0x4c445043,参数区校验 */
  uint16_t port;                     /* 目标端口,主机字节序(80/8930) */
  uint16_t ip_len;                   /* ip 字符串长度 */
  uint16_t path_len;                 /* path 字符串长度 */
  uint16_t reserved;
  char ip[LUDORA_DL_IP_MAX];         /* 点分十进制 IPv4,connect 用 */
  char path[LUDORA_DL_PATH_MAX];     /* /jb/host/pkg/ludora.pkg?t=TOKEN */
  char sha256_hex[LUDORA_DL_SHA256_HEX]; /* 预期 SHA-256,小写 64 hex */
};

#endif
