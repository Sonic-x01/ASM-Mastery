#!/usr/bin/env python3
"""
ASM Mastery — build + verification pipeline.

Expands the authoring tags in src/sections/*.html into index.html and verifies
every piece of code before it can ship. Any failure aborts the build.

  <nasm-example file="x.asm" [io] [norun] [stdin="..."] [expect-exit="N"] [any-exit]
                [nolab] [setup="..."] [graph] [assemble="win64|elf32"]>NASM</nasm-example>
      runnable on Compiler Explorer (NASM 3.01 + ld, Linux x86-64); the real output is
      baked in. If the in-page emulator can run it too, the output/exit code of the
      emulator MUST equal the real one (cross-check) and a 🔬 Debug button is added.
      `assemble=` only assembles (Windows / 32-bit listings that cannot run on Linux).
  <c-example file="x.c" [norun] [win]>C</c-example>          gcc 15.2 (local compile + CE run)
  <compiled file="x.c" targets="gcc-O0,gcc-O2,msvc-O2" [graph] [lang="cpp"]>C</compiled>
      side-by-side C and REAL compiler output (baked from Compiler Explorer)
  <asm-block file="x" [graph]>listing</asm-block>   <plain-block file="x" [lang]>text</plain-block>
  <asm-lab id="" title="" [setup=""] [io] [entry=""] [expect=""] [expect-fault]>code</asm-lab>
  <lab-challenge id title level [io] [entry] [forbid="mul,imul"] [maxins="N"]>
      <desc>html</desc><starter>asm</starter><solution>asm</solution>
      <test setup="rdi=5" expect="rax=120" [label="..."]/> ...
  </lab-challenge>
  <challenge id title level [lang="nasm|c"] [io]><desc/><starter/><expected/><solution/>[<stdin/>]</challenge>
  <quiz id answer="N"><q/><o/>...<good/><bad/></quiz>
  <re-task id title level answer="a|b" norm="int|hex|str|text" [bits="32"] [io] [entry]>
      <desc>html</desc>[<listing>asm shown to the learner</listing>]
      [<verify setup="edi={ans}" expect="eax=1"/>]   (runs <listing> in the emulator)
      <hint>html</hint><explain>html</explain>
  </re-task>

Usage:  python tools/build.py [--offline]
"""
from __future__ import annotations

import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
CACHE_FILE = ROOT / "tools" / ".ce-cache.json"
OFFLINE = "--offline" in sys.argv
IO_LIB = (SRC / "io.inc.asm").read_text(encoding="utf-8").replace("\r\n", "\n").lstrip("\n")

errors: list[str] = []
stats = {"nasm": 0, "nasm_run": 0, "c": 0, "compiled": 0, "quiz": 0, "ch": 0, "lab": 0, "labch": 0, "re": 0, "asm": 0, "proj": 0}

TARGETS = {  # name: (compiler id, lang, args, label)
    "gcc-O0": ("cg152", "c", "-O0", "gcc 15.2 -O0"),
    "gcc-O1": ("cg152", "c", "-O1", "gcc -O1"),
    "gcc-O2": ("cg152", "c", "-O2", "gcc -O2"),
    "gcc-O3": ("cg152", "c", "-O3", "gcc -O3"),
    "gcc-Os": ("cg152", "c", "-Os", "gcc -Os"),
    "gcc-O2-sp": ("cg152", "c", "-O2 -fstack-protector-all", "gcc -O2 -fstack-protector-all"),
    "gcc-O0-sp": ("cg152", "c", "-O0 -fstack-protector-all", "gcc -O0 -fstack-protector-all"),
    "gcc32-O0": ("cg152", "c", "-O0 -m32", "gcc -m32 -O0"),
    "gcc32-O2": ("cg152", "c", "-O2 -m32", "gcc -m32 -O2"),
    "clang-O2": ("cclang2110", "c", "-O2", "clang 21 -O2"),
    "msvc-Od": ("vc_v19_latest_x64", "c", "/Od", "MSVC x64 /Od"),
    "msvc-O2": ("vc_v19_latest_x64", "c", "/O2", "MSVC x64 /O2"),
    "msvc-O2-gs": ("vc_v19_latest_x64", "c", "/O2 /GS", "MSVC x64 /O2 /GS"),
    "msvc32-Od": ("vc_v19_latest_x86", "c", "/Od", "MSVC x86 (32-bit) /Od"),
    "msvc32-O2": ("vc_v19_latest_x86", "c", "/O2", "MSVC x86 (32-bit) /O2"),
    "arm64-O0": ("carm64g1520", "c", "-O0", "ARM64 gcc -O0"),
    "arm64-O2": ("carm64g1520", "c", "-O2", "ARM64 gcc -O2"),
    "g++-O2": ("g152", "c++", "-O2 -std=c++20", "g++ 15.2 -O2"),
    "g++-O0": ("g152", "c++", "-O0 -std=c++20", "g++ 15.2 -O0"),
    "msvc++-O2": ("vcpp_v19_latest_x64", "c++", "/O2 /std:c++20 /EHsc", "MSVC C++ x64 /O2"),
}


# --------------------------------------------------------------------------- utils
def esc(s: str) -> str:
    return html.escape(s, quote=False)


def esc_attr(s: str) -> str:
    return html.escape(s, quote=True)


