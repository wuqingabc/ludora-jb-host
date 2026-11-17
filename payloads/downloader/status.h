#ifndef LUDORA_DL_STATUS_H
#define LUDORA_DL_STATUS_H

#include <stdint.h>

#define LUDORA_DL_MAGIC 0x4c445044u
#define LUDORA_DL_VERSION 1u
/* 状态页/参数区偏移必须落在 .bin 代码段之后:.bin 当前 0x4891 字节,
 * 曾把状态页放 0x1000/参数区放 0x2000,会覆盖 .text 自毁挂起。8 路分块
 * 下载代码涨到 0x4891,已越过旧 0x4000,故抬到 0x8000/0x9000。 */
#define LUDORA_DL_STATUS_OFFSET 0x8000u
#define LUDORA_DL_PARAMS_OFFSET 0x9000u

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
