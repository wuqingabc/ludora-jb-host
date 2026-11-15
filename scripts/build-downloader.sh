#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PAYLOAD_DIR="$ROOT_DIR/payloads/downloader"
OUTPUT_BIN_G2ALL="$ROOT_DIR/g2all/ludora-web-downloader.bin"
OUTPUT_BIN_ZRM="$ROOT_DIR/zrm/ludora-web-downloader.bin"

if [[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] && command -v gcc >/dev/null && command -v ld >/dev/null && command -v objcopy >/dev/null; then
  make -C "$PAYLOAD_DIR" clean verify
else
  docker run --rm --platform linux/amd64 --user "$(id -u):$(id -g)" \
    -v "$ROOT_DIR:/work" -w /work/payloads/downloader \
    --entrypoint /bin/sh ludora-ps4-payload-sdk-amd64:latest \
    -lc 'make clean verify'
fi

cp "$PAYLOAD_DIR/bin/ludora-web-downloader.bin" "$OUTPUT_BIN_G2ALL"
cp "$PAYLOAD_DIR/bin/ludora-web-downloader.bin" "$OUTPUT_BIN_ZRM"
printf 'raw payload: %s bytes\n' "$(wc -c < "$OUTPUT_BIN_G2ALL" | tr -d ' ')"
printf 'sha256: '
shasum -a 256 "$OUTPUT_BIN_G2ALL" | awk '{print $1}'
