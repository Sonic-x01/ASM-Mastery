#!/usr/bin/env python3
"""
Encoding test: the in-page assembler/encoder (assets/emu.js) vs. real NASM.

Builds a long list of instruction forms, assembles them with NASM 3.01 on
Compiler Explorer (binary view) and with emu.js (node), and compares the
machine-code bytes of every instruction.

    python tools/test_encoder.py
"""
from __future__ import annotations

import json
import random
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EMU = (ROOT / "assets" / "emu.js").as_posix()
rnd = random.Random(7)

R64 = ["rax", "rcx", "rdx", "rbx", "rsp", "rbp", "rsi", "rdi", "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15"]
R32 = ["eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi"] + [f"r{i}d" for i in range(8, 16)]
R16 = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"] + [f"r{i}w" for i in range(8, 16)]
R8 = ["al", "cl", "dl", "bl", "spl", "bpl", "sil", "dil"] + [f"r{i}b" for i in range(8, 16)]
HI = ["ah", "ch", "dh", "bh"]
REGS = {64: R64, 32: R32, 16: R16, 8: R8}
SZ = {8: "byte", 16: "word", 32: "dword", 64: "qword"}
CCS = ["o", "no", "b", "ae", "e", "ne", "be", "a", "s", "ns", "p", "np", "l", "ge", "le", "g",
       "c", "nc", "z", "nz", "na", "nbe", "nae", "nb", "pe", "po", "nge", "nl", "ng", "nle"]
MEMS = ["[rax]", "[rsp]", "[rbp]", "[r12]", "[r13]", "[rax+8]", "[rax-8]", "[rax+127]", "[rax+128]", "[rax-128]", "[rax-129]",
        "[rax+0x1000]", "[rbx+rcx]", "[rax+rbx*4+8]", "[rbp+rax]", "[rbp+rax*2]", "[r13+r12*8-4]", "[rsp+rax*2]", "[rsp+8]",
        "[rsp+0x200]", "[rax*4]", "[rax*8+16]", "[rax*2]", "[rbx*3]", "[rcx*5+1]", "[r9*9]", "[0x1000]", "[r15+r15]",
        "[r12+rbp]", "[rdi+rsi*1]", "[rbp-0x14]", "[r8+r9*4+0x7f]", "[abs 0x404000]", "[fs:0x30]", "[gs:0x60]", "[gs:rax+8]"]
IMMS = [0, 1, -1, 5, 127, 128, -128, -129, 255, 256, 0x7FFF, 0x8000, 0xFFFF, -32768, 0x12345678, 0x7FFFFFFF, -0x80000000]


def imm_ok(v, bits, wide=False):
    if bits == 8:
        return -128 <= v <= 255
    if bits == 16:
        return -32768 <= v <= 65535
    if bits == 32:
        return -2**31 <= v <= 2**32 - 1
    return -2**31 <= v <= 2**31 - 1


