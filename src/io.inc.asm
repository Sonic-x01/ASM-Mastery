; ===================== io.inc — course print helpers =====================
; Linux x86-64, raw syscalls only (no libc). Unlike real ABI functions,
; these helpers preserve EVERY register and the flags, so beginner code
; can call them anywhere without surprises.
;   print_str  rdi = address of a NUL-terminated string
;   print_char dil = the character
;   print_nl   prints "\n"
;   print_uint rdi = unsigned 64-bit number (decimal)
;   print_int  rdi = signed 64-bit number (decimal)
;   print_hex  rdi = number, printed as 0x... (uppercase)
;   exit       edi = exit code (never returns)
section .text
print_str:
    pushfq
    push rax
    push rcx
    push rdx
    push rsi
    push rdi
    push r11
    mov rsi, rdi
    xor edx, edx
.len:
    cmp byte [rsi+rdx], 0
    je .go
    inc rdx
    jmp .len
.go:
    mov eax, 1
    mov edi, 1
    syscall
    pop r11
    pop rdi
    pop rsi
    pop rdx
    pop rcx
    pop rax
    popfq
    ret

print_char:
    pushfq
    push rax
    push rcx
    push rdx
    push rsi
    push rdi
    push r11
    push rdi
    mov rsi, rsp
    mov eax, 1
    mov edi, 1
    mov edx, 1
    syscall
    pop rdi
    pop r11
    pop rdi
    pop rsi
    pop rdx
    pop rcx
    pop rax
    popfq
    ret

print_nl:
    push rdi
    mov edi, 10
    call print_char
    pop rdi
    ret

print_uint:
    pushfq
    push rax
    push rcx
    push rdx
    push rsi
    push rdi
    push r8
    push r11
    sub rsp, 32
    mov rax, rdi
    lea rsi, [rsp+32]
    mov r8d, 10
.next:
    xor edx, edx
    div r8
    add dl, '0'
    dec rsi
    mov [rsi], dl
    test rax, rax
    jnz .next
    lea rdx, [rsp+32]
    sub rdx, rsi
    mov eax, 1
    mov edi, 1
    syscall
    add rsp, 32
    pop r11
    pop r8
    pop rdi
    pop rsi
    pop rdx
    pop rcx
    pop rax
    popfq
    ret

print_int:
    pushfq
    push rdi
    test rdi, rdi
    jns .pos
    push rdi
    mov edi, '-'
    call print_char
    pop rdi
    neg rdi
.pos:
    call print_uint
    pop rdi
    popfq
    ret

print_hex:
    pushfq
    push rax
    push rcx
    push rdx
    push rsi
    push rdi
    push r11
    sub rsp, 32
    mov rax, rdi
    lea rsi, [rsp+32]
.next:
    mov edx, eax
    and edx, 15
    cmp dl, 10
    jb .digit
    add dl, 'A' - 10
    jmp .put
.digit:
    add dl, '0'
.put:
    dec rsi
    mov [rsi], dl
    shr rax, 4
    jnz .next
    dec rsi
    mov byte [rsi], 'x'
    dec rsi
    mov byte [rsi], '0'
    lea rdx, [rsp+32]
    sub rdx, rsi
    mov eax, 1
    mov edi, 1
    syscall
    add rsp, 32
    pop r11
    pop rdi
    pop rsi
    pop rdx
    pop rcx
    pop rax
    popfq
    ret

exit:
    mov eax, 60
    syscall
