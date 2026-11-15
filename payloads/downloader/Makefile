CC ?= gcc
LD ?= ld
OBJCOPY ?= objcopy

BUILD := build
BIN_DIR := bin
ELF := $(BUILD)/ludora-web-downloader.elf
BIN := $(BIN_DIR)/ludora-web-downloader.bin
# Freestanding raw syscall payload; no libc, no dynamic linking.
CFLAGS := -O0 -std=c11 -ffreestanding -fno-builtin -fno-stack-protector \
  -fno-asynchronous-unwind-tables -fno-unwind-tables -ffunction-sections -fdata-sections \
  -m64 -mcmodel=small -mno-red-zone -fcf-protection=none -fpie -fPIC -Wall -Wextra -Werror

.PHONY: all clean verify

all: $(BIN)

$(BUILD) $(BIN_DIR):
	mkdir -p $@

$(BUILD)/crt0.o: crt0.s status.h | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

$(BUILD)/main.o: main.c status.h params.h | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

$(ELF): $(BUILD)/crt0.o $(BUILD)/main.o linker.ld | $(BUILD)
	$(LD) -nostdlib -T linker.ld --gc-sections -o $@ $(BUILD)/crt0.o $(BUILD)/main.o

$(BIN): $(ELF) | $(BIN_DIR)
	$(OBJCOPY) -O binary $(ELF) $@

verify: $(BIN)
	@test -s $(BIN)
	@test "$$(od -An -tx1 -N4 $(BIN) | tr -d ' \n')" != "7f454c46"
	@strings -a $(BIN) | grep -Fq "/data/pkg/ludora.pkg"
	@strings -a $(BIN) | grep -Fq "/data/pkg/ludora.pkg.tmp"
	@strings -a $(BIN) | grep -Fq "/data/.ludora_force_staged"
	@if strings -a $(BIN) | grep -Fq "sceAppInstUtilAppInstallPkg"; then echo 'install logic must be removed from downloader'; exit 1; fi
	@if objdump -d $(ELF) | grep -q 'endbr64'; then echo 'unexpected CET ENDBR64 instruction'; exit 1; fi

clean:
	rm -rf $(BUILD) $(BIN_DIR)
