PS4SDK ?= /opt/ps4-payload-sdk
SDK_LIB := $(PS4SDK)/libPS4
BUILD := build
BIN_DIR := bin
ELF := $(BUILD)/ludora-notification.elf
BIN := $(BIN_DIR)/ludora-notification.bin

CC ?= gcc
LD ?= ld
OBJCOPY ?= objcopy
CFLAGS := -I$(SDK_LIB)/include -Os -std=c11 -ffunction-sections -fdata-sections \
  -fno-builtin -nostartfiles -nostdlib -Wall -Wextra -masm=intel \
  -m64 -mcmodel=small -mno-red-zone -fcf-protection=none -fpie -fPIC

# Keep this payload deliberately small and deterministic. Pulling every SDK
# translation unit into a pre-GoldHEN raw blob increases compile time, binary
# size, and the chance of dragging in unrelated libc/runtime code.
SDK_C := $(SDK_LIB)/source/kernel.c $(SDK_LIB)/source/module.c $(SDK_LIB)/source/file.c
SDK_S := $(SDK_LIB)/source/syscall.s
SDK_OBJ := $(patsubst $(SDK_LIB)/source/%.c,$(BUILD)/sdk-%.o,$(SDK_C)) \
  $(patsubst $(SDK_LIB)/source/%.s,$(BUILD)/sdk-%.o,$(SDK_S))

.PHONY: all clean verify

all: $(BIN)

$(BUILD) $(BIN_DIR):
	mkdir -p $@

$(BUILD)/sdk-%.o: $(SDK_LIB)/source/%.c | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

$(BUILD)/sdk-%.o: $(SDK_LIB)/source/%.s | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

$(BUILD)/main.o: main.c | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

$(BUILD)/crt0.o: $(SDK_LIB)/crt0.s | $(BUILD)
	$(CC) -c -o $@ $< $(CFLAGS)

$(ELF): $(BUILD)/main.o $(BUILD)/crt0.o $(SDK_OBJ) $(SDK_LIB)/linker.x
	$(CC) $(CFLAGS) -Wl,-T,$(SDK_LIB)/linker.x -Wl,--gc-sections \
	  $(BUILD)/crt0.o $(BUILD)/main.o $(SDK_OBJ) -o $@

$(BIN): $(ELF) | $(BIN_DIR)
	$(OBJCOPY) -O binary $(ELF) $@

verify: $(BIN)
	@test -s $(BIN)
	@test "$$(od -An -tx1 -N4 $(BIN) | tr -d ' \n')" != "7f454c46"
	@strings -a $(BIN) | grep -Fq "LUDORA_PRE_GOLDHEN_BIN_ENTERED"
	@if objdump -d $(ELF) | grep -q 'endbr64'; then echo 'unexpected CET ENDBR64 instruction in PS4 payload'; exit 1; fi

clean:
	rm -rf $(BUILD) $(BIN_DIR)
