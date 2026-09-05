#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PAYLOAD_DIR="$ROOT_DIR/payloads/ludora-notification"

if [[ -z "${PS4SDK:-}" ]]; then
  if [[ -d /opt/ps4-payload-sdk/libPS4 ]]; then
    export PS4SDK=/opt/ps4-payload-sdk
  else
    echo "PS4SDK is not set and /opt/ps4-payload-sdk is unavailable" >&2
    exit 2
  fi
fi

make -C "$PAYLOAD_DIR" PS4SDK="$PS4SDK" clean
make -C "$PAYLOAD_DIR" PS4SDK="$PS4SDK" verify

BIN="$PAYLOAD_DIR/bin/ludora-notification.bin"
printf 'raw payload: %s bytes\n' "$(wc -c < "$BIN" | tr -d ' ')"
printf 'sha256: '
shasum -a 256 "$BIN" | awk '{print $1}'
