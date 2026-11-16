CC ?= gcc
LD ?= ld
OBJCOPY ?= objcopy

BUILD := build
BIN_DIR := bin
ELF := $(BUILD)/ludora-web-downloader.elf
BIN := $(BIN_DIR)/ludora-web-downloader.bin

# Freestanding raw syscall payload; no libc, no dynamic linking.
# Our code is built at -O0 -Werror; BearSSL (third-party) is built at -O2 with
# warnings suppressed (-w) so a newer GCC's stricter diagnostics don't block it.
# -D_FORTIFY_SOURCE=0: Ubuntu glibc 2.34+ auto-defines _FORTIFY_SOURCE, which maps
# memcpy/memset/memmove to __*_chk in any TU that includes <string.h> (BearSSL's
# inner.h does). We are freestanding and supply our own memcpy/memset, so the _chk
# variants would be undefined at link time. Force it off.
CFLAGS := -O0 -std=c11 -ffreestanding -fno-builtin -fno-stack-protector \
  -fno-asynchronous-unwind-tables -fno-unwind-tables -ffunction-sections -fdata-sections \
  -m64 -mcmodel=small -mno-red-zone -fcf-protection=none -fpie -fPIC -Wall -Wextra -Werror \
  -D_FORTIFY_SOURCE=0 -Ibearssl/inc -Ibearssl/src -I.

# Force BearSSL's pure-C code paths (no x86 AES-NI/SSE2/POWER8/RDRAND intrinsics,
# which would need target-specific headers/asm we don't want in a freestanding
# -fno-builtin payload). The relevant platform-asm .c files are excluded below.
# -O1 not -O2: GCC 15.2.0 hits an internal compiler error (cc1 segfault) on
# ec_c25519_i15.c at -O2. The downloader does a single TLS handshake, so the
# performance difference is negligible and -O1 avoids the ICE class entirely.
BSSL_CFLAGS := -O1 -std=c11 -ffreestanding -fno-builtin -fno-stack-protector \
  -fno-asynchronous-unwind-tables -fno-unwind-tables -ffunction-sections -fdata-sections \
  -m64 -mcmodel=small -mno-red-zone -fcf-protection=none -fpie -fPIC -w \
  -D_FORTIFY_SOURCE=0 -DBR_AES_X86NI=0 -DBR_SSE2=0 -DBR_POWER8=0 -DBR_RDRAND=0 \
  -Ibearssl/inc -Ibearssl/src

# BearSSL sources, minus (a) sysrng.c (we supply br_prng_seeder_system in
# freestanding_shim.c) and (b) the target-specific asm/intrinsics files.
BSSL_SRC := $(filter-out \
  bearssl/src/rand/sysrng.c \
  bearssl/src/symcipher/aes_x86ni.c \
  bearssl/src/symcipher/aes_x86ni_cbcdec.c \
  bearssl/src/symcipher/aes_x86ni_cbcenc.c \
  bearssl/src/symcipher/aes_x86ni_ctr.c \
  bearssl/src/symcipher/aes_x86ni_ctrcbc.c \
  bearssl/src/symcipher/aes_pwr8.c \
  bearssl/src/symcipher/aes_pwr8_cbcdec.c \
  bearssl/src/symcipher/aes_pwr8_cbcenc.c \
  bearssl/src/symcipher/aes_pwr8_ctr.c \
  bearssl/src/symcipher/aes_pwr8_ctrcbc.c \
  bearssl/src/symcipher/chacha20_sse2.c \
  bearssl/src/hash/ghash_pclmul.c \
  bearssl/src/hash/ghash_pwr8.c \
  ,$(wildcard bearssl/src/*/*.c))

BSSL_OBJ := $(patsubst bearssl/src/%.c,$(BUILD)/bssl/%.o,$(BSSL_SRC))

.PHONY: all clean verify

all: $(BIN)

$(BUILD) $(BIN_DIR):
	mkdir -p $@

$(BUILD)/crt0.o: crt0.s status.h | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

$(BUILD)/main.o: main.c status.h params.h tls.h | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

$(BUILD)/tls.o: tls.c tls.h | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

$(BUILD)/freestanding_shim.o: freestanding_shim.c | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

# The Docker SDK's gcc 15.2.0 intermittently segfaults (cc1) on this code under
# memory pressure; retry each TU a few times, discarding any partial .o left by a
# crash, so a transient failure doesn't poison the build.
$(BUILD)/bssl/%.o: bearssl/src/%.c
	@mkdir -p $(dir $@)
	@i=0; while [ $$i -lt 8 ]; do \
	  $(CC) -c -o $@ $< $(BSSL_CFLAGS) && break; \
	  rm -f $@; i=$$((i+1)); \
	done; \
	test -f $@

$(ELF): $(BUILD)/crt0.o $(BUILD)/main.o $(BUILD)/tls.o $(BUILD)/freestanding_shim.o $(BSSL_OBJ) linker.ld | $(BUILD)
	$(LD) -nostdlib -T linker.ld --gc-sections -o $@ \
	  $(BUILD)/crt0.o $(BUILD)/main.o $(BUILD)/tls.o $(BUILD)/freestanding_shim.o $(BSSL_OBJ)

$(BIN): $(ELF) | $(BIN_DIR)
	$(OBJCOPY) -O binary $(ELF) $@

verify: $(BIN)
	@test -s $(BIN)
	@test "$$(od -An -tx1 -N4 $(BIN) | tr -d ' \n')" != "7f454c46"
	@strings -a $(BIN) | grep -Fq "/data/pkg/ludora.pkg"
	@strings -a $(BIN) | grep -Fq "/data/pkg/ludora.pkg.tmp"
	@strings -a $(BIN) | grep -Fq "/data/.ludora_force_staged"
	@strings -a $(BIN) | grep -Fq "/user/appmeta/LUDO00001"
	@strings -a $(BIN) | grep -Fq "/user/appmeta/external/LUDO00001"
	@if strings -a $(BIN) | grep -Fq "sceAppInstUtilAppInstallPkg"; then echo 'install logic must be removed from downloader'; exit 1; fi
	@if objdump -d $(ELF) | grep -q 'endbr64'; then echo 'unexpected CET ENDBR64 instruction'; exit 1; fi

clean:
	rm -rf $(BUILD) $(BIN_DIR)
