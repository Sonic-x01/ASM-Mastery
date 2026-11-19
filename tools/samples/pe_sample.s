    .intel_syntax noprefix
    .section .rdata,"dr"
msg:    .ascii "Hello from Windows x64!\r\n"
        .set msg_len, . - msg
title:  .asciz "ASM Mastery"
text:   .asciz "PE explorer sample"
    .bss
written: .space 4
    .text
    .globl start
start:
    sub rsp, 40
    mov ecx, -11
    call [rip + __imp_GetStdHandle]
    mov rcx, rax
    lea rdx, [rip + msg]
    mov r8d, msg_len
    lea r9, [rip + written]
    mov qword ptr [rsp+32], 0
    call [rip + __imp_WriteFile]
    xor ecx, ecx
    lea rdx, [rip + text]
    lea r8, [rip + title]
    mov r9d, 0x40
    call [rip + __imp_MessageBoxA]
    xor ecx, ecx
    call [rip + __imp_ExitProcess]
