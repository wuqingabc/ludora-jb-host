#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PAYLOAD_DIR="$ROOT_DIR/payloads/pre-goldhen-probe"
OUTPUT_BIN="$ROOT_DIR/g2all/ludora-pre-goldhen-probe.bin"

if [[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] && command -v gcc >/dev/null && command -v ld >/dev/null && command -v objcopy >/dev/null; then
  make -C "$PAYLOAD_DIR" clean verify
else
  docker run --rm --platform linux/amd64 --user "$(id -u):$(id -g)" \
    -v "$ROOT_DIR:/work" -w /work/payloads/pre-goldhen-probe \
    --entrypoint /bin/sh ludora-ps4-payload-sdk-amd64:latest \
    -lc 'make clean verify'
fi

cp "$PAYLOAD_DIR/bin/ludora-pre-goldhen-probe.bin" "$OUTPUT_BIN"
printf 'raw payload: %s bytes\n' "$(wc -c < "$OUTPUT_BIN" | tr -d ' ')"
printf 'sha256: '
shasum -a 256 "$OUTPUT_BIN" | awk '{print $1}'
