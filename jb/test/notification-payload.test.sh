#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PAYLOAD="$ROOT_DIR/payloads/ludora-notification/bin/ludora-notification.bin"

test -s "$PAYLOAD"
test "$(xxd -p -l 4 "$PAYLOAD")" != "7f454c46"
strings -a "$PAYLOAD" | grep -Fq "LUDORA_PRE_GOLDHEN_BIN_ENTERED"

echo "pre-GoldHEN marker raw payload checks passed"
