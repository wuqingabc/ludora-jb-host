.intel_syntax noprefix
.equ LUDORA_DL_MAGIC, 0x4c445044
.equ LUDORA_DL_VERSION, 1
.equ LUDORA_DL_STAGE_ENTRY, 1
.equ LUDORA_DL_STATUS_OFFSET, 0x40000

.section .text.start
.global _start
_start:
    # RDI is the pthread argument. The browser passes the mapped payload base.
    # Acknowledge before any C prologue or syscall so the browser can detect
    # that the payload reached entry even if the rest crashes.
    mov eax, LUDORA_DL_MAGIC
    mov DWORD PTR [rdi + LUDORA_DL_STATUS_OFFSET], eax
    mov DWORD PTR [rdi + LUDORA_DL_STATUS_OFFSET + 4], LUDORA_DL_VERSION
    mov DWORD PTR [rdi + LUDORA_DL_STATUS_OFFSET + 8], LUDORA_DL_STAGE_ENTRY
    mov DWORD PTR [rdi + LUDORA_DL_STATUS_OFFSET + 0x18], 1
    jmp _main
