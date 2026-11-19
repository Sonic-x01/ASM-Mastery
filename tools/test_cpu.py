#!/usr/bin/env python3
"""
Differential test: the in-page emulator (assets/emu.js) vs. the REAL CPU.

Generates thousands of random instruction tests, runs each one natively
(gcc inline asm, Intel syntax) and inside the emulator (node), then compares
every register, the scratch buffer and every *defined* flag.

    python tools/test_cpu.py [count] [seed]
"""
from __future__ import annotations

import json
import os
import random
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EMU = (ROOT / "assets" / "emu.js").as_posix()
N = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 1337
rnd = random.Random(SEED)

REGS = {  # the 8 data registers used by tests (r11 = buffer base, r15 = state ptr)
    64: ["rax", "rbx", "rcx", "rdx", "rsi", "rdi", "r8", "r10"],
    32: ["eax", "ebx", "ecx", "edx", "esi", "edi", "r8d", "r10d"],
    16: ["ax", "bx", "cx", "dx", "si", "di", "r8w", "r10w"],
    8: ["al", "bl", "cl", "dl", "sil", "dil", "r8b", "r10b"],
}
HI8 = ["ah", "bh", "ch", "dh"]
LO8_LEGACY = ["al", "bl", "cl", "dl"]
SZ = {8: "byte", 16: "word", 32: "dword", 64: "qword"}
CCS = ["o", "no", "b", "ae", "e", "ne", "be", "a", "s", "ns", "p", "np", "l", "ge", "le", "g"]


def rv(bits=64):
    """Random value biased towards edge cases."""
    k = rnd.random()
    m = (1 << bits) - 1
    if k < 0.15:
        return rnd.choice([0, 1, m, m >> 1, (m >> 1) + 1, 0x7F, 0x80, 0xFF, 0x7FFF, 0x8000, 0xFFFF, 0x7FFFFFFF, 0x80000000, 0xFFFFFFFF]) & m
    if k < 0.3:
        return rnd.randrange(0, 256)
    return rnd.getrandbits(64)


def imm_for(bits, wide=False):
    k = rnd.random()
    if k < 0.4:
        return rnd.randint(-128, 127)
    if bits == 8:
        return rnd.randint(-128, 255)
    if bits == 16:
        return rnd.randint(-32768, 65535)
    if bits == 32:
        return rnd.choice([rnd.randint(-2**31, 2**32 - 1), rnd.randint(-1000, 1000)])
    return rnd.randint(-2**31, 2**31 - 1)


def reg(bits, avoid=()):
    pool = [r for r in REGS[bits] if r not in avoid]
    return rnd.choice(pool)


def mem(bits, off=None):
    off = rnd.choice([0, 8, 16, 24]) if off is None else off
    return f"{SZ[bits]} ptr [r11+{off}]" if off else f"{SZ[bits]} ptr [r11]"


