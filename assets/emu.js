/* ============================================================
   ASM Mastery — x86-64 teaching emulator
   NASM / Intel-syntax assembler + real x86-64 encoder + CPU model.
   - Encodings are checked against NASM (tools/test_encoder.py)
   - Semantics & flags are checked against a real CPU (tools/test_cpu.py)
   Works in the browser (window.AsmEmu) and in node (require()).
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AsmEmu = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ================================================================ basics */
  const U = (v, b) => BigInt.asUintN(b, v);
  const S = (v, b) => BigInt.asIntN(b, v);
  const MASK = { 8: 0xFFn, 16: 0xFFFFn, 32: 0xFFFFFFFFn, 64: 0xFFFFFFFFFFFFFFFFn };
  const TOPB = { 8: 0x80n, 16: 0x8000n, 32: 0x80000000n, 64: 0x8000000000000000n };
  const SZNAME = { 8: "byte", 16: "word", 32: "dword", 64: "qword" };
  const hex = (v, d) => "0x" + U(BigInt(v), 64).toString(16).toUpperCase().padStart(d || 1, "0");

  const TEXT_BASE = 0x401000n;
  const EXIT_ADDR = 0x400F00n;            // fake "caller" — ret here = function returned
  const STACK_TOP = 0x7FFFFFFFF000n;
  const STACK_SIZE = 0x10000n;
  const INPUT_BASE = 0x500000n;           // strings passed through lab setups (rdi=&"...")
  const PAGE = 0x1000n;

  class AsmError extends Error { constructor(msg, line) { super(msg); this.line = line; } }
  class Fault extends Error { constructor(kind, msg) { super(msg); this.kind = kind; } }

  /* ================================================================ registers */
  const R64 = ["rax", "rcx", "rdx", "rbx", "rsp", "rbp", "rsi", "rdi", "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15"];
  const R32 = ["eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi"];
  const R16 = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"];
  const R8 = ["al", "cl", "dl", "bl", "spl", "bpl", "sil", "dil"];
  const REG = Object.create(null);
  for (let i = 0; i < 16; i++) {
    const add = (name, bits, needRex) => { REG[name] = { name, i, bits, code: i, hi: false, rex8: !!needRex }; };
    add(R64[i], 64);
    if (i < 8) { add(R32[i], 32); add(R16[i], 16); add(R8[i], 8, i >= 4); }
    else { add("r" + i + "d", 32); add("r" + i + "w", 16); add("r" + i + "b", 8); add("r" + i + "l", 8); }
  }
  ["ah", "ch", "dh", "bh"].forEach((n, k) => { REG[n] = { name: n, i: k, bits: 8, code: k + 4, hi: true, rex8: false }; });
  const FAMILY = {};   // rax -> [rax, eax, ax, ah, al]
  R64.forEach((n, i) => {
    FAMILY[n] = i < 8 ? [n, R32[i], R16[i]].concat(i < 4 ? [["ah", "ch", "dh", "bh"][i]] : []).concat([R8[i]])
                      : [n, n + "d", n + "w", n + "b"];
  });

  /* ================================================================ flags */
  const FB = { CF: 0, PF: 2, AF: 4, ZF: 6, SF: 7, TF: 8, IF: 9, DF: 10, OF: 11 };
  const FLAG_ORDER = ["CF", "PF", "AF", "ZF", "SF", "DF", "OF"];
  const ARITH6 = ["CF", "PF", "AF", "ZF", "SF", "OF"];
  const CC = { o: 0, no: 1, b: 2, c: 2, nae: 2, nb: 3, nc: 3, ae: 3, e: 4, z: 4, ne: 5, nz: 5, be: 6, na: 6, nbe: 7, a: 7,
    s: 8, ns: 9, p: 10, pe: 10, np: 11, po: 11, l: 12, nge: 12, nl: 13, ge: 13, le: 14, ng: 14, nle: 15, g: 15 };
  const CC_NAME = ["o", "no", "b", "ae", "e", "ne", "be", "a", "s", "ns", "p", "np", "l", "ge", "le", "g"];
  const CC_RULE = ["OF=1", "OF=0", "CF=1", "CF=0", "ZF=1", "ZF=0", "CF=1 أو ZF=1", "CF=0 و ZF=0",
    "SF=1", "SF=0", "PF=1", "PF=0", "SF≠OF", "SF=OF", "ZF=1 أو SF≠OF", "ZF=0 و SF=OF"];
  const CC_MEANING = ["overflow (signed)", "no overflow", "below — أقل (unsigned)", "above or equal — أكبر أو يساوي (unsigned)",
    "equal / zero — يساوي", "not equal — مش بيساوي", "below or equal — أقل أو يساوي (unsigned)", "above — أكبر (unsigned)",
    "sign — النتيجة سالبة", "not sign — موجبة أو صفر", "parity even", "parity odd", "less — أقل (signed)",
    "greater or equal — أكبر أو يساوي (signed)", "less or equal — أقل أو يساوي (signed)", "greater — أكبر (signed)"];
  function parity8(v) { let x = Number(v & 0xFFn), c = 0; while (x) { c += x & 1; x >>= 1; } return (c & 1) === 0; }
  function evalCC(cc, f) {
    switch (cc) {
      case 0: return f.OF; case 1: return !f.OF; case 2: return f.CF; case 3: return !f.CF;
      case 4: return f.ZF; case 5: return !f.ZF; case 6: return f.CF || f.ZF; case 7: return !f.CF && !f.ZF;
      case 8: return f.SF; case 9: return !f.SF; case 10: return f.PF; case 11: return !f.PF;
      case 12: return f.SF !== f.OF; case 13: return f.SF === f.OF; case 14: return f.ZF || f.SF !== f.OF;
      default: return !f.ZF && f.SF === f.OF;
    }
  }

  /* ================================================================ ALU (shared with widgets) */
  function szp(res, bits) { return { ZF: res === 0n, SF: (res & TOPB[bits]) !== 0n, PF: parity8(res) }; }
  function aluAdd(a, b, cin, bits) {
    const r = a + b + cin, res = U(r, bits);
    return Object.assign({ res, CF: r > MASK[bits], OF: ((a ^ res) & (b ^ res) & TOPB[bits]) !== 0n, AF: ((a ^ b ^ res) & 0x10n) !== 0n }, szp(res, bits));
  }
  function aluSub(a, b, cin, bits) {
    const r = a - b - cin, res = U(r, bits);
    return Object.assign({ res, CF: r < 0n, OF: ((a ^ b) & (a ^ res) & TOPB[bits]) !== 0n, AF: ((a ^ b ^ res) & 0x10n) !== 0n }, szp(res, bits));
  }
  function aluLogic(res, bits) { return Object.assign({ res: U(res, bits), CF: false, OF: false, AF: false }, szp(U(res, bits), bits)); }
  /** Public helper for the flags calculator widget. a/b are BigInt (any sign). */
  function alu(op, a, b, bits, cf) {
    a = U(BigInt(a), bits); b = U(BigInt(b), bits); const c = cf ? 1n : 0n;
    let r, undef = [];
    switch (op) {
      case "add": r = aluAdd(a, b, 0n, bits); break;
      case "adc": r = aluAdd(a, b, c, bits); break;
      case "sub": case "cmp": r = aluSub(a, b, 0n, bits); break;
      case "sbb": r = aluSub(a, b, c, bits); break;
      case "and": case "test": r = aluLogic(a & b, bits); undef = ["AF"]; break;
      case "or": r = aluLogic(a | b, bits); undef = ["AF"]; break;
      case "xor": r = aluLogic(a ^ b, bits); undef = ["AF"]; break;
      case "inc": r = aluAdd(a, 1n, 0n, bits); r.CF = null; break;
      case "dec": r = aluSub(a, 1n, 0n, bits); r.CF = null; break;
      case "neg": r = aluSub(0n, a, 0n, bits); break;
      default: throw new Error("op?");
    }
    r.undef = undef;
    r.writes = !(op === "cmp" || op === "test");
    return r;
  }

  /* ================================================================ numbers & strings */
  function parseNumber(tok) {
    const t = tok.replace(/_/g, "").toLowerCase();
    let m;
    if (/^0x[0-9a-f]+$/.test(t)) return BigInt(t);
    if (/^0h[0-9a-f]+$/.test(t)) return BigInt("0x" + t.slice(2));
    if ((m = /^\$([0-9][0-9a-f]*)$/.exec(t))) return BigInt("0x" + m[1]);
    if (/^[0-9][0-9a-f]*h$/.test(t)) return BigInt("0x" + t.slice(0, -1));
    if (/^0[by][01]+$/.test(t)) return BigInt("0b" + t.slice(2));
    if (/^[01]+[by]$/.test(t)) return BigInt("0b" + t.slice(0, -1));
    if (/^0[oq][0-7]+$/.test(t)) return BigInt("0o" + t.slice(2));
    if (/^[0-7]+[oq]$/.test(t)) return BigInt("0o" + t.slice(0, -1));
    if (/^0d[0-9]+$/.test(t)) return BigInt(t.slice(2));
    if (/^[0-9]+d?$/.test(t)) return BigInt(t.replace(/d$/, ""));
    return null;
  }
  const isFloatTok = (t) => /^[0-9]+\.[0-9]*(e[+-]?[0-9]+)?$/i.test(t) || /^[0-9]+e[+-]?[0-9]+$/i.test(t);
  function strBytes(tok) {
    const q = tok[0], body = tok.slice(1, -1);
    if (q !== "`") return Array.from(utf8(body));
    const out = [];
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch !== "\\") { utf8(ch).forEach((b) => out.push(b)); continue; }
      const n = body[++i];
      const simple = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, e: 27, "\\": 92, "`": 96, "'": 39, '"': 34, "?": 63 };
      if (n in simple) out.push(simple[n]);
      else if (n === "x") { const h = body.slice(i + 1, i + 3).match(/^[0-9a-fA-F]{1,2}/)[0]; out.push(parseInt(h, 16)); i += h.length; }
      else if (/[0-7]/.test(n)) { const o = body.slice(i, i + 3).match(/^[0-7]{1,3}/)[0]; out.push(parseInt(o, 8) & 255); i += o.length - 1; }
      else out.push(n.charCodeAt(0));
    }
    return out;
  }
  function utf8(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    return Buffer.from(s, "utf8");
  }

  /* ================================================================ expression parser */
  const TOK_RE = /\s*(?:(0[xX][0-9a-fA-F_]+|\$[0-9][0-9a-fA-F_]*|[0-9][0-9a-zA-Z_]*(?:\.[0-9]*(?:[eE][+-]?[0-9]+)?)?)|('[^']*'|"[^"]*"|`(?:[^`\\]|\\.)*`)|(\$\$|\$|<<|>>|\/\/|%%|[-+*\/%&|^~!()]|\[|\]|:|,)|([A-Za-z_.?@][\w.?@$#~]*))/y;
  function tokenize(str, line) {
    const toks = [];
    let pos = 0;
    while (pos < str.length) {
      if (/^\s*$/.test(str.slice(pos))) break;
      TOK_RE.lastIndex = pos;
      const m = TOK_RE.exec(str);
      if (!m || TOK_RE.lastIndex === pos) throw new AsmError("مش فاهم الجزء ده: «" + str.slice(pos).trim().slice(0, 24) + "»", line);
      pos = TOK_RE.lastIndex;
      if (m[1] !== undefined) toks.push({ t: "num", s: m[1] });
      else if (m[2] !== undefined) toks.push({ t: "str", s: m[2] });
      else if (m[3] !== undefined) toks.push({ t: "op", s: m[3] });
      else toks.push({ t: "id", s: m[4] });
    }
    return toks;
  }
  const PREC = { "|": 1, "^": 2, "&": 3, "<<": 4, ">>": 4, "+": 5, "-": 5, "*": 6, "/": 6, "//": 6, "%": 6, "%%": 6 };
  function parseExpr(str, line, scope) {
    const toks = tokenize(str, line);
    if (!toks.length) throw new AsmError("تعبير فاضي", line);
    let i = 0;
    const peek = () => toks[i];
    const primary = () => {
      const tk = toks[i++];
      if (!tk) throw new AsmError("التعبير ناقص", line);
      if (tk.t === "num") {
        if (isFloatTok(tk.s)) return { k: "float", v: parseFloat(tk.s) };
        const v = parseNumber(tk.s);
        if (v === null) throw new AsmError("رقم مش مفهوم: " + tk.s, line);
        return { k: "num", v };
      }
      if (tk.t === "str") return { k: "str", bytes: strBytes(tk.s) };
      if (tk.t === "op") {
        if (tk.s === "(") {
          const e = binary(1);
          if (!toks[i] || toks[i].s !== ")") throw new AsmError("ناقص قوس ‎)‎", line);
          i++;
          return e;
        }
        if (tk.s === "$") return { k: "here" };
        if (tk.s === "$$") return { k: "sect" };
        throw new AsmError("مش متوقع «" + tk.s + "» هنا", line);
      }
      const low = tk.s.toLowerCase();
      if (REG[low]) return { k: "reg", r: REG[low] };
      if (/^[xyz]mm\d+$/.test(low)) throw new AsmError("registers الـ " + low + " (SIMD) مش مدعومة في المعمل — جربها على Compiler Explorer", line);
      let name = tk.s;
      if (name.startsWith(".") && !name.startsWith("..")) name = (scope || "") + name;
      return { k: "sym", name };
    };
    const unary = () => {
      const tk = peek();
      if (tk && tk.t === "op" && (tk.s === "-" || tk.s === "+" || tk.s === "~" || tk.s === "!")) { i++; return { k: "un", op: tk.s, a: unary() }; }
      return primary();
    };
    const binary = (min) => {
      let left = unary();
      for (;;) {
        const tk = peek();
        if (!tk || tk.t !== "op" || !(tk.s in PREC) || PREC[tk.s] < min) return left;
        i++;
        left = { k: "bin", op: tk.s, a: left, b: binary(PREC[tk.s] + 1) };
      }
    };
    const e = binary(1);
    if (i < toks.length) throw new AsmError("فيه حاجة زيادة بعد التعبير: «" + toks[i].s + "»", line);
    return e;
  }
  /** Evaluate to a linear form {c, rel, regs:Map(name->coef)} */
  function lin(node, env, line) {
    const L = (c, rel, regs) => ({ c, rel: rel || 0, regs: regs || new Map() });
    switch (node.k) {
      case "num": return L(node.v);
      case "float": throw new AsmError("الأرقام العشرية (float) مسموحة بس في dd/dq", line);
      case "str": {
        if (node.bytes.length > 8) throw new AsmError("الـ string أطول من 8 bytes ومينفعش يبقى رقم", line);
        let v = 0n;
        node.bytes.forEach((b, k) => { v |= BigInt(b) << BigInt(8 * k); });
        return L(v);
      }
      case "here": return L(env.here(), 1);
      case "sect": return L(env.sect(), 1);
      case "reg": return L(0n, 0, new Map([[node.r.name, 1n]]));
      case "sym": return env.sym(node.name, line);
      case "un": {
        const a = lin(node.a, env, line);
        if (node.op === "+") return a;
        if (node.op === "-") { const m = new Map(); a.regs.forEach((c, k) => m.set(k, -c)); return L(-a.c, -a.rel, m); }
        if (a.regs.size || a.rel) throw new AsmError("العملية «" + node.op + "» مينفعش مع registers أو labels", line);
        return L(node.op === "~" ? ~a.c : (a.c === 0n ? 1n : 0n));
      }
      case "bin": {
        const a = lin(node.a, env, line), b = lin(node.b, env, line);
        if (node.op === "+" || node.op === "-") {
          const sg = node.op === "+" ? 1n : -1n, m = new Map(a.regs);
          b.regs.forEach((c, k) => m.set(k, (m.get(k) || 0n) + sg * c));
          return L(a.c + sg * b.c, a.rel + (node.op === "+" ? b.rel : -b.rel), m);
        }
        if (node.op === "*") {
          if (a.regs.size && b.regs.size) throw new AsmError("مينفعش تضرب register في register", line);
          if (a.rel || b.rel) throw new AsmError("مينفعش تضرب عنوان (label)", line);
          const [r, k] = a.regs.size ? [a, b.c] : [b, a.c];
          const m = new Map();
          r.regs.forEach((c, n) => m.set(n, c * k));
          return L(a.c * b.c, 0, m);
        }
        if (a.regs.size || b.regs.size) throw new AsmError("العملية «" + node.op + "» مينفعش مع registers", line);
        if (a.rel || b.rel) throw new AsmError("العملية «" + node.op + "» مينفعش مع labels", line);
        const x = a.c, y = b.c;
        switch (node.op) {
          case "/": if (U(y, 64) === 0n) throw new AsmError("قسمة على صفر", line); return L(U(x, 64) / U(y, 64));
          case "//": if (y === 0n) throw new AsmError("قسمة على صفر", line); return L(S(x, 64) / S(y, 64));
          case "%": if (U(y, 64) === 0n) throw new AsmError("قسمة على صفر", line); return L(U(x, 64) % U(y, 64));
          case "%%": if (y === 0n) throw new AsmError("قسمة على صفر", line); return L(S(x, 64) % S(y, 64));
          case "<<": return L(U(x << U(y, 64), 64));
          case ">>": return L(U(x, 64) >> U(y, 64));
          case "&": return L(x & y);
          case "|": return L(x | y);
          case "^": return L(x ^ y);
        }
      }
    }
    throw new AsmError("تعبير مش مدعوم", line);
  }

  /* ================================================================ line splitting */
  function stripComment(s) {
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (q === "`" && c === "\\") { i++; continue; } if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === "`") q = c;
      else if (c === ";") return s.slice(0, i);
    }
    return s;
  }
  function splitTop(s) {
    const out = [];
    let q = null, depth = 0, cur = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { cur += c; if (q === "`" && c === "\\") { cur += s[++i] || ""; continue; } if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === "`") { q = c; cur += c; continue; }
      if (c === "[" || c === "(") depth++;
      if (c === "]" || c === ")") depth--;
      if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    if (cur.trim() !== "" || out.length) out.push(cur.trim());
    return out;
  }

  /* ================================================================ mnemonic tables */
  const ALU = { add: 0, or: 1, adc: 2, sbb: 3, and: 4, sub: 5, xor: 6, cmp: 7 };
  const SHIFT = { rol: 0, ror: 1, rcl: 2, rcr: 3, shl: 4, sal: 4, shr: 5, sar: 7 };
  const GRP3 = { not: 2, neg: 3, mul: 4, div: 6, idiv: 7 };
  const BTOP = { bt: [0xA3, 4], bts: [0xAB, 5], btr: [0xB3, 6], btc: [0xBB, 7] };
  const SIMPLE = {
    nop: [0x90], leave: [0xC9], int3: [0xCC], syscall: [0x0F, 0x05], hlt: [0xF4], ud2: [0x0F, 0x0B], cpuid: [0x0F, 0xA2],
    rdtsc: [0x0F, 0x31], pushfq: [0x9C], pushf: [0x9C], popfq: [0x9D], popf: [0x9D], clc: [0xF8], stc: [0xF9], cmc: [0xF5],
    cld: [0xFC], std: [0xFD], cbw: [0x66, 0x98], cwde: [0x98], cdqe: [0x48, 0x98], cwd: [0x66, 0x99], cdq: [0x99],
    cqo: [0x48, 0x99], endbr64: [0xF3, 0x0F, 0x1E, 0xFA], pause: [0xF3, 0x90]
  };
  const STRING = { movs: 0xA4, cmps: 0xA6, stos: 0xAA, lods: 0xAC, scas: 0xAE };
  const STR_SFX = { b: 8, w: 16, d: 32, q: 64 };
  const LOOPS = { loop: 0xE2, loope: 0xE1, loopz: 0xE1, loopne: 0xE0, loopnz: 0xE0, jrcxz: 0xE3, jecxz: 0xE3 };
  const KNOWN = new Set(["mov", "movabs", "movzx", "movsx", "movsxd", "lea", "xchg", "push", "pop", "test", "inc", "dec", "imul",
    "bsf", "bsr", "popcnt", "bswap", "jmp", "call", "ret", "int", ...Object.keys(ALU), ...Object.keys(SHIFT), ...Object.keys(GRP3),
    ...Object.keys(BTOP), ...Object.keys(SIMPLE), ...Object.keys(LOOPS)]);
  function classify(mn) {
    let m;
    if (KNOWN.has(mn)) return mn;
    if ((m = /^j(.+)$/.exec(mn)) && m[1] in CC) return "jcc";
    if ((m = /^set(.+)$/.exec(mn)) && m[1] in CC) return "setcc";
    if ((m = /^cmov(.+)$/.exec(mn)) && m[1] in CC) return "cmovcc";
    if ((m = /^(movs|cmps|stos|lods|scas)([bwdq])$/.exec(mn))) return "string";
    return null;
  }
  const LOCKABLE = new Set(["add", "adc", "and", "btc", "btr", "bts", "dec", "inc", "neg", "not", "or", "sbb", "sub", "xor", "xchg"]);
  const PREFIXES = { rep: "rep", repe: "repe", repz: "repe", repne: "repne", repnz: "repne", lock: "lock" };

  /* ================================================================ operand parsing */
  function parseOperand(text, line, scope) {
    let s = text.trim(), m, size = 0, mod = null, seg = null;
    if (!s) throw new AsmError("operand فاضي", line);
    for (;;) {
      if ((m = /^(byte|word|dword|qword|tword|oword|xmmword|yword)\s*(?:ptr\b)?\s*/i.exec(s)) && (s.length > m[0].length)) {
        const k = m[1].toLowerCase();
        size = { byte: 8, word: 16, dword: 32, qword: 64 }[k] || -1;
        if (size === -1) throw new AsmError("الحجم " + k + " مش مدعوم في المعمل", line);
        s = s.slice(m[0].length); continue;
      }
      if ((m = /^(short|near|strict)\s+/i.exec(s))) { if (m[1].toLowerCase() !== "strict") mod = m[1].toLowerCase(); s = s.slice(m[0].length); continue; }
      break;
    }
    if ((m = /^([cdefgs]s)\s*:\s*(?=\[)/i.exec(s))) { seg = m[1].toLowerCase(); s = s.slice(m[0].length); }
    if (s.startsWith("[")) {
      if (!s.endsWith("]")) throw new AsmError("ناقص ‎]‎ في آخر الـ memory operand", line);
      let inner = s.slice(1, -1).trim(), relKw = null;
      for (;;) {
        if ((m = /^(rel|abs)\s+/i.exec(inner))) { relKw = m[1].toLowerCase(); inner = inner.slice(m[0].length); continue; }
        if ((m = /^([cdefgs]s)\s*:\s*/i.exec(inner))) { seg = m[1].toLowerCase(); inner = inner.slice(m[0].length); continue; }
        if ((m = /^(byte|word|dword|qword)\s+/i.exec(inner))) { inner = inner.slice(m[0].length); continue; }
        break;
      }
      if (seg && seg !== "fs" && seg !== "gs") seg = null;   // ds:/ss:/es:/cs: are flat (base 0) in 64-bit mode
      return { t: "mem", size, seg, relKw, ast: parseExpr(inner, line, scope), text: s };
    }
    if (seg) throw new AsmError("الـ segment لازم يكون قبل [ ]", line);
    const low = s.toLowerCase();
    if (REG[low]) {
      if (size && size !== REG[low].bits) throw new AsmError("الحجم " + SZNAME[size] + " مش متوافق مع " + low, line);
      return { t: "reg", r: REG[low] };
    }
    if (/^[xyz]mm\d+$/.test(low)) throw new AsmError("registers الـ SIMD (" + low + ") مش مدعومة في المعمل — جربها على Compiler Explorer", line);
    if (/^(rip|eip|ip|rflags|eflags|cr\d|dr\d)$/.test(low)) throw new AsmError("الـ register " + low + " مينفعش يتكتب كـ operand مباشرة", line);
    return { t: "imm", size, mod, ast: parseExpr(s, line, scope), text: s };
  }

  /* ================================================================ assembler */
  function assemble(src, opts) {
    opts = opts || {};
    const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
    const errors = [];
    const ins = [];
    const secs = {
      text: { name: ".text", items: [], size: 0, base: TEXT_BASE, perm: "r-x" },
      rodata: { name: ".rodata", items: [], size: 0, base: 0n, perm: "r--" },
      data: { name: ".data", items: [], size: 0, base: 0n, perm: "rw-" },
      bss: { name: ".bss", items: [], size: 0, base: 0n, perm: "rw-" }
    };
    const SEC_ALIAS = { ".text": "text", ".code": "text", ".rodata": "rodata", ".rdata": "rodata", ".data": "data", ".bss": "bss" };
    const labels = new Map();     // name -> {sec, ins (index) | off, line}
    const equs = new Map();       // name -> {ast, sec, off, line, busy}
    let cur = "text", scope = "", defaultRel = false;
    let pending = [];             // code labels waiting for the next instruction

    const defLabel = (name, line) => {
      if (name.startsWith(".") && !name.startsWith("..")) name = scope + name;
      else scope = name;
      const low = name.toLowerCase();
      if (REG[low] || classify(low) || PREFIXES[low]) throw new AsmError("مينفعش تسمي label باسم register أو instruction: " + name, line);
      if (labels.has(name) || equs.has(name)) throw new AsmError("الـ label «" + name + "» متعرّف قبل كده", line);
      if (cur === "text") { labels.set(name, { sec: "text", ins: -1, line }); pending.push(name); }
      else labels.set(name, { sec: cur, off: secs[cur].size, line });
      return name;
    };

    // provisional env used before layout is final (only differences matter for sizes)
    const env = {
      here: () => (curEnvHere != null ? curEnvHere : 0n),
      sect: () => (curEnvSect != null ? curEnvSect : 0n),
      sym: (name, line) => {
        if (labels.has(name)) return { c: labelAddr(name), rel: 1, regs: new Map() };
        if (equs.has(name)) {
          const q = equs.get(name);
          if (q.busy) throw new AsmError("الثابت «" + name + "» بيعتمد على نفسه", line);
          q.busy = true;
          const saveH = curEnvHere, saveS = curEnvSect;
          curEnvHere = secAddr(q.sec) + BigInt(q.off); curEnvSect = secAddr(q.sec);
          try {
            const r = lin(q.ast, env, q.line);
            if (r.regs.size) throw new AsmError("equ مينفعش يحتوي registers", q.line);
            return r;
          } finally { q.busy = false; curEnvHere = saveH; curEnvSect = saveS; }
        }
        if (/^(printf|puts|malloc|free|exit|strlen|scanf|messageboxa|exitprocess|getstdhandle|writefile|writeconsolea)$/i.test(name))
          throw new AsmError("«" + name + "» دالة خارجية — المعمل مفيهوش libc ولا Windows API (استخدم syscall)", line);
        throw new AsmError("الـ label أو الثابت «" + name + "» مش معرّف", line);
      }
    };
    let curEnvHere = null, curEnvSect = null;
    const secAddr = (sec) => secs[sec].base;
    const labelAddr = (name) => {
      const L = labels.get(name);
      if (L.sec === "text") {
        if (L.ins < 0 || L.ins >= ins.length) return secs.text.base + BigInt(secs.text.size);
        return ins[L.ins].addr;
      }
      return secs[L.sec].base + BigInt(L.off);
    };
    const constVal = (ast, line, what) => {
      const r = lin(ast, env, line);
      if (r.regs.size) throw new AsmError(what + " لازم يكون رقم ثابت", line);
      if (r.rel) throw new AsmError(what + " لازم يكون رقم ثابت (مش عنوان)", line);
      return r.c;
    };

    /* ---------- pass 1: parse ---------- */
    lines.forEach((raw, idx) => {
      const ln = idx + 1;
      let s = stripComment(raw).trim();
      if (!s) return;
      try {
        let m;
        if ((m = /^\[?\s*(bits|default|section|segment|global|extern|cpu|use64)\b\s*([^\]]*)\]?$/i.exec(s))) {
          const d = m[1].toLowerCase(), arg = m[2].trim();
          if (d === "section" || d === "segment") {
            const nm = arg.split(/\s+/)[0].toLowerCase();
            if (!(nm in SEC_ALIAS)) throw new AsmError("section مش مدعوم في المعمل: " + nm + " (المدعوم: .text .rodata .data .bss)", ln);
            if (pending.length && cur === "text") { /* labels at the very end of .text keep pointing to its end */ }
            cur = SEC_ALIAS[nm];
          } else if (d === "default") defaultRel = /^rel$/i.test(arg);
          else if (d === "extern") throw new AsmError("extern مش مدعوم في المعمل (مفيش linker ولا libc) — جرّب الكود ده على Compiler Explorer", ln);
          return;
        }
        // label with colon
        if ((m = /^([A-Za-z_.?@][\w.?@$#~]*)\s*:(?!\s*\[)(.*)$/.exec(s)) && !REG[m[1].toLowerCase()]) {
          defLabel(m[1], ln);
          s = m[2].trim();
          if (!s) return;
        }
        // equ
        if ((m = /^([A-Za-z_.?@][\w.?@$#~]*)\s+equ\s+(.+)$/i.exec(s))) {
          let name = m[1];
          if (name.startsWith(".")) name = scope + name;
          if (labels.has(name) || equs.has(name)) throw new AsmError("الاسم «" + name + "» متعرّف قبل كده", ln);
          equs.set(name, { ast: parseExpr(m[2], ln, scope), sec: cur, off: cur === "text" ? 0 : secs[cur].size, line: ln, busy: false });
          return;
        }
        // label without colon before a data directive
        if ((m = /^([A-Za-z_.?@][\w.?@$#~]*)\s+(db|dw|dd|dq|resb|resw|resd|resq|times)\b(.*)$/i.exec(s)) && !classify(m[1].toLowerCase())) {
          defLabel(m[1], ln);
          s = (m[2] + m[3]).trim();
        }
        // times
        let times = 1n;
        if ((m = /^times\s+(.+?)\s+((?:db|dw|dd|dq|resb|resw|resd|resq)\b.*|[a-z][a-z0-9]*(?:\s.*)?)$/i.exec(s))) {
          curEnvHere = secAddr(cur) + BigInt(cur === "text" ? 0 : secs[cur].size); curEnvSect = secAddr(cur);
          times = constVal(parseExpr(m[1], ln, scope), ln, "عدد التكرار في times");
          curEnvHere = curEnvSect = null;
          if (times < 0n || times > 100000n) throw new AsmError("عدد التكرار في times لازم يكون بين 0 و100000", ln);
          s = m[2].trim();
        }
        // align
        if ((m = /^align\s+(.+)$/i.exec(s))) {
          const a = Number(constVal(parseExpr(m[1], ln, scope), ln, "align"));
          if (cur === "text") throw new AsmError("align جوه .text مش مدعوم في المعمل", ln);
          if (!a || (a & (a - 1))) throw new AsmError("align لازم يكون power of 2", ln);
          const pad = (a - (secs[cur].size % a)) % a;
          if (pad) { secs[cur].items.push({ kind: "fill", off: secs[cur].size, size: pad, line: ln }); secs[cur].size += pad; }
          return;
        }
        // data directives
        if ((m = /^(db|dw|dd|dq)\b\s*(.*)$/i.exec(s))) {
          if (cur === "text") throw new AsmError("البيانات (db/dw/dd/dq) جوه .text مش مدعومة في المعمل — حطها في section .data", ln);
          const unit = { db: 1, dw: 2, dd: 4, dq: 8 }[m[1].toLowerCase()];
          const items = splitTop(m[2]);
          if (!items.length || items.some((x) => !x)) throw new AsmError(m[1] + " محتاج قيم مفصولة بـ ,", ln);
          let one = 0;
          const parsed = items.map((it) => {
            if (/^(['"`]).*\1$/s.test(it) && it.length >= 2) {
              const b = strBytes(it);
              const n = unit === 1 ? b.length : Math.ceil(b.length / unit) * unit || unit;
              one += n;
              return { str: b, n };
            }
            if (isFloatTok(it.replace(/^[-+]/, ""))) {
              if (unit !== 4 && unit !== 8) throw new AsmError("الـ float محتاج dd أو dq", ln);
              one += unit;
              return { float: parseFloat(it), n: unit };
            }
            one += unit;
            return { ast: parseExpr(it, ln, scope), n: unit };
          });
          const T = Number(times);
          secs[cur].items.push({ kind: "data", off: secs[cur].size, unit, parsed, times: T, size: one * T, line: ln, scope });
          secs[cur].size += one * T;
          return;
        }
        if ((m = /^(resb|resw|resd|resq)\b\s*(.+)$/i.exec(s))) {
          if (cur === "text") throw new AsmError("resb/resq جوه .text مش منطقي — استخدم section .bss", ln);
          const unit = { resb: 1, resw: 2, resd: 4, resq: 8 }[m[1].toLowerCase()];
          const n = Number(constVal(parseExpr(m[2], ln, scope), ln, "الحجم")) * unit * Number(times);
          if (n < 0 || n > 0x100000) throw new AsmError("حجم الحجز كبير جدًا", ln);
          secs[cur].items.push({ kind: "fill", off: secs[cur].size, size: n, line: ln });
          secs[cur].size += n;
          return;
        }
        // instruction
        if (cur !== "text") throw new AsmError("الـ instructions لازم تكون في section .text", ln);
        let prefix = null;
        const words = s.split(/\s+/);
        if (PREFIXES[words[0].toLowerCase()] && words.length > 1) { prefix = PREFIXES[words[0].toLowerCase()]; s = s.slice(words[0].length).trim(); }
        const mm = /^([A-Za-z][A-Za-z0-9]*)\s*(.*)$/.exec(s);
        if (!mm) throw new AsmError("سطر مش مفهوم", ln);
        const mn = mm[1].toLowerCase();
        const kind = classify(mn);
        if (!kind) {
          if (/^(movss|movsd|addsd|addss|subsd|mulsd|divsd|cvt\w+|movaps|movups|movdqa|movdqu|pxor|xorps|paddd|ucomisd|comisd|movq|movd|pshufb|vmov\w*)$/.test(mn))
            throw new AsmError("instruction الـ SIMD/FP «" + mn + "» مش مدعومة في المعمل — جربها على Compiler Explorer", ln);
          if (/^(enter|xlat|xlatb|lahf|sahf|cmpxchg|xadd|lzcnt|tzcnt|in|out|iret|iretq|sysenter|lods|stos|movs|scas|cmps)$/.test(mn))
            throw new AsmError("«" + mn + "» مش مدعومة في المعمل" + (/^(lods|stos|movs|scas|cmps)$/.test(mn) ? " — اكتبها بالحجم: " + mn + "b / " + mn + "q" : ""), ln);
          throw new AsmError("instruction مش معروفة: «" + mn + "»", ln);
        }
        const ops = s.length > mn.length ? splitTop(mm[2]).map((o) => parseOperand(o, ln, scope)) : [];
        const T = Number(times);
        for (let k = 0; k < T; k++) {
          const I = { line: ln, mn, kind, ops: k ? ops.map((o) => Object.assign({}, o)) : ops, prefix, text: s.replace(/\s+/g, " ").trim(),
            addr: 0n, len: 0, near: false, index: ins.length, scope };
          analyze(I);
          if (k === 0) pending.forEach((n) => { labels.get(n).ins = ins.length; });
          if (k === 0) pending = [];
          ins.push(I);
        }
      } catch (e) {
        if (e instanceof AsmError) errors.push({ line: e.line || ln, msg: e.message });
        else errors.push({ line: ln, msg: String(e && e.message || e) });
      }
    });
    pending.forEach((n) => { labels.get(n).ins = ins.length; });   // labels after the last instruction
    if (!errors.length && !ins.length) errors.push({ line: 1, msg: "مفيش ولا instruction في الكود" });
    if (errors.length) return { ok: false, errors };

    /* ---------- pass 2: layout with branch relaxation ---------- */
    const ctx = { env, defaultRel, provisional: true };
    // provisional data bases far apart (only label differences matter for sizes)
    secs.rodata.base = 0x10000000n; secs.data.base = 0x20000000n; secs.bss.base = 0x30000000n;
    try {
      // Optimistic start (every jump short), then grow only what does not fit.
      // Each round lays out every instruction with the lengths of the previous
      // round, so sizes only ever grow and the result is the smallest fixpoint.
      for (let iter = 0; iter < 60; iter++) {
        let addr = TEXT_BASE, changed = false;
        ins.forEach((I) => { I.addr = addr; addr += BigInt(I.len); });
        secs.text.size = Number(addr - TEXT_BASE);
        for (const I of ins) {
          curEnvHere = I.addr; curEnvSect = TEXT_BASE;
          const enc = encode(I, ctx, true);
          if (enc.grow && !I.near) { I.near = true; changed = true; }
          if (enc.len !== I.len) { I.len = Math.max(I.len, enc.len); changed = true; }
        }
        if (!changed) break;
      }
      { let addr = TEXT_BASE; ins.forEach((I) => { I.addr = addr; addr += BigInt(I.len); }); secs.text.size = Number(addr - TEXT_BASE); }
    } catch (e) {
      curEnvHere = curEnvSect = null;
      if (e instanceof AsmError) return { ok: false, errors: [{ line: e.line || 1, msg: e.message }] };
      throw e;
    }
    // real section bases
    let next = TEXT_BASE + BigInt(secs.text.size);
    for (const k of ["rodata", "data", "bss"]) {
      const sc = secs[k];
      next = ((next + PAGE - 1n) / PAGE) * PAGE;
      sc.base = next;
      next += BigInt(sc.size);
    }

    /* ---------- pass 3: final encoding ---------- */
    ctx.provisional = false;
    for (const I of ins) {
      try {
        curEnvHere = I.addr; curEnvSect = TEXT_BASE;
        const enc = encode(I, ctx, false);
        if (enc.len !== I.len) throw new AsmError("خطأ داخلي في حساب طول الـ instruction", I.line);
        I.bytes = enc.bytes; I.parts = enc.parts;
      } catch (e) {
        if (e instanceof AsmError) errors.push({ line: e.line || I.line, msg: e.message }); else throw e;
      }
    }
    // data bytes
    for (const k of ["rodata", "data", "bss"]) {
      const sc = secs[k];
      sc.bytes = new Uint8Array(sc.size);
      for (const it of sc.items) {
        if (it.kind !== "data") continue;
        let off = it.off;
        try {
          for (let t = 0; t < it.times; t++) {
            for (const p of it.parsed) {
              curEnvHere = sc.base + BigInt(off); curEnvSect = sc.base;
              if (p.str) { sc.bytes.set(p.str, off); off += p.n; continue; }
              if (p.float !== undefined) {
                const dv = new DataView(sc.bytes.buffer);
                if (p.n === 4) dv.setFloat32(off, p.float, true); else dv.setFloat64(off, p.float, true);
                off += p.n; continue;
              }
              const r = lin(p.ast, env, it.line);
              if (r.regs.size) throw new AsmError("مينفعش registers جوه البيانات", it.line);
              if (r.rel && p.n < 4) throw new AsmError("عنوان (label) مش هيكفي في " + (p.n === 1 ? "byte" : "word") + " — استخدم dq", it.line);
              const bits = p.n * 8;
              if (p.n < 8 && !r.rel && (r.c < -(1n << BigInt(bits - 1)) || r.c > MASK[bits])) throw new AsmError("القيمة " + r.c + " مش بتكفي في " + SZNAME[bits], it.line);
              const v = U(r.c, bits);
              for (let b = 0; b < p.n; b++) sc.bytes[off + b] = Number((v >> BigInt(8 * b)) & 0xFFn);
              off += p.n;
            }
          }
        } catch (e) {
          if (e instanceof AsmError) errors.push({ line: e.line || it.line, msg: e.message }); else throw e;
        }
      }
    }
    curEnvHere = curEnvSect = null;
    if (errors.length) return { ok: false, errors };

    const textBytes = new Uint8Array(secs.text.size);
    ins.forEach((I) => textBytes.set(I.bytes, Number(I.addr - TEXT_BASE)));
    secs.text.bytes = textBytes;
    const byAddr = new Map();
    ins.forEach((I) => byAddr.set(I.addr, I));
    const labelList = [];
    labels.forEach((L, name) => labelList.push({ name, addr: labelAddr(name), sec: L.sec, line: L.line }));
    labelList.sort((a, b) => (a.addr < b.addr ? -1 : a.addr > b.addr ? 1 : 0));
    let entryName = opts.entry || (labels.has("_start") ? "_start" : labels.has("main") ? "main" : null);
    if (entryName && !labels.has(entryName)) return { ok: false, errors: [{ line: 1, msg: "نقطة البداية «" + entryName + "» مش موجودة" }] };
    const entry = entryName ? labelAddr(entryName) : ins[0].addr;
    const consts = [];
    equs.forEach((q, name) => { try { consts.push({ name, value: constVal(q.ast, q.line, "equ") }); } catch (e) { /* address-like equ */ } });
    return {
      ok: true, errors: [], ins, byAddr, secs, labels: labelList, consts, entry, entryName,
      mode: entryName === "_start" ? "start" : "func",
      textEnd: TEXT_BASE + BigInt(secs.text.size),
      labelAt: (addr) => { const l = labelList.find((x) => x.addr === addr && x.sec === "text"); return l ? l.name : null; },
      symbolize: (addr) => {
        let best = null;
        for (const l of labelList) if (l.addr <= addr && (!best || l.addr >= best.addr)) best = l;
        if (!best) return null;
        const sec = secs[best.sec];
        if (addr >= sec.base + BigInt(Math.max(sec.size, 1))) return null;
        const d = addr - best.addr;
        return best.name + (d ? "+" + d.toString(16).toUpperCase() + "h" : "");
      }
    };
  }

  /* ================================================================ analysis (validation + operand size) */
  function E(msg, I) { throw new AsmError(msg, I.line); }
  function nOps(I, n) {
    const ok = Array.isArray(n) ? n.includes(I.ops.length) : I.ops.length === n;
    if (!ok) E("«" + I.mn + "» محتاجة " + (Array.isArray(n) ? n.join(" أو ") : n) + " operand", I);
  }
  const bitsOf = (o) => (o.t === "reg" ? o.r.bits : o.t === "mem" ? o.size : 0);
  function needSize(I, size) {
    if (!size) E("مش واضح حجم الـ memory — اكتب byte / word / dword / qword قبل الـ [ ]", I);
    return size;
  }
  function sizeOf2(I, a, b) {
    const sa = bitsOf(a), sb = b ? bitsOf(b) : 0;
    if (a.t === "reg" && b && b.t === "reg" && sa !== sb) E("حجم الـ operands مختلف: " + a.r.name + " (" + sa + "-bit) و " + b.r.name + " (" + sb + "-bit)", I);
    if (sa && sb && sa !== sb) E("حجم الـ operands مختلف (" + sa + "-bit و " + sb + "-bit)", I);
    return needSize(I, sa || sb);
  }
  function analyze(I) {
    const o = I.ops, mn = I.mn, k = I.kind;
    if (I.prefix === "lock" && (!LOCKABLE.has(mn) || !o[0] || o[0].t !== "mem"))
      E("lock مسموح بس مع instructions بتعدل memory زي lock add [x], 1 أو lock xchg", I);
    if ((I.prefix === "rep" || I.prefix === "repe" || I.prefix === "repne") && k !== "string") E("rep/repe/repne بتشتغل بس مع string instructions (movsb, stosq…)", I);
    const noImmDst = () => { if (o[0] && o[0].t === "imm") E("الـ destination مينفعش يكون رقم ثابت", I); };
    const noMemMem = () => { if (o[0].t === "mem" && o[1].t === "mem") E("مينفعش الاتنين يبقوا memory — x86 مفيهوش memory ← memory في instruction واحدة", I); };
    if (mn in ALU || mn === "test") {
      nOps(I, 2); noImmDst(); noMemMem();
      I.size = o[1].t === "imm" ? needSize(I, bitsOf(o[0])) : sizeOf2(I, o[0], o[1]);
      if (o[1].t === "imm" && o[1].size && o[1].size !== I.size) { /* NASM allows "add eax, dword 5" */ }
      I.form = "alu"; return;
    }
    if (mn === "mov" || mn === "movabs") {
      nOps(I, 2); noImmDst(); noMemMem();
      I.size = o[1].t === "imm" ? needSize(I, bitsOf(o[0])) : sizeOf2(I, o[0], o[1]);
      if (mn === "movabs" && !(o[0].t === "reg" && o[0].r.bits === 64 && o[1].t === "imm")) E("movabs هنا محتاجة: movabs r64, imm64", I);
      I.form = "mov"; return;
    }
    if (mn === "movzx" || mn === "movsx" || mn === "movsxd") {
      nOps(I, 2);
      if (o[0].t !== "reg") E(mn + ": الـ destination لازم يكون register", I);
      if (o[1].t === "imm") E(mn + ": الـ source مينفعش يكون رقم — استخدم mov", I);
      const ds = o[0].r.bits, ss = o[1].t === "reg" ? o[1].r.bits : o[1].size;
      if (!ss) E(mn + " مع memory محتاجة حجم الـ source: " + (mn === "movsxd" ? "dword" : "byte أو word") + " [ … ]", I);
      if (mn === "movsxd" || (mn === "movsx" && ss === 32)) {
        if (ds !== 64 || ss !== 32) E("movsxd شكلها: movsxd r64, r/m32", I);
        I.mn = "movsxd";
      } else {
        if (ss >= ds) E(mn + ": الـ source (" + ss + "-bit) لازم يكون أصغر من الـ destination (" + ds + "-bit)", I);
        if (ss !== 8 && ss !== 16) E(mn + ": الـ source لازم يكون 8 أو 16 bit", I);
      }
      I.size = ds; I.srcSize = ss; I.form = "movx"; return;
    }
    if (mn === "lea") {
      nOps(I, 2);
      if (o[0].t !== "reg" || o[0].r.bits === 8) E("lea: الـ destination لازم يكون register (16/32/64-bit)", I);
      if (o[1].t !== "mem") E("lea: الـ source لازم يكون عنوان بين [ ] — lea بتحسب العنوان من غير ما تقرا الذاكرة", I);
      I.size = o[0].r.bits; I.form = "lea"; return;
    }
    if (mn === "xchg") {
      nOps(I, 2); noMemMem();
      if (o[0].t === "imm" || o[1].t === "imm") E("xchg مبتاخدش أرقام ثابتة", I);
      I.size = sizeOf2(I, o[0], o[1]); I.form = "xchg"; return;
    }
    if (mn === "push" || mn === "pop") {
      nOps(I, 1);
      const a = o[0];
      if (a.t === "reg") {
        if (a.r.bits === 32) E(mn + " بـ register 32-bit مش مسموح في 64-bit mode — استخدم " + R64[a.r.i], I);
        if (a.r.bits === 8) E(mn + " مبتشتغلش مع registers 8-bit", I);
        I.size = a.r.bits;
      } else if (a.t === "mem") {
        if (a.size === 32 || a.size === 8) E(mn + " مع memory لازم يكون qword (أو word)", I);
        I.size = a.size || 64;
      } else {
        if (mn === "pop") E("pop محتاجة مكان تحط فيه القيمة (register أو memory)", I);
        I.size = 64;
      }
      I.form = mn; return;
    }
    if (mn in GRP3 || mn === "inc" || mn === "dec") {
      nOps(I, 1);
      if (o[0].t === "imm") E(mn + " محتاجة register أو memory", I);
      I.size = needSize(I, bitsOf(o[0])); I.form = "unary"; return;
    }
    if (mn === "imul") {
      nOps(I, [1, 2, 3]);
      if (o.length === 1) { if (o[0].t === "imm") E("imul محتاجة register أو memory", I); I.size = needSize(I, bitsOf(o[0])); I.form = "unary"; return; }
      if (o[0].t !== "reg") E("imul بـ 2 أو 3 operands: الأول لازم يكون register", I);
      if (o[0].r.bits === 8) E("imul بـ 2 أو 3 operands مبتشتغلش على 8-bit", I);
      if (o.length === 2 && o[1].t === "imm") { I.ops = [o[0], o[0], o[1]]; }
      const p = I.ops;
      if (p.length === 3 && p[2].t !== "imm") E("imul: الـ operand التالت لازم يكون رقم ثابت", I);
      if (p[1].t === "imm") E("imul: الـ operand التاني لازم يكون register أو memory", I);
      I.size = sizeOf2(I, p[0], p[1]); I.form = p.length === 3 ? "imul3" : "imul2"; return;
    }
    if (mn in SHIFT) {
      if (o.length === 1) E(mn + " محتاجة عدد مرات الـ shift — اكتب مثلًا: " + mn + " " + (o[0].t === "reg" ? o[0].r.name : "eax") + ", 1", I);
      nOps(I, 2);
      if (o[0].t === "imm") E(mn + ": الـ destination لازم يكون register أو memory", I);
      if (I.ops[1].t === "reg" && I.ops[1].r.name !== "cl") E(mn + ": عدد الـ shift لازم يكون رقم ثابت أو cl بس", I);
      if (I.ops[1].t === "mem") E(mn + ": عدد الـ shift لازم يكون رقم ثابت أو cl بس", I);
      I.size = needSize(I, bitsOf(o[0])); I.form = "shift"; return;
    }
    if (mn in BTOP) {
      nOps(I, 2);
      if (o[0].t === "imm") E(mn + ": الـ operand الأول لازم يكون register أو memory", I);
      if (o[1].t === "mem") E(mn + ": رقم الـ bit لازم يكون register أو رقم ثابت", I);
      I.size = o[1].t === "imm" ? needSize(I, bitsOf(o[0])) : sizeOf2(I, o[0], o[1]);
      if (I.size === 8) E(mn + " مبتشتغلش على 8-bit", I);
      I.form = "bt"; return;
    }
    if (mn === "bsf" || mn === "bsr" || mn === "popcnt") {
      nOps(I, 2);
      if (o[0].t !== "reg") E(mn + ": الـ destination لازم يكون register", I);
      if (o[1].t === "imm") E(mn + ": الـ source لازم يكون register أو memory", I);
      I.size = sizeOf2(I, o[0], o[1]);
      if (I.size === 8) E(mn + " مبتشتغلش على 8-bit", I);
      I.form = "bitscan"; return;
    }
    if (mn === "bswap") {
      nOps(I, 1);
      if (o[0].t !== "reg" || o[0].r.bits < 32) E("bswap محتاجة register 32 أو 64-bit", I);
      I.size = o[0].r.bits; I.form = "bswap"; return;
    }
    if (k === "setcc") {
      nOps(I, 1); I.cc = CC[mn.slice(3)];
      if (o[0].t === "imm" || (o[0].t === "reg" && o[0].r.bits !== 8) || (o[0].t === "mem" && o[0].size && o[0].size !== 8))
        E(mn + " بتكتب byte واحد: لازم register 8-bit (زي al) أو byte [ ]", I);
      I.size = 8; I.form = "setcc"; return;
    }
    if (k === "cmovcc") {
      nOps(I, 2); I.cc = CC[mn.slice(4)];
      if (o[0].t !== "reg" || o[0].r.bits === 8) E(mn + ": الـ destination لازم يكون register 16/32/64-bit", I);
      if (o[1].t === "imm") E(mn + ": الـ source مينفعش يكون رقم ثابت (cmov مفيهاش immediate)", I);
      I.size = sizeOf2(I, o[0], o[1]); I.form = "cmovcc"; return;
    }
    if (mn === "jmp" || mn === "call" || k === "jcc") {
      nOps(I, 1);
      if (k === "jcc") I.cc = CC[mn.slice(1)];
      const a = o[0];
      if (a.t === "imm") { I.form = k === "jcc" ? "jcc" : mn; I.branch = true; if (a.mod === "near") I.near = true; I.forceShort = a.mod === "short"; if (mn === "call") I.near = true; return; }
      if (k === "jcc") E("الـ conditional jumps بتاخد label بس (مفيش jcc لعنوان في register)", I);
      if (a.t === "reg" && a.r.bits !== 64) E(mn + " لعنوان في register لازم يكون 64-bit", I);
      if (a.t === "mem" && a.size && a.size !== 64) E(mn + " لعنوان في الذاكرة لازم يكون qword", I);
      I.size = 64; I.form = mn + "_ind"; return;
    }
    if (mn in LOOPS) {
      nOps(I, 1);
      if (o[0].t !== "imm") E(mn + " بتاخد label", I);
      I.form = "loop"; I.branch = true; I.forceShort = true; return;
    }
    if (mn === "ret") {
      nOps(I, [0, 1]);
      if (o.length && o[0].t !== "imm") E("ret بتاخد رقم بس (عدد الـ bytes اللي تتشال من الـ stack)", I);
      I.form = "ret"; return;
    }
    if (mn === "int") { nOps(I, 1); if (o[0].t !== "imm") E("int بتاخد رقم", I); I.form = "int"; return; }
    if (mn === "nop" && o.length) {
      nOps(I, 1);
      if (o[0].t === "imm") E("nop مع operand لازم يكون register أو memory", I);
      I.size = needSize(I, bitsOf(o[0])); if (I.size === 8 || I.size === 64) E("nop متعددة الـ bytes بتاخد word أو dword", I);
      I.form = "nopm"; return;
    }
    if (mn in SIMPLE) { nOps(I, 0); I.form = "simple"; return; }
    if (k === "string") {
      if (o.length && (mn === "movsd" || mn === "cmpsd")) E("«" + mn + "» بـ operands دي نسخة الـ SSE (double) — مش مدعومة في المعمل. نسخة الـ string بتتكتب من غير operands", I);
      if (o.length) E("اكتب " + mn + " من غير operands (rsi/rdi/rcx ثابتين)", I);
      I.size = STR_SFX[mn.slice(4)]; I.sop = mn.slice(0, 4); I.form = "string"; return;
    }
    E("instruction مش مدعومة: " + mn, I);
  }

  /* ================================================================ encoder */
  const fits8 = (v) => v >= -128n && v <= 127n;
  const fits32 = (v) => v >= -0x80000000n && v <= 0x7FFFFFFFn;
  function le(v, n) { const out = []; v = U(v, n * 8); for (let i = 0; i < n; i++) out.push(Number((v >> BigInt(8 * i)) & 0xFFn)); return out; }

  function resolveImm(I, op, ctx) {
    const r = lin(op.ast, ctx.env, I.line);
    if (r.regs.size) E("مينفعش register جوه رقم ثابت (لو قصدك عنوان حطه بين [ ])", I);
    op.v = r.c;
    return { v: r.c, reloc: r.rel !== 0 };
  }
  function resolveMem(I, op, ctx) {
    const r = lin(op.ast, ctx.env, I.line);
    const regs = [];
    r.regs.forEach((c, n) => { if (c !== 0n) regs.push([REG[n], c]); });
    let base = null, index = null, scale = 1;
    for (const [rg] of regs) {
      if (rg.bits !== 64) E("استخدم registers 64-bit جوه [ ] (" + rg.name + " → " + R64[rg.i] + ")", I);
    }
    if (regs.length > 2) E("العنوان فيه registers كتير — المسموح base + index*scale + displacement", I);
    if (regs.length === 1) {
      const [rg, c] = regs[0];
      if (c === 1n) base = rg;
      else if (c === 2n) { base = rg; index = rg; scale = 1; }
      else if (c === 3n || c === 5n || c === 9n) { base = rg; index = rg; scale = Number(c) - 1; }
      else if (c === 4n || c === 8n) { index = rg; scale = Number(c); }
      else E("الـ scale لازم يكون 1 أو 2 أو 4 أو 8", I);
    } else if (regs.length === 2) {
      let [[r1, c1], [r2, c2]] = regs;
      if (c1 !== 1n && c2 === 1n) { [r1, c1, r2, c2] = [r2, c2, r1, c1]; }
      if (c1 !== 1n) E("واحد بس من الـ registers ممكن يكون عليه scale", I);
      if (![1n, 2n, 4n, 8n].includes(c2)) E("الـ scale لازم يكون 1 أو 2 أو 4 أو 8", I);
      base = r1; index = r2; scale = Number(c2);
    }
    if (index && index.i === 4) {
      if (scale === 1 && base && base.i !== 4) { const t = base; base = index; index = t; }
      else E("rsp مينفعش يبقى index", I);
    }
    // NASM: REL (explicit or DEFAULT REL) only applies to symbol-relative addresses without base/index/fs/gs
    const rip = !base && !index && op.seg == null && r.rel !== 0 && (op.relKw === "rel" || (ctx.defaultRel && op.relKw !== "abs"));
    const m = { base, index, scale, disp: r.c, reloc: r.rel !== 0, rip, seg: op.seg };
    if (rip) m.target = U(r.c, 64);
    else if (!fits32(r.c)) E("الـ displacement أكبر من 32-bit (signed) — حط العنوان في register الأول", I);
    return m;
  }

  function Spec() { return { pfx: [], seg: null, opsz: false, W: 0, R: 0, X: 0, B: 0, force: false, noRex: false, op: [], modrm: null, sib: null, dispSize: 0, disp: 0n, ripTarget: null, immSize: 0, imm: 0n, relSize: 0, relTarget: null }; }
  function regField(sp, r) { sp.R = r.code >> 3; if (r.rex8) sp.force = true; if (r.hi) sp.noRex = true; return r.code & 7; }
  function rmReg(sp, r) { sp.B = r.code >> 3; if (r.rex8) sp.force = true; if (r.hi) sp.noRex = true; sp.modrm = { mod: 3, reg: 0, rm: r.code & 7 }; }
  function rmMem(sp, m) {
    if (m.seg === "fs") sp.seg = 0x64; else if (m.seg === "gs") sp.seg = 0x65;
    if (m.rip) { sp.modrm = { mod: 0, reg: 0, rm: 5 }; sp.dispSize = 4; sp.ripTarget = m.target; return; }
    const { base, index, scale } = m, disp = m.disp, f32 = m.reloc;
    const dsz = (low) => (disp === 0n && low !== 5 && !f32 ? 0 : !f32 && fits8(disp) ? 1 : 4);
    if (!base && !index) { sp.modrm = { mod: 0, reg: 0, rm: 4 }; sp.sib = 0x25; sp.dispSize = 4; sp.disp = disp; return; }
    if (!index) {
      sp.B = base.code >> 3;
      const low = base.code & 7, ds = dsz(low);
      sp.modrm = { mod: ds === 0 ? 0 : ds === 1 ? 1 : 2, reg: 0, rm: low === 4 ? 4 : low };
      if (low === 4) sp.sib = 0x24;
      sp.dispSize = ds; sp.disp = disp; return;
    }
    sp.X = index.code >> 3;
    const ss = { 1: 0, 2: 1, 4: 2, 8: 3 }[scale];
    if (!base) { sp.modrm = { mod: 0, reg: 0, rm: 4 }; sp.sib = (ss << 6) | ((index.code & 7) << 3) | 5; sp.dispSize = 4; sp.disp = disp; return; }
    sp.B = base.code >> 3;
    const low = base.code & 7, ds = dsz(low);
    sp.modrm = { mod: ds === 0 ? 0 : ds === 1 ? 1 : 2, reg: 0, rm: 4 };
    sp.sib = (ss << 6) | ((index.code & 7) << 3) | low;
    sp.dispSize = ds; sp.disp = disp;
  }
  function rm(sp, I, op, ctx) {
    if (op.t === "reg") rmReg(sp, op.r);
    else { const m = resolveMem(I, op, ctx); op.m = m; rmMem(sp, m); }
  }
  function sizePfx(sp, size) { if (size === 16) sp.opsz = true; if (size === 64) sp.W = 1; }
  function immFor(I, size, v, reloc, allowWide) {
    const lo = size === 64 && !allowWide ? -0x80000000n : -(1n << BigInt(size - 1));
    const hi = size === 64 && !allowWide ? 0x7FFFFFFFn : MASK[size];
    if (!reloc && (v < lo || v > hi)) {
      if (size === 64) E("الرقم " + hex(v) + " مش بيكفي كـ imm32 (بيتعمله sign-extend لـ 64-bit). حطه في register بـ mov الأول", I);
      E("الرقم " + v + " مش بيكفي في " + size + "-bit", I);
    }
  }

  function finalize(sp, I, addr) {
    if (sp.noRex && (sp.W || sp.R || sp.X || sp.B || sp.force)) E("ah/bh/ch/dh مينفعش يتجمعوا مع REX (r8–r15 أو spl/sil/dil أو 64-bit)", I);
    const parts = [];
    const pre = [];
    if (I.prefix === "lock") pre.push(0xF0);
    if (sp.seg) pre.push(sp.seg);
    if (sp.opsz) pre.push(0x66);
    if (I.prefix === "rep" || I.prefix === "repe") pre.push(0xF3);
    if (I.prefix === "repne") pre.push(0xF2);
    sp.pfx.forEach((b) => pre.push(b));
    if (pre.length) parts.push({ k: "prefix", b: pre });
    if (sp.W || sp.R || sp.X || sp.B || sp.force) parts.push({ k: "rex", b: [0x40 | (sp.W << 3) | (sp.R << 2) | (sp.X << 1) | sp.B] });
    parts.push({ k: "opcode", b: sp.op.slice() });
    if (sp.modrm) parts.push({ k: "modrm", b: [(sp.modrm.mod << 6) | ((sp.modrm.reg & 7) << 3) | (sp.modrm.rm & 7)] });
    if (sp.sib !== null) parts.push({ k: "sib", b: [sp.sib] });
    let len = parts.reduce((n, p) => n + p.b.length, 0) + sp.dispSize + sp.relSize + sp.immSize;
    const end = addr + BigInt(len);
    if (sp.dispSize) {
      let d = sp.ripTarget !== null ? sp.ripTarget - end : sp.disp;
      if (sp.ripTarget !== null && !fits32(S(U(d, 64), 64))) E("الـ label بعيد جدًا عن RIP", I);
      parts.push({ k: "disp", b: le(d, sp.dispSize) });
    }
    if (sp.relSize) {
      const rel = sp.relTarget - end;
      parts.push({ k: "rel", b: le(rel, sp.relSize), grow: sp.relSize === 1 && !fits8(rel) });
    }
    if (sp.immSize) parts.push({ k: "imm", b: le(sp.imm, sp.immSize) });
    const bytes = [];
    parts.forEach((p) => p.b.forEach((b) => bytes.push(b)));
    return { bytes, parts, len };
  }

  function encode(I, ctx, layout) {
    const sp = Spec(), o = I.ops, size = I.size;
    const imm = (op) => resolveImm(I, op, ctx);
    let grow = false;
    switch (I.form) {
      case "alu": {
        const n = I.mn === "test" ? -1 : ALU[I.mn];
        sizePfx(sp, size);
        if (o[1].t === "imm") {
          const { v, reloc } = imm(o[1]);
          immFor(I, size, v, reloc, false);
          const nv = S(U(v, size), size);
          const acc = o[0].t === "reg" && o[0].r.i === 0 && !o[0].r.hi;
          if (I.mn === "test") {
            if (acc) { sp.op = [size === 8 ? 0xA8 : 0xA9]; if (o[0].r.rex8) sp.force = true; }
            else { sp.op = [size === 8 ? 0xF6 : 0xF7]; rm(sp, I, o[0], ctx); sp.modrm.reg = 0; }
            sp.immSize = size === 8 ? 1 : size === 16 ? 2 : 4; sp.imm = v;
          } else if (size === 8) {
            if (acc) sp.op = [n * 8 + 4]; else { sp.op = [0x80]; rm(sp, I, o[0], ctx); sp.modrm.reg = n; }
            sp.immSize = 1; sp.imm = v;
          } else if (!reloc && fits8(nv)) {
            sp.op = [0x83]; rm(sp, I, o[0], ctx); sp.modrm.reg = n; sp.immSize = 1; sp.imm = nv;
          } else {
            if (acc) sp.op = [n * 8 + 5]; else { sp.op = [0x81]; rm(sp, I, o[0], ctx); sp.modrm.reg = n; }
            sp.immSize = size === 16 ? 2 : 4; sp.imm = v;
          }
        } else if (o[1].t === "reg" && (o[0].t === "reg" || o[0].t === "mem")) {
          const base = I.mn === "test" ? 0x84 : n * 8;
          sp.op = [base + (size === 8 ? 0 : 1)];
          rm(sp, I, o[0], ctx); sp.modrm.reg = regField(sp, o[1].r);
        } else {   // reg, mem
          if (I.mn === "test") { sp.op = [size === 8 ? 0x84 : 0x85]; rm(sp, I, o[1], ctx); sp.modrm.reg = regField(sp, o[0].r); }
          else { sp.op = [n * 8 + (size === 8 ? 2 : 3)]; rm(sp, I, o[1], ctx); sp.modrm.reg = regField(sp, o[0].r); }
        }
        break;
      }
      case "mov": {
        if (o[1].t === "imm") {
          const { v, reloc } = imm(o[1]);
          if (o[0].t === "reg") {
            const r = o[0].r;
            sp.B = r.code >> 3; if (r.rex8) sp.force = true; if (r.hi) sp.noRex = true;
            if (size === 8) { immFor(I, 8, v, reloc); sp.op = [0xB0 + (r.code & 7)]; sp.immSize = 1; sp.imm = v; }
            else if (size === 16) { immFor(I, 16, v, reloc); sp.opsz = true; sp.op = [0xB8 + (r.code & 7)]; sp.immSize = 2; sp.imm = v; }
            else if (size === 32) { immFor(I, 32, v, reloc); sp.op = [0xB8 + (r.code & 7)]; sp.immSize = 4; sp.imm = v; }
            else {
              if (!reloc && (v < -(1n << 63n) || v > MASK[64])) E("الرقم أكبر من 64-bit", I);
              const uv = U(v, 64);
              if (I.mn !== "movabs" && !reloc && uv <= 0xFFFFFFFFn) { sp.op = [0xB8 + (r.code & 7)]; sp.immSize = 4; sp.imm = uv; }
              else if (I.mn !== "movabs" && !reloc && fits32(S(uv, 64))) { sp.W = 1; sp.op = [0xC7]; sp.modrm = { mod: 3, reg: 0, rm: r.code & 7 }; sp.immSize = 4; sp.imm = uv; }
              else { sp.W = 1; sp.op = [0xB8 + (r.code & 7)]; sp.immSize = 8; sp.imm = uv; }
            }
          } else {
            immFor(I, size, v, reloc, false);
            sizePfx(sp, size);
            sp.op = [size === 8 ? 0xC6 : 0xC7]; rm(sp, I, o[0], ctx); sp.modrm.reg = 0;
            sp.immSize = size === 8 ? 1 : size === 16 ? 2 : 4; sp.imm = v;
          }
        } else if (o[1].t === "reg") {
          sizePfx(sp, size); sp.op = [size === 8 ? 0x88 : 0x89];
          rm(sp, I, o[0], ctx); sp.modrm.reg = regField(sp, o[1].r);
        } else {
          sizePfx(sp, size); sp.op = [size === 8 ? 0x8A : 0x8B];
          rm(sp, I, o[1], ctx); sp.modrm.reg = regField(sp, o[0].r);
        }
        break;
      }
      case "movx": {
        if (I.mn !== "movzx" && o[1].t === "reg" && o[0].r.i === 0 && o[1].r.i === 0 && !o[1].r.hi && I.srcSize * 2 === size) {
          sizePfx(sp, size); sp.op = [0x98]; break;      // movsx eax, ax  ==  cwde (NASM picks the short form)
        }
        sizePfx(sp, size);
        if (I.mn === "movsxd") sp.op = [0x63];
        else sp.op = [0x0F, (I.mn === "movzx" ? 0xB6 : 0xBE) + (I.srcSize === 16 ? 1 : 0)];
        rm(sp, I, o[1], ctx); sp.modrm.reg = regField(sp, o[0].r);
        break;
      }
      case "lea": sizePfx(sp, size); sp.op = [0x8D]; rm(sp, I, o[1], ctx); sp.modrm.reg = regField(sp, o[0].r); break;
      case "xchg": {
        sizePfx(sp, size);
        const a = o[0], b = o[1];
        if (size !== 8 && a.t === "reg" && b.t === "reg" && (a.r.i === 0 || b.r.i === 0) && !(size === 32 && a.r.i === 0 && b.r.i === 0)) {
          const other = a.r.i === 0 ? b.r : a.r;
          sp.B = other.code >> 3; sp.op = [0x90 + (other.code & 7)];
        } else {
          sp.op = [size === 8 ? 0x86 : 0x87];
          if (a.t === "reg" && b.t === "reg") { rm(sp, I, b, ctx); sp.modrm.reg = regField(sp, a.r); }
          else if (a.t === "mem") { rm(sp, I, a, ctx); sp.modrm.reg = regField(sp, b.r); }
          else { rm(sp, I, b, ctx); sp.modrm.reg = regField(sp, a.r); }
        }
        break;
      }
      case "push": case "pop": {
        const a = o[0];
        if (size === 16) sp.opsz = true;
        if (a.t === "reg") { sp.B = a.r.code >> 3; sp.op = [(I.form === "push" ? 0x50 : 0x58) + (a.r.code & 7)]; }
        else if (a.t === "mem") { sp.op = [I.form === "push" ? 0xFF : 0x8F]; rm(sp, I, a, ctx); sp.modrm.reg = I.form === "push" ? 6 : 0; }
        else {
          const { v, reloc } = imm(a);
          immFor(I, 64, v, reloc, false);
          if (!reloc && fits8(v)) { sp.op = [0x6A]; sp.immSize = 1; } else { sp.op = [0x68]; sp.immSize = 4; }
          sp.imm = v;
        }
        break;
      }
      case "unary": {
        sizePfx(sp, size);
        if (I.mn === "inc" || I.mn === "dec") { sp.op = [size === 8 ? 0xFE : 0xFF]; rm(sp, I, o[0], ctx); sp.modrm.reg = I.mn === "inc" ? 0 : 1; }
        else { sp.op = [size === 8 ? 0xF6 : 0xF7]; rm(sp, I, o[0], ctx); sp.modrm.reg = I.mn === "imul" ? 5 : GRP3[I.mn]; }
        break;
      }
      case "imul2": sizePfx(sp, size); sp.op = [0x0F, 0xAF]; rm(sp, I, o[1], ctx); sp.modrm.reg = regField(sp, o[0].r); break;
      case "imul3": {
        sizePfx(sp, size);
        const { v, reloc } = imm(I.ops[2]);
        immFor(I, size, v, reloc, false);
        const nv = S(U(v, size), size);
        if (!reloc && fits8(nv)) { sp.op = [0x6B]; sp.immSize = 1; sp.imm = nv; } else { sp.op = [0x69]; sp.immSize = size === 16 ? 2 : 4; sp.imm = v; }
        rm(sp, I, I.ops[1], ctx); sp.modrm.reg = regField(sp, I.ops[0].r);
        break;
      }
      case "shift": {
        sizePfx(sp, size);
        const n = SHIFT[I.mn], c = I.ops[1];
        if (c.t === "reg") sp.op = [size === 8 ? 0xD2 : 0xD3];
        else {
          const { v } = imm(c);
          if (v < 0n || v > 255n) E("عدد الـ shift لازم يكون بين 0 و255", I);
          if (v === 1n) sp.op = [size === 8 ? 0xD0 : 0xD1];
          else { sp.op = [size === 8 ? 0xC0 : 0xC1]; sp.immSize = 1; sp.imm = v; }
        }
        rm(sp, I, o[0], ctx); sp.modrm.reg = n;
        break;
      }
      case "bt": {
        sizePfx(sp, size);
        const [opc, n] = BTOP[I.mn];
        if (o[1].t === "imm") {
          const { v } = imm(o[1]);
          if (v < 0n || v > 255n) E("رقم الـ bit لازم يكون بين 0 و255", I);
          sp.op = [0x0F, 0xBA]; rm(sp, I, o[0], ctx); sp.modrm.reg = n; sp.immSize = 1; sp.imm = v;
        } else { sp.op = [0x0F, opc]; rm(sp, I, o[0], ctx); sp.modrm.reg = regField(sp, o[1].r); }
        break;
      }
      case "bitscan": {
        sizePfx(sp, size);
        if (I.mn === "popcnt") { sp.pfx = [0xF3]; sp.op = [0x0F, 0xB8]; }
        else sp.op = [0x0F, I.mn === "bsf" ? 0xBC : 0xBD];
        rm(sp, I, o[1], ctx); sp.modrm.reg = regField(sp, o[0].r);
        break;
      }
      case "bswap": sizePfx(sp, size); sp.B = o[0].r.code >> 3; sp.op = [0x0F, 0xC8 + (o[0].r.code & 7)]; break;
      case "setcc": sp.op = [0x0F, 0x90 + I.cc]; rm(sp, I, o[0], ctx); sp.modrm.reg = 0; break;
      case "cmovcc": sizePfx(sp, size); sp.op = [0x0F, 0x40 + I.cc]; rm(sp, I, o[1], ctx); sp.modrm.reg = regField(sp, o[0].r); break;
      case "jmp": case "jcc": case "call": case "loop": {
        const { v } = imm(o[0]);
        const target = U(v, 64);
        I.target = target;
        if (I.form === "call") { sp.op = [0xE8]; sp.relSize = 4; }
        else if (I.form === "loop") { if (I.mn === "jecxz") sp.pfx = [0x67]; sp.op = [LOOPS[I.mn]]; sp.relSize = 1; }
        else if (!I.near) { sp.op = [I.form === "jmp" ? 0xEB : 0x70 + I.cc]; sp.relSize = 1; }
        else { sp.op = I.form === "jmp" ? [0xE9] : [0x0F, 0x80 + I.cc]; sp.relSize = 4; }
        sp.relTarget = target;
        const fin = finalize(sp, I, I.addr);
        const relPart = fin.parts.find((p) => p.k === "rel");
        if (relPart && relPart.grow) {
          if (I.forceShort || I.form === "loop") {
            if (!layout) E((I.form === "loop" ? I.mn : "jmp short") + ": الهدف بعيد عن مدى الـ rel8 (‎-128..127 byte‎)", I);
          } else if (layout) grow = true;
          else E("خطأ داخلي: قفزة مش متوسعة", I);
        }
        return { len: fin.len, bytes: fin.bytes, parts: fin.parts, grow };
      }
      case "jmp_ind": case "call_ind": sp.op = [0xFF]; rm(sp, I, o[0], ctx); sp.modrm.reg = I.form === "jmp_ind" ? 4 : 2; break;
      case "ret": {
        if (o.length) {
          const { v } = imm(o[0]);
          if (v < 0n || v > 0xFFFFn) E("ret N: الرقم لازم يكون بين 0 و65535", I);
          sp.op = [0xC2]; sp.immSize = 2; sp.imm = v;
        } else sp.op = [0xC3];
        break;
      }
      case "int": {
        const { v } = imm(o[0]);
        if (v < 0n || v > 255n) E("رقم الـ interrupt لازم يكون بين 0 و255", I);
        sp.op = [0xCD]; sp.immSize = 1; sp.imm = v; I.intNo = Number(v);
        break;
      }
      case "nopm": sizePfx(sp, size); sp.op = [0x0F, 0x1F]; rm(sp, I, o[0], ctx); sp.modrm.reg = 0; break;
      case "simple": {
        const b = SIMPLE[I.mn].slice();
        if (b[0] === 0x66 && b.length === 2) { sp.opsz = true; b.shift(); }
        if (b[0] === 0x48 && b.length === 2) { sp.W = 1; b.shift(); }
        if (b[0] === 0xF3 && b.length > 1) { sp.pfx = [0xF3]; b.shift(); }
        sp.op = b;
        break;
      }
      case "string": {
        const s = I.size;
        sizePfx(sp, s);
        sp.op = [STRING[I.sop] + (s === 8 ? 0 : 1)];
        break;
      }
      default: E("خطأ داخلي: form غير معروف", I);
    }
    const fin = finalize(sp, I, I.addr);
    return { len: fin.len, bytes: fin.bytes, parts: fin.parts, grow };
  }

  /* ================================================================ machine */
  function parseSetup(text) {
    const out = [];
    if (!text) return out;
    let q = null, cur = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { cur += c; if (c === "\\") { cur += text[++i] || ""; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.map((p) => {
      const m = /^([A-Za-z0-9_]+(?:\([^)]*\))?)\s*(<=|>=|=)\s*([\s\S]*)$/.exec(p);
      if (!m) throw new Error("setup/expect غلط: " + p);
      return { key: m[1], op: m[2], val: m[3].trim() };
    });
  }
  function jsString(lit) {
    // "..." with C-like escapes
    if (!/^"[\s\S]*"$/.test(lit)) throw new Error("محتاج string بين \"\": " + lit);
    return JSON.parse(lit.replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1"));
  }

  class Machine {
    constructor(prog, setup) {
      this.prog = prog;
      this.regs = new Array(16).fill(0n);
      this.fl = 0x202; this.undef = 0;
      this.regions = [];
      this.outBytes = [];
      this.stdin = []; this.stdinPos = 0;
      this.steps = 0; this.tsc = 0x1A2B3C00n;
      this.halted = false; this.status = null;
      this.history = [];
      this.segBase = { fs: 0n, gs: 0n };
      this.vm = false;
      this.trapNext = false;
      const SC = prog.secs;
      const addRegion = (name, start, size, perm, bytes) => {
        if (size <= 0) return null;
        const buf = new Uint8Array(size);
        if (bytes) buf.set(bytes.subarray ? bytes.subarray(0, size) : bytes);
        const r = { name, start, end: start + BigInt(size), r: perm[0] === "r", w: perm[1] === "w", x: perm[2] === "x", buf };
        this.regions.push(r);
        return r;
      };
      addRegion(".text", SC.text.base, Math.max(SC.text.size, 1), "r-x", SC.text.bytes);
      addRegion(".rodata", SC.rodata.base, SC.rodata.size, "r--", SC.rodata.bytes);
      addRegion(".data", SC.data.base, SC.data.size, "rw-", SC.data.bytes);
      addRegion(".bss", SC.bss.base, SC.bss.size, "rw-", SC.bss.bytes);
      this.stack = addRegion("[stack]", STACK_TOP - STACK_SIZE, Number(STACK_SIZE), "rw-");
      this.input = null; this.inputUsed = 0;
      this.rip = prog.entry;
      if (prog.mode === "start") {
        // Linux process entry: [rsp]=argc, argv[0], NULL, envp NULL
        const argv0 = STACK_TOP - 0x20n;
        this._raw(argv0, utf8("./lab\0"));
        let sp = STACK_TOP - 0x100n;
        this._poke(sp, 8, 1n); this._poke(sp + 8n, 8, argv0); this._poke(sp + 16n, 8, 0n); this._poke(sp + 24n, 8, 0n);
        this.regs[4] = sp;
      } else {
        const sp = STACK_TOP - 0x108n;          // like right after a call: rsp ≡ 8 (mod 16)
        this._poke(sp, 8, EXIT_ADDR);
        this.regs[4] = sp;
      }
      this.initialRsp = this.regs[4];
      if (setup) this.applySetup(setup);
      this.initRegs = this.regs.slice();     // memory checks like str(rsi) use the pointer as passed in
    }
    applySetup(setup) {
      const items = typeof setup === "string" ? parseSetup(setup) : setup;
      for (const it of items) {
        const key = it.key.toLowerCase();
        if (key === "stdin") { this.stdin = Array.from(utf8(jsString(it.val))); continue; }
        if (key === "vm") { this.vm = it.val === "1"; continue; }
        if (key === "fs" || key === "gs") { this.segBase[key] = this._valueOf(it.val); continue; }
        if (key === "cf" || key === "zf" || key === "sf" || key === "of" || key === "pf" || key === "af" || key === "df") {
          this._setF(key.toUpperCase(), it.val === "1"); continue;
        }
        const r = REG[key];
        if (!r) throw new Error("مش register: " + it.key);
        this.setReg(r, this._valueOf(it.val));
      }
    }
    _valueOf(val) {
      if (val.startsWith("&")) {
        const lit = val.slice(1).trim();
        let bytes;
        if (/^bytes\(/i.test(lit)) bytes = lit.slice(6, -1).split(/[\s,]+/).filter(Boolean).map((x) => parseInt(x, 16));
        else bytes = Array.from(utf8(jsString(lit))).concat([0]);
        if (!this.input) this.input = (() => { const r = { name: "[input]", start: INPUT_BASE, end: INPUT_BASE + 0x1000n, r: true, w: true, x: false, buf: new Uint8Array(0x1000) }; this.regions.push(r); return r; })();
        const addr = INPUT_BASE + BigInt(this.inputUsed);
        this.input.buf.set(bytes, this.inputUsed);
        this.inputUsed += (bytes.length + 15) & ~15;
        return addr;
      }
      const lab = this.prog.labels.find((l) => l.name === val);
      if (lab) return lab.addr;
      const n = /^-/.test(val) ? -parseNumber(val.slice(1)) : parseNumber(val);
      if (n === null || Number.isNaN(n)) throw new Error("قيمة مش مفهومة: " + val);
      return n;
    }
    /* ---------- registers & flags ---------- */
    getReg(r) { const v = this.regs[r.i]; return r.hi ? (v >> 8n) & 0xFFn : U(v, r.bits); }
    setReg(r, val) {
      val = U(BigInt(val), r.bits);
      const i = r.i;
      if (r.bits === 64 || r.bits === 32) this.regs[i] = val;
      else if (r.hi) this.regs[i] = (this.regs[i] & ~0xFF00n) | (val << 8n);
      else this.regs[i] = (this.regs[i] & ~MASK[r.bits]) | val;
    }
    F(name) { return (this.fl >> FB[name] & 1) === 1; }
    flags() { const o = {}; for (const k of ["CF", "PF", "AF", "ZF", "SF", "TF", "DF", "OF"]) o[k] = this.F(k); return o; }
    _setF(name, v) { const b = 1 << FB[name]; this.fl = v ? (this.fl | b) : (this.fl & ~b); this.undef &= ~b; }
    _arith(r, undef) {
      for (const k of ARITH6) if (k in r && r[k] !== null && r[k] !== undefined) this._setF(k, r[k]);
      (undef || []).forEach((k) => { this.undef |= 1 << FB[k]; });
    }
    /* ---------- memory ---------- */
    region(addr) { for (const r of this.regions) if (addr >= r.start && addr < r.end) return r; return null; }
    _find(addr, n, acc) {
      addr = U(addr, 64);
      for (const r of this.regions) {
        if (addr >= r.start && addr + BigInt(n) <= r.end) {
          if (!r[acc]) throw new Fault("segv", "Segmentation fault — " + (acc === "w" ? "كتابة في" : acc === "x" ? "تنفيذ من" : "قراءة من") + " " + r.name + " (" + hex(addr) + ") والصفحة دي صلاحياتها " + (r.r ? "r" : "-") + (r.w ? "w" : "-") + (r.x ? "x" : "-"));
          return [r, Number(addr - r.start)];
        }
      }
      throw new Fault("segv", "Segmentation fault — " + (acc === "w" ? "كتابة في" : "قراءة من") + " عنوان مش متعمله map: " + hex(addr, 16));
    }
    read(addr, n) { const [r, o] = this._find(addr, n, "r"); let v = 0n; for (let k = n - 1; k >= 0; k--) v = (v << 8n) | BigInt(r.buf[o + k]); return v; }
    write(addr, n, val) {
      const [r, o] = this._find(addr, n, "w");
      val = U(BigInt(val), n * 8);
      for (let k = 0; k < n; k++) {
        if (this._log) this._log.push([r, o + k, r.buf[o + k]]);
        r.buf[o + k] = Number((val >> BigInt(8 * k)) & 0xFFn);
      }
      if (this._writes) this._writes.push({ addr: U(addr, 64), n, val });
    }
    _poke(addr, n, val) { const r = this.region(addr); const o = Number(addr - r.start); for (let k = 0; k < n; k++) r.buf[o + k] = Number((U(val, 64) >> BigInt(8 * k)) & 0xFFn); }
    _raw(addr, bytes) { const r = this.region(addr); r.buf.set(bytes, Number(addr - r.start)); }
    peek(addr, n) { try { const [r, o] = this._find(addr, n, "r"); let v = 0n; for (let k = n - 1; k >= 0; k--) v = (v << 8n) | BigInt(r.buf[o + k]); return v; } catch (e) { return null; } }
    peekBytes(addr, n) { const out = []; for (let i = 0; i < n; i++) { const r = this.region(addr + BigInt(i)); out.push(r && r.r ? r.buf[Number(addr + BigInt(i) - r.start)] : null); } return out; }
    readCString(addr, max) { const out = []; for (let i = 0; i < (max || 4096); i++) { const b = this.peek(addr + BigInt(i), 1); if (b === null || b === 0n) break; out.push(Number(b)); } return decodeBytes(out); }
    /* ---------- operands ---------- */
    ea(op, noSeg) {
      const m = op.m;
      if (m.rip) return m.target;
      let a = m.disp;
      if (m.base) a += this.regs[m.base.i];
      if (m.index) a += this.regs[m.index.i] * BigInt(m.scale);
      if (m.seg && !noSeg) a += this.segBase[m.seg];
      return U(a, 64);
    }
    rd(op, bits) {
      if (op.t === "reg") return this.getReg(op.r);
      if (op.t === "imm") return U(op.v, bits);
      return this.read(this.ea(op), bits / 8);
    }
    wr(op, bits, v) { if (op.t === "reg") this.setReg(op.r, v); else this.write(this.ea(op), bits / 8, v); }
    push(v, n) { n = n || 8; const sp = U(this.regs[4] - BigInt(n), 64); this.write(sp, n, v); this.regs[4] = sp; }
    pop(n) { n = n || 8; const v = this.read(this.regs[4], n); this.regs[4] = U(this.regs[4] + BigInt(n), 64); return v; }
    /* ---------- execution ---------- */
    snapshot() { return { regs: this.regs.slice(), rip: this.rip, fl: this.fl, undef: this.undef, out: this.outBytes.length, stdinPos: this.stdinPos, tsc: this.tsc, steps: this.steps, segBase: Object.assign({}, this.segBase), trapNext: this.trapNext, log: [] }; }
    _revert(s) {
      for (let k = s.log.length - 1; k >= 0; k--) { const [r, o, old] = s.log[k]; r.buf[o] = old; }
      this.regs = s.regs; this.rip = s.rip; this.fl = s.fl; this.undef = s.undef; this.outBytes.length = s.out;
      this.stdinPos = s.stdinPos; this.tsc = s.tsc; this.steps = s.steps; this.segBase = s.segBase; this.trapNext = s.trapNext;
    }
    back() {
      const s = this.history.pop();
      if (!s) return false;
      this._revert(s);
      this.halted = false; this.status = null;
      return true;
    }
    get output() { return decodeBytes(this.outBytes); }
    step() {
      if (this.halted) return { halted: true, status: this.status };
      const I = this.prog.byAddr.get(this.rip);
      if (!I) {
        this.halted = true;
        if (this.rip === this.prog.textEnd && this.prog.mode === "func") this.status = { kind: "end", ok: true, msg: "وصلت لآخر الكود ✓" };
        else if (this.rip === this.prog.textEnd) this.status = { kind: "segv", ok: false, msg: "Segmentation fault — البرنامج كمّل بعد آخر instruction من غير exit syscall (فـ _start لازم تنهي بـ exit)" };
        else this.status = { kind: "badrip", ok: false, msg: "RIP = " + hex(this.rip, 16) + " مش بداية instruction في .text — البرنامج اتقفل" };
        return { halted: true, status: this.status };
      }
      const snap = this.snapshot();
      this._log = snap.log; this._writes = [];
      this._next = I.addr + BigInt(I.len);
      this._info = {};
      const trap = this.trapNext;
      try {
        this.rip = this._next;
        this.exec(I);
        this.steps++; this.tsc += 27n;
      } catch (e) {
        if (!(e instanceof Fault)) throw e;
        this._revert(snap);
        this._log = null;
        this.halted = true;
        this.status = { kind: e.kind, ok: false, msg: e.message, line: I.line };
        return { halted: true, status: this.status, ins: I, fault: true };
      }
      this._log = null;
      this.history.push(snap);
      if (this.history.length > 50000) this.history.shift();
      const res = { ins: I, info: this._info, writes: this._writes, snap };
      if (this._halt) { this.halted = true; this.status = this._halt; this._halt = null; res.halted = true; res.status = this.status; return res; }
      if (this.rip === EXIT_ADDR) {
        this.halted = true;
        this.status = { kind: "return", ok: true, msg: "الدالة رجعت للـ caller ✓ (rax = " + hex(this.regs[0]) + ")" };
        res.halted = true; res.status = this.status;
      } else if (trap) {
        this.halted = true;
        this.status = { kind: "trap", ok: false, msg: "Trap Flag (TF=1) → حصل #DB exception بعد instruction واحدة (single-step). من غير debugger أو exception handler البرنامج بيتقفل بـ SIGTRAP" };
        res.halted = true; res.status = this.status;
      }
      this.trapNext = this.F("TF");
      if (this._pause) { res.pause = this._pause; this._pause = null; }
      return res;
    }
    run(limit, breakpoints) {
      limit = limit || 100000;
      let last = null, n = 0;
      while (!this.halted) {
        if (n > 0 && breakpoints && breakpoints.has(this.rip)) return { breakpoint: true, last };
        last = this.step(); n++;
        if (last.pause) return { pause: true, last };
        if (n >= limit && !this.halted) {
          this.status = { kind: "limit", ok: false, msg: "اتنفذ " + limit + " instruction ولسه مخلصش — غالبًا فيه loop مش بتخلص" };
          return { limit: true, last };
        }
      }
      return { halted: true, last };
    }
    _jump(target) { this.rip = U(target, 64); }
    exec(I) {
      const o = I.ops, sz = I.size, mn = I.mn;
      const info = this._info;
      switch (I.form) {
        case "mov": this.wr(o[0], sz, this.rd(o[1], sz)); break;
        case "movx": {
          let v = this.rd(o[1], I.srcSize);
          if (mn !== "movzx") v = U(S(v, I.srcSize), sz);
          this.wr(o[0], sz, v); break;
        }
        case "lea": { const a = this.ea(o[1], true); this.wr(o[0], sz, a); info.addr = a; break; }
        case "xchg": { const a = this.rd(o[0], sz), b = this.rd(o[1], sz); this.wr(o[0], sz, b); this.wr(o[1], sz, a); break; }
        case "push": { const v = o[0].t === "imm" ? U(o[0].v, 64) : this.rd(o[0], sz); this.push(v, sz / 8); break; }
        case "pop": { const v = this.pop(sz / 8); this.wr(o[0], sz, v); break; }
        case "alu": {
          const a = this.rd(o[0], sz), b = this.rd(o[1], sz);
          let r, undef = [];
          switch (mn) {
            case "add": r = aluAdd(a, b, 0n, sz); break;
            case "adc": r = aluAdd(a, b, this.F("CF") ? 1n : 0n, sz); break;
            case "sub": case "cmp": r = aluSub(a, b, 0n, sz); break;
            case "sbb": r = aluSub(a, b, this.F("CF") ? 1n : 0n, sz); break;
            case "and": case "test": r = aluLogic(a & b, sz); undef = ["AF"]; break;
            case "or": r = aluLogic(a | b, sz); undef = ["AF"]; break;
            case "xor": r = aluLogic(a ^ b, sz); undef = ["AF"]; break;
          }
          if (mn !== "cmp" && mn !== "test") this.wr(o[0], sz, r.res);
          info.alu = { a, b, res: r.res, op: mn };
          this._arith(r, undef); break;
        }
        case "unary": {
          const a = this.rd(o[0], sz);
          switch (mn) {
            case "not": this.wr(o[0], sz, ~a); break;
            case "neg": { const r = aluSub(0n, a, 0n, sz); this.wr(o[0], sz, r.res); this._arith(r); break; }
            case "inc": { const r = aluAdd(a, 1n, 0n, sz); delete r.CF; this.wr(o[0], sz, r.res); this._arith(r); break; }
            case "dec": { const r = aluSub(a, 1n, 0n, sz); delete r.CF; this.wr(o[0], sz, r.res); this._arith(r); break; }
            case "mul": case "imul": {
              const signed = mn === "imul";
              const acc = this.getReg(REG[{ 8: "al", 16: "ax", 32: "eax", 64: "rax" }[sz]]);
              const x = signed ? S(acc, sz) : acc, y = signed ? S(a, sz) : a;
              const p = x * y, lo = U(p, sz), hi = U(p >> BigInt(sz), sz);
              const over = signed ? p !== S(lo, sz) : hi !== 0n;
              if (sz === 8) this.setReg(REG.ax, U(p, 16));
              else { this.setReg(REG[{ 16: "ax", 32: "eax", 64: "rax" }[sz]], lo); this.setReg(REG[{ 16: "dx", 32: "edx", 64: "rdx" }[sz]], hi); }
              this._arith({ CF: over, OF: over }, ["SF", "ZF", "AF", "PF"]); break;
            }
            case "div": case "idiv": {
              const signed = mn === "idiv";
              let dividend;
              if (sz === 8) dividend = this.getReg(REG.ax);
              else dividend = (this.getReg(REG[{ 16: "dx", 32: "edx", 64: "rdx" }[sz]]) << BigInt(sz)) | this.getReg(REG[{ 16: "ax", 32: "eax", 64: "rax" }[sz]]);
              if (a === 0n) throw new Fault("de", "Divide Error (#DE) — قسمة على صفر! البرنامج اتقفل (SIGFPE)");
              let q, rem;
              if (signed) {
                const n = S(dividend, sz * 2), d = S(a, sz);
                q = n / d; rem = n % d;
                if (q > (TOPB[sz] - 1n) || q < -TOPB[sz]) throw new Fault("de", "Divide Error (#DE) — ناتج القسمة مش بيكفي في " + sz + "-bit (مثلًا لما تنسى cdq/cqo قبل idiv)");
              } else {
                q = dividend / a; rem = dividend % a;
                if (q > MASK[sz]) throw new Fault("de", "Divide Error (#DE) — ناتج القسمة أكبر من " + sz + "-bit (اتأكد إن " + (sz === 8 ? "ah" : { 16: "dx", 32: "edx", 64: "rdx" }[sz]) + " متصفّر قبل div)");
              }
              if (sz === 8) { this.setReg(REG.al, q); this.setReg(REG.ah, rem); }
              else { this.setReg(REG[{ 16: "ax", 32: "eax", 64: "rax" }[sz]], q); this.setReg(REG[{ 16: "dx", 32: "edx", 64: "rdx" }[sz]], rem); }
              this._arith({}, ARITH6); break;
            }
          }
          break;
        }
        case "imul2": case "imul3": {
          const x = S(this.rd(I.ops[1], sz), sz);
          const y = I.form === "imul2" ? S(this.rd(I.ops[0], sz), sz) : S(U(I.ops[2].v, sz), sz);
          const p = x * y, lo = U(p, sz), over = p !== S(lo, sz);
          this.wr(I.ops[0], sz, lo);
          this._arith({ CF: over, OF: over }, ["SF", "ZF", "AF", "PF"]); break;
        }
        case "shift": this._shift(I); break;
        case "bt": {
          let off = this.rd(o[1], o[1].t === "reg" ? sz : 8);
          let addrOp = null, bit, val, bitsW;
          if (o[0].t === "reg") { bitsW = sz; bit = off % BigInt(sz); val = this.getReg(o[0].r); }
          else if (o[1].t === "imm") { bitsW = sz; bit = off % BigInt(sz); val = this.read(this.ea(o[0]), sz / 8); addrOp = this.ea(o[0]); }
          else {
            const so = S(off, sz);
            addrOp = U(this.ea(o[0]) + (so >> 3n), 64); bit = U(so, 64) & 7n; bitsW = 8;
            val = this.read(addrOp, 1);
          }
          const cf = ((val >> bit) & 1n) === 1n;
          let nv = val;
          if (mn === "bts") nv = val | (1n << bit); else if (mn === "btr") nv = val & ~(1n << bit); else if (mn === "btc") nv = val ^ (1n << bit);
          if (mn !== "bt") { if (o[0].t === "reg") this.setReg(o[0].r, nv); else this.write(addrOp, bitsW / 8, nv); }
          this._arith({ CF: cf }, ["OF", "SF", "AF", "PF"]); break;
        }
        case "bitscan": {
          const v = this.rd(o[1], sz);
          if (mn === "popcnt") {
            let c = 0n, x = v; while (x) { c += x & 1n; x >>= 1n; }
            this.wr(o[0], sz, c);
            this._arith({ ZF: v === 0n, CF: false, OF: false, SF: false, AF: false, PF: false }); break;
          }
          if (v === 0n) { this._arith({ ZF: true }, ["CF", "OF", "SF", "AF", "PF"]); info.note = "الـ source = 0 → ZF=1 والـ destination مش بيتغير"; break; }
          let idx = 0n;
          if (mn === "bsf") { while (((v >> idx) & 1n) === 0n) idx++; } else { idx = BigInt(v.toString(2).length - 1); }
          this.wr(o[0], sz, idx);
          this._arith({ ZF: false }, ["CF", "OF", "SF", "AF", "PF"]); break;
        }
        case "bswap": {
          const v = this.getReg(o[0].r); let r = 0n;
          for (let k = 0; k < sz / 8; k++) r = (r << 8n) | ((v >> BigInt(8 * k)) & 0xFFn);
          this.setReg(o[0].r, r); break;
        }
        case "setcc": { const c = evalCC(I.cc, this.flags()); this.wr(o[0], 8, c ? 1n : 0n); info.cond = { cc: I.cc, val: c }; break; }
        case "cmovcc": {
          const v = this.rd(o[1], sz), c = evalCC(I.cc, this.flags());
          if (c) this.wr(o[0], sz, v); else if (sz === 32) this.setReg(o[0].r, this.getReg(o[0].r));
          info.cond = { cc: I.cc, val: c }; break;
        }
        case "jmp": this._jump(I.target); info.taken = true; break;
        case "jcc": { const c = evalCC(I.cc, this.flags()); info.cond = { cc: I.cc, val: c }; info.taken = c; if (c) this._jump(I.target); break; }
        case "loop": {
          let c;
          if (mn === "jrcxz") c = this.regs[1] === 0n;
          else if (mn === "jecxz") c = U(this.regs[1], 32) === 0n;
          else {
            this.regs[1] = U(this.regs[1] - 1n, 64);
            c = this.regs[1] !== 0n;
            if (mn === "loope" || mn === "loopz") c = c && this.F("ZF");
            if (mn === "loopne" || mn === "loopnz") c = c && !this.F("ZF");
          }
          info.taken = c; if (c) this._jump(I.target); break;
        }
        case "call": this.push(this._next); this._jump(I.target); info.call = true; break;
        case "jmp_ind": { const t = this.rd(o[0], 64); this._jump(t); info.taken = true; break; }
        case "call_ind": { const t = this.rd(o[0], 64); this.push(this._next); this._jump(t); info.call = true; break; }
        case "ret": { const t = this.pop(); if (o.length) this.regs[4] = U(this.regs[4] + U(o[0].v, 16), 64); this._jump(t); info.ret = t; break; }
        case "nopm": break;
        case "int": this._int(I.intNo); break;
        case "simple": this._simple(mn); break;
        case "string": this._string(I); break;
        default: throw new Fault("ud", "instruction مش متنفذة");
      }
    }
    _shift(I) {
      const o = I.ops, sz = I.size, mn = I.mn;
      const mask = sz === 64 ? 0x3Fn : 0x1Fn;
      const raw = o[1].t === "reg" ? this.getReg(REG.cl) : U(o[1].v, 8);
      const cnt = raw & mask;
      const v = this.rd(o[0], sz);
      const B = BigInt(sz), top = (x) => (x & TOPB[sz]) !== 0n;
      if (cnt === 0n) { this.wr(o[0], sz, v); return; }
      let res, CF, OF = null, undef = [];
      if (mn === "shl" || mn === "sal") {
        res = U(v << cnt, sz);
        if (cnt <= B) CF = ((v >> (B - cnt)) & 1n) === 1n; else { CF = false; undef.push("CF"); }
        if (cnt === B) undef.push("CF");
        if (cnt === 1n) OF = top(res) !== CF; else undef.push("OF");
        this.wr(o[0], sz, res); this._arith(Object.assign({ CF, OF }, szp(res, sz)), undef.concat(["AF"])); return;
      }
      if (mn === "shr") {
        res = cnt >= B ? 0n : v >> cnt;
        if (cnt <= B) CF = ((v >> (cnt - 1n)) & 1n) === 1n; else { CF = false; }
        if (cnt >= B) undef.push("CF");
        if (cnt === 1n) OF = top(v); else undef.push("OF");
        this.wr(o[0], sz, res); this._arith(Object.assign({ CF, OF }, szp(res, sz)), undef.concat(["AF"])); return;
      }
      if (mn === "sar") {
        const sv = S(v, sz);
        res = U(sv >> cnt, sz);
        CF = ((sv >> (cnt - 1n)) & 1n) === 1n;
        if (cnt === 1n) OF = false; else undef.push("OF");
        this.wr(o[0], sz, res); this._arith(Object.assign({ CF, OF }, szp(res, sz)), undef.concat(["AF"])); return;
      }
      if (mn === "rol" || mn === "ror") {
        const t = cnt % B;
        res = t === 0n ? v : (mn === "rol" ? U((v << t) | (v >> (B - t)), sz) : U((v >> t) | (v << (B - t)), sz));
        if (mn === "rol") { CF = (res & 1n) === 1n; if (cnt === 1n) OF = top(res) !== CF; else undef.push("OF"); }
        else { CF = top(res); if (cnt === 1n) OF = top(res) !== (((res >> (B - 2n)) & 1n) === 1n); else undef.push("OF"); }
        this.wr(o[0], sz, res); this._arith({ CF, OF }, undef); return;
      }
      // rcl / rcr: rotate through carry (size+1 bits)
      let t = sz <= 16 ? cnt % (B + 1n) : cnt;
      let cf = this.F("CF") ? 1n : 0n, d = v;
      if (mn === "rcr" && cnt === 1n) OF = top(d) !== (cf === 1n);
      while (t > 0n) {
        if (mn === "rcl") { const tc = (d >> (B - 1n)) & 1n; d = U((d << 1n) | cf, sz); cf = tc; }
        else { const tc = d & 1n; d = (d >> 1n) | (cf << (B - 1n)); cf = tc; }
        t--;
      }
      if (mn === "rcl") { if (cnt === 1n) OF = top(d) !== (cf === 1n); else undef.push("OF"); }
      else if (cnt !== 1n) undef.push("OF");
      this.wr(o[0], sz, d); this._arith({ CF: cf === 1n, OF }, undef);
    }
    _simple(mn) {
      switch (mn) {
        case "nop": case "endbr64": case "pause": return;
        case "leave": this.regs[4] = this.regs[5]; this.regs[5] = this.pop(); return;
        case "int3": this._pause = { kind: "int3", msg: "وصلت لـ int3 (0xCC) — Breakpoint! اضغط Run أو Step عشان تكمّل" }; return;
        case "hlt": throw new Fault("gp", "hlt instruction privileged (Ring 0 بس) → General Protection Fault، البرنامج اتقفل");
        case "ud2": throw new Fault("ud", "ud2 → Invalid Opcode (#UD)، البرنامج اتقفل بـ SIGILL");
        case "syscall": this._syscall(); return;
        case "cpuid": this._cpuid(); return;
        case "rdtsc": this.setReg(REG.eax, this.tsc); this.setReg(REG.edx, this.tsc >> 32n); return;
        case "pushfq": case "pushf": this.push(BigInt(this.fl | 0x2)); return;
        case "popfq": case "popf": {
          const v = Number(this.pop() & 0xFFFn), m = 0b1101_1101_0101;   // CF PF AF ZF SF TF DF OF
          this.fl = (this.fl & ~m) | (v & m) | 0x202; this.undef &= ~m; return;
        }
        case "clc": this._setF("CF", false); return;
        case "stc": this._setF("CF", true); return;
        case "cmc": this._setF("CF", !this.F("CF")); return;
        case "cld": this._setF("DF", false); return;
        case "std": this._setF("DF", true); return;
        case "cbw": this.setReg(REG.ax, U(S(this.getReg(REG.al), 8), 16)); return;
        case "cwde": this.setReg(REG.eax, U(S(this.getReg(REG.ax), 16), 32)); return;
        case "cdqe": this.regs[0] = U(S(this.getReg(REG.eax), 32), 64); return;
        case "cwd": this.setReg(REG.dx, (this.getReg(REG.ax) & 0x8000n) ? 0xFFFFn : 0n); return;
        case "cdq": this.setReg(REG.edx, (this.getReg(REG.eax) & 0x80000000n) ? 0xFFFFFFFFn : 0n); return;
        case "cqo": this.regs[2] = (this.regs[0] & TOPB[64]) ? MASK[64] : 0n; return;
      }
      throw new Fault("ud", "instruction مش متنفذة: " + mn);
    }
    _cpuid() {
      const leaf = Number(U(this.regs[0], 32));
      let a = 0n, b = 0n, c = 0n, d = 0n;
      if (leaf === 0) { a = 0x16n; b = 0x756E6547n; d = 0x49656E69n; c = 0x6C65746En; }
      else if (leaf === 1) { a = 0x000906EAn; b = 0x00100800n; c = 0x77FAFBBFn | (this.vm ? 0x80000000n : 0n); d = 0xBFEBFBFFn; }
      else if (leaf === 0x40000000 && this.vm) { a = 0x40000010n; b = 0x61774D56n; c = 0x4D566572n; d = 0x65726177n; }
      this.setReg(REG.eax, a); this.setReg(REG.ebx, b); this.setReg(REG.ecx, c); this.setReg(REG.edx, d);
      this._info.note = leaf === 1 ? "cpuid(1): bit 31 في ecx = hypervisor bit (" + (this.vm ? "1 → جوه VM" : "0 → جهاز حقيقي") + ")" : null;
    }
    _sysWrite(fd, buf, n) {
      if (fd !== 1n && fd !== 2n) return -9n;
      if (n > 0x100000n) n = 0x100000n;
      const out = [];
      for (let i = 0n; i < n; i++) { const b = this.peek(buf + i, 1); if (b === null) return out.length ? BigInt(this._emit(out)) : -14n; out.push(Number(b)); }
      return BigInt(this._emit(out));
    }
    _emit(bytes) { bytes.forEach((b) => this.outBytes.push(b)); return bytes.length; }
    _sysRead(fd, buf, n) {
      if (fd !== 0n) return -9n;
      let c = 0n;
      while (c < n && this.stdinPos < this.stdin.length) {
        try { this.write(buf + c, 1, BigInt(this.stdin[this.stdinPos])); } catch (e) { return c ? c : -14n; }
        this.stdinPos++; c++;
        if (this.stdin[this.stdinPos - 1] === 10) break;
      }
      return c;
    }
    _syscall() {
      const nr = this.regs[0], a1 = this.regs[7], a2 = this.regs[6], a3 = this.regs[2];
      this.regs[1] = this._next;                  // the kernel stores RIP in rcx
      this.regs[11] = BigInt(this.fl | 0x2);      // and RFLAGS in r11
      let ret;
      const info = this._info;
      switch (Number(U(nr, 64) > 1000n ? 9999n : nr)) {
        case 0: ret = this._sysRead(a1, a2, a3); info.sys = "read(" + a1 + ", " + hex(a2) + ", " + a3 + ")"; break;
        case 1: ret = this._sysWrite(a1, a2, a3); info.sys = "write(" + a1 + ", " + hex(a2) + ", " + a3 + ")"; break;
        case 39: ret = 4242n; info.sys = "getpid()"; break;
        case 102: ret = 1000n; info.sys = "getuid()"; break;
        case 60: case 231: {
          const code = Number(a1 & 0xFFn);
          info.sys = (nr === 60n ? "exit(" : "exit_group(") + code + ")";
          this._halt = { kind: "exit", ok: true, code, msg: "البرنامج خلص بـ exit(" + code + ") ✓" };
          return;
        }
        default: ret = -38n; info.sys = "syscall رقم " + nr + " مش مدعوم في المعمل → رجّع -ENOSYS (-38)";
      }
      this.regs[0] = U(ret, 64);
    }
    _int(n) {
      if (n === 3) { this._pause = { kind: "int3", msg: "int 3 (CD 03) — Breakpoint exception. لاحظ إنها 2 bytes مش زي int3 (CC)" }; return; }
      if (n !== 0x80) throw new Fault("gp", "int " + hex(n) + " → General Protection Fault (الـ interrupt ده مش متاح للبرامج العادية)");
      // 32-bit Linux ABI: eax = nr, ebx, ecx, edx = args (pointers truncated to 32-bit!)
      const nr = U(this.regs[0], 32), b = U(this.regs[3], 32), c = U(this.regs[1], 32), d = U(this.regs[2], 32);
      let ret;
      const info = this._info;
      if (nr === 1n) { const code = Number(b & 0xFFn); info.sys = "int 0x80: exit(" + code + ")"; this._halt = { kind: "exit", ok: true, code, msg: "البرنامج خلص بـ exit(" + code + ") عن طريق int 0x80 ✓" }; return; }
      else if (nr === 4n) { ret = this._sysWrite(b, c, d); info.sys = "int 0x80: write(" + b + ", " + hex(c) + ", " + d + ")" + (ret === -14n ? " → EFAULT: العنوان اتقص لـ 32-bit!" : ""); }
      else if (nr === 3n) { ret = this._sysRead(b, c, d); info.sys = "int 0x80: read(" + b + ", " + hex(c) + ", " + d + ")"; }
      else if (nr === 20n) { ret = 4242n; info.sys = "int 0x80: getpid()"; }
      else { ret = -38n; info.sys = "int 0x80: syscall " + nr + " مش مدعوم"; }
      this.regs[0] = U(ret, 64);
    }
    _string(I) {
      const sz = I.size, n = BigInt(sz / 8), op = I.sop;
      const d = this.F("DF") ? -n : n;
      const A = REG[{ 8: "al", 16: "ax", 32: "eax", 64: "rax" }[sz]];
      const once = () => {
        const rsi = this.regs[6], rdi = this.regs[7];
        switch (op) {
          case "movs": this.write(rdi, sz / 8, this.read(rsi, sz / 8)); this.regs[6] = U(rsi + d, 64); this.regs[7] = U(rdi + d, 64); break;
          case "stos": this.write(rdi, sz / 8, this.getReg(A)); this.regs[7] = U(rdi + d, 64); break;
          case "lods": this.setReg(A, this.read(rsi, sz / 8)); this.regs[6] = U(rsi + d, 64); break;
          case "scas": this._arith(aluSub(this.getReg(A), this.read(rdi, sz / 8), 0n, sz)); this.regs[7] = U(rdi + d, 64); break;
          case "cmps": this._arith(aluSub(this.read(rsi, sz / 8), this.read(rdi, sz / 8), 0n, sz)); this.regs[6] = U(rsi + d, 64); this.regs[7] = U(rdi + d, 64); break;
        }
      };
      if (!I.prefix || I.prefix === "lock") { once(); return; }
      let it = 0;
      while (this.regs[1] !== 0n) {
        once();
        this.regs[1] = U(this.regs[1] - 1n, 64);
        it++;
        if (it > 1000000) throw new Fault("limit", "rep اتكررت أكتر من مليون مرة — rcx كبير جدًا؟");
        if (op === "scas" || op === "cmps") {
          if ((I.prefix === "repe" || I.prefix === "rep") && !this.F("ZF")) break;
          if (I.prefix === "repne" && this.F("ZF")) break;
        }
      }
      this.tsc += BigInt(it) * 3n;
      this._info.reps = it;
    }
    /* ---------- views for the UI ---------- */
    stackView(above, below) {
      const rows = [], rsp = this.regs[4];
      for (let k = -(below || 2); k < (above || 10); k++) {
        const a = U(rsp + BigInt(k * 8), 64);
        if (a < this.stack.start || a + 8n > this.stack.end) continue;
        rows.push({ addr: a, val: this.peek(a, 8), rel: k * 8 });
      }
      return rows;
    }
  }
  function decodeBytes(arr) {
    const u8 = Uint8Array.from(arr);
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", { fatal: false }).decode(u8);
    return Buffer.from(u8).toString("utf8");
  }

  /* ================================================================ testing helpers */
  function check(m, expect) {
    const items = typeof expect === "string" ? parseSetup(expect) : expect;
    const fails = [];
    for (const it of items) {
      const key = it.key.toLowerCase();
      let got, want, ok, label = it.key;
      if (key === "out") { got = m.output; want = jsString(it.val); ok = got === want; label = "المخرجات"; got = JSON.stringify(got); want = JSON.stringify(want); }
      else if (key === "exit") { got = m.status && m.status.kind === "exit" ? String(m.status.code) : "(مفيش exit)"; want = it.val; ok = got === want; label = "exit code"; }
      else if (key === "status") { got = m.status ? m.status.kind : "running"; want = it.val; ok = got === want; }
      else if (key === "steps") { got = m.steps; want = Number(it.val); ok = it.op === "<=" ? got <= want : it.op === ">=" ? got >= want : got === want; label = "عدد الخطوات"; }
      else if (/^(cf|pf|af|zf|sf|df|of)$/.test(key)) { got = m.F(key.toUpperCase()) ? "1" : "0"; want = it.val; ok = got === want; label = key.toUpperCase(); }
      else if (/^(byte|word|dword|qword|str)\(/.test(key)) {
        const mm = /^(\w+)\((.+)\)$/.exec(it.key);
        const fn = mm[1].toLowerCase();
        const addr = evalAddr(m, mm[2]);
        if (fn === "str") { got = JSON.stringify(m.readCString(addr)); want = JSON.stringify(jsString(it.val)); ok = got === want; }
        else {
          const bits = { byte: 8, word: 16, dword: 32, qword: 64 }[fn];
          const v = m.peek(addr, bits / 8);
          const w = m._valueOf(it.val);
          got = v === null ? "(unmapped)" : hex(v); want = hex(U(w, bits)); ok = v !== null && v === U(w, bits);
        }
      } else if (REG[key]) {
        const r = REG[key], v = m.getReg(r), w = U(m._valueOf(it.val), r.bits);
        got = hex(v) + (r.bits <= 64 ? " (" + S(v, r.bits) + ")" : ""); want = hex(w) + " (" + S(w, r.bits) + ")"; ok = v === w;
      } else throw new Error("expect مش مفهوم: " + it.key);
      if (!ok) fails.push({ what: label, got: String(got), want: String(want) });
    }
    return fails;
  }
  function evalAddr(m, expr) {
    const mm = /^([A-Za-z_.][\w.]*)\s*(?:([+-])\s*(\w+))?$/.exec(expr.trim());
    if (!mm) throw new Error("عنوان مش مفهوم: " + expr);
    let a = REG[mm[1].toLowerCase()] ? (m.initRegs || m.regs)[REG[mm[1].toLowerCase()].i] : m._valueOf(mm[1]);
    if (mm[2]) a += (mm[2] === "-" ? -1n : 1n) * parseNumber(mm[3]);
    return U(a, 64);
  }
  /** Run one test: {setup, expect}. Returns {pass, fails, status, output} */
  function runTest(src, test, opts) {
    opts = opts || {};
    const prog = typeof src === "string" ? assemble(src, { entry: opts.entry }) : src;
    if (!prog.ok) return { pass: false, asmErrors: prog.errors, fails: [{ what: "assembly", got: prog.errors.map((e) => "سطر " + e.line + ": " + e.msg).join(" | "), want: "كود من غير أخطاء" }] };
    const m = new Machine(prog, test.setup || "");
    let st = m.run(opts.limit || 200000);
    let guard = 0;
    while (st.pause && guard++ < 100) st = m.run(opts.limit || 200000);   // continue over int3
    if (st.limit) return { pass: false, machine: m, fails: [{ what: "التنفيذ", got: m.status.msg, want: "البرنامج يخلص" }] };
    const status = m.status;
    const fails = [];
    if (status && !status.ok && !/status=/.test(test.expect || "")) fails.push({ what: "التنفيذ", got: status.msg, want: "يخلص من غير crash" });
    fails.push(...check(m, test.expect || ""));
    return { pass: fails.length === 0, fails, status, output: m.output, machine: m };
  }
  /** Assemble one instruction and return its bytes + parts (encoder playground). */
  function encodeOne(line, opts) {
    const src = (opts && opts.defaultRel ? "default rel\n" : "") + "section .text\n_here:\n" + line + "\n";
    const prog = assemble(src);
    if (!prog.ok) return { ok: false, error: prog.errors[0].msg };
    const I = prog.ins[0];
    return { ok: true, bytes: I.bytes, parts: I.parts, addr: I.addr, count: prog.ins.length };
  }

  return {
    assemble, Machine, runTest, encodeOne, alu, parseSetup, REG, R64, FAMILY, CC, CC_NAME, CC_RULE, CC_MEANING, FLAG_ORDER,
    evalCC, hex, U, S, TEXT_BASE, EXIT_ADDR, STACK_TOP, AsmError, Fault, version: "1.0"
  };
});
