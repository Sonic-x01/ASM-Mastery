# ASM Mastery — authoring guide

Arabic (Egyptian colloquial, like C Mastery) explanations; code, identifiers, comments and program output in English.
Every section is `src/sections/NN-name.html`; `python tools/build.py [--draft]` builds + verifies (`--draft` skips in-page link checks).

## Section skeleton
```html
<section class="section" id="sNN" data-part="الجزء X · …" data-nav="short nav title" data-icon="🧠" data-keywords="english keywords for search">
  <div class="section-head"><span class="section-index">NN</span><div>
    <p class="eyebrow">المرحلة … </p><h2>Title</h2><p class="lede">…</p></div></div>
  … content …
  <div class="exercises"><div class="exercises-head"><h3><span class="bulb">✏️</span> تمارين المرحلة NN</h3></div>
    quizzes / challenges / lab-challenges / re-tasks
  </div>
</section>
```
Ids: quizzes `sNN-qK`, challenges `sNN-cK`, labs `sNN-labK`, lab challenges `sNN-lcK`, RE tasks `sNN-reK`, projects `pNN`.

## Building blocks (see tools/build.py docstring for attributes)
- `<nasm-example file io stdin= expect-exit= nolab graph assemble="win64|elf32">` — runs on CE, cross-checked against the emulator, gets ⚙ Bytes + 🔬 Debug.
- `<compiled file targets="gcc-O0,gcc-O2,msvc-O2,msvc32-O2,gcc32-O2,clang-O2,arm64-O2,g++-O2,msvc++-O2" graph note="">` real compiler output. **Before writing prose about a listing, look at the real output** (`python tools/peek.py file.c target`).
- `<asm-block file graph>` static listing (e.g. hand-written disassembly).
- `<asm-lab id title setup="rdi=5" io entry expect="rax=15" expect-fault>` debugger lab (func mode unless `_start`).
- `<lab-challenge id title level forbid maxins io>` + `<desc> <starter> <solution> <test setup expect label/>`.
- `<challenge id title level lang="nasm|c" io>` + `<desc> <starter> <expected> <solution> [<stdin>]` — graded on CE.
- `<quiz id answer="0-based">` + `<q> <o>… <good> <bad>`; `<pre-asm>`/`<pre-c>` inside `<q>`.
- `<re-task id title level answer="a|b" norm="int|hex|str|text" bits="32">` + `<desc> <listing> <verify setup="edi={ans}" expect="eax=1"/> <hint> <explain>`.
- Widgets: `<div class="widget" data-widget="conv|regs|flags|encoder|endian|addr"></div>`.
- Diagrams (Arabic SVG text: class `ar`, anchored at the RIGHT edge x or text-anchor=middle; never mix Arabic into an LTR text): `<figure class="diagram"><svg viewBox=…>` using classes d-box/d-box2..5, d-t, d-tb, d-ts, d-tx, d-acc/vio/amb/grn/red, d-ar*, d-flow, d-pulse; `<figcaption>`.
- Charts: `<div class="chart"><h4/><div class="c-sub"/> <div class="bar-row" style="--w:35%"><span class="bn">mov</span><span class="bt"><span class="bf"></span></span><span class="bp2">34.9%</span></div>…`.
- Memory diagrams: `.mem` > `.mem-title` + `.mem-row(.hl|.warn|.ret|.vio)` > `span.addr span.val span.what`.
- Callouts: `.callout.tip|warn|danger|info|re|lab-tip|mal` with `<span class="ci">emoji</span><div><strong/>…<p/></div>`.
- Cards `.grid-2/.grid-3 > .card.reveal`, steps `.steps > .step`, tables `.table-wrap > table.ref`, `.pipeline`.

## Emulator facts (for lab text)
.text at 0x401000, sections page-aligned after it, stack top 0x7FFFFFFFF000; function mode: rsp=0x7FFFFFFFEEF8, [rsp]=return to caller (0x400F00).
Supported: integer x86-64 subset (mov/movzx/movsx/lea/xchg/push/pop/alu/mul/div/shifts/rotates/bt*/bsf/bsr/popcnt/bswap/setcc/cmovcc/jcc/jmp/call/ret/loop/string ops+rep/cpuid/rdtsc/pushfq/popfq/syscall/int 0x80/int3/ud2/hlt). No SSE/x87, no extern, no data in .text.
Linux syscalls: read 0, write 1, getpid 39, getuid 102, exit 60, exit_group 231. `io.inc`: print_str/print_char/print_nl/print_uint/print_int/print_hex/exit (preserve all regs).

## Verification
- `python tools/test_cpu.py 4000 <seed>` — emulator vs real CPU.
- `python tools/test_encoder.py` — encoder vs NASM.
- Lab/RE expectations like `str(rsi)` / `qword(rdi+8)` resolve registers to their INITIAL (setup) values.

## Added later
- Widgets also: `simd`, `fcmp`, `idioms` (flashcards), `walk` (analysis walkthrough: put `{"title","sub","listing","passes":[{t,d,hl:[[a,b]],notes:{"line":"text"},c}]}` in a `<script type="application/json">` child), `pe` (base64 PE in a `<script type="text/plain" class="pe-data">` child).
- `<re-task live="">`: keygen-style — the page runs the listing with the user's key using the `<verify>` setup/expect (`{ans}` substituted), so any valid key is accepted. `<reject ans="..."/>` = keys the build proves are refused. Extra `answer="a|b"` alternatives are also run.
- Explorer scenes: a second code panel follows its own highlight key with `hk: "code2"` (`set: {code2: i}`).
- Challenge `🔬 Debug` buttons are emitted only when the emulator can run the solution (SSE etc. → no button).
- `tools/samples/`: source + patch script of the real PE used by the PE Explorer and project 03.