def gen_one():
    kind = rnd.choice(["alu"] * 8 + ["unary"] * 3 + ["muldiv"] * 3 + ["imul23"] * 2 + ["shift"] * 6 + ["bt"] * 2 +
                      ["scan"] * 2 + ["movx"] * 3 + ["mov"] * 2 + ["xchg", "lea", "lea", "setcc", "setcc", "cmov", "cmov",
                       "conv", "bswap", "string", "string", "hi8"])
    bits = rnd.choice([8, 16, 32, 64])
    pre = []
    if kind == "alu":
        op = rnd.choice(["add", "or", "adc", "sbb", "and", "sub", "xor", "cmp", "test"])
        form = rnd.choice(["rr", "ri", "mr", "rm", "mi"])
        if op == "test" and form == "rm":
            form = "mr"
        if form == "rr":
            ins = f"{op} {reg(bits)}, {reg(bits)}"
        elif form == "ri":
            ins = f"{op} {reg(bits)}, {imm_for(bits)}"
        elif form == "mr":
            ins = f"{op} {mem(bits)}, {reg(bits)}"
        elif form == "rm":
            ins = f"{op} {reg(bits)}, {mem(bits)}"
        else:
            ins = f"{op} {mem(bits)}, {imm_for(bits)}"
    elif kind == "unary":
        op = rnd.choice(["inc", "dec", "neg", "not"])
        ins = f"{op} {reg(bits) if rnd.random() < 0.7 else mem(bits)}"
    elif kind == "muldiv":
        op = rnd.choice(["mul", "imul", "div", "idiv"])
        if op in ("mul", "imul"):
            src = reg(bits, avoid=REGS[bits][:1] + REGS[bits][3:4]) if rnd.random() < 0.7 else mem(bits)
            ins = f"{op} {src}"
        else:
            # build a safe division: set divisor and dividend explicitly
            d = rnd.randint(1, (1 << bits) - 1) if rnd.random() < 0.7 else rnd.randint(1, 50)
            if op == "div":
                q = rnd.randint(0, (1 << bits) - 1)
                r = rnd.randint(0, d - 1)
                n = q * d + r
                if n >> (2 * bits):
                    q = rnd.randint(0, 1000)
                    n = q * d + r
            else:
                d = rnd.randint(1, (1 << (bits - 1)) - 1) if rnd.random() < 0.7 else rnd.randint(1, 50)
                sd = d if rnd.random() < 0.5 else -d
                if sd == -(1 << (bits - 1)) or sd == 0:
                    sd = 7
                q = rnd.randint(-(1 << (bits - 1)) + 2, (1 << (bits - 1)) - 2)
                r = rnd.randint(0, abs(sd) - 1)
                n0 = q * sd
                if n0 < 0 or (n0 == 0 and rnd.random() < 0.5):
                    r = -r            # the remainder takes the sign of the dividend
                n = n0 + r
                d = sd & ((1 << bits) - 1)
                n &= (1 << (2 * bits)) - 1
            lo = n & ((1 << bits) - 1)
            hi = n >> bits
            if bits == 8:
                pre = [f"mov ax, {n & 0xFFFF}", f"mov bl, {d}"]
            else:
                pre = [f"mov {REGS[bits][0]}, {lo}" if bits < 64 or lo < 2**31 else f"mov rax, {lo}",
                       f"mov {REGS[bits][3]}, {hi}" if bits < 64 else f"mov rdx, {hi}",
                       f"mov {REGS[bits][1]}, {d}" if bits < 64 else f"mov rbx, {d}"]
                if bits == 64:
                    pre = [f"movabs rax, {lo}", f"movabs rdx, {hi}", f"movabs rbx, {d}"]
            ins = f"{op} {REGS[bits][1]}"
    elif kind == "imul23":
        bits = rnd.choice([16, 32, 64])
        if rnd.random() < 0.5:
            ins = f"imul {reg(bits)}, {reg(bits) if rnd.random() < 0.7 else mem(bits)}"
        else:
            ins = f"imul {reg(bits)}, {reg(bits) if rnd.random() < 0.7 else mem(bits)}, {imm_for(bits)}"
    elif kind == "shift":
        op = rnd.choice(["shl", "shr", "sar", "rol", "ror", "rcl", "rcr", "sal"])
        dst = reg(bits, avoid=REGS[bits][2:3]) if rnd.random() < 0.75 else mem(bits)
        c = rnd.random()
        if c < 0.4:
            ins = f"{op} {dst}, cl"
            pre = [f"mov cl, {rnd.choice([0, 1, 2, 7, 8, 9, 15, 16, 17, 31, 32, 33, 63, 64, 65, 255, rnd.randint(0, 255)])}"]
        elif c < 0.6:
            ins = f"{op} {dst}, 1"
        else:
            ins = f"{op} {dst}, {rnd.choice([0, 2, 3, 7, 8, 9, 15, 16, 17, 31, 32, 33, 63, rnd.randint(0, 70)])}"
    elif kind == "bt":
        bits = rnd.choice([16, 32, 64])
        op = rnd.choice(["bt", "bts", "btr", "btc"])
        f = rnd.random()
        if f < 0.4:
            ins = f"{op} {reg(bits)}, {reg(bits)}"
        elif f < 0.6:
            ins = f"{op} {reg(bits)}, {rnd.randint(0, 255)}"
        elif f < 0.8:
            ins = f"{op} {mem(bits, 8)}, {rnd.randint(0, 255)}"
        else:
            r = reg(bits)
            pre = [f"mov {r}, {rnd.randint(-64, 150)}"]
            ins = f"{op} {mem(bits, 8)}, {r}"
    elif kind == "scan":
        bits = rnd.choice([16, 32, 64])
        op = rnd.choice(["bsf", "bsr", "popcnt"])
        src = reg(bits)
        dst = reg(bits)
        if op != "popcnt" and rnd.random() < 0.15:
            pre = [f"xor {REGS[32][REGS[bits].index(src)]}, {REGS[32][REGS[bits].index(src)]}"]
        ins = f"{op} {dst}, {src}"
    elif kind == "movx":
        op = rnd.choice(["movzx", "movsx", "movsxd"])
        if op == "movsxd":
            ins = f"movsxd {reg(64)}, {reg(32) if rnd.random() < 0.7 else mem(32)}"
        else:
            sb = rnd.choice([8, 16])
            db = rnd.choice([b for b in (16, 32, 64) if b > sb])
            ins = f"{op} {reg(db)}, {reg(sb) if rnd.random() < 0.7 else mem(sb)}"
    elif kind == "mov":
        f = rnd.random()
        if f < 0.3:
            ins = f"mov {reg(bits)}, {reg(bits)}"
        elif f < 0.55:
            ins = f"mov {reg(bits)}, {imm_for(bits) if bits != 64 else rnd.randint(-2**31, 2**32 - 1)}"
        elif f < 0.7:
            ins = f"mov {reg(bits)}, {mem(bits)}"
        elif f < 0.85:
            ins = f"mov {mem(bits)}, {reg(bits)}"
        else:
            ins = f"mov {mem(bits)}, {imm_for(bits)}"
    elif kind == "xchg":
        ins = f"xchg {reg(bits)}, {reg(bits) if rnd.random() < 0.7 else mem(bits)}"
    elif kind == "lea":
        db = rnd.choice([16, 32, 64])
        b = rnd.choice(REGS[64][:4] + REGS[64][6:])
        i = rnd.choice([x for x in REGS[64] if x != "rsp"])
        sc = rnd.choice([1, 2, 4, 8])
        d = rnd.choice([0, 1, -1, 8, -8, 127, -128, 128, 1000, -100000])
        f = rnd.random()
        if f < 0.3:
            addr = f"[{b}+{d}]"
        elif f < 0.8:
            addr = f"[{b}+{i}*{sc}+{d}]"
        else:
            addr = f"[{i}*{sc}+{d}]"
        ins = f"lea {reg(db)}, {addr.replace('+-', '-')}"
    elif kind == "setcc":
        ins = f"set{rnd.choice(CCS)} {reg(8) if rnd.random() < 0.8 else mem(8)}"
    elif kind == "cmov":
        b2 = rnd.choice([16, 32, 64])
        ins = f"cmov{rnd.choice(CCS)} {reg(b2)}, {reg(b2) if rnd.random() < 0.7 else mem(b2)}"
    elif kind == "conv":
        ins = rnd.choice(["cbw", "cwde", "cdqe", "cwd", "cdq", "cqo"])
    elif kind == "bswap":
        ins = f"bswap {reg(rnd.choice([32, 64]))}"
    elif kind == "hi8":
        op = rnd.choice(["add", "sub", "xor", "mov", "and", "cmp", "adc"])
        a = rnd.choice(HI8 + LO8_LEGACY)
        b = rnd.choice(HI8 + LO8_LEGACY)
        ins = f"{op} {a}, {b}" if rnd.random() < 0.7 else f"{op} {a}, {imm_for(8)}"
        if rnd.random() < 0.3:
            ins = f"movzx {rnd.choice(['eax', 'ebx', 'ecx', 'edx'])}, {rnd.choice(HI8)}"
    elif kind == "string":
        op = rnd.choice(["stos", "lods", "movs", "scas", "cmps"])
        s = rnd.choice("bwdq")
        n = rnd.randint(0, 3)
        rep = rnd.choice(["", "rep "] if op in ("stos", "lods", "movs") else ["", "repe ", "repne "])
        pre = ["lea rdi, [r11+16]", "lea rsi, [r11]", f"mov ecx, {n}"]
        ins = f"{rep}{op}{s}"
        return pre, ins, True
    return pre, ins, False


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    tests = []
    for k in range(N):
        pre, ins, ptr = gen_one()
        regs = [rv() for _ in range(8)]
        fl = 0x202 | sum(1 << b for b in (0, 2, 4, 6, 7, 11) if rnd.random() < 0.5)
        buf = [rv() for _ in range(8)]
        tests.append({"pre": pre, "ins": ins, "regs": regs, "fl": fl, "buf": buf, "ptr": ptr})

    tmp = Path(tempfile.gettempdir()) / "asm-mastery-cpu"
    tmp.mkdir(exist_ok=True)
    c = ["#include <stdio.h>", "#include <stdint.h>", "#include <windows.h>",
         "typedef struct { uint64_t r[8]; uint64_t fin, fout; uint64_t buf[8]; } St;"]
    for k, t in enumerate(tests):
        body = list(t["pre"]) + [t["ins"]]
        if t["ptr"]:
            body += ["not r11", "lea rdi, [rdi+r11+1]", "lea rsi, [rsi+r11+1]"]
        lines = ["mov r15, %0", "mov rax, [r15]", "mov rbx, [r15+8]", "mov rcx, [r15+16]", "mov rdx, [r15+24]",
                 "mov rsi, [r15+32]", "mov rdi, [r15+40]", "mov r8, [r15+48]", "mov r10, [r15+56]", "lea r11, [r15+80]",
                 "push qword ptr [r15+64]", "popfq"] + body + [
                 "pushfq", "pop qword ptr [r15+72]", "cld",
                 "mov [r15], rax", "mov [r15+8], rbx", "mov [r15+16], rcx", "mov [r15+24], rdx",
                 "mov [r15+32], rsi", "mov [r15+40], rdi", "mov [r15+48], r8", "mov [r15+56], r10"]
        asm = "\\n\\t".join(lines)
        c.append(f'static void t{k}(St *s) {{ __asm__ volatile("{asm}" :: "r"(s) : "rax","rbx","rcx","rdx","rsi","rdi","r8","r10","r11","r15","memory","cc"); }}')
    c.append("static void (*T[])(St*) = {" + ",".join(f"t{k}" for k in range(N)) + "};")
    init = ",\n".join("{{" + ",".join(f"0x{x:x}ULL" for x in t["regs"]) + f"}},0x{t['fl']:x}ULL,0,{{" +
                      ",".join(f"0x{x:x}ULL" for x in t["buf"]) + "}}" for t in tests)
    c.append("static St S0[] = {\n" + init + "\n};")
    c.append(r'''int main(void){ SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
  for (int k = 0; k < (int)(sizeof S0 / sizeof S0[0]); k++) { St s = S0[k]; T[k](&s); fflush(stdout);
  printf("%d", k); for (int i = 0; i < 8; i++) printf(" %llx", (unsigned long long)s.r[i]);
  printf(" %llx", (unsigned long long)s.fout); for (int i = 0; i < 8; i++) printf(" %llx", (unsigned long long)s.buf[i]); printf("\n"); } return 0; }''')
    (tmp / "cpu.c").write_text("\n".join(c), encoding="utf-8")
    js_tests = [dict(t, regs=[hex(x) for x in t["regs"]], buf=[hex(x) for x in t["buf"]]) for t in tests]
    (tmp / "tests.json").write_text(json.dumps(js_tests), encoding="utf-8")
    exe = tmp / "cpu.exe"
    print(f"compiling {N} native tests…")
    r = subprocess.run(["gcc", "-O0", "-masm=intel", "-o", str(exe), str(tmp / "cpu.c")], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[:4000])
        return 1
    try:
        native = subprocess.run([str(exe)], capture_output=True, text=True, timeout=180).stdout.strip().split("\n")
    except subprocess.TimeoutExpired:
        print("native run timed out")
        return 1
    if len(native) != N:
        k = len(native)
        print(f"native run stopped at test #{k}: {tests[k]['pre']} {tests[k]['ins']}")
        return 1

    node_js = r'''
const E = require(process.argv[2]);
const tests = JSON.parse(require("fs").readFileSync(process.argv[3], "utf8"));
const R = ["rax","rbx","rcx","rdx","rsi","rdi","r8","r10"];
const out = [];
tests.forEach((t, k) => {
  let body = t.pre.concat([t.ins]);
  if (t.ptr) body = body.concat(["not r11", "lea rdi, [rdi+r11+1]", "lea rsi, [rsi+r11+1]"]);
  const src = "section .data\nbuf: dq " + t.buf.join(", ") + "\nsection .text\n" + body.join("\n") + "\n";
  const p = E.assemble(src);
  if (!p.ok) { out.push(k + " ASMERR " + JSON.stringify(p.errors)); return; }
  const setup = R.map((r, i) => r + "=" + t.regs[i]).join(";") + ";r11=buf;" +
    ["CF","PF","AF","ZF","SF","OF"].map((f) => f.toLowerCase() + "=" + ((t.fl >> {CF:0,PF:2,AF:4,ZF:6,SF:7,OF:11}[f]) & 1)).join(";");
  const m = new E.Machine(p, setup);
  let undef = 0;
  for (let n = 0; n < body.length; n++) {
    const st = m.step();
    if (st.halted && st.status && !st.status.ok) { out.push(k + " FAULT " + st.status.msg); return; }
    if (n === body.length - 1 - (t.ptr ? 3 : 0)) undef = m.undef;
  }
  const bufAddr = p.labels.find((l) => l.name === "buf").addr;
  const vals = R.map((r) => E.U(m.regs[E.REG[r].i], 64).toString(16));
  const buf = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => m.peek(bufAddr + BigInt(8 * i), 8).toString(16));
  out.push(k + " " + vals.join(" ") + " " + m.fl.toString(16) + " " + buf.join(" ") + " U" + undef.toString(16));
});
console.log(out.join("\n"));
'''
    (tmp / "run.js").write_text(node_js, encoding="utf-8")
    emu = subprocess.run(["node", str(tmp / "run.js"), EMU, str(tmp / "tests.json")], capture_output=True, text=True, encoding="utf-8")
    if emu.returncode != 0:
        print(emu.stderr[:3000])
        return 1
    emu_lines = emu.stdout.strip().split("\n")
    FL = {"CF": 0, "PF": 2, "AF": 4, "ZF": 6, "SF": 7, "DF": 10, "OF": 11}
    names = ["rax", "rbx", "rcx", "rdx", "rsi", "rdi", "r8", "r10"]
    bad = 0
    for k, t in enumerate(tests):
        nat = native[k].split()
        em = emu_lines[k].split()
        diffs = []
        if len(em) < 3 or em[1] in ("ASMERR", "FAULT"):
            diffs.append(" ".join(em[1:])[:300])
        else:
            undef = int(em[-1][1:], 16)
            for i, nm in enumerate(names):
                if int(nat[1 + i], 16) != int(em[1 + i], 16):
                    diffs.append(f"{nm}: cpu={nat[1 + i]} emu={em[1 + i]}")
            fn, fe = int(nat[9], 16), int(em[9], 16)
            if t["ptr"]:
                pass  # flags captured after normalising lea/not (which do not touch flags)
            for f, b in FL.items():
                if undef >> b & 1:
                    continue
                if (fn >> b & 1) != (fe >> b & 1):
                    diffs.append(f"{f}: cpu={fn >> b & 1} emu={fe >> b & 1}")
            for i in range(8):
                if int(nat[10 + i], 16) != int(em[10 + i], 16):
                    diffs.append(f"buf[{i}]: cpu={nat[10 + i]} emu={em[10 + i]}")
        if diffs:
            bad += 1
            if bad <= 40:
                print(f"✗ #{k}: {' ; '.join(t['pre'] + [t['ins']])}")
                print("   in : " + " ".join(f"{n}={v:x}" for n, v in zip(names, t["regs"])) + f" fl={t['fl']:x}")
                print("   " + " | ".join(diffs))
    print(f"\n{N - bad}/{N} tests match the real CPU" + (" ✓" if not bad else f" — {bad} mismatches"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