def dedent_block(s: str) -> str:
    s = s.replace("\r\n", "\n")
    s = re.sub(r"^\n+", "", s)
    s = re.sub(r"\s+$", "", s)
    lines = s.split("\n")
    ind = min((len(l) - len(l.lstrip(" ")) for l in lines if l.strip()), default=0)
    return "\n".join(l[ind:] if len(l) >= ind else l for l in lines)


def norm_out(t: str) -> str:
    return "\n".join(l.rstrip(" \t") for l in t.replace("\r\n", "\n").split("\n")).strip("\n")


def attrs(raw: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in re.finditer(r'([\w-]+)(?:="([^"]*)"|=\'([^\']*)\')?', raw):
        v = m.group(2) if m.group(2) is not None else m.group(3)
        out[m.group(1)] = html.unescape(v) if v is not None else ""
    return out


def with_io(src: str, io: bool) -> str:
    return re.sub(r"\s+$", "", src) + "\n\n" + IO_LIB if io else src


def js_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


# --------------------------------------------------------------------------- Compiler Explorer (cached)
try:
    CACHE = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
except Exception:
    CACHE = {}
USED: set[str] = set()


def save_cache():
    CACHE_FILE.write_text(json.dumps(CACHE, indent=0, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def ce_post(compiler: str, body: dict) -> dict | None:
    key = hashlib.sha256(json.dumps([compiler, body], sort_keys=True).encode()).hexdigest()
    USED.add(key)
    if key in CACHE:
        return CACHE[key]
    if OFFLINE:
        return None
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(f"https://godbolt.org/api/compiler/{compiler}/compile", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "Accept": "application/json",
                                                  "User-Agent": "asm-mastery-course-build/1.0"})
            data = json.load(urllib.request.urlopen(req, timeout=90))
            break
        except Exception as exc:
            last = exc
            time.sleep(3 + attempt * 4)
    else:
        raise RuntimeError(f"Compiler Explorer unreachable: {last}")
    ansi = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
    j = lambda a: ansi.sub("", "\n".join(x["text"] for x in (a or [])))
    res = {"code": data.get("code"), "didExecute": bool(data.get("didExecute")), "stdout": j(data.get("stdout")),
           "stderr": j(data.get("stderr")), "build": j((data.get("buildResult") or {}).get("stderr")),
           "timedOut": bool(data.get("timedOut")), "asm": [x.get("text", "") for x in (data.get("asm") or [])]}
    CACHE[key] = res
    save_cache()
    time.sleep(0.4)
    return res


def ce_nasm_run(src: str, stdin: str = "") -> dict | None:
    return ce_post("nasm301", {"source": src, "lang": "assembly", "options": {"userArguments": "", "executeParameters": {"args": [], "stdin": stdin},
                   "compilerOptions": {"executorRequest": True}, "filters": {"execute": True}, "tools": [], "libraries": []}})


def ce_nasm_assemble(src: str, fmt: str) -> dict | None:
    return ce_post("nasm301", {"source": src, "lang": "assembly", "options": {"userArguments": f"-f {fmt}", "compilerOptions": {},
                   "filters": {"binary": False, "intel": True, "labels": True, "directives": True, "commentOnly": True}, "tools": [], "libraries": []}})


def ce_c_run(src: str, stdin: str = "") -> dict | None:
    return ce_post("cg152", {"source": src, "lang": "c", "options": {"userArguments": "-O0 -std=c17 -Wall -Wextra -fdiagnostics-color=never",
                   "executeParameters": {"args": [], "stdin": stdin}, "compilerOptions": {"executorRequest": True},
                   "filters": {"execute": True}, "tools": [], "libraries": []}})


def ce_compile(target: str, src: str) -> str | None:
    cid, lang, args, _ = TARGETS[target]
    extra = " -fno-asynchronous-unwind-tables -fdiagnostics-color=never" if not cid.startswith("vc") else ""
    r = ce_post(cid, {"source": src, "lang": lang, "options": {"userArguments": args + extra, "compilerOptions": {},
                "filters": {"intel": True, "labels": True, "directives": True, "commentOnly": True, "libraryCode": True, "demangle": True},
                "tools": [], "libraries": []}})
    if r is None:
        return None
    if r["code"] != 0:
        raise RuntimeError(f"{target} compile failed:\n{r['stderr'][:1500]}")
    lines = [l for l in r["asm"] if not re.match(r"^# (License|The use|See https)", l)]
    text = "\n".join(lines).strip("\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


# --------------------------------------------------------------------------- emulator jobs (node)
JOBS: list[dict] = []
POST: list = []      # callables run after node results are available
SUBS: dict[str, str] = {}


def emu_job(job: dict) -> int:
    JOBS.append(job)
    return len(JOBS) - 1


def run_jobs() -> list[dict]:
    if not JOBS:
        return []
    tmp = Path(tempfile.gettempdir()) / "asm-mastery-build"
    tmp.mkdir(exist_ok=True)
    (tmp / "jobs.json").write_text(json.dumps(JOBS, ensure_ascii=False), encoding="utf-8")
    r = subprocess.run(["node", str(ROOT / "tools" / "verify_emu.js"), str(tmp / "jobs.json"), str(tmp / "results.json")],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise RuntimeError("node verify failed:\n" + r.stderr[:3000])
    return json.loads((tmp / "results.json").read_text(encoding="utf-8"))


def asm_errs(res: dict) -> str:
    if res.get("crash"):
        return "emulator crash: " + res["crash"][:800]
    return "; ".join(f"line {e['line']}: {e['msg']}" for e in res.get("asmErrors", [])[:4])


# --------------------------------------------------------------------------- renderers
def code_block(code: str, filename: str, lang: str, *, runnable=False, baked=None, attrs_html="", cls="") -> str:
    tools = '<button class="copy" type="button">نسخ</button>'
    if runnable:
        tools = '<button class="run-mini" type="button">▶ تشغيل</button>' + tools
    klass = "code-block" + (" " + cls if cls else "")
    lang_cls = {"nasm": "nasm", "asm": "asm", "c": "c", "cpp": "c"}.get(lang, lang)
    parts = [f'<div class="{klass}"{" data-run" if runnable else ""}{attrs_html}>',
             f'<div class="code-head"><div class="dots"><i></i><i></i><i></i></div><span class="filename">{esc(filename)}</span>',
             f'<div class="code-tools">{tools}</div></div>',
             f'<div class="code-body"><pre class="code-pre"><code class="language-{lang_cls}">{esc(code)}</code></pre></div>']
    if runnable:
        parts.append('<div class="run-out" hidden></div>')
        if baked is not None:
            parts.append(f'<pre class="baked" hidden>{esc(baked)}</pre>')
    parts.append("</div>")
    return "".join(parts)


def exit_ok(a: dict, code) -> str | None:
    if "any-exit" in a:
        return None
    want = int(a.get("expect-exit", "0"))
    if code != want:
        return f"exit code {code} != expected {want}"
    return None


def expand_nasm(m: re.Match, where: str) -> str:
    a = attrs(m.group(1))
    code = dedent_block(m.group(2))
    fn = a.get("file", "prog.asm")
    label = f"{where} › {fn}"
    stats["nasm"] += 1
    io = "io" in a
    stdin = a.get("stdin", "").replace("\\n", "\n")
    full = with_io(code, io)
    runnable = "norun" not in a and "assemble" not in a
    baked = None
    if "assemble" in a:
        try:
            r = ce_nasm_assemble(full, a["assemble"])
            if r and r["code"] != 0:
                errors.append(f"{label}: NASM -f {a['assemble']} failed:\n{r['stderr']}")
        except RuntimeError as exc:
            errors.append(f"{label}: {exc}")
    real = None
    if runnable:
        stats["nasm_run"] += 1
        try:
            real = ce_nasm_run(full, stdin)
        except RuntimeError as exc:
            errors.append(f"{label}: {exc}")
        if real:
            if not real["didExecute"]:
                errors.append(f"{label}: failed on Compiler Explorer:\n{real['build']}\n{real['stderr']}")
            else:
                e = exit_ok(a, real["code"])
                if e:
                    errors.append(f"{label}: {e}\n{real['stdout'][:300]}")
                if "expect" in a and norm_out(real["stdout"]) != norm_out(a["expect"].replace("\\n", "\n")):
                    errors.append(f"{label}: output mismatch\n got: {real['stdout']!r}")
                baked = (real["stdout"] or "(البرنامج اتنفّذ بدون مخرجات)") + (f"\n\n[exit code: {real['code']}]" if real["code"] else "")
    token = f"@@EMU{len(JOBS)}@@"
    setup = a.get("setup", "")
    if stdin:
        setup = (setup + ";" if setup else "") + "stdin=" + js_str(stdin)
    jid = emu_job({"kind": "run", "src": full, "setup": setup, "entry": a.get("entry", ""), "userLines": code.count("\n") + 1})

    def post(results, jid=jid, token=token, real=real, a=a, label=label):
        res = results[jid]
        if not res.get("ok"):
            SUBS[token] = ""
            if "lab" in a:
                errors.append(f"{label}: marked lab but emulator cannot assemble it: {asm_errs(res)}")
            return
        if "nolab" in a:
            SUBS[token] = ""
            return
        st = res.get("status") or {}
        if real and real.get("didExecute") and "emu-skip" not in a:
            if norm_out(res.get("output", "")) != norm_out(real["stdout"]):
                errors.append(f"{label}: EMULATOR OUTPUT DIFFERS FROM REAL CPU\n real: {real['stdout']!r}\n emu : {res.get('output')!r}\n status: {st}")
            real_code = real["code"]
            emu_code = st.get("code") if st.get("kind") == "exit" else None
            if st.get("ok") and st.get("kind") == "exit" and emu_code != real_code:
                errors.append(f"{label}: exit code differs real={real_code} emu={emu_code}")
            if not st.get("ok") and real_code == 0:
                errors.append(f"{label}: emulator faulted but real run succeeded: {st}")
        SUBS[token] = " data-lab"
    POST.append(post)
    extra = (" data-lang=\"nasm\"" + (" data-io" if io else "") + (f' data-stdin="{esc_attr(stdin)}"' if stdin else "") +
             (f' data-setup="{esc_attr(a["setup"])}"' if a.get("setup") else "") + (" data-graph" if "graph" in a else "") + token)
    return code_block(code, fn, "nasm", runnable=runnable, baked=baked, attrs_html=extra, cls="nasm")


GCC = shutil.which("gcc")


def expand_c(m: re.Match, where: str) -> str:
    a = attrs(m.group(1))
    code = dedent_block(m.group(2))
    fn = a.get("file", "main.c")
    label = f"{where} › {fn}"
    stats["c"] += 1
    if GCC and "win" in a:
        obj = os.path.join(tempfile.gettempdir(), "asm-mastery-check.o")
        p = subprocess.run([GCC, "-std=c17", "-Wall", "-Wextra", "-Werror", "-x", "c", "-c", "-o", obj, "-"], input=code + "\n",
                           capture_output=True, text=True, encoding="utf-8")
        if p.returncode != 0:
            errors.append(f"{label}: local gcc failed:\n{p.stderr}")
    runnable = "norun" not in a and "win" not in a and re.search(r"\bint\s+main\s*\(", code)
    baked = None
    if runnable or ("norun" in a and "win" not in a):
        try:
            r = ce_c_run(code)
            if r:
                if not r["didExecute"]:
                    errors.append(f"{label}: failed on Compiler Explorer:\n{r['build']}")
                elif "warning:" in r["build"] and "allow-warn" not in a:
                    errors.append(f"{label}: compiler warning:\n{r['build']}")
                elif runnable:
                    e = exit_ok(a, r["code"])
                    if e:
                        errors.append(f"{label}: {e}")
                    baked = r["stdout"] or "(البرنامج اتنفّذ بدون مخرجات)"
        except RuntimeError as exc:
            errors.append(f"{label}: {exc}")
    return code_block(code, fn, "c", runnable=bool(runnable), baked=baked, attrs_html=' data-lang="c"')


def expand_compiled(m: re.Match, where: str) -> str:
    a = attrs(m.group(1))
    code = dedent_block(m.group(2))
    fn = a.get("file", "example.c")
    targets = [t.strip() for t in a.get("targets", "gcc-O0,gcc-O2").split(",") if t.strip()]
    stats["compiled"] += 1
    panes, tabs = [], []
    for k, t in enumerate(targets):
        if t not in TARGETS:
            errors.append(f"{where} › {fn}: unknown target {t}")
            continue
        try:
            asm = ce_compile(t, code)
        except RuntimeError as exc:
            errors.append(f"{where} › {fn}: {exc}")
            asm = ""
        if asm is None:
            asm = "(offline build — run without --offline to fetch)"
        label = TARGETS[t][3]
        tabs.append(f'<button class="cv-tab{" on" if k == 0 else ""}" type="button" data-k="{t}">{esc(label)}</button>')
        blk = code_block(asm, f"{label} · Intel syntax", "asm", attrs_html=" data-graph" if "graph" in a else "", cls="asm")
        panes.append(f'<div class="cv-pane" data-k="{t}"{"" if k == 0 else " hidden"}>{blk}</div>')
    src_lang = "cpp" if a.get("lang") == "cpp" else "c"
    left = code_block(code, fn, src_lang)
    note = a.get("note", "")
    return (f'<div class="compiled"><div class="cv-tabs"><span class="lbl">مخرجات حقيقية من:</span>{"".join(tabs)}</div>'
            f'<div class="side-by-side">{left}<div class="cv-panes">{"".join(panes)}</div></div>'
            + (f'<div class="cv-note">{note}</div>' if note else "") + "</div>")


def expand_asm(m: re.Match) -> str:
    a = attrs(m.group(1))
    stats["asm"] += 1
    return code_block(dedent_block(m.group(2)), a.get("file", "disassembly"), "asm", attrs_html=" data-graph" if "graph" in a else "", cls="asm")


def expand_plain(m: re.Match) -> str:
    a = attrs(m.group(1))
    return code_block(dedent_block(m.group(2)), a.get("file", "terminal"), a.get("lang", "bash"))


IDS: set[str] = set()


def take_id(i: str, where: str) -> None:
    if not i or i in IDS:
        errors.append(f"{where}: missing/duplicate id {i!r}")
    IDS.add(i)


def expand_quiz(raw: str, body: str, where: str) -> str:
    a = attrs(raw)
    body = re.sub(r"<pre-asm>([\s\S]*?)</pre-asm>", lambda mm: f'<pre class="q-code"><code class="language-asm">{esc(dedent_block(mm.group(1)))}</code></pre>', body)
    body = re.sub(r"<pre-c>([\s\S]*?)</pre-c>", lambda mm: f'<pre class="q-code"><code class="language-c">{esc(dedent_block(mm.group(1)))}</code></pre>', body)
    qid = a.get("id", "")
    take_id(qid, where)
    stats["quiz"] += 1
    q = re.search(r"<q>([\s\S]*?)</q>", body)
    opts = re.findall(r"<o>([\s\S]*?)</o>", body)
    good = re.search(r"<good>([\s\S]*?)</good>", body)
    bad = re.search(r"<bad>([\s\S]*?)</bad>", body)
    try:
        ans = int(a.get("answer", "-1"))
    except ValueError:
        ans = -1
    if not q or not good or not bad:
        errors.append(f"{where} › {qid}: quiz needs <q>, <good>, <bad>")
    if not 2 <= len(opts) <= 5:
        errors.append(f"{where} › {qid}: quiz needs 2..5 options")
    if not 0 <= ans < len(opts):
        errors.append(f"{where} › {qid}: answer index out of range")
    if len(set(o.strip() for o in opts)) != len(opts):
        errors.append(f"{where} › {qid}: duplicate options")
    L = "ABCDE"
    oh = "".join(f'<button class="option" data-i="{i}"><span class="k">{L[i]}</span><span class="otxt">{o.strip()}</span><span class="mark"></span></button>' for i, o in enumerate(opts))
    return (f'<div class="quiz" data-ex="{esc_attr(qid)}" data-answer="{ans}"><div class="quiz-q">{q.group(1).strip() if q else ""}</div>'
            f'<div class="quiz-options">{oh}</div><div class="quiz-feedback" data-good="{esc_attr(good.group(1).strip() if good else "")}" '
            f'data-bad="{esc_attr(bad.group(1).strip() if bad else "")}"></div></div>')


def part(body: str, tag: str, label: str, required=True) -> str | None:
    mm = re.search(rf"<{tag}>([\s\S]*?)</{tag}>", body)
    if not mm:
        if required:
            errors.append(f"{label}: missing <{tag}>")
        return None
    return mm.group(1)


LVL = {"1": "أساسي", "2": "متوسط", "3": "متقدم"}


def expand_challenge(m: re.Match, where: str) -> str:
    a = attrs(m.group(1))
    body = m.group(2)
    cid = a.get("id", "")
    label = f"{where} › {cid}"
    take_id(cid, where)
    stats["ch"] += 1
    lang = a.get("lang", "nasm")
    io = "io" in a
    desc = (part(body, "desc", label) or "").strip()
    starter = dedent_block(part(body, "starter", label) or "")
    expected = dedent_block(part(body, "expected", label) or "")
    solution = dedent_block(part(body, "solution", label) or "")
    stdin_raw = part(body, "stdin", label, required=False)
    stdin = dedent_block(stdin_raw) + "\n" if stdin_raw is not None else ""
    try:
        if lang == "c":
            r, rs = ce_c_run(solution, stdin), ce_c_run(starter, stdin)
        else:
            r, rs = ce_nasm_run(with_io(solution, io), stdin), ce_nasm_run(with_io(starter, io), stdin)
        if r:
            if not r["didExecute"]:
                errors.append(f"{label}: solution failed:\n{r['build']}")
            elif norm_out(r["stdout"]) != norm_out(expected):
                errors.append(f"{label}: solution output != expected\n--- got ---\n{r['stdout']}\n--- expected ---\n{expected}")
        if rs and not rs["didExecute"] and ("error" in rs["build"].lower()):
            errors.append(f"{label}: starter does not assemble:\n{rs['build']}")
    except RuntimeError as exc:
        errors.append(f"{label}: {exc}")
    dbg_token = ""
    if lang == "nasm":
        jid = emu_job({"kind": "run", "src": with_io(solution, io), "setup": ("stdin=" + js_str(stdin)) if stdin else "", "userLines": solution.count("\n") + 1})

        dbg_token = f"@@DBG{jid}@@"

        def post(results, jid=jid, label=label, expected=expected, a=a, dbg_token=dbg_token):
            res = results[jid]
            # the in-page debugger only gets a button when the emulator can run the solution
            SUBS[dbg_token] = '<button class="btn btn-sm btn-ghost btn-dbg" type="button">🔬 Debug</button>' if res.get("ok") else ""
            if res.get("ok") and "emu-skip" not in a and norm_out(res.get("output", "")) != norm_out(expected):
                errors.append(f"{label}: emulator output of solution differs from expected:\n{res.get('output')!r}")
        POST.append(post)
    lvl = a.get("level", "1")
    fname = "main.c" if lang == "c" else "solution.asm"
    out = [f'<div class="challenge" data-ex="{esc_attr(cid)}" data-lang="{lang}"' + (" data-io" if io else "") + ">",
           f'<div class="ch-head"><span class="badge-code">{"C" if lang == "c" else "ASM"}</span><h4>{a.get("title", "تحدي")}<span class="lvl l{esc_attr(lvl)}">{LVL.get(lvl, "")}</span></h4></div>',
           f'<div class="ch-desc">{desc}</div>',
           f'<div class="editor"><div class="editor-bar"><span class="ed-dot"></span>{fname}{" + io.inc" if io else ""}<span class="ed-keys">Ctrl + Enter للتشغيل</span></div>',
           f'<textarea spellcheck="false" aria-label="محرر كود التحدي">{esc(starter)}\n</textarea></div>',
           '<div class="ch-actions"><button class="btn btn-sm btn-run" type="button">▶ تشغيل وتصحيح</button>',
           (dbg_token if lang == "nasm" else ""),
           '<button class="btn btn-sm btn-ghost btn-solution" type="button">اعرض الحل</button>',
           '<button class="btn btn-sm btn-ghost btn-reset" type="button">استعادة</button><span class="ch-status"></span></div>',
           f'<div class="console" hidden><div class="console-head"><span>Output · {"gcc 15.2" if lang == "c" else "NASM 3.01 + ld"} · x86-64 Linux</span></div><pre></pre></div>',
           f'<div class="expected" hidden>{esc(expected)}</div><div class="solution" hidden>{esc(solution)}</div>']
    if stdin_raw is not None:
        out.append(f'<div class="stdin" hidden>{esc(stdin)}</div>')
    out.append("</div>")
    return "".join(out)


def expand_lab(m: re.Match, where: str) -> str:
    a = attrs(m.group(1))
    code = dedent_block(m.group(2))
    lid = a.get("id", "")
    label = f"{where} › lab {lid}"
    take_id(lid, where)
    stats["lab"] += 1
    io = "io" in a
    jid = emu_job({"kind": "run", "src": with_io(code, io), "setup": a.get("setup", ""), "entry": a.get("entry", ""),
                   "expect": a.get("expect", ""), "userLines": code.count("\n") + 1})

    def post(results, jid=jid, a=a, label=label):
        res = results[jid]
        if not res.get("ok"):
            errors.append(f"{label}: does not assemble in the emulator: {asm_errs(res)}")
            return
        st = res.get("status") or {}
        if "expect-fault" in a:
            if st.get("ok"):
                errors.append(f"{label}: expected a fault but it finished: {st}")
            elif a["expect-fault"] and st.get("kind") != a["expect-fault"]:
                errors.append(f"{label}: expected fault {a['expect-fault']} got {st.get('kind')}")
        elif not st.get("ok"):
            errors.append(f"{label}: lab does not finish cleanly: {st.get('msg')}")
        if res.get("fails"):
            errors.append(f"{label}: expect failed: {res['fails']}")
    POST.append(post)
    return (f'<div class="lab" data-id="{esc_attr(lid)}" data-title="{esc_attr(a.get("title", ""))}"'
            + (f' data-setup="{esc_attr(a["setup"])}"' if a.get("setup") else "") + (" data-io" if io else "")
            + (f' data-entry="{esc_attr(a["entry"])}"' if a.get("entry") else "")
            + f'><textarea class="lab-src" hidden>{esc(code)}</textarea><div class="lab-loading">⏳ بيحمّل المعمل…</div></div>')


def expand_lab_challenge(m: re.Match, where: str) -> str:
    a = attrs(m.group(1))
    body = m.group(2)
    lid = a.get("id", "")
    label = f"{where} › labch {lid}"
    take_id(lid, where)
    stats["labch"] += 1
    io = "io" in a
    desc = (part(body, "desc", label) or "").strip()
    starter = dedent_block(part(body, "starter", label) or "")
    solution = dedent_block(part(body, "solution", label) or "")
    tests = [dict(attrs(t)) for t in re.findall(r"<test\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)/>", body)]
    if not tests:
        errors.append(f"{label}: no <test/>")
    tests = [{"setup": t.get("setup", ""), "expect": t.get("expect", ""), **({"label": t["label"]} if "label" in t else {})} for t in tests]
    forbid = [x.strip() for x in a.get("forbid", "").split(",") if x.strip()]
    maxins = int(a["maxins"]) if a.get("maxins") else 0
    j1 = emu_job({"kind": "test", "src": with_io(solution, io), "entry": a.get("entry", ""), "tests": tests, "userLines": solution.count("\n") + 1})
    j2 = emu_job({"kind": "run", "src": with_io(starter, io), "entry": a.get("entry", ""), "setup": tests[0]["setup"] if tests else "", "userLines": starter.count("\n") + 1})

    def post(results, j1=j1, j2=j2, label=label):
        r1, r2 = results[j1], results[j2]
        if not r1.get("ok"):
            errors.append(f"{label}: solution does not assemble: {asm_errs(r1)}")
        else:
            for k, rr in enumerate(r1["results"]):
                if not rr["pass"]:
                    errors.append(f"{label}: solution FAILS test {k + 1} {tests[k]}: {rr['fails']}")
            bad = [x for x in r1["mnemonics"] if x in forbid]
            if bad:
                errors.append(f"{label}: solution uses forbidden {bad}")
            if maxins and r1["nIns"] > maxins:
                errors.append(f"{label}: solution has {r1['nIns']} instructions > maxins {maxins}")
        if not r2.get("ok"):
            errors.append(f"{label}: starter does not assemble: {asm_errs(r2)}")
        elif all(rr["pass"] for rr in (results[j1].get("results") or [])) and r2.get("ok"):
            pass
    POST.append(post)
    return (f'<div class="lab lab-challenge" data-ex="{esc_attr(lid)}" data-title="{esc_attr(a.get("title", ""))} · {LVL.get(a.get("level", "1"), "")}"'
            f" data-tests='{esc_attr(json.dumps(tests, ensure_ascii=False))}'" + (" data-io" if io else "")
            + (f' data-forbid="{esc_attr(",".join(forbid))}"' if forbid else "") + (f' data-maxins="{maxins}"' if maxins else "")
            + (f' data-entry="{esc_attr(a["entry"])}"' if a.get("entry") else "")
            + f'><div class="lab-desc-src" hidden>{desc}</div><textarea class="lab-src" hidden>{esc(starter)}</textarea>'
            f'<pre class="lab-solution" hidden>{esc(solution)}</pre><div class="lab-loading">⏳ بيحمّل المعمل…</div></div>')


def norm_answer(v: str, kind: str, bits: int) -> str | None:
    v = v.strip()
    if kind == "int":
        s = v.lower().replace("_", "").lstrip("+")
        neg = s.startswith("-")
        s = s[1:] if neg else s
        if re.fullmatch(r"0x[0-9a-f]+", s):
            n = int(s, 16)
        elif re.fullmatch(r"[0-9][0-9a-f]*h", s):
            n = int(s[:-1], 16)
        elif re.fullmatch(r"0b[01]+", s):
            n = int(s, 2)
        elif re.fullmatch(r"\d+", s):
            n = int(s)
        elif re.fullmatch(r"'.'", s):
            n = ord(s[1])
        else:
            return None
        n = -n if neg else n
        return str(n % (1 << bits))
    if kind == "hex":
        return re.sub(r"[\s,]", "", v.lower().replace("0x", ""))
    if kind == "str":
        return re.sub(r"^[\"']|[\"']$", "", v)
    return re.sub(r"\s+", " ", re.sub(r"^[\"'`]|[\"'`]$", "", v.lower())).strip()


def expand_re(m: re.Match, where: str) -> str:
    a = attrs(m.group(1))
    body = m.group(2)
    rid = a.get("id", "")
    label = f"{where} › re {rid}"
    take_id(rid, where)
    stats["re"] += 1
    kind = a.get("norm", "text")
    bits = int(a.get("bits", "64"))
    answers = [x for x in a.get("answer", "").split("|") if x.strip()]
    if not answers:
        errors.append(f"{label}: missing answer")
    hashes = []
    for ans in answers:
        n = norm_answer(ans, kind, bits)
        if n is None:
            errors.append(f"{label}: answer {ans!r} cannot be normalised as {kind}")
            continue
        hashes.append(hashlib.sha256(f"{rid}:{n}".encode("utf-8")).hexdigest())
    desc = (part(body, "desc", label) or "").strip()
    code_raw = part(body, "listing", label, required=False)
    hint = part(body, "hint", label, required=False)
    explain = part(body, "explain", label, required=False)
    io = "io" in a
    code_html = ""
    live_json = ""
    if code_raw is not None:
        code = dedent_block(code_raw)
        verifies = [attrs(v) for v in re.findall(r"<verify\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)/>", body)]
        if verifies and answers:
            tests = [{"setup": v.get("setup", "").replace("{ans}", answers[0]), "expect": v.get("expect", "").replace("{ans}", answers[0])} for v in verifies]
            jid = emu_job({"kind": "test", "src": with_io(code, io), "entry": a.get("entry", ""), "tests": tests})

            def post(results, jid=jid, label=label, tests=tests):
                res = results[jid]
                if not res.get("ok"):
                    errors.append(f"{label}: code does not assemble: {asm_errs(res)}")
                    return
                for k, rr in enumerate(res["results"]):
                    if not rr["pass"]:
                        errors.append(f"{label}: ANSWER NOT VERIFIED by emulator ({tests[k]}): {rr['fails']}")
            POST.append(post)
            # <reject ans="..."/>: keys that a live (keygen-style) crackme MUST refuse
            for rj in [attrs(v) for v in re.findall(r"<reject\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)/>", body)]:
                bad = rj.get("ans", "")
                rtests = [{"setup": v.get("setup", "").replace("{ans}", bad), "expect": v.get("expect", "").replace("{ans}", bad)} for v in verifies]
                rjid = emu_job({"kind": "test", "src": with_io(code, io), "entry": a.get("entry", ""), "tests": rtests})

                def rpost(results, rjid=rjid, label=label, bad=bad):
                    res = results[rjid]
                    if res.get("ok") and all(rr["pass"] for rr in res["results"]):
                        errors.append(f"{label}: reject value {bad!r} is ACCEPTED by the code")
                POST.append(rpost)
            for alt in answers[1:]:
                atests = [{"setup": v.get("setup", "").replace("{ans}", alt), "expect": v.get("expect", "").replace("{ans}", alt)} for v in verifies]
                ajid = emu_job({"kind": "test", "src": with_io(code, io), "entry": a.get("entry", ""), "tests": atests})

                def apost(results, ajid=ajid, label=label, alt=alt):
                    res = results[ajid]
                    if res.get("ok") and not all(rr["pass"] for rr in res["results"]):
                        errors.append(f"{label}: alternative answer {alt!r} NOT accepted by the code")
                POST.append(apost)
            if "live" in a:
                live_json = json.dumps({"src": with_io(code, io), "entry": a.get("entry", ""), "tests": [{"setup": v.get("setup", ""), "expect": v.get("expect", "")} for v in verifies]}, ensure_ascii=False)
            token = f"@@EMU{len(JOBS)}@@"
            jid2 = emu_job({"kind": "run", "src": with_io(code, io), "entry": a.get("entry", ""), "setup": ""})
            POST.append(lambda results, jid2=jid2, token=token: SUBS.__setitem__(token, " data-lab" if results[jid2].get("ok") else ""))
        else:
            token = ""
        code_html = code_block(code, a.get("file", "crackme.asm"), "nasm", attrs_html=' data-lang="nasm"' + (" data-io" if io else "") + (" data-graph" if "graph" in a else "") + token, cls="nasm")
    lvl = a.get("level", "2")
    ph = {"int": "اكتب رقم (عشري أو hex زي 0x1F)", "hex": "اكتب bytes بالـ hex (زي 74 0E)", "str": "اكتب النص بالظبط"}.get(kind, "اكتب إجابتك")
    return (f'<div class="re-task" data-ex="{esc_attr(rid)}" data-hash="{",".join(hashes)}" data-norm="{kind}" data-bits="{bits}"' + (f' data-live="{esc_attr(live_json)}"' if live_json else "") + '>'
            f'<div class="re-head"><span class="re-ico">🔓</span><h4>{a.get("title", "مهمة RE")}<span class="lvl l{esc_attr(lvl)}">{LVL.get(lvl, "")}</span></h4></div>'
            f'<div class="re-body"><p>{desc}</p>{code_html}'
            f'<div class="re-answer"><input type="text" placeholder="{ph}" aria-label="الإجابة" spellcheck="false"><button class="btn btn-sm btn-primary re-check" type="button">تحقق 🔓</button></div>'
            f'<div class="re-msg"></div>'
            + (f'<details class="re-hint"><summary>💡 تلميح</summary>{hint.strip()}</details>' if hint else "")
            + (f'<details class="re-explain" hidden><summary>✅ الشرح الكامل</summary>{explain.strip()}</details>' if explain else "")
            + "</div></div>")


# --------------------------------------------------------------------------- main
def process(text: str, where: str) -> str:
    text = text.replace("@@IOLIB@@", IO_LIB)
    text = re.sub(r"<nasm-example\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</nasm-example>", lambda m: expand_nasm(m, where), text)
    text = re.sub(r"<c-example\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</c-example>", lambda m: expand_c(m, where), text)
    text = re.sub(r"<compiled\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</compiled>", lambda m: expand_compiled(m, where), text)
    text = re.sub(r"<asm-block\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</asm-block>", expand_asm, text)
    text = re.sub(r"<plain-block\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</plain-block>", expand_plain, text)
    text = re.sub(r"<asm-lab\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</asm-lab>", lambda m: expand_lab(m, where), text)
    text = re.sub(r"<lab-challenge\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</lab-challenge>", lambda m: expand_lab_challenge(m, where), text)
    text = re.sub(r"<re-task\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</re-task>", lambda m: expand_re(m, where), text)
    text = re.sub(r"<quiz\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</quiz>", lambda m: expand_quiz(m.group(1), m.group(2), where), text)
    text = re.sub(r"<challenge\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>([\s\S]*?)</challenge>", lambda m: expand_challenge(m, where), text)
    stats["proj"] += len(re.findall(r'class="project[^"]*"[^>]*data-ex=', text))
    return text


def main() -> int:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    template = (SRC / "template.html").read_text(encoding="utf-8")
    files = sorted((SRC / "sections").glob("*.html"))
    only = [x for x in sys.argv[1:] if not x.startswith("--")]
    rendered = []
    for f in files:
        print(f"  · {f.name}")
        rendered.append(process(f.read_text(encoding="utf-8"), f.stem))
    print(f"  · emulator: {len(JOBS)} verification jobs")
    try:
        results = run_jobs()
    except RuntimeError as exc:
        errors.append(str(exc))
        results = [{"ok": False}] * len(JOBS)
    for p in POST:
        p(results)
    body = "\n".join(rendered)
    body = re.sub(r"@@(?:EMU|DBG)\d+@@", lambda mm: SUBS.get(mm.group(0), ""), body)
    ids = re.findall(r'\sid="([^"]+)"', template + body)
    dups = sorted({i for i in ids if ids.count(i) > 1})
    if dups:
        errors.append("duplicate element ids: " + ", ".join(dups))
    for href in set(re.findall(r'href="#([^"]+)"', template + body)):
        if href not in ids and "--draft" not in sys.argv:
            errors.append(f"broken in-page link: #{href}")
    left = re.findall(r"</?(?:nasm-example|c-example|compiled|asm-block|plain-block|asm-lab|lab-challenge|re-task|quiz|challenge|pre-asm|pre-c)\b", body)
    if left:
        errors.append(f"unexpanded tags: {set(left)}")
    n_sec = len(re.findall(r'class="section"[^>]*data-nav=', body))
    ver = hashlib.sha256(b"".join((ROOT / "assets" / f).read_bytes() for f in sorted(os.listdir(ROOT / "assets")))).hexdigest()[:10]
    template = template.replace("{{VER}}", ver)
    page = (template.replace("{{SECTIONS}}", body).replace("{{IO_LIB}}", IO_LIB)
            .replace("{{N_SECTIONS}}", str(n_sec)).replace("{{N_QUIZ}}", str(stats["quiz"]))
            .replace("{{N_LABS}}", str(stats["lab"] + stats["labch"])).replace("{{N_RE}}", str(stats["re"]))
            .replace("{{N_CH}}", str(stats["ch"])).replace("{{N_PROJ}}", str(stats["proj"]))
            .replace("{{N_LABCH}}", str(stats["labch"])).replace("{{N_EX}}", str(stats["nasm"] + stats["c"]))
            .replace("{{N_COMPILED}}", str(stats["compiled"]))
            .replace("{{N_TOTAL}}", str(stats["quiz"] + stats["ch"] + stats["labch"] + stats["re"] + stats["proj"])))
    print()
    print("  " + " · ".join(f"{k}: {v}" for k, v in stats.items()))
    if errors:
        print(f"\n✗ BUILD FAILED — {len(errors)} problem(s):\n")
        for e in errors:
            print("  ✗ " + e.replace("\n", "\n    "))
        return 1
    (ROOT / "index.html").write_text(page, encoding="utf-8")
    if not OFFLINE and not only:
        for k in set(CACHE) - USED:
            del CACHE[k]
        save_cache()
    print("\n✓ index.html written — every example, lab, challenge and answer verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
