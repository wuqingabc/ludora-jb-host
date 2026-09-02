.intel_syntax noprefix
.equ LUDORA_PRE_GOLDHEN_MAGIC, 0x4c445047
.equ LUDORA_PRE_GOLDHEN_VERSION, 1
.equ LUDORA_PRE_GOLDHEN_STAGE_ENTRY, 1

.section .text.start
.global _start
_start:
    # RDI is the pthread argument. The browser passes the mapped payload base.
    # This acknowledgement executes before any C prologue or syscall.
    mov eax, LUDORA_PRE_GOLDHEN_MAGIC
    mov DWORD PTR [rdi + 0x1000], eax
    mov DWORD PTR [rdi + 0x1004], LUDORA_PRE_GOLDHEN_VERSION
    mov DWORD PTR [rdi + 0x1008], LUDORA_PRE_GOLDHEN_STAGE_ENTRY
    mov DWORD PTR [rdi + 0x1018], 1
    jmp _main
