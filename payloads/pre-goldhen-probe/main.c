#include <stdint.h>

#include "status.h"

#define O_WRONLY 0x0001
#define O_CREAT 0x0200
#define O_TRUNC 0x0400

struct notification_request {
  int32_t type;
  int32_t req_id;
  int32_t priority;
  int32_t msg_id;
  int32_t target_id;
  int32_t user_id;
  int32_t device_id;
  int32_t addressing_user_id;
  int32_t app_id;
  int32_t error_number;
  int32_t attribute;
  uint8_t use_icon_image_uri;
  char buffer[0xc03];
} __attribute__((packed));

typedef int (*notification_function)(int, struct notification_request *, uint64_t, int);

_Static_assert(sizeof(struct notification_request) == 0xc30, "PS4 notification request must be 0xc30 bytes");

static long syscall1(long number, long arg1) {
  long result;
  __asm__ volatile("syscall" : "=a"(result) : "a"(number), "D"(arg1) : "rcx", "r11", "memory");
  return result;
}

static long syscall3(long number, long arg1, long arg2, long arg3) {
  long result;
  __asm__ volatile("syscall" : "=a"(result) : "a"(number), "D"(arg1), "S"(arg2), "d"(arg3) : "rcx", "r11", "memory");
  return result;
}

static long syscall4(long number, long arg1, long arg2, long arg3, long arg4) {
  long result;
  register long r10 __asm__("r10") = arg4;
  __asm__ volatile("syscall" : "=a"(result) : "a"(number), "D"(arg1), "S"(arg2), "d"(arg3), "r"(r10) : "rcx", "r11", "memory");
  return result;
}

static void copy_text(char *destination, const char *source, uint32_t limit) {
  uint32_t index = 0;
  while (index + 1 < limit && source[index]) {
    destination[index] = source[index];
    index++;
  }
  destination[index] = 0;
}

static void update(struct ludora_pre_goldhen_status *status, uint32_t stage, int32_t result, uint32_t detail0, uint32_t detail1) {
  status->stage = stage;
  status->result = result;
  status->detail0 = detail0;
  status->detail1 = detail1;
  status->sequence++;
}

static void fail(struct ludora_pre_goldhen_status *status, uint32_t failed_stage, int32_t result, uint32_t detail0) {
  update(status, LUDORA_PRE_GOLDHEN_STAGE_FAILED, result, failed_stage, detail0);
}

int _main(void *payload_base) {
  struct ludora_pre_goldhen_status *status = (struct ludora_pre_goldhen_status *)((uint8_t *)payload_base + LUDORA_PRE_GOLDHEN_STATUS_OFFSET);
  static const char marker_path[] = "/data/.ludora-pre-goldhen-probe-v2";
  static const char marker_text[] = "LUDORA_PRE_GOLDHEN_RAW_PAYLOAD_OK\n";
  static const char module_primary[] = "libkernel.sprx";
  static const char module_fallback[] = "libkernel_web.sprx";
  static const char notify_symbol[] = "sceKernelSendNotificationRequest";
  static const char notify_text[] = "Ludora pre-GoldHEN payload: raw probe reached notification";
  static const char icon_uri[] = "cxml://psnotification/tex_icon_system";

  update(status, LUDORA_PRE_GOLDHEN_STAGE_FILE_OPEN, 0, 0, 0);
  long fd = syscall3(5, (long)(uintptr_t)marker_path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
  if (fd < 0) {
    fail(status, LUDORA_PRE_GOLDHEN_STAGE_FILE_OPEN, (int32_t)fd, 0);
    return (int)fd;
  }

  update(status, LUDORA_PRE_GOLDHEN_STAGE_FILE_WRITE, 0, (uint32_t)fd, 0);
  long written = syscall3(4, fd, (long)(uintptr_t)marker_text, sizeof(marker_text) - 1);
  if (written != (long)(sizeof(marker_text) - 1)) {
    syscall1(6, fd);
    fail(status, LUDORA_PRE_GOLDHEN_STAGE_FILE_WRITE, (int32_t)written, (uint32_t)fd);
    return (int)written;
  }

  update(status, LUDORA_PRE_GOLDHEN_STAGE_FILE_CLOSE, 0, (uint32_t)fd, (uint32_t)written);
  long closed = syscall1(6, fd);
  if (closed < 0) {
    fail(status, LUDORA_PRE_GOLDHEN_STAGE_FILE_CLOSE, (int32_t)closed, (uint32_t)fd);
    return (int)closed;
  }

  int module_id = 0;
  update(status, LUDORA_PRE_GOLDHEN_STAGE_MODULE_LOAD, 0, 0, 0);
  long loaded = syscall4(594, (long)(uintptr_t)module_primary, 0, (long)(uintptr_t)&module_id, 0);
  if (loaded != 0) {
    module_id = 0;
    loaded = syscall4(594, (long)(uintptr_t)module_fallback, 0, (long)(uintptr_t)&module_id, 0);
  }
  if (loaded != 0 || module_id == 0) {
    fail(status, LUDORA_PRE_GOLDHEN_STAGE_MODULE_LOAD, (int32_t)loaded, (uint32_t)module_id);
    return (int)loaded;
  }

  uintptr_t notify_address = 0;
  update(status, LUDORA_PRE_GOLDHEN_STAGE_SYMBOL_RESOLVE, 0, (uint32_t)module_id, 0);
  long resolved = syscall3(591, module_id, (long)(uintptr_t)notify_symbol, (long)(uintptr_t)&notify_address);
  if (resolved != 0 || notify_address == 0) {
    fail(status, LUDORA_PRE_GOLDHEN_STAGE_SYMBOL_RESOLVE, (int32_t)resolved, (uint32_t)notify_address);
    return (int)resolved;
  }

  struct notification_request request = {0};
  request.type = 0;
  request.target_id = -1;
  request.use_icon_image_uri = 1;
  copy_text(request.buffer, notify_text, 0x400);
  copy_text(request.buffer + 0x400, icon_uri, 0x800);

  update(status, LUDORA_PRE_GOLDHEN_STAGE_NOTIFY, 0, (uint32_t)notify_address, 0);
  int notification_result = ((notification_function)notify_address)(0, &request, sizeof(request), 0);
  if (notification_result != 0) {
    fail(status, LUDORA_PRE_GOLDHEN_STAGE_NOTIFY, notification_result, (uint32_t)notify_address);
    return notification_result;
  }

  update(status, LUDORA_PRE_GOLDHEN_STAGE_DONE, 0, (uint32_t)written, (uint32_t)module_id);
  return 0;
}