def forms():
    out = []
    add = out.append
    for bits in (8, 16, 32, 64):
        regs = REGS[bits]
        for op in ["add", "or", "adc", "sbb", "and", "sub", "xor", "cmp", "test", "mov"]:
            for _ in range(4):
                add(f"{op} {rnd.choice(regs)}, {rnd.choice(regs)}")
            for v in IMMS:
                if imm_ok(v, bits):
                    add(f"{op} {rnd.choice(regs[:4])}, {v}")
                    add(f"{op} {regs[0]}, {v}")
            for m in rnd.sample(MEMS, 6):
                add(f"{op} {SZ[bits]} {m}, {rnd.choice(regs)}")
                if op not in ("test",):
                    add(f"{op} {rnd.choice(regs)}, {SZ[bits]} {m}")
                v = rnd.choice([x for x in IMMS if imm_ok(x, bits)])
                add(f"{op} {SZ[bits]} {m}, {v}")
        for op in ["inc", "dec", "neg", "not", "mul", "imul", "div", "idiv"]:
            add(f"{op} {rnd.choice(regs)}")
            add(f"{op} {SZ[bits]} {rnd.choice(MEMS)}")
        for op in ["shl", "shr", "sar", "rol", "ror", "rcl", "rcr", "sal"]:
            r = rnd.choice(regs)
            add(f"{op} {r}, 1")
            add(f"{op} {r}, cl")
            add(f"{op} {r}, {rnd.choice([2, 7, 31, 63])}")
            add(f"{op} {SZ[bits]} {rnd.choice(MEMS)}, {rnd.choice([1, 3])}")
        if bits != 8:
            for op in ["bt", "bts", "btr", "btc"]:
                add(f"{op} {rnd.choice(regs)}, {rnd.choice(regs)}")
                add(f"{op} {rnd.choice(regs)}, {rnd.randint(0, 63)}")
                add(f"{op} {SZ[bits]} {rnd.choice(MEMS)}, {rnd.choice(regs)}")
            for op in ["bsf", "bsr", "popcnt", "imul"]:
                add(f"{op} {rnd.choice(regs)}, {rnd.choice(regs)}")
                add(f"{op} {rnd.choice(regs)}, {SZ[bits]} {rnd.choice(MEMS)}")
            for v in [3, -3, 127, 128, 1000, -1000]:
                add(f"imul {rnd.choice(regs)}, {rnd.choice(regs)}, {v}")
                add(f"imul {rnd.choice(regs)}, {v}")
            for cc in CCS:
                add(f"cmov{cc} {rnd.choice(regs)}, {rnd.choice(regs)}")
            add(f"cmovz {rnd.choice(regs)}, {SZ[bits]} {rnd.choice(MEMS)}")
            for _ in range(3):
                add(f"lea {rnd.choice(regs)}, {rnd.choice(MEMS[:-3])}")
            add(f"xchg {rnd.choice(regs)}, {rnd.choice(regs)}")
            add(f"xchg {regs[0]}, {rnd.choice(regs)}")
            add(f"xchg {rnd.choice(regs)}, {regs[0]}")
            add(f"xchg {SZ[bits]} {rnd.choice(MEMS)}, {rnd.choice(regs)}")
        else:
            add(f"xchg {rnd.choice(regs)}, {rnd.choice(regs)}")
    for cc in CCS:
        add(f"set{cc} {rnd.choice(R8)}")
    add("sete byte [rax+1]")
    for r in R64:
        add(f"push {r}")
        add(f"pop {r}")
    for r in R16[:4] + ["r9w"]:
        add(f"push {r}")
        add(f"pop {r}")
    for v in [0, 1, -1, 127, 128, -128, -129, 0x12345678, -0x80000000]:
        add(f"push {v}")
    add("push qword [rax+8]")
    add("pop qword [rsp+16]")
    add("push word [rax]")
    for src in ["al", "bl", "sil", "r9b", "ah", "byte [rax]", "ax", "r10w", "word [rbp-2]"]:
        for dst in ["eax", "rcx", "r12d", "r15", "dx"]:
            s16 = src in ("ax", "r10w", "word [rbp-2]")
            if s16 and dst == "dx":
                continue
            if src == "ah" and dst in ("r12d", "r15", "rcx"):
                continue
            add(f"movzx {dst}, {src}")
            add(f"movsx {dst}, {src}")
    for src in ["eax", "r9d", "ecx", "dword [rax]", "dword [rsp+4]"]:
        add(f"movsxd rax, {src}")
        add(f"movsxd r11, {src}")
    for r in R32 + R64:
        add(f"bswap {r}")
    for v in [0, 1, 0x7FFFFFFF, 0x80000000, 0xFFFFFFFF, 0x100000000, -1, -0x80000000, -0x80000001, 0x1122334455667788]:
        add(f"mov rax, {v}")
        add(f"mov r9, {v}")
    add("movabs rax, 5")
    for h in HI:
        for l in ["al", "bl", "ch", "dh", "cl"]:
            add(f"mov {h}, {l}")
            add(f"add {l}, {h}")
        add(f"mov {h}, 0x41")
        add(f"movzx eax, {h}")
        add(f"mov {h}, byte [rax]")
    for s in "bwdq":
        for op in ["movs", "stos", "lods", "scas", "cmps"]:
            add(f"{op}{s}")
        add(f"rep movs{s}")
        add(f"rep stos{s}")
        add(f"repe cmps{s}")
        add(f"repne scas{s}")
    for x in ["nop", "leave", "int3", "int 3", "int 0x80", "syscall", "hlt", "ud2", "cpuid", "rdtsc", "pushfq", "popfq", "clc", "stc",
              "cmc", "cld", "std", "cbw", "cwde", "cdqe", "cwd", "cdq", "cqo", "ret", "ret 8", "ret 0x10", "endbr64", "pause",
              "nop dword [rax+rax*1+0]", "nop word [rax+rax*1+0]", "nop dword [rax]", "lock add qword [rax], 1",
              "lock xchg qword [rbx], rax", "lock inc dword [rdi]", "jmp rax", "jmp r12", "jmp qword [rax+8]", "call rax",
              "call r15", "call qword [rbx*8+0x400000]", "jmp qword [rel $]", "mov rax, [fs:0x28]",
              "mov rax, [gs:0x60]", "mov eax, [fs:0x30]", "mov ax, [fs:rax]", "mov ax, [gs:0x10]", "lock add word [rax], 1",
              "lock inc word [rdi]", "movsx ax, al", "movsx eax, ax", "movsx rax, eax", "movsxd rax, eax", "movsx rax, ax",
              "movsx eax, al", "mov eax, [0x1000]", "lea rax, [0x1000]", "mov rax, [rel 0x1000]", "lea rax, [rel $]", "mov eax, [rel $+0x100]", "mov rax, qword [abs 0x401000]"]:
        add(x)
    return out


