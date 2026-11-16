#ifndef LUDORA_DL_STATUS_H
#define LUDORA_DL_STATUS_H

#include <stdint.h>

#define LUDORA_DL_MAGIC 0x4c445044u
#define LUDORA_DL_VERSION 1u
/* 状态页/参数区偏移必须落在 .bin 代码段之后。原下载器 .bin 只有 ~0x2480 字节,
 * 状态页放 0x4000/参数区放 0x5000 即可;引入 BearSSL 后 .bin 涨到 ~0x10000+,
 * 且 .bss 紧随代码段之后(注入侧会把整个映射清零,故 .bss 从 filesz 起算),
 * 状态/参数区必须抬到代码段 + .bss 之后。抬到 0x40000/0x41000,同时浏览器侧
 * 映射大小须 >= 0x41400(见 lapse.js 的 mappingBytes 兜底)。 */
#define LUDORA_DL_STATUS_OFFSET 0x40000u
#define LUDORA_DL_PARAMS_OFFSET 0x41000u

#define LUDORA_DL_STAGE_ENTRY 1u
#define LUDORA_DL_STAGE_PARAM 2u
#define LUDORA_DL_STAGE_SOCKET 3u
#define LUDORA_DL_STAGE_CONNECT 4u
#define LUDORA_DL_STAGE_SEND 5u
#define LUDORA_DL_STAGE_RESP_HEAD 6u
#define LUDORA_DL_STAGE_BODY 7u
#define LUDORA_DL_STAGE_HASH 8u
#define LUDORA_DL_STAGE_MODULE_LOAD 9u
#define LUDORA_DL_STAGE_SYMBOL 10u
#define LUDORA_DL_STAGE_INSTALL 11u
#define LUDORA_DL_STAGE_LAUNCH 12u
#define LUDORA_DL_STAGE_DONE 0x7fu
#define LUDORA_DL_STAGE_FAILED 0x80u

struct ludora_dl_status {
  uint32_t magic;
  uint32_t version;
  uint32_t stage;
  int32_t result;
  uint32_t detail0;
  uint32_t detail1;
  uint32_t sequence;
  uint32_t reserved;
};

#endif
