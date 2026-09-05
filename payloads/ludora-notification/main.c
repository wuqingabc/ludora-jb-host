#include "file.h"

/*
 * This is intentionally a small, independent raw payload. It runs after the
 * WebKit jailbreak and before GoldHEN. It deliberately does not initialize
 * modules or call the ShellUI notification API. Its only job is to leave a
 * fresh marker that the browser can verify after GoldHEN starts.
 */
static int write_marker(const char *marker_path) {
  const char marker_data[] = "LUDORA_PRE_GOLDHEN_BIN_ENTERED\n";
  int marker_fd = open(marker_path, O_WRONLY | O_CREAT | O_TRUNC, 0777);
  if (marker_fd < 0) return -1;
  int written = write(marker_fd, marker_data, sizeof(marker_data) - 1);
  close(marker_fd);
  return written == (int)(sizeof(marker_data) - 1) ? 0 : -2;
}

int _main(void) {
  const char data_marker[] = "/data/.ludora-pre-goldhen-probe";
  const char tmp_marker[] = "/tmp/.ludora-pre-goldhen-probe";
  int data_result = write_marker(data_marker);
  if (data_result == 0) return 0;
  int tmp_result = write_marker(tmp_marker);
  if (tmp_result == 0) return 1;
  return data_result == -1 ? -1001 : (tmp_result == -1 ? -1002 : -1003);
}