def branch_program():
    """Jumps and calls at short / near distances."""
    lines = ["top:"]
    for i in range(6):
        cc = rnd.choice(CCS)
        lines.append(f"j{cc} short_{i}")
        lines += ["nop"] * rnd.choice([0, 5, 60, 120, 126, 127, 128, 200])
        lines.append(f"short_{i}:")
        lines.append(f"jmp top")
        lines.append(f"call top")
        lines.append(f"j{cc} top")
        lines.append(f"loop short_{i}")
        lines.append(f"jrcxz short_{i}")
        lines.append(f"jecxz short_{i}")
    lines.append("jmp $")
    lines.append("jz $+2")
    lines.append("jmp near short_0")
    lines.append("jmp short short_5")
    return lines


def ce_binary(src: str) -> list[list[int]]:
    body = {"source": src, "lang": "assembly", "options": {"userArguments": "", "compilerOptions": {},
            "filters": {"binary": True, "intel": True, "labels": True, "directives": True, "commentOnly": True},
            "tools": [], "libraries": []}}
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://godbolt.org/api/compiler/nasm301/compile", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "Accept": "application/json",
                                                  "User-Agent": "asm-course-build/1.0"})
            d = json.load(urllib.request.urlopen(req, timeout=90))
            break
        except Exception as exc:
            time.sleep(3 + 3 * attempt)
    else:
        raise RuntimeError("Compiler Explorer unreachable")
    if d.get("code") != 0:
        raise RuntimeError("NASM error:\n" + "\n".join(x["text"] for x in d.get("stderr", []))[:3000])
    res = []
    for item in d.get("asm", []):
        if "opcodes" in item and item["opcodes"]:
            res.append({"b": [int(x, 16) for x in item["opcodes"]], "t": item["text"].strip()})
    return res


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    tmp = Path(tempfile.gettempdir()) / "asm-mastery-enc"
    tmp.mkdir(exist_ok=True)
    instrs = forms()
    chunks = [instrs[i:i + 350] for i in range(0, len(instrs), 350)]
    progs = [["section .text", "default rel" if k % 2 else ""] + c for k, c in enumerate(chunks)]
    progs.append(["section .text"] + branch_program())
    bad = total = 0
    for k, lines in enumerate(progs):
        src = "\n".join(lines) + "\n"
        try:
            nasm = ce_binary(src)
        except RuntimeError as exc:
            print(f"chunk {k}: {exc}")
            bad += 1
            continue
        (tmp / "src.asm").write_text(src, encoding="utf-8")
        js = ("const E=require(process.argv[2]);const fs=require('fs');const p=E.assemble(fs.readFileSync(process.argv[3],'utf8'));"
              "if(!p.ok){console.log(JSON.stringify({err:p.errors}));}else console.log(JSON.stringify({ins:p.ins.map(i=>({b:i.bytes,t:i.text,l:i.line}))}));")
        (tmp / "enc.js").write_text(js, encoding="utf-8")
        r = subprocess.run(["node", str(tmp / "enc.js"), EMU, str(tmp / "src.asm")], capture_output=True, text=True, encoding="utf-8")
        emu = json.loads(r.stdout)
        if "err" in emu:
            for e in emu["err"][:20]:
                print(f"✗ emu rejected line {e['line']}: {lines[e['line'] - 1]!r} — {e['msg']}")
            bad += len(emu["err"])
            continue
        ei = emu["ins"]
        if len(ei) != len(nasm):
            print(f"chunk {k}: instruction count differs emu={len(ei)} nasm={len(nasm)}")
        for a, b in zip(ei, nasm):
            total += 1
            if a["b"] != b["b"]:
                bad += 1
                if bad <= 60:
                    print(f"✗ {a['t']:<38} emu={' '.join(f'{x:02x}' for x in a['b']):<36} nasm={' '.join(f'{x:02x}' for x in b['b'])}  ({b['t']})")
        time.sleep(0.5)
    print(f"\n{total - bad}/{total} encodings identical to NASM" + (" ✓" if not bad else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
