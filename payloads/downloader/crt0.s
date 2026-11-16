.intel_syntax noprefix
.equ LUDORA_DL_MAGIC, 0x4c445044
.equ LUDORA_DL_VERSION, 1
.equ LUDORA_DL_STAGE_ENTRY, 1

.section .text.start
.global _start
_start:
    # RDI is the pthread argument. The browser passes the mapped payload base.
    # Acknowledge before any C prologue or syscall so the browser can detect
    # that the payload reached entry even if the rest crashes.
    mov eax, LUDORA_DL_MAGIC
    mov DWORD PTR [rdi + 0x4000], eax
    mov DWORD PTR [rdi + 0x4004], LUDORA_DL_VERSION
    mov DWORD PTR [rdi + 0x4008], LUDORA_DL_STAGE_ENTRY
    mov DWORD PTR [rdi + 0x4018], 1
    jmp _main
