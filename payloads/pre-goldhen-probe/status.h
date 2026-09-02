#ifndef LUDORA_PRE_GOLDHEN_STATUS_H
#define LUDORA_PRE_GOLDHEN_STATUS_H

#include <stdint.h>

#define LUDORA_PRE_GOLDHEN_MAGIC 0x4c445047u
#define LUDORA_PRE_GOLDHEN_VERSION 1u
#define LUDORA_PRE_GOLDHEN_STATUS_OFFSET 0x1000u

#define LUDORA_PRE_GOLDHEN_STAGE_ENTRY 1u
#define LUDORA_PRE_GOLDHEN_STAGE_FILE_OPEN 2u
#define LUDORA_PRE_GOLDHEN_STAGE_FILE_WRITE 3u
#define LUDORA_PRE_GOLDHEN_STAGE_FILE_CLOSE 4u
#define LUDORA_PRE_GOLDHEN_STAGE_MODULE_LOAD 5u
#define LUDORA_PRE_GOLDHEN_STAGE_SYMBOL_RESOLVE 6u
#define LUDORA_PRE_GOLDHEN_STAGE_NOTIFY 7u
#define LUDORA_PRE_GOLDHEN_STAGE_DONE 0x7fu
#define LUDORA_PRE_GOLDHEN_STAGE_FAILED 0x80u

struct ludora_pre_goldhen_status {
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
