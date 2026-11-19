/* ============================================================
   ASM Mastery for Reverse Engineers — course engine
   Static page. Real execution: Compiler Explorer (NASM 3.01 / gcc 15.2,
   x86-64 Linux). Offline: the in-page emulator (emu.js) + outputs that
   tools/build.py verified and baked into the page.
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const E = window.AsmEmu;

  /* ---------------- state ---------------- */
  const STORE_KEY = "asmMastery.v1", THEME_KEY = "asmMastery.theme";
  function loadState() {
    try {
      const r = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return { quizzes: r.quizzes || {}, challenges: r.challenges || {}, labs: r.labs || {}, re: r.re || {}, code: r.code || {}, projects: r.projects || {}, celebrated: !!r.celebrated };
    } catch (e) { return { quizzes: {}, challenges: {}, labs: {}, re: {}, code: {}, projects: {}, celebrated: false }; }
  }
  const state = loadState();
  const saveState = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ } };
  const IO_LIB = ($("#ioLib") || { textContent: "" }).textContent.replace(/^\n+/, "");

  /* ---------------- toast / theme ---------------- */
  const toastEl = $("#toast"), toastTxt = $("#toastTxt");
  let toastTimer = null;
  function toast(msg, icon) {
    if (!toastEl) return;
    const ico = toastEl.querySelector(".t-ico"); if (ico) ico.textContent = icon || "✓";
    toastTxt.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }
  const themeBtn = $("#themeBtn");
  function applyTheme(t, persist) {
    document.documentElement.dataset.theme = t;
    if (themeBtn) { themeBtn.textContent = t === "light" ? "☀️" : "🌙"; themeBtn.setAttribute("aria-label", t === "light" ? "تفعيل الوضع الداكن" : "تفعيل الوضع الفاتح"); }
    const meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", t === "light" ? "#f4f7fb" : "#060911");
    if (persist) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
  }
  function initTheme() {
    let t = "dark"; try { t = localStorage.getItem(THEME_KEY) || "dark"; } catch (e) {}
    applyTheme(t === "light" ? "light" : "dark", false);
    if (themeBtn) themeBtn.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light", true));
  }
  const yearEl = $("#year"); if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- syntax highlighting ---------------- */
  const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const C_KW = new Set("auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while true false NULL __asm__ asm".split(" "));
  const C_TY = new Set("void char short int long float double signed unsigned bool size_t uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t uintptr_t FILE BYTE WORD DWORD QWORD BOOL HANDLE LPVOID PVOID ULONG_PTR DWORD64 wchar_t".split(" "));
  const C_RE = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|^[ \t]*#[ \t]*\w+(?:[ \t]*<[^>\n]*>)?|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\b0[xX][0-9a-fA-F]+[uUlL]*\b|\b\d+(?:\.\d+)?[uUlLfF]*\b|\b[A-Za-z_]\w*\b)/gm;
  function highlightC(code) {
    let out = "", last = 0;
    code.replace(C_RE, (m, _g, off) => {
      out += escapeHtml(code.slice(last, off));
      let c = "";
      if (m.startsWith("/*") || m.startsWith("//")) c = "com";
      else if (/^[ \t]*#/.test(m)) c = "dec";
      else if (m[0] === '"' || m[0] === "'") c = "str";
      else if (/^\d/.test(m)) c = "num";
      else if (C_KW.has(m)) c = "kw";
      else if (C_TY.has(m)) c = "builtin";
      else if (/^\s*\(/.test(code.slice(off + m.length))) c = "fn";
      out += c ? '<span class="tok-' + c + '">' + escapeHtml(m) + "</span>" : escapeHtml(m);
      last = off + m.length; return m;
    });
    return out + escapeHtml(code.slice(last));
  }
  const ASM_REG = /^(?:[re]?[abcd]x|[abcd][lh]|[re]?(?:si|di|sp|bp|ip)|(?:si|di|sp|bp)l|r(?:[89]|1[0-5])[dwbl]?|[xyz]mm\d+|st\d?|[cdefgs]s|[re]?flags|cr\d|dr\d|[wx](?:\d|[12]\d|30)|sp|lr|pc|fp|xzr|wzr)$/i;
  const ASM_DIR = /^(?:section|segment|global|extern|default|bits|db|dw|dd|dq|dt|resb|resw|resd|resq|times|equ|align|%define|%macro|%endmacro|%include|%assign|%rep|%endrep|%if|%endif|%else|PROC|ENDP|PUBLIC|EXTRN|END|proc|endp|struc|endstruc|istruc|iend|at)$/i;
  const ASM_SIZE = /^(?:byte|word|dword|qword|xmmword|ymmword|tbyte|ptr|offset|flat|rel|abs|short|near|far)$/i;
  const ASM_RE = /(;[^\n]*|\/\/[^\n]*|(?<![\w$])#[^\n]*|"(?:\\.|[^"\\\n])*"|'[^'\n]*'|`(?:\\.|[^`\\\n])*`|^[ \t]*[\w.$@?]+:|%%?[\w.]+|\b0x[0-9a-fA-F]+\b|\b[0-9][0-9a-fA-F]*h\b|-?\b\d+\b|\b[A-Za-z_.$@?][\w.$@?]*\b)/gm;
  function highlightAsm(code) {
    let out = "", last = 0;
    code.replace(ASM_RE, (m, _g, off) => {
      out += escapeHtml(code.slice(last, off));
      const ls = code.lastIndexOf("\n", off - 1) + 1;
      const first = /^[ \t]*$/.test(code.slice(ls, off));
      let c = "";
      if (m[0] === ";" || m[0] === "#" || m.startsWith("//")) c = "com";
      else if (m[0] === '"' || m[0] === "'" || m[0] === "`") c = "str";
      else if (/:$/.test(m)) c = "fn";
      else if (m[0] === "%" || ASM_DIR.test(m)) c = "dir";
      else if (/^-?\d/.test(m) || /^0x/i.test(m)) c = "num";
      else if (ASM_REG.test(m)) c = "reg";
      else if (ASM_SIZE.test(m)) c = "size";
      else if (first && /^[a-z]/i.test(m)) c = "kw";
      out += c ? '<span class="tok-' + c + '">' + escapeHtml(m) + "</span>" : escapeHtml(m);
      last = off + m.length; return m;
    });
    return out + escapeHtml(code.slice(last));
  }
  function highlightAll(root) {
    $$("code.language-c", root).forEach((c) => { if (c.dataset.hl) return; c.innerHTML = highlightC(c.textContent); c.dataset.hl = "1"; });
    $$("code.language-asm, code.language-nasm", root).forEach((c) => { if (c.dataset.hl) return; c.innerHTML = highlightAsm(c.textContent); c.dataset.hl = "1"; });
  }
  function buildGutter(block) {
    const body = block.querySelector(".code-body"), pre = body && body.querySelector("pre.code-pre"), code = pre && pre.querySelector("code");
    if (!body || !pre || !code || body.querySelector(".gutter")) return;
    const n = code.textContent.replace(/\n+$/, "").split("\n").length;
    const g = document.createElement("div"); g.className = "gutter"; g.setAttribute("aria-hidden", "true");
    g.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n");
    body.insertBefore(g, pre);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (x) {} ta.remove(); }
    toast("تم النسخ", "📋");
  }

  /* ---------------- Compiler Explorer ---------------- */
  const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
  const joinLines = (a) => (a || []).map((l) => l.text).join("\n").replace(ANSI, "");
  async function ce(compiler, body) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
    try {
      const res = await fetch("https://godbolt.org/api/compiler/" + compiler + "/compile", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: ctl.signal
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  }
  const withIO = (src, io) => (io ? src.replace(/\s+$/, "") + "\n\n" + IO_LIB : src);
  /** lang: "nasm" | "c". Returns {out, err, exitCode, compileError} */
  async function runCode(src, lang, stdin, io) {
    let data;
    if (lang === "c") {
      data = await ce("cg152", { source: src, lang: "c", allowStoreCodeDebug: false, options: {
        userArguments: "-O0 -std=c17 -Wall -Wextra -fdiagnostics-color=never", executeParameters: { args: [], stdin: stdin || "" },
        compilerOptions: { executorRequest: true }, filters: { execute: true }, tools: [], libraries: [] } });
    } else {
      data = await ce("nasm301", { source: withIO(src, io), lang: "assembly", allowStoreCodeDebug: false, options: {
        userArguments: "", executeParameters: { args: [], stdin: stdin || "" },
        compilerOptions: { executorRequest: true }, filters: { execute: true }, tools: [], libraries: [] } });
    }
    const build = data.buildResult || {};
    const be = joinLines(build.stderr).replace(/<source>|example\.asm|\/app\/example\.\w+/g, lang === "c" ? "main.c" : "prog.asm");
    if (!data.didExecute) return { out: "", err: be || "تعذّر بناء البرنامج.", exitCode: null, compileError: true };
    let err = joinLines(data.stderr);
    if (data.timedOut) err += (err ? "\n" : "") + "⏱ البرنامج أخد وقت أطول من المسموح واتوقف (loop مش بتخلص؟)";
    return { out: joinLines(data.stdout), err, warnings: be, exitCode: data.code, compileError: false };
  }
  const norm = (t) => String(t).replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/, "")).join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
  function exitNote(code) {
    if (code === null || code === undefined) return "";
    if (code === 139 || code === -11) return "exit code: " + code + " (Segmentation fault)";
    if (code === 136 || code === -8) return "exit code: " + code + " (SIGFPE — قسمة على صفر؟)";
    if (code === 132 || code === -4) return "exit code: " + code + " (SIGILL)";
    if (code === 133 || code === -5) return "exit code: " + code + " (SIGTRAP — int3؟)";
    return "exit code: " + code;
  }
  function renderResult(pre, r) {
    pre.classList.remove("err", "warn");
    if (r.compileError) { pre.classList.add("err"); pre.textContent = "✗ خطأ في الـ assembly/compilation:\n\n" + r.err; return; }
    let t = r.out || "(البرنامج اتنفّذ بدون مخرجات)";
    if (r.err && r.err.trim()) t += "\n\n[stderr]\n" + r.err;
    if (r.warnings && r.warnings.trim() && !/^\s*$/.test(r.warnings)) { t += "\n\n[warnings]\n" + r.warnings; pre.classList.add("warn"); }
    pre.textContent = t;
  }
  function outPanel(c) {
    if (!c.querySelector(".ro-head")) c.innerHTML = '<div class="ro-head"><span class="dot"></span><span class="ro-title">OUTPUT</span><span class="ro-exit"></span></div><pre></pre><div class="ro-time"></div>';
    return { pre: $("pre", c), time: $(".ro-time", c), exit: $(".ro-exit", c), title: $(".ro-title", c) };
  }

  /* ---------------- code blocks: run / bytes / debug / graph ---------------- */
  function listingHTML(prog, userLines) {
    const rows = [];
    const lbl = new Map();
    prog.labels.forEach((l) => { if (l.sec === "text") { if (!lbl.has(l.addr.toString())) lbl.set(l.addr.toString(), []); lbl.get(l.addr.toString()).push(l.name); } });
    prog.ins.forEach((I) => {
      if (userLines && I.line > userLines) return;
      (lbl.get(I.addr.toString()) || []).forEach((n) => rows.push('<div class="lst-row lbl"><span class="a"></span><span class="b"></span><span class="t">' + escapeHtml(n) + ":</span></div>"));
      const by = I.bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
      rows.push('<div class="lst-row"><span class="a">' + I.addr.toString(16).toUpperCase() + '</span><span class="b">' + by + '</span><span class="t">' + escapeHtml(I.text) + "</span></div>");
    });
    return rows.join("");
  }
  function openBytes(block, src, io) {
    let p = block.querySelector(":scope > .bytes-panel");
    if (p) { p.hidden = !p.hidden; return; }
    p = document.createElement("div");
    p.className = "bytes-panel";
    const userLines = src.replace(/\s+$/, "").split("\n").length;
    const prog = E.assemble(withIO(src, io));
    if (prog.ok) {
      p.innerHTML = '<div class="bytes-head">⚙ MACHINE CODE · address · bytes · instruction (زي x64dbg)</div><div class="bytes-body">' + listingHTML(prog, userLines) + '</div><div class="lst-note">الـ bytes دي متطابقة مع NASM (المعمل بيحسبها بنفسه offline). الـ .text بتبدأ عند 0x401000 زي ملفات ELF الحقيقية.</div>';
    } else {
      p.innerHTML = '<div class="bytes-head">⚙ MACHINE CODE</div><div class="bytes-body" style="padding:12px 14px;color:#93a1b9">⏳ بيعمل assemble على Compiler Explorer…</div>';
      ce("nasm301", { source: withIO(src, io), lang: "assembly", options: { userArguments: "", compilerOptions: {}, filters: { binary: true, intel: true, labels: true, directives: true, commentOnly: true }, tools: [], libraries: [] } })
        .then((d) => {
          const rows = (d.asm || []).map((it) => it.opcodes ? '<div class="lst-row"><span class="a">' + (it.address || 0).toString(16).toUpperCase() + '</span><span class="b">' + it.opcodes.join(" ").toUpperCase() + '</span><span class="t">' + escapeHtml(it.text.trim()) + "</span></div>" : '<div class="lst-row lbl"><span class="a"></span><span class="b"></span><span class="t">' + escapeHtml(it.text) + "</span></div>");
          $(".bytes-body", p).innerHTML = rows.join("") || escapeHtml(joinLines(d.stderr));
        })
        .catch(() => { $(".bytes-body", p).textContent = "تعذّر الاتصال بـ Compiler Explorer."; });
    }
    (block.querySelector(".run-out") || block.querySelector(".code-body")).insertAdjacentElement("afterend", p);
  }
  function openDebug(block, src, io, setup) {
    let host = block.nextElementSibling;
    if (host && host.classList.contains("lab") && host.dataset.inline) { host.hidden = !host.hidden; return; }
    const prog = E.assemble(withIO(src, io));
    if (!prog.ok) { toast("الكود ده فيه حاجات المعمل مش بيدعمها: " + prog.errors[0].msg, "⚠"); return; }
    host = document.createElement("div");
    host.className = "lab"; host.dataset.inline = "1"; host.dataset.title = "🔬 Debug: " + (block.querySelector(".filename") || { textContent: "" }).textContent;
    if (io) host.setAttribute("data-io", "");
    if (setup) host.dataset.setup = setup;
    const ta = document.createElement("textarea"); ta.className = "lab-src"; ta.hidden = true; ta.value = src;
    host.appendChild(ta);
    block.insertAdjacentElement("afterend", host);
    host._lab = new window.AsmLab.Lab(host);
    host.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "nearest" });
  }
  function initCodeBlocks() {
    highlightAll(document);
    $$(".code-block").forEach((block) => {
      buildGutter(block);
      const code = block.querySelector(".code-body code");
      const tools = block.querySelector(".code-tools");
      const copy = block.querySelector(".copy");
      if (copy) copy.addEventListener("click", () => copyText(code ? code.textContent : ""));
      if (!tools || !code) return;
      const lang = block.dataset.lang || (code.classList.contains("language-nasm") ? "nasm" : "c");
      const io = block.hasAttribute("data-io");
      const add = (cls, txt, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = txt; b.title = title; b.addEventListener("click", fn); tools.insertBefore(b, tools.firstChild); return b; };
      if (block.hasAttribute("data-graph")) add("graph-mini", "⧉ Graph", "اعرض الـ control-flow graph زي IDA", () => {
        const cv = block.closest(".compiled");
        if (!cv) { window.AsmLab.openCFG(block, () => code.textContent, block.querySelector(".code-body")); return; }
        const key = block.closest(".cv-pane").dataset.k, old = cv.querySelector(":scope > .cfg-wrap");
        if (old) { old.remove(); if (old.dataset.k === key) return; }
        window.AsmLab.openCFG(cv, () => code.textContent, cv.querySelector(".side-by-side"));
        const w = cv.querySelector(":scope > .cfg-wrap"); if (w) { w.dataset.k = key; $(".cfg-head", w).insertAdjacentText("afterbegin", ""); }
      });
      if (lang === "nasm") {
        if (block.hasAttribute("data-lab")) add("dbg-mini", "🔬 Debug", "شغّل الكود خطوة بخطوة في المعمل", () => openDebug(block, code.textContent, io, block.dataset.setup || ""));
        add("bytes-mini", "⚙ Bytes", "اعرض الـ machine code لكل instruction", () => openBytes(block, code.textContent, io));
      }
      if (block.hasAttribute("data-run")) {
        const btn = block.querySelector(".run-mini"), out = block.querySelector(".run-out"), baked = block.querySelector(".baked");
        btn.addEventListener("click", async () => {
          if (btn.disabled) return;
          const orig = btn.textContent; btn.disabled = true; btn.textContent = "⏳";
          out.hidden = false;
          const p = outPanel(out);
          p.title.textContent = "OUTPUT · " + (lang === "c" ? "gcc 15.2" : "NASM 3.01 + ld") + " · x86-64 Linux";
          p.pre.classList.remove("err", "warn"); p.pre.textContent = "⏳ بيعمل assemble ويشغّل على Compiler Explorer…"; p.time.textContent = ""; p.exit.textContent = "";
          const t0 = performance.now();
          try {
            const r = await runCode(code.textContent, lang, block.dataset.stdin || "", io);
            renderResult(p.pre, r);
            p.exit.textContent = exitNote(r.exitCode);
            p.time.textContent = "⏱ " + ((performance.now() - t0) / 1000).toFixed(2) + "s";
          } catch (e) {
            if (baked) { p.pre.textContent = baked.textContent; p.title.textContent = "OUTPUT (نسخة متحققة مسبقًا — مفيش اتصال بـ Compiler Explorer)"; }
            else { p.pre.classList.add("err"); p.pre.textContent = "تعذّر الاتصال بـ Compiler Explorer. جرّب زرار 🔬 Debug (بيشتغل offline)."; }
          } finally { btn.disabled = false; btn.textContent = orig; }
        });
      }
    });
    // compiled views: tabs
    $$(".compiled").forEach((cv) => {
      const tabs = $$(".cv-tab", cv), panes = $$(".cv-pane", cv);
      tabs.forEach((t) => t.addEventListener("click", () => {
        tabs.forEach((x) => x.classList.toggle("on", x === t));
        panes.forEach((p) => { p.hidden = p.dataset.k !== t.dataset.k; });
      }));
    });
  }

  /* ---------------- navigation ---------------- */
  const sections = $$("main .section[data-nav]");
  const nav = $("#nav");
  const navLinks = new Map();
  function initNav() {
    if (!nav) return;
    let part = null;
    sections.forEach((s) => {
      if (s.dataset.part && s.dataset.part !== part) { part = s.dataset.part; const h = document.createElement("div"); h.className = "nav-part"; h.textContent = part; nav.appendChild(h); }
      const a = document.createElement("a"); a.href = "#" + s.id; a.dataset.target = s.id;
      const idx = s.querySelector(".section-index");
      a.innerHTML = '<span class="num"></span><span class="ico"></span><span class="txt"></span><span class="tick">✓</span>';
      a.querySelector(".num").textContent = idx ? idx.textContent.trim() : "";
      a.querySelector(".ico").textContent = s.dataset.icon || "•";
      a.querySelector(".txt").textContent = s.dataset.nav || s.id;
      nav.appendChild(a); navLinks.set(s.id, a);
    });
  }
  function initActive() {
    const upd = () => { let cur = null; sections.forEach((s) => { if (s.getBoundingClientRect().top <= 150) cur = s.id; }); navLinks.forEach((l, id) => l.classList.toggle("active", id === cur)); };
    let tk = false;
    window.addEventListener("scroll", () => { if (tk) return; tk = true; requestAnimationFrame(() => { upd(); tk = false; }); }, { passive: true });
    upd();
  }
  function initSearch() {
    const input = $("#navSearch"); if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      $$(".nav a").forEach((l) => { const s = document.getElementById(l.dataset.target); const hay = (l.textContent + " " + (s ? s.dataset.keywords || "" : "")).toLowerCase(); l.classList.toggle("hide", q !== "" && hay.indexOf(q) === -1); });
      $$(".nav .nav-part").forEach((p) => p.classList.toggle("hide", q !== ""));
    });
  }
  function initDrawer() {
    const sb = $("#sidebar"), scrim = $("#scrim"), mb = $("#menuBtn"), cb = $("#sidebarClose");
    const open = () => { sb.classList.add("open"); scrim.classList.add("show"); mb.setAttribute("aria-expanded", "true"); document.body.style.overflow = "hidden"; };
    const close = () => { sb.classList.remove("open"); scrim.classList.remove("show"); mb.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; };
    if (mb) mb.addEventListener("click", open); if (cb) cb.addEventListener("click", close); if (scrim) scrim.addEventListener("click", close);
    if (nav) nav.addEventListener("click", (e) => { if (e.target.closest("a") && window.innerWidth <= 980) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sb.classList.contains("open")) close(); });
  }

  /* ---------------- progress ---------------- */
  const quizzes = $$(".quiz[data-ex]"), challenges = $$(".challenge[data-ex]"), labChs = $$(".lab-challenge[data-ex]"), reTasks = $$(".re-task[data-ex]"), projects = $$(".project[data-ex]");
  const total = quizzes.length + challenges.length + labChs.length + reTasks.length + projects.length;
  const done = (el, bag) => !!state[bag][el.dataset.ex];
  function solved() {
    return quizzes.filter((q) => done(q, "quizzes")).length + challenges.filter((c) => done(c, "challenges")).length +
      labChs.filter((l) => done(l, "labs")).length + reTasks.filter((r) => done(r, "re")).length + projects.filter((p) => done(p, "projects")).length;
  }
  function updateProgress() {
    const n = solved(), ratio = total ? n / total : 0, pct = Math.round(ratio * 100);
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set("#topProgress", pct + "%"); set("#sidePercent", pct + "%"); set("#sideCount", n + " من " + total + " تمرين");
    set("#finalSolved", n); set("#finalTotal", total);
    const tr = $("#topRing"), sr = $("#sideRing");
    if (tr) tr.style.strokeDashoffset = String(63 - 63 * ratio);
    if (sr) sr.style.strokeDashoffset = String(163 - 163 * ratio);
    let ds = 0;
    sections.forEach((s) => {
      const items = [[".quiz[data-ex]", "quizzes"], [".challenge[data-ex]", "challenges"], [".lab-challenge[data-ex]", "labs"], [".re-task[data-ex]", "re"], [".project[data-ex]", "projects"]];
      let any = false, all = true;
      items.forEach(([sel, bag]) => $$(sel, s).forEach((el) => { any = true; if (!state[bag][el.dataset.ex]) all = false; }));
      if (!any) return;
      if (all) ds++;
      const l = navLinks.get(s.id); if (l) l.classList.toggle("done", all);
    });
    set("#finalSections", ds);
    if (ratio === 1 && total && !state.celebrated) { state.celebrated = true; saveState(); confetti(); toast("🎉 مبروك! خلصت كل تمارين الكورس", "🏆"); }
  }

  /* ---------------- quizzes ---------------- */
  function initQuizzes() {
    quizzes.forEach((q) => {
      const id = q.dataset.ex, ans = Number(q.dataset.answer), opts = $$(".option", q), fb = q.querySelector(".quiz-feedback");
      const markCorrect = (o) => { o.classList.add("correct"); const m = o.querySelector(".mark"); if (m) m.textContent = "✓"; };
      if (state.quizzes[id]) {
        q.classList.add("solved");
        opts.forEach((o) => { o.disabled = true; if (Number(o.dataset.i) === ans) markCorrect(o); });
        if (fb) { fb.className = "quiz-feedback show good"; fb.innerHTML = "<strong>تم حلها قبل كده ✓</strong> " + (fb.dataset.good || ""); }
      }
      opts.forEach((o) => o.addEventListener("click", () => {
        if (q.classList.contains("solved") || o.disabled) return;
        if (Number(o.dataset.i) === ans) {
          opts.forEach((x) => { x.disabled = true; x.classList.remove("wrong"); });
          markCorrect(o); q.classList.add("solved");
          if (fb) { fb.className = "quiz-feedback show good"; fb.innerHTML = "<strong>إجابة صحيحة ✅</strong> " + (fb.dataset.good || ""); highlightAll(fb); }
          state.quizzes[id] = true; saveState(); updateProgress(); toast("إجابة صحيحة — اتسجلت", "✅");
        } else {
          o.classList.add("wrong"); o.disabled = true;
          const m = o.querySelector(".mark"); if (m) m.textContent = "✗";
          if (fb) { fb.className = "quiz-feedback show bad"; fb.innerHTML = "<strong>مش صح ❌</strong> " + (fb.dataset.bad || ""); highlightAll(fb); }
        }
      }));
    });
  }

  /* ---------------- code challenges (graded on Compiler Explorer) ---------------- */
  function initChallenges() {
    challenges.forEach((ch) => {
      const id = ch.dataset.ex, lang = ch.dataset.lang || "nasm", io = ch.hasAttribute("data-io");
      const ed = ch.querySelector("textarea"), runBtn = ch.querySelector(".btn-run"), resetBtn = ch.querySelector(".btn-reset"), solBtn = ch.querySelector(".btn-solution"), dbgBtn = ch.querySelector(".btn-dbg");
      const status = ch.querySelector(".ch-status"), con = ch.querySelector(".console"), outPre = con ? con.querySelector("pre") : null;
      const expected = (ch.querySelector(".expected") || {}).textContent, solution = (ch.querySelector(".solution") || { textContent: "" }).textContent;
      const stdin = (ch.querySelector(".stdin") || { textContent: "" }).textContent;
      const starter = ed ? ed.value : "";
      let solWrap = null, running = false;
      if (ed && state.code[id]) ed.value = state.code[id];
      const grow = () => { if (!ed) return; ed.style.height = "auto"; ed.style.height = Math.min(Math.max(ed.scrollHeight, 150), 620) + "px"; };
      grow();
      const setStatus = (t, c) => { if (status) { status.textContent = t; status.className = "ch-status" + (c ? " " + c : ""); } };
      if (state.challenges[id]) { ch.classList.add("done"); setStatus("تم الحل ✓", "pass"); }
      async function run() {
        if (!ed || running) return;
        running = true;
        const orig = runBtn.innerHTML; runBtn.disabled = true; runBtn.innerHTML = '<span class="spinner"></span> بيشتغل…';
        con.hidden = false; outPre.classList.remove("err", "warn"); outPre.textContent = "⏳ " + (lang === "c" ? "gcc" : "NASM") + " بيشتغل على Compiler Explorer…";
        setStatus("بيشغّل…", ""); state.code[id] = ed.value; saveState();
        try {
          const r = await runCode(ed.value, lang, stdin, io);
          if (r.compileError) { renderResult(outPre, r); setStatus("❌ فيه خطأ — اقرا رسالة الـ assembler", "fail"); }
          else if (norm(r.out) === norm(expected)) {
            renderResult(outPre, r); ch.classList.add("done"); setStatus("✅ مخرجات صحيحة", "pass");
            if (!state.challenges[id]) { state.challenges[id] = true; saveState(); updateProgress(); toast("تحدي مكتمل! +1", "🎯"); }
          } else {
            outPre.textContent = (r.out || "(مفيش مخرجات)") + (r.err && r.err.trim() ? "\n\n[stderr]\n" + r.err : "") + (r.exitCode ? "\n\n" + exitNote(r.exitCode) : "") + "\n\n─── المتوقع ───\n" + norm(expected);
            setStatus("❌ المخرجات مختلفة — قارن سطر بسطر", "fail");
          }
        } catch (e) {
          outPre.classList.add("err");
          outPre.textContent = "تعذّر الاتصال بـ Compiler Explorer (godbolt.org).\nاتأكد من الإنترنت — أو جرّب الكود في المعمل بزرار 🔬 Debug.";
          setStatus("❌ فشل الاتصال", "fail");
        } finally { running = false; runBtn.disabled = false; runBtn.innerHTML = orig; }
      }
      if (runBtn) runBtn.addEventListener("click", run);
      if (dbgBtn) dbgBtn.addEventListener("click", () => openDebug(ch.querySelector(".ch-actions"), ed.value, io, ""));
      if (solBtn) solBtn.addEventListener("click", () => {
        if (!solWrap) {
          solWrap = document.createElement("div"); solWrap.className = "solution-wrap";
          solWrap.innerHTML = '<div class="sol-head">💡 الحل المقترح (اتشغّل واتحقق من مخرجاته)</div><pre><code class="language-' + (lang === "c" ? "c" : "nasm") + '"></code></pre>';
          const c = solWrap.querySelector("code"); c.textContent = solution.replace(/^\n+|\s+$/g, ""); highlightAll(solWrap);
          ch.querySelector(".ch-actions").insertAdjacentElement("afterend", solWrap); solWrap.hidden = true;
        }
        solWrap.hidden = !solWrap.hidden; solBtn.textContent = solWrap.hidden ? "اعرض الحل" : "إخفاء الحل";
      });
      if (resetBtn) resetBtn.addEventListener("click", () => { ed.value = starter; state.code[id] = starter; saveState(); grow(); setStatus("", ""); con.hidden = true; toast("تمت استعادة الكود الأصلي", "↺"); });
      if (ed) {
        let tm = null;
        ed.addEventListener("input", () => { grow(); clearTimeout(tm); tm = setTimeout(() => { state.code[id] = ed.value; saveState(); }, 300); });
        ed.addEventListener("keydown", (e) => {
          if (e.key === "Tab") { e.preventDefault(); ed.setRangeText("    ", ed.selectionStart, ed.selectionEnd, "end"); return; }
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); return; }
          if (e.key === "Enter" && ed.selectionStart === ed.selectionEnd) {
            const pos = ed.selectionStart, line = ed.value.slice(0, pos).split("\n").pop();
            const ind = (line.match(/^[ \t]*/) || [""])[0];
            if (ind) { e.preventDefault(); ed.setRangeText("\n" + ind, pos, pos, "end"); }
          }
        });
      }
    });
  }

  /* ---------------- RE tasks (answers stored as SHA-256) ---------------- */
  function sha256(str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = Array.from(new TextEncoder().encode(str));
    const l = bytes.length * 8;
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (l >>> (i * 8)) & 0xff);
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = H.map((x, i) => (x + [a, b, c, d, e, f, g, h][i]) | 0);
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }
  function normAnswer(v, kind, bits) {
    v = String(v).trim();
    if (kind === "int") {
      const n = window.AsmLab.parseNum(v.replace(/^\+/, ""), 0);
      if (n === null) return null;
      return E.U(n, bits || 64).toString();
    }
    if (kind === "hex") return v.toLowerCase().replace(/0x/g, "").replace(/[\s,]/g, "");
    if (kind === "str") return v.replace(/^["']|["']$/g, "");
    return v.toLowerCase().replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, " ").trim();
  }
  function initRE() {
    reTasks.forEach((t) => {
      const id = t.dataset.ex, hashes = (t.dataset.hash || "").split(","), kind = t.dataset.norm || "text", bits = Number(t.dataset.bits || 64);
      const input = t.querySelector("input"), btn = t.querySelector(".re-check"), msg = t.querySelector(".re-msg"), ex = t.querySelector(".re-explain");
      const solvedUI = () => { t.classList.add("done"); msg.className = "re-msg ok"; msg.textContent = "✅ صح! اتسجلت."; if (ex) { ex.hidden = false; } };
      if (state.re[id]) { solvedUI(); msg.textContent = "✅ تم حلها قبل كده"; }
      const live = t.dataset.live ? JSON.parse(t.dataset.live) : null;
      const liveOk = (raw) => {        // keygen-style tasks: run the code in the emulator with YOUR key
        let v = kind === "int" ? normAnswer(raw, "int", bits) : String(raw).trim();
        if (v === null || v === "" || v.length > 200) return false;
        if (kind !== "int") v = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');   // escape for the "…" string literal in the setup
        try {
          const prog = E.assemble(live.src, { entry: live.entry || undefined });
          if (!prog.ok) return false;
          return live.tests.every((tt) => E.runTest(prog, { setup: tt.setup.split("{ans}").join(v), expect: tt.expect.split("{ans}").join(v) }, { limit: 500000 }).pass);
        } catch (e) { return false; }
      };
      const check = () => {
        if (live && input.value.trim() && liveOk(input.value)) {
          solvedUI(); msg.textContent = "✅ الـ key اشتغل في المعمل! اتسجلت.";
          if (!state.re[id]) { state.re[id] = true; saveState(); updateProgress(); toast("Crackme اتكسر! 🔓", "🔓"); }
          return;
        }
        const n = normAnswer(input.value, kind, bits);
        if (n === null || n === "") { msg.className = "re-msg bad"; msg.textContent = kind === "int" ? "اكتب رقم (عشري أو hex زي 0x41)" : "اكتب إجابة"; return; }
        if (hashes.includes(sha256(id + ":" + n))) {
          solvedUI();
          if (!state.re[id]) { state.re[id] = true; saveState(); updateProgress(); toast("مهمة RE اتحلت! 🔓", "🔓"); }
        } else { msg.className = "re-msg bad"; msg.textContent = "❌ مش هي — ارجع للكود وتتبّع القيم تاني (المعمل هيساعدك)"; t.animate && t.animate([{ transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "none" }], { duration: 260 }); }
      };
      if (btn) btn.addEventListener("click", check);
      if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
    });
  }

  /* ---------------- projects ---------------- */
  function initProjects() {
    $$(".project-head").forEach((h) => {
      const tg = () => { const p = h.parentElement; const o = p.classList.toggle("open"); h.setAttribute("aria-expanded", o ? "true" : "false"); };
      h.addEventListener("click", tg); h.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tg(); } });
    });
    projects.forEach((p) => {
      const id = p.dataset.ex, btn = p.querySelector(".btn-done");
      const sync = () => { const d = !!state.projects[id]; p.classList.toggle("done", d); if (btn) btn.textContent = d ? "✓ المشروع مكتمل (اضغط للتراجع)" : "علّم المشروع كمكتمل"; };
      sync();
      if (btn) btn.addEventListener("click", () => { state.projects[id] = !state.projects[id]; saveState(); sync(); updateProgress(); if (state.projects[id]) toast("مشروع مكتمل! 🛠️", "🏗️"); });
    });
  }

  /* ---------------- cheat sheet search ---------------- */
  function initCheat() {
    const input = $("#cheatSearch"), grid = $("#cheatGrid"); if (!input || !grid) return;
    input.addEventListener("input", () => { const q = input.value.trim().toLowerCase(); $$(".cheat-card", grid).forEach((c) => c.classList.toggle("hide", q !== "" && c.textContent.toLowerCase().indexOf(q) === -1)); });
  }

  /* ---------------- scroll ui / reveal / counters / charts ---------------- */
  function initScroll() {
    const bar = $("#scrollBar");
    const on = () => { const d = document.documentElement, max = d.scrollHeight - d.clientHeight; if (bar) bar.style.width = ((max > 0 ? Math.min(1, d.scrollTop / max) : 0) * 100).toFixed(2) + "%"; };
    window.addEventListener("scroll", on, { passive: true }); on();
  }
  function observe(els, cls, th) {
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || REDUCED) { els.forEach((e) => e.classList.add(cls)); return; }
    const o = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) { x.target.classList.add(cls); o.unobserve(x.target); } }), { threshold: th || 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => o.observe(e));
  }
  function initCounters() {
    const els = $$(".stat b[data-count]");
    const anim = (el) => { const t = Number(el.dataset.count) || 0; if (REDUCED) { el.textContent = t; return; } const s = performance.now(); const tick = (n) => { const p = Math.min(1, (n - s) / 1100); el.textContent = Math.round(t * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); };
    if (!("IntersectionObserver" in window)) { els.forEach(anim); return; }
    const o = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) { anim(x.target); o.unobserve(x.target); } }), { threshold: 0.6 });
    els.forEach((e) => o.observe(e));
  }
  function initReset() {
    const b = $("#resetProgress"); if (!b) return;
    b.addEventListener("click", () => {
      if (!window.confirm("متأكد؟ هيتم مسح كل إجاباتك والكود المحفوظ.")) return;
      ["quizzes", "challenges", "labs", "re", "code", "projects"].forEach((k) => { state[k] = {}; }); state.celebrated = false; saveState(); window.location.reload();
    });
  }
  function confetti() {
    if (REDUCED) return;
    const cv = $("#confetti"), ctx = cv && cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = ["#3fd0e8", "#b48cff", "#ffb454", "#4ade80", "#ff6b81", "#ffffff"];
    const ps = Array.from({ length: 160 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 260, y: innerHeight * 0.28 + Math.random() * 80, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 12 - 3, s: 5 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3 }));
    const st = performance.now();
    const draw = (now) => {
      const el = now - st; ctx.clearRect(0, 0, innerWidth, innerHeight);
      ps.forEach((p) => { p.vy += 0.24; p.vx *= 0.995; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - el / 4200); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore(); });
      if (el < 4200) requestAnimationFrame(draw); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    requestAnimationFrame(draw);
  }
  function initShortcuts() {
    const ns = $("#navSearch");
    document.addEventListener("keydown", (e) => {
      const el = document.activeElement, typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); if (innerWidth <= 980) { $("#sidebar").classList.add("open"); $("#scrim").classList.add("show"); } if (ns) ns.focus(); }
      if (e.key === "Escape" && el === ns) { ns.value = ""; ns.dispatchEvent(new Event("input")); ns.blur(); }
    });
    const pb = $("#printBtn"); if (pb) pb.addEventListener("click", () => window.print());
  }

  function boot() {
    initTheme(); initNav(); initActive(); initSearch(); initDrawer();
    initCodeBlocks(); initQuizzes(); initChallenges(); initRE(); initProjects(); initCheat();
    initScroll(); observe($$(".reveal"), "in"); observe($$(".chart"), "in", 0.3); initCounters(); initReset(); initShortcuts();
    if (window.AsmLab) window.AsmLab.initAll({ state, save: saveState, progress: updateProgress, toast, ioLib: IO_LIB, highlightAsm });
    updateProgress();
    requestAnimationFrame(() => $$(".hero .reveal").forEach((el) => el.classList.add("in")));
  }
  window.AsmCourse = { highlightAsm, highlightC, sha256, normAnswer };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
