/* ============================================================
   ASM Mastery — interactive layer
   - Lab: an x64dbg-style debugger over AsmEmu (step/back/run/
     breakpoints, registers, flags, stack, memory, explanations)
   - Lab challenges (auto-graded in the emulator)
   - Widgets: base converter, register explorer, flags calculator,
     encoder playground, endianness, addressing calculator
   - CFG graph view (IDA-like) for any assembly listing
   ============================================================ */
(function () {
  "use strict";
  const E = window.AsmEmu;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const h16 = (v) => E.U(BigInt(v), 64).toString(16).toUpperCase().padStart(16, "0");
  const hexShort = (v) => "0x" + E.U(BigInt(v), 64).toString(16).toUpperCase();
  const dimZeros = (s) => { const m = /^(0*)(.*)$/.exec(s); const z = m[2] === "" ? m[1].slice(0, -1) : m[1]; return '<span class="z">' + z + "</span>" + s.slice(z.length); };
  const ORDER = ["rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rbp", "rsp", "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15"];
  const FLAG_HELP = {
    CF: "Carry — حصل carry/borrow برا آخر bit (overflow للأرقام unsigned)",
    PF: "Parity — عدد الـ 1 في أول byte من النتيجة زوجي",
    AF: "Adjust — carry من bit 3 لـ bit 4 (للـ BCD، نادر)",
    ZF: "Zero — النتيجة = صفر",
    SF: "Sign — أعلى bit في النتيجة = 1 (سالبة لو signed)",
    DF: "Direction — 1 = الـ string instructions بتمشي لورا",
    OF: "Overflow — overflow للأرقام signed",
    TF: "Trap — single-step (الـ debuggers بتستخدمه)"
  };
  let API = null;           // provided by app.js: {state, save, progress, toast, highlightAsm, ioLib}

  /* ================================================================ LAB */
  class Lab {
    constructor(el) {
      this.el = el;
      this.id = el.dataset.ex || el.dataset.id || null;
      this.title = el.dataset.title || "";
      this.setup = el.dataset.setup || "";
      this.entry = el.dataset.entry || "";
      this.io = el.hasAttribute("data-io");
      this.isChallenge = el.classList.contains("lab-challenge");
      const srcEl = $("textarea.lab-src", el);
      this.original = srcEl ? srcEl.value.replace(/\s+$/, "") + "\n" : "";
      this.solution = el.querySelector(".lab-solution") ? el.querySelector(".lab-solution").textContent.replace(/^\n+|\s+$/g, "") + "\n" : null;
      this.tests = el.dataset.tests ? JSON.parse(el.dataset.tests) : [];
      this.forbid = (el.dataset.forbid || "").split(",").map((s) => s.trim()).filter(Boolean);
      this.maxIns = el.dataset.maxins ? Number(el.dataset.maxins) : 0;
      this.descHTML = el.querySelector(".lab-desc-src") ? el.querySelector(".lab-desc-src").innerHTML : "";
      this.src = this.original;
      if (this.isChallenge && API && API.state.code[this.id]) this.src = API.state.code[this.id];
      this.bps = new Set();
      this.mode = "debug";
      this.libOpen = false;
      this.openReg = null;
      this.timer = null;
      this.build();
      this.load(this.src);
    }
    /* ---------- skeleton ---------- */
    build() {
      const el = this.el;
      el.innerHTML = "";
      el.insertAdjacentHTML("beforeend",
        '<div class="lab-head"><span class="lab-badge">' + (this.isChallenge ? "LAB · CHALLENGE" : "LAB · x86-64") + '</span>' +
        '<span class="lab-title">' + esc(this.title) + '</span><span class="lab-status">جاهز</span></div>' +
        (this.isChallenge ? '<div class="lab-desc">' + this.descHTML + this.rulesHTML() + "</div>" : "") +
        '<div class="lab-tools">' +
        '<button class="lab-btn pri" data-a="run" title="Run (F9)">▶ Run <kbd>F9</kbd></button>' +
        '<button class="lab-btn" data-a="into" title="Step Into (F7)">⤵ Step <kbd>F7</kbd></button>' +
        '<button class="lab-btn" data-a="over" title="Step Over (F8)">⤼ Over <kbd>F8</kbd></button>' +
        '<button class="lab-btn" data-a="back" title="Step Back (Shift+F7)">⤺ Back</button>' +
        '<button class="lab-btn" data-a="anim" title="Animate">⏵⏵ Animate</button>' +
        '<button class="lab-btn" data-a="reset" title="Restart (Ctrl+F2)">↺ Reset</button>' +
        '<span class="lab-sep"></span>' +
        '<button class="lab-btn" data-a="edit">✎ تعديل الكود</button>' +
        (this.isChallenge ? '<button class="lab-btn chk" data-a="check">✓ تحقق من الحل</button><button class="lab-btn" data-a="sol">💡 الحل</button>' : "") +
        '<span class="lab-steps"></span></div>' +
        '<div class="lab-grid"><div class="lab-code"></div><div class="lab-side">' +
        '<div class="lab-pane-t">Registers <span class="hint">اضغط على register لتفاصيله</span></div><div class="lab-regs"></div>' +
        '<div class="lab-pane-t">RFLAGS</div><div class="lab-flags"></div></div></div>' +
        '<div class="lab-low"><div class="lab-stack"><div class="lab-pane-t">Stack <span class="hint">العناوين الأعلى تحت</span></div><div class="stk-body"></div></div>' +
        '<div class="lab-mem"><div class="lab-pane-t">Memory · data sections</div><div class="mem-body"></div></div></div>' +
        '<div class="lab-explain"></div>' +
        '<div class="lab-console" hidden><div class="cl-h">STDOUT</div><pre></pre></div>' +
        (this.isChallenge ? '<div class="lab-tests" hidden></div><div class="lab-sol" hidden><div class="sh">💡 الحل المرجعي (اتحقق منه في الـ emulator)</div><pre></pre></div>' : ""));
      this.codeEl = $(".lab-code", el);
      this.regsEl = $(".lab-regs", el);
      this.flagsEl = $(".lab-flags", el);
      this.stackEl = $(".stk-body", el);
      this.memEl = $(".mem-body", el);
      this.explainEl = $(".lab-explain", el);
      this.consoleEl = $(".lab-console", el);
      this.statusEl = $(".lab-status", el);
      this.stepsEl = $(".lab-steps", el);
      el.tabIndex = -1;
      $$(".lab-btn", el).forEach((b) => b.addEventListener("click", () => this.action(b.dataset.a)));
      el.addEventListener("keydown", (e) => {
        if (this.mode === "edit") {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); this.action("edit"); }
          return;
        }
        const k = e.key;
        if (k === "F7" && e.shiftKey) { e.preventDefault(); this.action("back"); }
        else if (k === "F7") { e.preventDefault(); this.action("into"); }
        else if (k === "F8") { e.preventDefault(); this.action("over"); }
        else if (k === "F9") { e.preventDefault(); this.action("run"); }
        else if (k === "F2" && e.ctrlKey) { e.preventDefault(); this.action("reset"); }
      });
      el.addEventListener("focusin", () => el.classList.add("focus"));
      el.addEventListener("focusout", () => el.classList.remove("focus"));
      if (this.isChallenge && API && API.state.labs[this.id]) el.classList.add("done");
    }
    rulesHTML() {
      const r = [];
      if (this.tests.length) r.push("الحل بيتجرب على " + this.tests.length + " حالة اختبار");
      if (this.forbid.length) r.push("ممنوع تستخدم: <code>" + this.forbid.join("</code>، <code>") + "</code>");
      if (this.maxIns) r.push("أقصى عدد instructions: <code>" + this.maxIns + "</code>");
      return r.length ? '<div class="rules">📏 ' + r.join(" · ") + "</div>" : "";
    }
    fullSource(src) { return this.io && API && API.ioLib ? src.replace(/\s+$/, "") + "\n\n" + API.ioLib : src; }
    /* ---------- assemble + machine ---------- */
    load(src) {
      this.src = src;
      this.userLines = src.replace(/\s+$/, "").split("\n").length;
      const prog = E.assemble(this.fullSource(src), { entry: this.entry || undefined });
      this.prog = prog;
      if (!prog.ok) { this.machine = null; this.showErrors(prog.errors); return false; }
      try { this.machine = new E.Machine(prog, this.setup); }
      catch (e) { this.machine = null; this.showErrors([{ line: 0, msg: String(e.message || e) }]); return false; }
      this.last = null;
      this.mode = "debug";
      this.renderListing();
      this.render(true);
      this.setStatus("جاهز — اضغط Step (F7) أو Run (F9)", "");
      this.explainEl.innerHTML = this.introText();
      return true;
    }
    introText() {
      const p = this.prog;
      const parts = ['البرنامج اتعمله assemble: <b>' + p.ins.filter((I) => I.line <= this.userLines).length + "</b> instruction"];
      parts.push("، نقطة البداية <code>" + (p.entryName || "أول سطر") + "</code> عند <code>" + hexShort(p.entry) + "</code>");
      if (p.mode === "func") parts.push(" — المعمل بيشغّل الكود كأنه <b>دالة اتنادت بـ call</b>: أول قيمة على الـ stack هي عنوان الرجوع، و<code>ret</code> في الآخر بتنهي البرنامج.");
      else parts.push(" — <code>_start</code> زي برنامج Linux حقيقي: لازم ينتهي بـ <code>exit</code> syscall.");
      if (this.setup) parts.push(' <span class="m">setup: ' + esc(this.setup) + "</span>");
      return parts.join("");
    }
    showErrors(errs) {
      this.mode = "edit";
      this.renderEditor();
      const box = document.createElement("div");
      box.className = "lab-errs";
      box.innerHTML = errs.slice(0, 6).map((e) => (e.line ? "<b>سطر " + e.line + ":</b> " : "") + esc(e.msg)).join("<br>");
      this.codeEl.appendChild(box);
      this.setStatus("فيه أخطاء في الكود", "bad");
      this.regsEl.innerHTML = ""; this.flagsEl.innerHTML = ""; this.stackEl.innerHTML = ""; this.memEl.innerHTML = "";
      this.explainEl.innerHTML = "صلّح الخطأ واضغط <b>⚙ Assemble</b> (أو Ctrl+Enter).";
    }
    setStatus(t, cls) { this.statusEl.textContent = t; this.statusEl.className = "lab-status" + (cls ? " " + cls : ""); }
    /* ---------- listing ---------- */
    renderListing() {
      const p = this.prog, srcLines = this.fullSource(this.src).split("\n");
      const byLine = new Map();
      p.ins.forEach((I) => { if (!byLine.has(I.line)) byLine.set(I.line, []); byLine.get(I.line).push(I); });
      const labByLine = new Map();
      p.labels.forEach((l) => { if (l.sec === "text") { if (!labByLine.has(l.line)) labByLine.set(l.line, []); labByLine.get(l.line).push(l.name); } });
      const rows = [];
      this.rowOf = new Map();
      let inText = true;
      const libStart = this.io ? this.userLines + 1 : Infinity;
      let libCount = 0;
      for (let ln = 1; ln <= srcLines.length; ln++) {
        const raw = srcLines[ln - 1];
        const st = raw.trim();
        if (/^\[?\s*(section|segment)\b/i.test(st)) { inText = /\.text|\.code/i.test(st); continue; }
        const isLib = ln >= libStart;
        if (isLib && !this.libOpen) { if (byLine.has(ln)) libCount += byLine.get(ln).length; continue; }
        if (!inText) continue;
        const cls = isLib ? " lib" : "";
        (labByLine.get(ln) || []).forEach((name) => rows.push('<div class="lab-row lbl' + cls + '"><span></span><span class="tx">' + esc(name) + ":</span></div>"));
        const list = byLine.get(ln);
        if (list) {
          const cmt = /;(.*)$/.exec(raw);
          list.forEach((I) => {
            const bytes = I.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ").toUpperCase();
            const brk = this.bps.has(I.addr) ? " brk" : "";
            rows.push('<div class="lab-row' + cls + brk + '" data-addr="' + I.addr.toString() + '"><span class="bp" title="Breakpoint (F2)"></span><span class="ad">' +
              I.addr.toString(16).toUpperCase().padStart(6, "0") + '</span><span class="by" title="' + bytes + '">' + bytes + '</span><span class="tx">' +
              esc(I.text) + (cmt && !isLib ? ' <span class="c">;' + esc(cmt[1]) + "</span>" : "") + "</span></div>");
          });
        } else if (!isLib && /^;/.test(st)) {
          rows.push('<div class="lab-row lbl"><span></span><span class="tx" style="color:#5f7392;font-weight:400;font-style:italic">' + esc(st) + "</span></div>");
        }
      }
      if (this.io && !this.libOpen && libCount) rows.push('<div class="lab-row libfold" data-a="lib"><span></span><span class="tx">▸ io.inc — مكتبة الطباعة (' + libCount + " instruction) — اضغط عشان تفتحها</span></div>");
      if (this.io && this.libOpen) rows.push('<div class="lab-row libfold" data-a="lib"><span></span><span class="tx">▾ اقفل io.inc</span></div>');
      this.codeEl.innerHTML = rows.join("");
      $$(".lab-row[data-addr]", this.codeEl).forEach((r) => {
        this.rowOf.set(r.dataset.addr, r);
        r.querySelector(".bp").addEventListener("click", (e) => {
          e.stopPropagation();
          const a = BigInt(r.dataset.addr);
          if (this.bps.has(a)) this.bps.delete(a); else this.bps.add(a);
          r.classList.toggle("brk", this.bps.has(a));
        });
      });
      const fold = $(".libfold", this.codeEl);
      if (fold) fold.addEventListener("click", () => { this.libOpen = !this.libOpen; this.renderListing(); this.render(false); });
    }
    renderEditor() {
      const lines = this.src.replace(/\n$/, "").split("\n").length;
      this.codeEl.innerHTML = '<div class="lab-edit"><div class="ln"></div><textarea spellcheck="false" aria-label="محرر الكود"></textarea></div>';
      const ta = $("textarea", this.codeEl), ln = $(".ln", this.codeEl);
      ta.value = this.src;
      const nums = () => { const n = ta.value.split("\n").length; ln.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n"); };
      nums();
      ta.addEventListener("input", () => { nums(); this.src = ta.value; if (this.isChallenge && API) { API.state.code[this.id] = ta.value; API.save(); } });
      ta.addEventListener("scroll", () => { ln.scrollTop = ta.scrollTop; });
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end"); }
      });
      const b = $('[data-a="edit"]', this.el);
      if (b) b.textContent = "⚙ Assemble";
      this.toggleRunButtons(false);
      setTimeout(() => ta.focus({ preventScroll: true }), 30);
      void lines;
    }
    toggleRunButtons(on) { ["run", "into", "over", "back", "anim", "reset"].forEach((a) => { const b = $('[data-a="' + a + '"]', this.el); if (b) b.disabled = !on; }); }
    /* ---------- actions ---------- */
    action(a) {
      if (a === "edit") {
        if (this.mode === "edit") {
          const ta = $("textarea", this.codeEl);
          if (ta) this.src = ta.value;
          this.stopAnim();
          if (this.load(this.src)) { const b = $('[data-a="edit"]', this.el); b.textContent = "✎ تعديل الكود"; this.toggleRunButtons(true); }
        } else {
          this.stopAnim();
          this.mode = "edit";
          this.renderEditor();
          this.setStatus("وضع التعديل — Ctrl+Enter للـ assemble", "");
        }
        return;
      }
      if (a === "check") { this.check(); return; }
      if (a === "sol") { this.toggleSolution(); return; }
      if (!this.machine || this.mode === "edit") return;
      const m = this.machine;
      if (a !== "anim") this.stopAnim();
      if (a === "reset") { this.load(this.src); return; }
      if (a === "back") {
        if (m.back()) { this.last = null; this.render(true); this.setStatus("رجعت خطوة لورا ⤺", ""); this.explainEl.innerHTML = "رجعنا للحالة اللي قبل الـ instruction دي — نفّذها تاني عشان تشوف اللي بيحصل."; }
        else this.setStatus("أنت في أول البرنامج", "");
        return;
      }
      if (m.halted) { this.setStatus("البرنامج خلص — اضغط Reset", m.status && m.status.ok ? "ok" : "bad"); return; }
      if (a === "into") { this.last = m.step(); this.after(); return; }
      if (a === "over") {
        const I = this.prog.byAddr.get(m.rip);
        if (I && (I.form === "call" || I.form === "call_ind")) {
          const ret = I.addr + BigInt(I.len), sp = m.regs[4];
          let n = 0, res = null;
          while (!m.halted && n < 200000) {
            res = m.step(); n++;
            if (res.pause) break;
            if (m.rip === ret && m.regs[4] === sp) break;
            if (n > 1 && this.bps.has(m.rip)) break;
          }
          this.last = res; this.after(n > 1 ? "Step Over: اتنفذت الدالة كلها (" + n + " instruction)" : null); return;
        }
        this.last = m.step(); this.after(); return;
      }
      if (a === "run") {
        const r = m.run(200000, this.bps);
        this.last = r.last;
        this.after(r.breakpoint ? "وقفنا عند breakpoint ●" : r.limit ? m.status.msg : null);
        return;
      }
      if (a === "anim") {
        if (this.timer) { this.stopAnim(); return; }
        const b = $('[data-a="anim"]', this.el);
        b.textContent = "⏸ Stop";
        const tick = () => {
          if (m.halted) { this.stopAnim(); return; }
          this.last = m.step(); this.after();
          if (this.last && this.last.pause) { this.stopAnim(); return; }
          if (this.bps.has(m.rip)) { this.stopAnim(); this.setStatus("وقفنا عند breakpoint ●", "pause"); return; }
          this.timer = setTimeout(tick, 420);
        };
        tick();
      }
    }
    stopAnim() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } const b = $('[data-a="anim"]', this.el); if (b) b.textContent = "⏵⏵ Animate"; }
    after(note) {
      const m = this.machine, res = this.last;
      this.render(false, res);
      if (m.halted) {
        const st = m.status;
        this.setStatus(st.ok ? "✓ " + (st.kind === "exit" ? "exit(" + st.code + ")" : st.kind === "return" ? "ret → رجعت للـ caller" : "خلص") : "✗ " + st.kind.toUpperCase(), st.ok ? "ok" : "bad");
        this.explainEl.innerHTML = (res && res.ins && !res.fault ? this.explain(res) + "<br>" : "") + (st.ok ? "🏁 " : "💥 ") + esc(st.msg);
        if (!st.ok && res && res.ins) { const r = this.rowOf.get(res.ins.addr.toString()); if (r) r.classList.add("faulted"); }
        return;
      }
      if (res && res.pause) this.setStatus("⏸ int3 — Breakpoint", "pause");
      else this.setStatus(note || "متوقف عند " + hexShort(m.rip), note ? "pause" : "run");
      this.explainEl.innerHTML = (note ? "<b>" + esc(note) + "</b><br>" : "") + (res && res.ins ? this.explain(res) : "") + (res && res.pause ? "<br>⏸ " + esc(res.pause.msg) : "");
    }
    /* ---------- explanation of one step ---------- */
    explain(res) {
      const m = this.machine, I = res.ins, info = res.info || {}, snap = res.snap;
      const out = ['<span class="ins">' + esc(I.text) + "</span>"];
      const sym = (a) => { if (a === E.EXIT_ADDR) return "الـ caller"; const s = this.prog.symbolize(a); return s ? "<code>" + esc(s) + "</code>" : "<code>" + hexShort(a) + "</code>"; };
      const f = I.form, mn = I.mn;
      if (f === "jcc") {
        out.push("الشرط <b>" + mn + "</b> معناه <span class=\"m\">" + E.CC_RULE[I.cc] + "</span> → " +
          (info.taken ? '<span class="yes">اتحقق ✓ القفز حصل</span> لـ ' + sym(I.target) : '<span class="no">مش متحقق ✗</span> فكمّلنا للـ instruction اللي بعدها'));
      } else if (f === "jmp" || f === "jmp_ind") out.push("قفز من غير شرط → " + sym(m.rip));
      else if (f === "call" || f === "call_ind") out.push("<b>call</b> = <span class=\"m\">push " + hexShort(snap.rip + BigInt(I.len)) + "</span> (عنوان الرجوع) + قفز لـ " + sym(m.rip));
      else if (f === "ret") out.push("<b>ret</b> = <span class=\"m\">pop rip</span> → رجعنا لـ " + sym(m.rip));
      else if (f === "loop") out.push(mn === "jrcxz" || mn === "jecxz" ? (info.taken ? '<span class="yes">rcx = 0 → قفز</span>' : '<span class="no">rcx ≠ 0 → مفيش قفز</span>') :
        "<span class=\"m\">rcx--</span> → rcx = " + m.regs[1] + (info.taken ? ' <span class="yes">≠ 0 → رجعنا للـ loop</span>' : ' <span class="no">→ الـ loop خلصت</span>'));
      else if (mn === "cmp") out.push("<b>cmp</b> بيحسب <span class=\"m\">" + hexShort(info.alu.a) + " − " + hexShort(info.alu.b) + " = " + hexShort(info.alu.res) + "</span> ويرمي النتيجة — بيغيّر الـ flags بس");
      else if (mn === "test") out.push("<b>test</b> بيحسب <span class=\"m\">" + hexShort(info.alu.a) + " AND " + hexShort(info.alu.b) + " = " + hexShort(info.alu.res) + "</span> ويرمي النتيجة — بيغيّر الـ flags بس");
      else if (f === "lea") out.push("<b>lea</b> حسبت العنوان <span class=\"m\">" + hexShort(info.addr) + "</span> من غير ما تقرا الذاكرة");
      else if (f === "setcc" || f === "cmovcc") out.push("الشرط <span class=\"m\">" + E.CC_RULE[I.cc] + "</span> " + (info.cond && info.cond.val ? '<span class="yes">متحقق</span>' : '<span class="no">مش متحقق</span>'));
      if (info.sys) out.push("🐧 syscall: <span class=\"m\">" + esc(info.sys) + "</span>");
      if (info.reps !== undefined) out.push("اتكررت <b>" + info.reps + "</b> مرة");
      if (info.note) out.push(esc(info.note));
      // register changes
      const ch = [];
      for (let i = 0; i < 16; i++) if (snap.regs[i] !== m.regs[i]) ch.push('<span class="ch">' + E.R64[i] + " = " + hexShort(m.regs[i]) + "</span>");
      if (ch.length) out.push("✎ " + ch.join(" ، "));
      (res.writes || []).slice(0, 4).forEach((w) => out.push('✎ <span class="ch">[' + hexShort(w.addr) + "] ← " + hexShort(w.val) + " (" + (w.n * 8) + "-bit)</span>"));
      const fl = [];
      ["CF", "PF", "AF", "ZF", "SF", "DF", "OF"].forEach((k) => {
        const b = { CF: 0, PF: 2, AF: 4, ZF: 6, SF: 7, DF: 10, OF: 11 }[k];
        const was = (snap.fl >> b) & 1, now = (m.fl >> b) & 1, und = (m.undef >> b) & 1;
        if (was !== now || ((snap.undef >> b) & 1) !== und) fl.push(k + "=" + (und ? "?" : now));
      });
      if (fl.length) out.push("🚩 <span class=\"m\">" + fl.join(" ") + "</span>");
      return out.join(" — ");
    }
    /* ---------- render panels ---------- */
    render(fresh, res) {
      const m = this.machine;
      if (!m) return;
      const snap = res && res.snap;
      // current row
      $$(".lab-row.cur,.lab-row.faulted", this.codeEl).forEach((r) => r.classList.remove("cur", "faulted"));
      const cur = this.rowOf.get(m.rip.toString());
      if (cur) {
        cur.classList.add("cur");
        const box = this.codeEl, top = cur.offsetTop, h = box.clientHeight;
        if (top < box.scrollTop + 20 || top > box.scrollTop + h - 40) box.scrollTop = Math.max(0, top - h / 3);
      } else if (this.io && !this.libOpen && m.rip >= E.TEXT_BASE && m.rip < this.prog.textEnd) {
        const fold = $(".libfold .tx", this.codeEl);
        if (fold) fold.textContent = "▸ جوه io.inc (" + (this.prog.symbolize(m.rip) || "") + ") — اضغط عشان تشوف الكود";
      }
      // registers
      const regRows = ORDER.map((n) => {
        const i = E.REG[n].i, v = m.regs[i];
        const chg = snap && snap.regs[i] !== v;
        return '<div class="reg' + (chg ? " chg flash" : "") + '" data-r="' + n + '"><span class="n">' + n.toUpperCase() + '</span><span class="v">' + dimZeros(h16(v)) + "</span></div>" +
          (this.openReg === n ? this.regDetail(n) : "");
      });
      const ripChg = snap ? "" : "";
      regRows.push('<div class="reg wide' + ripChg + '"><span class="n">RIP</span><span class="v">' + dimZeros(h16(m.rip)) + ' <span style="color:#7d8aa3">' + esc(this.prog.symbolize(m.rip) || (m.rip === E.EXIT_ADDR ? "caller" : "")) + "</span></span></div>");
      regRows.push('<div class="reg wide"><span class="n">RFL</span><span class="v">' + dimZeros(h16(BigInt(m.fl))) + "</span></div>");
      this.regsEl.innerHTML = regRows.join("");
      $$(".reg[data-r]", this.regsEl).forEach((r) => r.addEventListener("click", () => { this.openReg = this.openReg === r.dataset.r ? null : r.dataset.r; this.render(false); }));
      // flags
      this.flagsEl.innerHTML = ["CF", "PF", "AF", "ZF", "SF", "DF", "OF", "TF"].map((k) => {
        const b = { CF: 0, PF: 2, AF: 4, ZF: 6, SF: 7, TF: 8, DF: 10, OF: 11 }[k];
        const on = (m.fl >> b) & 1, und = (m.undef >> b) & 1;
        const chg = snap && (((snap.fl >> b) & 1) !== on || ((snap.undef >> b) & 1) !== und);
        return '<span class="flag-chip' + (und ? " undef" : on ? " on" : "") + (chg ? " chg" : "") + '" title="' + esc(FLAG_HELP[k] + (und ? " — القيمة undefined بعد آخر instruction" : "")) + '">' + k + " " + (und ? "?" : on) + "</span>";
      }).join("");
      // stack
      const rows = m.stackView(12, 2);
      const rsp = m.regs[4], rbp = m.regs[5];
      const writes = new Set((res && res.writes || []).map((w) => w.addr.toString()));
      this.stackEl.innerHTML = rows.map((r) => {
        const rel = r.rel === 0 ? "rsp" : (r.rel > 0 ? "rsp+" : "rsp-") + Math.abs(r.rel).toString(16).toUpperCase();
        let note = "", cls = "";
        if (r.addr === rsp) cls += " rsp";
        if (r.addr === rbp) cls += " rbp";
        if (r.rel < 0) cls += " below";
        if (writes.has(r.addr.toString())) cls += " new";
        const v = r.val;
        if (v !== null) {
          if (v === E.EXIT_ADDR) { note = "↩ return → caller"; cls += " ret"; }
          else if (v >= E.TEXT_BASE && v < this.prog.textEnd) { note = "↩ " + (this.prog.symbolize(v) || hexShort(v)); cls += " ret"; }
          else { const s = this.prog.symbolize(v); if (s) note = "→ " + s; else if (v >= m.stack.start && v < m.stack.end) note = "→ stack"; }
        }
        if (r.addr === rbp) note = "← rbp " + note;
        return '<div class="stk-row' + cls + '" title="' + hexShort(r.addr) + '"><span class="sa">' + rel + '</span><span class="sv">' + (v === null ? "??" : h16(v)) + '</span><span class="sn">' + esc(note) + "</span></div>";
      }).join("");
      // memory
      this.renderMem(res);
      // console
      const out = m.output;
      this.consoleEl.hidden = !out;
      $("pre", this.consoleEl).textContent = out;
      this.stepsEl.textContent = "steps: " + m.steps;
      if (fresh) { this.toggleRunButtons(true); }
    }
    regDetail(n) {
      const m = this.machine, R = E.REG[n], v = m.regs[R.i];
      const fam = E.FAMILY[n];
      const parts = fam.slice(1).map((nm) => { const r = E.REG[nm]; return "<b>" + nm + "</b>=" + hexShort(m.getReg(r)); });
      let extra = "";
      const s = this.prog.symbolize(v);
      if (s) extra = " · يشاور على <b>" + esc(s) + "</b>";
      const reg = m.region(v);
      if (reg && reg.r && !reg.x) { const str = m.readCString(v, 40); if (/^[\x20-\x7e]{2,}$/.test(str)) extra += ' · string: <b>"' + esc(str) + '"</b>'; }
      return '<div class="reg-detail">unsigned=' + E.U(v, 64) + " · signed=" + E.S(v, 64) + "<br>" + parts.join(" · ") + extra + "</div>";
    }
    renderMem(res) {
      const m = this.machine, p = this.prog;
      const written = new Set();
      (res && res.writes || []).forEach((w) => { for (let k = 0; k < w.n; k++) written.add((w.addr + BigInt(k)).toString()); });
      const html = [];
      const secs = [["rodata", ".rodata"], ["data", ".data"], ["bss", ".bss"]];
      for (const [k, nm] of secs) {
        const sc = p.secs[k];
        if (!sc.size) continue;
        const labs = p.labels.filter((l) => l.sec === k);
        html.push('<div class="mem-sec"><div class="sh">' + nm + " @ " + hexShort(sc.base) + "</div>");
        if (labs.length) html.push('<div class="mem-labels">' + labs.slice(0, 8).map((l) => "<b>" + esc(l.name) + "</b>=" + hexShort(l.addr)).join(" · ") + "</div>");
        html.push(this.dumpLines(sc.base, Math.min(sc.size, 128), written));
        html.push("</div>");
      }
      if (m.input) { html.push('<div class="mem-sec"><div class="sh">[input] @ ' + hexShort(m.input.start) + "</div>" + this.dumpLines(m.input.start, Math.min(Math.max(m.inputUsed, 16), 64), written) + "</div>"); }
      if (!html.length) html.push('<div class="mem-sec" style="color:#5f7799">مفيش section .data في البرنامج ده</div>');
      this.memEl.innerHTML = html.join("");
    }
    dumpLines(base, n, written) {
      const m = this.machine, out = [];
      for (let off = 0; off < n; off += 8) {
        const bytes = m.peekBytes(base + BigInt(off), Math.min(8, n - off));
        const hx = bytes.map((b, k) => { const a = (base + BigInt(off + k)).toString(); const s = b === null ? "??" : b.toString(16).padStart(2, "0").toUpperCase(); return '<span class="bb' + (written.has(a) ? " w" : "") + '">' + s + "</span>"; }).join(" ");
        const as = bytes.map((b) => (b >= 32 && b < 127 ? esc(String.fromCharCode(b)) : ".")).join("");
        out.push('<div class="mem-line"><span class="o">' + (base + BigInt(off)).toString(16).toUpperCase() + "</span>  " + hx + '  <span class="as">' + as + "</span></div>");
      }
      return out.join("");
    }
    /* ---------- challenges ---------- */
    check() {
      const box = $(".lab-tests", this.el);
      if (this.mode === "edit") { const ta = $("textarea", this.codeEl); if (ta) this.src = ta.value; }
      const src = this.fullSource(this.src);
      const prog = E.assemble(src, { entry: this.entry || undefined });
      box.hidden = false;
      if (!prog.ok) { box.innerHTML = "❌ الكود فيه أخطاء: " + prog.errors.slice(0, 3).map((e) => "سطر " + e.line + ": " + esc(e.msg)).join(" | "); return; }
      const userIns = prog.ins.filter((I) => I.line <= this.userLines);
      const issues = [];
      const used = userIns.filter((I) => this.forbid.includes(I.mn) || (this.forbid.includes("jcc") && I.form === "jcc") || (this.forbid.includes("cmov") && I.form === "cmovcc") || (this.forbid.includes("set") && I.form === "setcc"));
      if (used.length) issues.push("استخدمت instruction ممنوعة: <code>" + used.map((I) => I.mn).join(", ") + "</code>");
      if (this.maxIns && userIns.length > this.maxIns) issues.push("عدد الـ instructions " + userIns.length + " أكبر من المسموح (" + this.maxIns + ")");
      const rows = this.tests.map((t, k) => {
        const r = E.runTest(prog, { setup: t.setup || "", expect: t.expect || "" });
        return { k, t, r };
      });
      const allPass = rows.every((x) => x.r.pass) && !issues.length;
      box.innerHTML = (allPass ? '<b style="color:#4ade80">✅ كل الاختبارات نجحت — ممتاز!</b>' : '<b style="color:#ff8d9d">❌ لسه — بص على الحالات اللي فشلت</b>') +
        (issues.length ? "<div>⚠ " + issues.join("<br>⚠ ") + "</div>" : "") +
        "<table><tr><th>#</th><th>input (setup)</th><th>expected</th><th>result</th></tr>" +
        rows.map(({ k, t, r }) => "<tr><td>" + (k + 1) + "</td><td>" + esc(t.label || t.setup || "—") + "</td><td>" + esc(t.expect) + '</td><td class="' + (r.pass ? "p" : "f") + '">' +
          (r.pass ? "✓ pass" : "✗ " + esc(r.fails.map((x) => x.what + ": got " + x.got + (x.want ? " / want " + x.want : "")).join("; "))) + "</td></tr>").join("") + "</table>";
      if (allPass && API) {
        this.el.classList.add("done");
        if (!API.state.labs[this.id]) { API.state.labs[this.id] = true; API.save(); API.progress(); API.toast("تحدي Lab مكتمل! +1", "🧪"); }
      }
    }
    toggleSolution() {
      const box = $(".lab-sol", this.el);
      if (!box || !this.solution) return;
      box.hidden = !box.hidden;
      $("pre", box).textContent = this.solution;
      if (!box.querySelector(".lab-btn")) {
        const b = document.createElement("button");
        b.className = "lab-btn"; b.style.margin = "0 14px 10px";
        b.textContent = "⇩ حمّل الحل في المعمل";
        b.addEventListener("click", () => { this.stopAnim(); if (this.load(this.solution)) { const eb = $('[data-a="edit"]', this.el); eb.textContent = "✎ تعديل الكود"; this.toggleRunButtons(true); } });
        box.appendChild(b);
      }
    }
  }

  /* ================================================================ WIDGETS */
  function parseNum(raw, bits) {
    const t = String(raw).trim().toLowerCase().replace(/_/g, "");
    if (!t) return null;
    let v;
    const neg = t.startsWith("-");
    const s = neg ? t.slice(1) : t;
    if (/^0x[0-9a-f]+$/.test(s)) v = BigInt(s);
    else if (/^[0-9][0-9a-f]*h$/.test(s)) v = BigInt("0x" + s.slice(0, -1));
    else if (/^0b[01]+$/.test(s)) v = BigInt(s);
    else if (/^\d+$/.test(s)) v = BigInt(s);
    else if (/^'.'$/.test(s)) v = BigInt(s.charCodeAt(1));
    else return null;
    if (neg) v = -v;
    return bits ? E.U(v, bits) : v;
  }

  function wConverter(box) {
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🔢</span><h4>محوّل الأنظمة العددية</h4><span class="w-sub">decimal · hex · binary · signed · bytes</span></div>' +
      '<div class="widget-body"><div class="w-row"><input class="w-in" value="-1" aria-label="رقم"><select class="w-sel"><option value="8">8-bit (byte)</option><option value="16">16-bit (word)</option><option value="32" selected>32-bit (dword)</option><option value="64">64-bit (qword)</option></select></div><div class="w-out"></div></div>';
    const input = $("input", box), width = $("select", box), out = $(".w-out", box);
    const render = () => {
      const bits = Number(width.value);
      const raw = parseNum(input.value, 0);
      if (raw === null) { out.innerHTML = '<div class="bc-err">اكتب رقم عشري (255 أو -1) أو hex (0xff أو 0FFh) أو binary (0b1010) أو حرف (\'A\')</div>'; return; }
      const mod = 1n << BigInt(bits);
      const uv = ((raw % mod) + mod) % mod, sv = uv >= mod >> 1n ? uv - mod : uv;
      const hx = uv.toString(16).toUpperCase().padStart(bits / 4, "0");
      const bin = uv.toString(2).padStart(bits, "0").replace(/(.{4})(?=.)/g, "$1 ");
      const be = hx.match(/../g), le = be.slice().reverse();
      const over = raw !== uv && raw !== sv;
      const chr = bits === 8 && uv >= 32n && uv < 127n ? " = '" + String.fromCharCode(Number(uv)) + "'" : "";
      out.innerHTML =
        '<div class="bc-row"><span>unsigned</span><code>' + uv + chr + "</code></div>" +
        '<div class="bc-row"><span>signed (two\'s complement)</span><code>' + sv + "</code></div>" +
        '<div class="bc-row"><span>hex</span><code>0x' + hx + "</code></div>" +
        '<div class="bc-row"><span>binary</span><code>' + bin + "</code></div>" +
        '<div class="bc-row"><span>bytes في الذاكرة (little-endian)</span><code>' + le.join(" ") + "</code></div>" +
        '<div class="bc-row"><span>NASM</span><code>' + (bits === 8 ? "db" : bits === 16 ? "dw" : bits === 32 ? "dd" : "dq") + " 0x" + hx + "</code></div>" +
        (over ? '<div class="bc-warn">⚠ الرقم ده مش بيكفي في ' + bits + " bit — اتقص (truncate) زي ما الـ CPU بيعمل بالظبط.</div>" : "");
    };
    input.addEventListener("input", render); width.addEventListener("change", render); render();
  }

  function wRegs(box) {
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🧩</span><h4>مستكشف الـ Registers: RAX من جوه</h4><span class="w-sub">جرّب الكتابة بأحجام مختلفة</span></div>' +
      '<div class="widget-body"><div class="w-row"><span class="w-lbl">RAX</span><input class="w-in" value="0x1122334455667788" aria-label="قيمة"><button class="w-btn ghost" data-k="set">mov rax, ←</button></div>' +
      '<div class="rx-bar"></div><div class="rx-scale"><div class="rx-span r64">RAX (64-bit)</div></div><div class="rx-scale"><div class="rx-span r32">EAX (32)</div></div><div class="rx-scale"><div class="rx-span r16">AX (16)</div></div><div class="rx-scale"><div class="rx-span rh">AH</div><div class="rx-span rl">AL</div></div>' +
      '<div class="rx-ops"><button class="w-btn" data-k="eax">mov eax, 0xAAAAAAAA</button><button class="w-btn" data-k="ax">mov ax, 0xBBBB</button><button class="w-btn" data-k="ah">mov ah, 0xCC</button><button class="w-btn" data-k="al">mov al, 0xDD</button><button class="w-btn" data-k="xor">xor eax, eax</button><button class="w-btn" data-k="neg1">mov rax, -1</button></div>' +
      '<div class="rx-log"></div><div class="w-note">لاحظ: الكتابة في <b>EAX</b> (32-bit) بتصفّر النص العالي من RAX كله — لكن الكتابة في <b>AX/AH/AL</b> مش بتلمس الباقي. القاعدة دي بتفسّر ليه الـ compilers بيكتبوا <code>xor eax, eax</code> بدل <code>xor rax, rax</code>.</div></div>';
    let v = 0x1122334455667788n;
    const bar = $(".rx-bar", box), log = $(".rx-log", box), input = $("input", box);
    const draw = (hit, zero) => {
      const hx = v.toString(16).toUpperCase().padStart(16, "0").match(/../g);
      bar.innerHTML = hx.map((b, k) => { const bi = 7 - k; return '<div class="rx-byte' + (hit && hit.includes(bi) ? " hit" : "") + (zero && zero.includes(bi) ? " zeroed" : "") + '">' + b + "<small>byte " + bi + "</small></div>"; }).join("");
    };
    const ops = {
      eax: () => { v = 0xAAAAAAAAn; return [[0, 1, 2, 3], [4, 5, 6, 7], "mov eax, 0xAAAAAAAA → الـ 4 bytes العليا <b>اتصفّرت</b>"]; },
      ax: () => { v = (v & ~0xFFFFn) | 0xBBBBn; return [[0, 1], [], "mov ax, 0xBBBB → اتغير byte 0 و1 بس"]; },
      ah: () => { v = (v & ~0xFF00n) | 0xCC00n; return [[1], [], "mov ah, 0xCC → اتغير byte 1 بس (bits 8–15)"]; },
      al: () => { v = (v & ~0xFFn) | 0xDDn; return [[0], [], "mov al, 0xDD → اتغير byte 0 بس"]; },
      xor: () => { v = 0n; return [[0, 1, 2, 3], [4, 5, 6, 7], "xor eax, eax → rax كله بقى صفر (والـ instruction 2 bytes بس: 31 C0)"]; },
      neg1: () => { v = E.U(-1n, 64); return [[0, 1, 2, 3, 4, 5, 6, 7], [], "mov rax, -1 → كل الـ bits = 1 = 0xFFFFFFFFFFFFFFFF"]; },
      set: () => { const n = parseNum(input.value, 64); if (n === null) return [[], [], "قيمة مش مفهومة"]; v = n; return [[0, 1, 2, 3, 4, 5, 6, 7], [], "rax = " + hexShort(v)]; }
    };
    $$("[data-k]", box).forEach((b) => b.addEventListener("click", () => {
      const [hit, zero, msg] = ops[b.dataset.k]();
      draw(hit, zero);
      log.innerHTML = msg + " &nbsp;→&nbsp; RAX = <b>0x" + v.toString(16).toUpperCase().padStart(16, "0") + "</b> · EAX = 0x" + (v & 0xFFFFFFFFn).toString(16).toUpperCase() + " · AX = 0x" + (v & 0xFFFFn).toString(16).toUpperCase() + " · AH = 0x" + ((v >> 8n) & 0xFFn).toString(16).toUpperCase() + " · AL = 0x" + (v & 0xFFn).toString(16).toUpperCase();
    }));
    draw();
  }

  function wFlags(box) {
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🚩</span><h4>حاسبة الـ Flags وقرارات الـ Jumps</h4><span class="w-sub">نفس الحسابات بتاعة الـ CPU بالظبط</span></div>' +
      '<div class="widget-body"><div class="w-row"><select class="w-sel" data-k="op"><option>cmp</option><option>sub</option><option>add</option><option>test</option><option>and</option><option>or</option><option>xor</option><option>adc</option><option>sbb</option><option>inc</option><option>dec</option><option>neg</option></select>' +
      '<select class="w-sel" data-k="bits"><option value="8">8-bit</option><option value="16">16-bit</option><option value="32" selected>32-bit</option><option value="64">64-bit</option></select>' +
      '<input class="w-in" data-k="a" value="5" aria-label="A"><input class="w-in" data-k="b" value="7" aria-label="B"><label class="w-lbl"><input type="checkbox" data-k="cf"> CF in</label></div>' +
      '<div class="w-out"></div></div>';
    const g = (k) => $('[data-k="' + k + '"]', box);
    const render = () => {
      const op = g("op").value, bits = Number(g("bits").value);
      const a = parseNum(g("a").value, 0), b = parseNum(g("b").value, 0);
      g("b").disabled = ["inc", "dec", "neg"].includes(op);
      const out = $(".w-out", box);
      if (a === null || (b === null && !g("b").disabled)) { out.innerHTML = '<div class="w-err">اكتب أرقام (عشري، hex بـ 0x، أو سالب)</div>'; return; }
      const r = E.alu(op, a, b || 0n, bits, g("cf").checked);
      const ua = E.U(a, bits), ub = E.U(b || 0n, bits);
      const fl = { CF: r.CF, PF: r.PF, AF: r.AF, ZF: r.ZF, SF: r.SF, OF: r.OF };
      const und = r.undef || [];
      const sym = { add: "+", sub: "−", cmp: "−", and: "AND", test: "AND", or: "OR", xor: "XOR", adc: "+ CF +", sbb: "− CF −" }[op];
      const expr = ["inc", "dec", "neg"].includes(op) ? op + " " + hexShort(ua) : hexShort(ua) + " " + sym + " " + hexShort(ub);
      let html = '<div class="fc-res">' +
        '<div class="fc-box"><div class="k">' + (r.writes ? "RESULT" : "RESULT (بيترمي — flags بس)") + '</div><div class="v">' + hexShort(r.res) + "</div></div>" +
        '<div class="fc-box"><div class="k">UNSIGNED</div><div class="v">' + ua + " " + sym + " " + (["inc", "dec", "neg"].includes(op) ? "" : ub) + " → " + r.res + "</div></div>" +
        '<div class="fc-box"><div class="k">SIGNED</div><div class="v">' + E.S(ua, bits) + (["inc", "dec", "neg"].includes(op) ? "" : " " + sym + " " + E.S(ub, bits)) + " → " + E.S(r.res, bits) + "</div></div></div>";
      html += '<div class="fc-flags">' + Object.keys(fl).map((k) => {
        const keep = fl[k] === null;
        return '<span class="flag-chip' + (und.includes(k) ? " undef" : keep ? " keep" : fl[k] ? " on" : "") + '">' + k + " " + (und.includes(k) ? "?" : keep ? "—" : fl[k] ? 1 : 0) + "<i>" + (keep ? "مش بيتغير" : und.includes(k) ? "undefined" : "") + "</i></span>";
      }).join("") + "</div>";
      const why = [];
      if (fl.CF !== null && !["and", "or", "xor", "test"].includes(op)) why.push("<b>CF=" + (fl.CF ? 1 : 0) + "</b>: " + (fl.CF ? "الحساب كـ <b>unsigned</b> طلع برا مدى " + bits + "-bit (carry أو borrow)" : "مفيش carry/borrow — النتيجة unsigned صح"));
      if (fl.CF === null) why.push("<b>CF</b>: inc/dec <b>مبيلمسوش CF</b> — فخ مشهور!");
      why.push("<b>OF=" + (fl.OF ? 1 : 0) + "</b>: " + (["and", "or", "xor", "test"].includes(op) ? "العمليات المنطقية بتصفّر OF وCF دايمًا" : fl.OF ? "الحساب كـ <b>signed</b> عمل overflow (إشارة النتيجة غلط)" : "مفيش signed overflow"));
      why.push("<b>ZF=" + (fl.ZF ? 1 : 0) + "</b>: النتيجة " + (fl.ZF ? "= صفر" : "≠ صفر") + " · <b>SF=" + (fl.SF ? 1 : 0) + "</b>: أعلى bit = " + (fl.SF ? 1 : 0));
      html += '<div class="fc-why">' + expr + " = " + hexShort(r.res) + "<br>" + why.join("<br>") + "</div>";
      const f = { CF: !!fl.CF, PF: fl.PF, ZF: fl.ZF, SF: fl.SF, OF: fl.OF };
      if (fl.CF === null) f.CF = g("cf").checked;
      html += '<div class="w-lbl" style="margin-top:14px">لو جت بعدها conditional jump — هتقفز؟</div><div class="jcc-grid">' +
        E.CC_NAME.map((c, k) => '<div class="jcc ' + (E.evalCC(k, f) ? "yes" : "no") + '" title="' + esc(E.CC_MEANING[k]) + '"><b>j' + c + "</b><span>" + E.CC_RULE[k] + "</span></div>").join("") + "</div>";
      out.innerHTML = html;
    };
    $$("input,select", box).forEach((x) => x.addEventListener("input", render));
    render();
  }

  function wEncoder(box) {
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🧬</span><h4>من Assembly لـ Machine Code</h4><span class="w-sub">نفس bytes الـ NASM بالظبط</span></div>' +
      '<div class="widget-body"><div class="w-row"><input class="w-in" value="mov rax, [rbx+rcx*8+0x10]" aria-label="instruction" style="flex:3 1 260px"></div>' +
      '<div class="w-row" style="margin-top:8px;gap:6px">' + ["mov eax, 1", "mov rax, 1", "add rsp, 0x28", "push rbp", "call _here", "jz _here", "xor eax, eax", "lea rcx, [rbp-0x20]", "mov r9d, [rsp+0x40]", "inc byte [rax]", "syscall", "int3", "cmp dword [rbp-4], 9", "movzx eax, byte [rdi+rcx]"].map((x) => '<button class="w-btn ghost" data-x="' + esc(x) + '">' + esc(x) + "</button>").join("") + "</div>" +
      '<div class="w-out"></div></div>';
    const input = $("input", box), out = $(".w-out", box);
    const NAMES = { prefix: "Prefix", rex: "REX", opcode: "Opcode", modrm: "ModRM", sib: "SIB", disp: "Displacement", imm: "Immediate", rel: "Rel offset" };
    const bits = (b, groups) => { const s = b.toString(2).padStart(8, "0"); let i = 0; return '<span class="bitgrp">' + groups.map(([n, w]) => { const part = s.slice(i, i + w); i += w; return "<span>" + part + "<em>" + n + "</em></span>"; }).join("") + "</span>"; };
    const render = () => {
      const r = E.encodeOne(input.value);
      if (!r.ok) { out.innerHTML = '<div class="w-err">⚠ ' + esc(r.error) + "</div>"; return; }
      const hx = r.bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
      let html = '<div class="enc-hex">' + hx + ' <span class="w-lbl">(' + r.bytes.length + " bytes)</span></div>";
      html += '<div class="enc-parts">' + r.parts.map((p, k) => '<div class="enc-part ' + p.k + '" style="animation-delay:' + k * 0.06 + 's"><div class="eb">' + p.b.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ") + '</div><div class="ek">' + NAMES[p.k] + "</div></div>").join("") + "</div>";
      const rows = [];
      r.parts.forEach((p) => {
        if (p.k === "rex") { const b = p.b[0]; rows.push('<div class="enc-bitrow"><span class="nm">REX</span>' + bits(b, [["0100", 4], ["W", 1], ["R", 1], ["X", 1], ["B", 1]]) + " W=" + ((b >> 3) & 1) + (b & 8 ? " (64-bit operand)" : "") + " R=" + ((b >> 2) & 1) + " X=" + ((b >> 1) & 1) + " B=" + (b & 1) + "</div>"); }
        if (p.k === "modrm") { const b = p.b[0]; const mod = b >> 6; rows.push('<div class="enc-bitrow"><span class="nm">ModRM</span>' + bits(b, [["mod", 2], ["reg", 3], ["r/m", 3]]) + " mod=" + mod + (mod === 3 ? " (register)" : mod === 0 ? " (memory, no disp)" : mod === 1 ? " (memory + disp8)" : " (memory + disp32)") + " reg=" + ((b >> 3) & 7) + " r/m=" + (b & 7) + ((b & 7) === 4 && mod !== 3 ? " → SIB جاي" : "") + "</div>"); }
        if (p.k === "sib") { const b = p.b[0]; rows.push('<div class="enc-bitrow"><span class="nm">SIB</span>' + bits(b, [["scale", 2], ["index", 3], ["base", 3]]) + " scale=" + (1 << (b >> 6)) + " index=" + ((b >> 3) & 7) + " base=" + (b & 7) + "</div>"); }
        if (p.k === "disp" || p.k === "imm" || p.k === "rel") {
          let v = 0n; p.b.forEach((x, i) => { v |= BigInt(x) << BigInt(8 * i); });
          rows.push('<div class="enc-bitrow"><span class="nm">' + NAMES[p.k] + "</span>" + p.b.map((x) => x.toString(16).padStart(2, "0").toUpperCase()).join(" ") + " → little-endian = " + hexShort(v) + " = " + E.S(v, p.b.length * 8) + (p.k === "rel" ? " (من نهاية الـ instruction)" : "") + "</div>");
        }
      });
      html += '<div class="enc-bits">' + rows.join("") + "</div>";
      out.innerHTML = html;
    };
    input.addEventListener("input", render);
    $$("[data-x]", box).forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.x; render(); }));
    render();
  }

  function wEndian(box) {
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🔁</span><h4>Little-Endian: الرقم في الذاكرة</h4><span class="w-sub">ليه الـ bytes بتبان مقلوبة في الـ hexdump</span></div>' +
      '<div class="widget-body"><div class="w-row"><input class="w-in" value="0x12345678" aria-label="قيمة"><select class="w-sel"><option value="16">word (2)</option><option value="32" selected>dword (4)</option><option value="64">qword (8)</option></select><span class="w-lbl">address</span><input class="w-in" value="0x404000" style="flex:0 1 130px" aria-label="عنوان"></div><div class="w-out"></div></div>';
    const [inp, sel, adr] = [$$("input", box)[0], $("select", box), $$("input", box)[1]];
    const render = () => {
      const bits = Number(sel.value), n = bits / 8;
      const v = parseNum(inp.value, bits), a = parseNum(adr.value, 64);
      const out = $(".w-out", box);
      if (v === null || a === null) { out.innerHTML = '<div class="w-err">قيمة مش مفهومة</div>'; return; }
      const be = v.toString(16).toUpperCase().padStart(n * 2, "0").match(/../g), le = be.slice().reverse();
      const cells = (arr, mark) => arr.map((b, k) => '<div class="byte-cell' + (mark && k === 0 ? " lo" : "") + '">' + b + "<small>+" + k + "</small></div>").join("");
      out.innerHTML = '<div class="endian">' +
        '<div class="line"><span class="lbl2">الرقم (bits)</span><code style="font:700 15px var(--mono)">0x' + be.join("") + "</code></div>" +
        '<div class="line"><span class="lbl2">x86 (little-endian)</span>' + cells(le, true) + '<span class="w-lbl">← الـ byte الأصغر (LSB) الأول</span></div>' +
        '<div class="line"><span class="lbl2">network / big-endian</span>' + cells(be, false) + "</div>" +
        '<div class="line"><span class="lbl2">hexdump</span><code>' + a.toString(16).padStart(8, "0") + ":  " + le.join(" ") + "</code></div>" +
        '<div class="line"><span class="lbl2">NASM</span><code>' + ({ 16: "dw", 32: "dd", 64: "dq" })[bits] + " 0x" + be.join("") + "  ≡  db " + le.map((x) => "0x" + x).join(", ") + "</code></div>" +
        '<div class="line"><span class="lbl2">byte [addr]</span><code>mov al, [0x' + a.toString(16) + "]  → al = 0x" + le[0] + "</code></div></div>";
    };
    $$("input,select", box).forEach((x) => x.addEventListener("input", render)); render();
  }

  function wAddr(box) {
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🎯</span><h4>حاسبة العنوان الفعلي: [base + index×scale + disp]</h4><span class="w-sub">زي arr[i] و struct->field</span></div>' +
      '<div class="widget-body"><div class="w-row"><span class="w-lbl">base</span><input class="w-in" data-k="base" value="0x404000" style="flex:1 1 120px"><span class="w-lbl">index (i)</span><input class="w-in" data-k="i" value="3" style="flex:0 1 70px"><span class="w-lbl">scale</span><select class="w-sel" data-k="s"><option>1</option><option>2</option><option selected>4</option><option>8</option></select><span class="w-lbl">disp</span><input class="w-in" data-k="d" value="0" style="flex:0 1 80px"></div><div class="w-out"></div></div>';
    const g = (k) => $('[data-k="' + k + '"]', box);
    const render = () => {
      const base = parseNum(g("base").value, 64), i = parseNum(g("i").value, 0), s = Number(g("s").value), d = parseNum(g("d").value, 0);
      const out = $(".w-out", box);
      if (base === null || i === null || d === null) { out.innerHTML = '<div class="w-err">قيم مش مفهومة</div>'; return; }
      const ea = E.U(base + i * BigInt(s) + d, 64);
      const type = { 1: "char / byte", 2: "short / word", 4: "int / dword", 8: "long / pointer / qword" }[s];
      const reg = { 1: "al", 2: "ax", 4: "eax", 8: "rax" }[s], kw = { 1: "byte", 2: "word", 4: "dword", 8: "qword" }[s];
      let cells = "";
      for (let k = 0; k < 8; k++) {
        const a = E.U(base + BigInt(k * s) + d, 64);
        cells += '<div class="addr-cell' + (BigInt(k) === i ? " sel" : "") + '"><div class="i">[' + k + ']</div><div class="v">' + (k * 10 + 7) + '</div><div class="ad">' + a.toString(16).toUpperCase() + "</div></div>";
      }
      out.innerHTML = '<div class="addr-formula">EA = ' + hexShort(base) + " + " + i + " × " + s + " + " + d + " = <b>" + hexShort(ea) + "</b></div>" +
        '<div class="addr-formula">C: <b>arr[' + i + "]</b> (عناصر " + type + ")  ⇢  asm: <b>mov " + reg + ", " + kw + " [rbx + rcx*" + s + (d ? (d > 0n ? " + " : " - ") + (d > 0n ? d : -d) : "") + "]</b></div>" +
        '<div class="addr-arr">' + cells + "</div>";
    };
    $$("input,select", box).forEach((x) => x.addEventListener("input", render)); render();
  }

  function wSimd(box) {
    box.innerHTML = '<div class="widget-head"><span class="w-ico">⚡</span><h4>SIMD: instruction واحدة × 16 byte</h4><span class="w-sub">xmm = 128 bit = 16 lane</span></div>' +
      '<div class="widget-body"><div class="w-row"><span class="w-lbl">[rsi]</span><input class="w-in" data-k="s" value="kernel32.dll" maxlength="16" aria-label="16 bytes" style="flex:3 1 200px">' +
      '<select class="w-sel" data-k="op"><option value="xor">pxor  (XOR بمفتاح)</option><option value="eq0">pcmpeqb + pmovmskb  (strlen)</option><option value="eqc">pcmpeqb  (دوّر على حرف)</option><option value="add">paddb  (+k)</option><option value="shuf">pshufb  (اقلب الترتيب)</option></select>' +
      '<span class="w-lbl" data-k="kl">key</span><input class="w-in" data-k="k" value="0x41" style="flex:0 1 80px" aria-label="key">' +
      '<select class="w-sel" data-k="view"><option value="1">16 × byte</option><option value="2">8 × word</option><option value="4">4 × dword</option><option value="8">2 × qword</option></select></div>' +
      '<div class="w-out"></div><div class="w-note">الـ lane 0 على الشمال = أول byte في الذاكرة (أصغر عنوان). x64dbg بيعرض الـ xmm كرقم واحد 128-bit، فبيبان <b>مقلوب</b> (lane 15 الأول) — نفس قصة الـ little-endian.</div></div>';
    const g = (k) => $('[data-k="' + k + '"]', box);
    const hx2 = (b) => b.toString(16).padStart(2, "0").toUpperCase();
    const chr = (b) => (b >= 32 && b < 127 ? esc(String.fromCharCode(b)) : b === 0 ? "\\0" : "·");
    const lanes = (bytes, w, cls) => {
      let h = '<div class="simd-row w' + w + '">';
      for (let i = 0; i < 16; i += w) {
        let v = "";
        for (let j = w - 1; j >= 0; j--) v += hx2(bytes[i + j]);
        const c = cls ? cls(i) : "";
        h += '<div class="lane ' + c + '" style="grid-column:span ' + w + '"><b>' + v + "</b>" + (w === 1 ? "<small>" + chr(bytes[i]) + "</small>" : "<small>lane " + i / w + "</small>") + "</div>";
      }
      return h + "</div>";
    };
    const render = () => {
      const s = g("s").value, op = g("op").value, w = Number(g("view").value);
      const out = $(".w-out", box);
      const a = new Array(16).fill(0);
      for (let i = 0; i < Math.min(16, s.length); i++) a[i] = s.charCodeAt(i) & 0xff;
      g("k").disabled = op === "eq0" || op === "shuf";
      g("kl").textContent = op === "eqc" ? "char" : "key";
      let kv = 0;
      if (op === "eqc") { const t = g("k").value; kv = /^0x/i.test(t) || /^\d+$/.test(t) ? Number(parseNum(t, 8)) : t.charCodeAt(0) & 0xff; }
      else if (!g("k").disabled) { const p = parseNum(g("k").value, 8); if (p === null) { out.innerHTML = '<div class="w-err">key لازم يبقى byte: 0x41 أو 65</div>'; return; } kv = Number(p); }
      let b, r, asm, note = "", extra = "";
      if (op === "xor") { b = new Array(16).fill(kv); r = a.map((x) => x ^ kv); asm = "movdqu xmm0, [rsi]\nmovd   xmm1, eax        ; eax = 0x" + hx2(kv) + hx2(kv) + hx2(kv) + hx2(kv) + "\npshufd xmm1, xmm1, 0    ; broadcast → 16 × 0x" + hx2(kv) + "\npxor   xmm0, xmm1\nmovdqu [rsi], xmm0"; note = "16 byte اتشفّروا في instruction واحدة. لو شفت <code>pxor</code> جوه loop بتمشي على buffer بخطوة 16 ← decoder متجّه (vectorized) — نفس الـ XOR العادي بس أسرع."; }
      else if (op === "eq0" || op === "eqc") {
        const t = op === "eq0" ? 0 : kv;
        b = new Array(16).fill(t); r = a.map((x) => (x === t ? 0xff : 0));
        let mask = 0; r.forEach((x, i) => { if (x) mask |= 1 << i; });
        const first = mask ? Math.log2(mask & -mask) : -1;
        asm = "movdqu   xmm0, [rsi]\n" + (op === "eq0" ? "pxor     xmm1, xmm1      ; 16 × 0x00" : "; xmm1 = 16 × 0x" + hx2(t) + " ('" + chr(t) + "')") + "\npcmpeqb  xmm0, xmm1      ; lane = FF لو متساوي، 00 لو لأ\npmovmskb eax, xmm0       ; bit i = أعلى bit في lane i\nbsf      eax, eax        ; أول bit = 1 → index";
        extra = '<div class="fc-res" style="margin-top:10px"><div class="fc-box"><div class="k">PMOVMSKB → EAX</div><div class="v">0x' + mask.toString(16).toUpperCase().padStart(4, "0") + '</div></div><div class="fc-box"><div class="k">BINARY (bit 15 … bit 0)</div><div class="v">' + mask.toString(2).padStart(16, "0").replace(/(.{4})(?=.)/g, "$1 ") + '</div></div><div class="fc-box"><div class="k">BSF → INDEX</div><div class="v">' + (first < 0 ? "ZF=1 (مفيش تطابق — كمّل الـ 16 اللي بعدهم)" : first) + "</div></div></div>";
        note = op === "eq0" ? "ده قلب <code>strlen</code> في glibc: يقارن 16 حرف مع الصفر مرة واحدة. لو شفت <code>pcmpeqb</code> + <code>pmovmskb</code> + <code>bsf</code>/<code>tzcnt</code> ← بيدوّر على byte معين (غالبًا strlen/memchr متعمل inline)." : "نفس الحيلة بتدوّر على أي حرف (memchr / strchr): هنا الـ index = مكان أول '" + chr(t) + "'.";
      } else if (op === "add") { b = new Array(16).fill(kv); r = a.map((x) => (x + kv) & 0xff); asm = "movdqu xmm0, [rsi]\npaddb  xmm0, xmm1        ; xmm1 = 16 × 0x" + hx2(kv) + "  (wraparound لكل lane لوحده)"; note = "كل lane بيلف لوحده (0xFF + 1 = 0x00) ومفيش carry بيعدّي للـ lane اللي جنبه. <code>paddb/psubb</code> = Caesar cipher متجّه."; }
      else { b = Array.from({ length: 16 }, (_, i) => 15 - i); r = b.map((i) => a[i]); asm = "movdqu xmm0, [rsi]\npshufb xmm0, [mask]      ; mask = 0F 0E 0D … 01 00\n; result lane i = xmm0[mask[i]]"; note = "<code>pshufb</code> بيعيد ترتيب الـ bytes حسب mask (أي ترتيب، أو 0x80 = صفّر الـ lane). بيستخدم في الـ crypto وفي فك تشفير strings بترتيب ملخبط."; }
      const changed = (i) => { for (let j = 0; j < w; j++) if (r[i + j] !== a[i + j]) return "hit"; return ""; };
      const big = r.slice().reverse().map(hx2).join("");
      out.innerHTML = '<div class="simd">' +
        '<div class="simd-lbl">xmm0  (من الذاكرة)</div>' + lanes(a, w) +
        '<div class="simd-lbl">' + (op === "shuf" ? "mask" : "xmm1") + "</div>" + lanes(b, w, () => "dim") +
        '<div class="simd-lbl">النتيجة</div>' + lanes(r, w, changed) +
        '<div class="simd-big"><span class="w-lbl">x64dbg: XMM0 =</span> <code>' + big.slice(0, 16) + " " + big.slice(16) + "</code></div>" + extra +
        '<pre class="simd-asm">' + esc(asm) + "</pre>" +
        '<div class="fc-why">' + note + "</div></div>";
    };
    $$("input,select", box).forEach((x) => x.addEventListener("input", render)); render();
  }

  function wFcmp(box) {
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🎚️</span><h4>مقارنة الـ floats: ucomisd والـ Flags</h4><span class="w-sub">ليه بنشوف ja / jb / jp مع الـ doubles</span></div>' +
      '<div class="widget-body"><div class="w-row"><span class="w-lbl">xmm0 (a)</span><input class="w-in" data-k="a" value="2.5" style="flex:1 1 110px"><span class="w-lbl">xmm1 (b)</span><input class="w-in" data-k="b" value="10" style="flex:1 1 110px">' +
      ["1.5|1.5", "-3|0.25", "nan|1", "0|-0", "inf|1e308"].map((p) => '<button class="w-btn ghost" data-p="' + p + '">' + p.replace("|", " , ") + "</button>").join("") + "</div>" +
      '<div class="w-out"></div></div>';
    const g = (k) => $('[data-k="' + k + '"]', box);
    const parse = (t) => { t = t.trim().toLowerCase(); if (t === "nan") return NaN; if (t === "inf" || t === "+inf") return Infinity; if (t === "-inf") return -Infinity; if (t === "-0") return -0; if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/.test(t)) return null; return Number(t); };
    const bitsOf = (x) => { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x); return [dv.getUint32(0), dv.getUint32(4)]; };
    const h8 = (n) => n.toString(16).toUpperCase().padStart(8, "0");
    const render = () => {
      const a = parse(g("a").value), b = parse(g("b").value), out = $(".w-out", box);
      if (a === null || b === null) { out.innerHTML = '<div class="w-err">اكتب رقم (2.5 أو -1e3) أو nan أو inf أو -0</div>'; return; }
      const un = Number.isNaN(a) || Number.isNaN(b);
      const f = { ZF: un || a === b, PF: un, CF: un || a < b, SF: false, OF: false };
      const rel = un ? "unordered (فيه NaN)" : a > b ? "a > b" : a < b ? "a < b" : "a == b";
      const show = [["a", "CF=0 و ZF=0", 7], ["ae", "CF=0", 3], ["b", "CF=1", 2], ["be", "CF=1 أو ZF=1", 6], ["e", "ZF=1", 4], ["ne", "ZF=0", 5], ["p", "PF=1", 10], ["np", "PF=0", 11]];
      const meaning = { a: "a > b", ae: "a ≥ b", b: "a < b ⚠ أو NaN", be: "a ≤ b ⚠ أو NaN", e: "a == b ⚠ أو NaN", ne: "a ≠ b (و NaN لأ)", p: "واحد منهم NaN", np: "مفيش NaN" };
      const [ah, al] = bitsOf(a), [bh, bl] = bitsOf(b);
      let html = '<div class="fc-res"><div class="fc-box"><div class="k">ucomisd xmm0, xmm1</div><div class="v">' + rel + "</div></div>" +
        '<div class="fc-box"><div class="k">a كـ bits (IEEE-754)</div><div class="v">0x' + h8(ah) + h8(al) + '</div></div><div class="fc-box"><div class="k">b كـ bits</div><div class="v">0x' + h8(bh) + h8(bl) + "</div></div></div>";
      html += '<div class="fc-flags">' + ["ZF", "PF", "CF"].map((k) => '<span class="flag-chip' + (f[k] ? " on" : "") + '">' + k + " " + (f[k] ? 1 : 0) + "</span>").join("") + '<span class="flag-chip">OF 0<i>دايمًا</i></span><span class="flag-chip">SF 0<i>دايمًا</i></span></div>';
      html += '<div class="jcc-grid">' + show.map(([c, rule, k]) => '<div class="jcc ' + (E.evalCC(k, f) ? "yes" : "no") + '"><b>j' + c + "</b><span>" + meaning[c] + "</span></div>").join("") + "</div>";
      html += '<div class="fc-why">الـ flags هنا بتتظبط زي مقارنة <b>unsigned</b> (CF/ZF) — عشان كده الـ compiler بيستخدم <b>ja / jb</b> مش jg / jl. وNaN بيخلّي ZF=PF=CF=1، فـ <code>je</code> لوحدها هتقول «متساويين»! لذلك <code>if (a == b)</code> بتطلع: <code>ucomisd</code> ثم <code>jp</code> (NaN ← لأ) ثم <code>jne</code>. و<code>if (a &lt; b)</code> بيتكتب غالبًا معكوس: <code>comisd xmm1, xmm0</code> + <code>ja</code> عشان NaN يدّي false.</div>';
      html += '<div class="fc-why" style="direction:ltr;text-align:left">gcc .rodata:  <code>.long ' + (al | 0) + "  .long " + (ah | 0) + "</code>   ·   IDA:  <code>dq " + h8(ah) + h8(al) + "h</code>   ← ده الـ " + esc(g("a").value) + " لو لقيته ثابت في الـ binary</div>";
      out.innerHTML = html;
    };
    $$("input", box).forEach((x) => x.addEventListener("input", render));
    $$("[data-p]", box).forEach((x) => x.addEventListener("click", () => { const [p, q] = x.dataset.p.split("|"); g("a").value = p; g("b").value = q; render(); }));
    render();
  }

  const IDIOMS = [
    ["xor eax, eax", "eax = 0;", "أقصر طريقة تصفّر (2 bytes)، وكتابة eax بتصفّر rax كله. وبتقول للـ CPU إن مفيش اعتماد على القيمة القديمة."],
    ["test rdi, rdi\nsete al", "return x == 0;", "<code>test</code> = AND من غير تخزين. <code>test r,r</code> هي الطريقة القياسية تسأل «هل ده صفر/سالب؟»."],
    ["lea eax, [rdi+rdi*4]", "return x * 5;", "<code>lea</code> بتعمل حساب عنوان من غير ما تلمس الذاكرة: x + x×4 = 5x. أسرع من imul."],
    ["lea eax, [rdi+rdi*2]\nshl eax, 2", "return x * 12;", "3x × 4 = 12x. الـ compiler بيفكّ الضرب في ثابت لـ lea وshifts."],
    ["mov eax, edi\nshr eax, 3", "return x / 8;   // unsigned", "القسمة على 2ⁿ لـ unsigned = shift يمين منطقي. لاحظ shr (مش sar) = النوع unsigned."],
    ["test edi, edi\nlea eax, [rdi+7]\ncmovns eax, edi\nsar eax, 3", "return x / 8;   // signed int", "الـ sar لوحده بيقرّب لتحت (-1/8 = -1)، وC بتقرّب ناحية الصفر. فلو x سالب بيزود 7 (bias) قبل الـ shift."],
    ["mov eax, ecx\ncdq\nand edx, 7\nadd eax, edx\nsar eax, 3", "return x / 8;   // signed (MSVC)", "نفس الفكرة: cdq بتخلّي edx = -1 لو سالب، فـ and edx,7 = الـ bias (7 أو 0)."],
    ["mov edx, edi\nsar edx, 31\nshr edx, 29\nlea eax, [rdi+rdx]\nand eax, 7\nsub eax, edx", "return x % 8;   // signed", "الـ and 7 لوحده كان يبقى صح للـ unsigned بس. التصحيح بالـ bias عشان -9 % 8 = -1 في C."],
    ["mov eax, edi\nneg eax\ncmovs eax, edi", "return abs(x);", "احسب -x، ولو طلع سالب (يعني x كان موجب) رجّع x. من غير branch."],
    ["cmp esi, edi\nmov eax, edi\ncmovge eax, esi", "return a > b ? a : b;   // max", "cmovXX = if من غير jump. ge/g/l/le = signed، و ae/a/b/be = unsigned."],
    ["sub edi, 97\ncmp edi, 25\nsetbe al", "return c >= 'a' && c <= 'z';", "حيلة الـ range check: (c-'a') كـ unsigned ≤ 25. لو c < 'a' الطرح بيلف لرقم ضخم. مقارنة واحدة بدل اتنين."],
    ["lea eax, [rdi-1]\ntest eax, edi\nsete al", "return (x & (x - 1)) == 0;   // power of 2", "x & (x-1) بتشيل أقل bit = 1. لو النتيجة صفر يبقى فيه bit واحد بس."],
    ["sub edi, 97\nmov edx, 0x104111\nbt rdx, rdi\nsetc dl", "switch (c) { case 'a': case 'e': case 'i': case 'o': case 'u': … }", "bit-test switch: كل bit في الـ mask = حالة. 0x104111 = bits 0,4,8,14,20 = a,e,i,o,u."],
    ["mov eax, edi\nmov edx, 0x92492493\nimul edx\n…\nsar edx, 2", "return x / 7;", "magic number: القسمة على ثابت = ضرب في مقلوبه × 2ⁿ. شفناها في مرحلة 7 — استخدم الـ widget هناك."],
    ["mov eax, ecx\ncdq\nidiv r8d", "q = a / b;   r = a % b;", "idiv بتقسم edx:eax. النتيجة في eax والباقي في edx. cdq = sign-extend eax لـ edx (لازمة قبل idiv)."],
    ["movsxd rax, ecx\nmov eax, [rdx+rax*4]", "return arr[i];   // int i", "movsxd/cdqe = int → 64-bit عشان يستخدمه كـ index. وجودها معناه إن الـ index نوعه int (signed)."],
    ["call is_ready\nmovzx eax, al", "bool r = is_ready();", "الـ bool بيرجع في al بس. movzx بيوسّعه لـ int كامل."],
    ["…\nadd rsp, 40\njmp report", "return report(x);   // tail call", "jmp لدالة تانية في آخر الدالة = tail call: report هترجع مباشرة للـ caller بتاعنا. IDA أحيانًا بيفتكرها نفس الدالة."],
    ["mov eax, 8248\ncall __chkstk\nsub rsp, rax", "char buf[8192];   // MSVC", "أي frame أكبر من صفحة (4KB) على Windows: __chkstk بيلمس الـ stack صفحة صفحة عشان الـ guard page."],
    ["mov rax, QWORD PTR fs:40\nmov [rsp+24], rax\n…\nsub rax, QWORD PTR fs:40\njne .Lfail", "/* -fstack-protector canary */", "مش جزء من منطق البرنامج — تجاهلها وانت بتقرا. على MSVC: __security_cookie + __security_check_cookie."],
    ["xor eax, eax\nmov ecx, 16\nmov rdi, rdx\nrep stosq", "memset(p, 0, 128);", "rep stosq = اكتب rax في [rdi] عدد rcx مرة (8 bytes). 16 × 8 = 128."],
    ["neg ecx\nsbb eax, eax", "eax = (x != 0) ? -1 : 0;", "neg بتعمل CF=1 لو x≠0، وsbb eax,eax = 0 - 0 - CF = -CF. mask من غير branch."],
    ["ucomisd xmm0, xmm1\njp .Lfalse\njne .Lfalse", "if (a == b)   // double", "jp بتمسك الـ NaN (unordered). مرحلة 16."],
    ["pxor xmm0, xmm0\nmovups [rsp+32], xmm0\nmovups [rsp+48], xmm0", "struct s v = {0};", "تصفير 32 byte بـ instructionين. الـ xmm مش float هنا — مجرد نقل بيانات."],
    ["mov [rcx], edx\nmov [rcx+8], eax\n…\nmov rax, rcx\nret", "struct big make(…);   // returned by value", "الـ struct الكبير بيرجع عن طريق pointer مخفي (أول argument: rcx / rdi) والدالة بترجعه في rax."],
    ["mov ecx, 2\ncall __acrt_iob_func\nmov rdx, rax", "stderr   // MSVC UCRT", "stdin/stdout/stderr في الـ UCRT = __acrt_iob_func(0/1/2)."],
    ["endbr64\npush rbp", "/* function start (CET) */", "endbr64 = علامة بداية دالة مسموح الـ jump ليها (Intel CET). مفيدة جدًا عشان تلاقي بدايات الدوال في binary مش معروف."],
    ["call abort\nint 3", "abort();   /* noreturn */", "بعد دالة مبترجعش (abort, exit, ExitProcess) MSVC بيحط int3. مفيش كود بعدها في الـ flow — الـ disassembler ممكن يتلخبط لو مش عارف إنها noreturn."]
  ];

  function wIdioms(box) {
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🃏</span><h4>بطاقات الـ Idioms: شوف الـ asm وقول الـ C</h4><span class="w-sub">' + IDIOMS.length + ' نمط بتشوفهم كل يوم</span></div>' +
      '<div class="widget-body"><div class="idc-stage"><div class="idc-card" tabindex="0" role="button" aria-label="اقلب البطاقة"><div class="idc-face idc-front"></div><div class="idc-face idc-back"></div></div></div>' +
      '<div class="idc-bar"><button class="w-btn" data-k="flip">↻ اقلب</button><button class="w-btn ghost" data-k="prev">→ السابقة</button><button class="w-btn ghost" data-k="next">التالية ←</button><button class="w-btn ghost" data-k="shuf">🔀 لخبط</button>' +
      '<button class="w-btn ghost idc-yes" data-k="yes" hidden>✓ عرفتها</button><button class="w-btn ghost idc-no" data-k="no" hidden>✗ لسه</button><span class="idc-score"></span></div></div>';
    let order = IDIOMS.map((_, i) => i), pos = 0, known = new Set(), seen = new Set();
    const card = $(".idc-card", box), front = $(".idc-front", box), back = $(".idc-back", box), score = $(".idc-score", box);
    const hl = (t) => (window.AsmCourse && window.AsmCourse.highlightAsm ? window.AsmCourse.highlightAsm(t) : esc(t));
    const hc = (t) => (window.AsmCourse && window.AsmCourse.highlightC ? window.AsmCourse.highlightC(t) : esc(t));
    const draw = () => {
      const [asm, c, why] = IDIOMS[order[pos]];
      card.classList.remove("flip");
      front.innerHTML = '<div class="idc-q">بطاقة ' + (pos + 1) + " / " + IDIOMS.length + " — الكود ده بيعمل إيه في C؟ (اضغط عشان تقلب)</div><pre>" + hl(asm) + "</pre>";
      back.innerHTML = '<div class="idc-q">الإجابة</div><pre class="idc-c">' + hc(c) + '</pre><div class="idc-why">' + why + "</div>";
      $$(".idc-yes,.idc-no", box).forEach((b) => { b.hidden = true; });
      score.textContent = "عرفت " + known.size + " من " + seen.size + " · فاضل " + (IDIOMS.length - seen.size);
    };
    const flip = () => { card.classList.toggle("flip"); if (card.classList.contains("flip")) $$(".idc-yes,.idc-no", box).forEach((b) => { b.hidden = false; }); };
    const go = (d) => { pos = (pos + d + IDIOMS.length) % IDIOMS.length; draw(); };
    const act = {
      flip, prev: () => go(-1), next: () => go(1),
      shuf: () => { for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } pos = 0; draw(); },
      yes: () => { seen.add(order[pos]); known.add(order[pos]); go(1); },
      no: () => { seen.add(order[pos]); known.delete(order[pos]); go(1); }
    };
    $$("[data-k]", box).forEach((b) => b.addEventListener("click", () => act[b.dataset.k]()));
    card.addEventListener("click", flip);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); flip(); } });
    draw();
  }

  /* analysis walkthrough: a real listing annotated pass by pass (data in a JSON <script> child) */
  function wWalk(box) {
    const src = box.querySelector('script[type="application/json"]');
    if (!src) return;
    const D = JSON.parse(src.textContent);
    const lines = D.listing.replace(/^\n+|\s+$/g, "").split("\n");
    const P = D.passes;
    const hl = (t) => (window.AsmCourse && window.AsmCourse.highlightAsm ? window.AsmCourse.highlightAsm(t) : esc(t));
    const hc = (t) => (window.AsmCourse && window.AsmCourse.highlightC ? window.AsmCourse.highlightC(t) : esc(t));
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🧭</span><h4>' + D.title + '</h4><span class="w-sub">' + (D.sub || "") + "</span></div>" +
      '<div class="widget-body"><div class="wk-tabs">' + P.map((p, i) => '<button class="wk-tab" data-i="' + i + '"><b>' + (i + 1) + "</b> " + p.t + "</button>").join("") + "</div>" +
      '<div class="wk-grid"><div class="wk-code">' + lines.map((l, i) => '<div class="wk-ln" data-n="' + (i + 1) + '"><span class="wk-no">' + (i + 1) + '</span><span class="wk-src">' + hl(l) + '</span><span class="wk-note"></span></div>').join("") + "</div>" +
      '<div class="wk-side"><div class="wk-desc"></div><div class="wk-ct">الـ C لحد دلوقتي</div><pre class="wk-c"></pre></div></div>' +
      '<div class="wk-nav"><button class="w-btn ghost" data-k="prev">→ السابق</button><span class="wk-pos"></span><button class="w-btn" data-k="next">التالي ←</button></div></div>';
    const rows = $$(".wk-ln", box);
    let cur = 0;
    const inR = (n, ranges) => (ranges || []).some(([a, b]) => n >= a && n <= (b === undefined ? a : b));
    const show = (i) => {
      cur = Math.max(0, Math.min(P.length - 1, i));
      const p = P[cur];
      $$(".wk-tab", box).forEach((b, k) => { b.classList.toggle("on", k === cur); b.classList.toggle("done", k < cur); });
      rows.forEach((r) => {
        const n = Number(r.dataset.n);
        r.classList.toggle("hl", inR(n, p.hl));
        r.classList.toggle("dim", !!p.hl && p.hl.length > 0 && !inR(n, p.hl));
        let note = "", old = false;
        for (let k = cur; k >= 0; k--) { const t = P[k].notes && P[k].notes[n]; if (t) { note = t; old = k < cur; break; } }
        const ne = $(".wk-note", r);
        ne.innerHTML = note ? "; " + note : "";
        ne.classList.toggle("old", old);
        r.classList.toggle("noted", !!note && !old);
      });
      $(".wk-desc", box).innerHTML = p.d;
      $(".wk-c", box).innerHTML = hc(p.c);
      $(".wk-pos", box).textContent = (cur + 1) + " / " + P.length;
      const first = rows.find((r) => r.classList.contains("hl"));
      const code = $(".wk-code", box);
      if (first && code.scrollHeight > code.clientHeight) code.scrollTo({ top: first.offsetTop - 30, behavior: "smooth" });
    };
    $$(".wk-tab", box).forEach((b) => b.addEventListener("click", () => show(Number(b.dataset.i))));
    $('[data-k="prev"]', box).addEventListener("click", () => show(cur - 1));
    $('[data-k="next"]', box).addEventListener("click", () => show(cur + 1));
    show(0);
  }

  /* PE explorer: parses a real PE (base64 in <script class="pe-data">) and maps every field to its bytes */
  function wPE(box) {
    const src = box.querySelector("script.pe-data");
    if (!src) return;
    const bin = Uint8Array.from(atob(src.textContent.trim()), (c) => c.charCodeAt(0));
    const dv = new DataView(bin.buffer);
    const u16 = (o) => dv.getUint16(o, true), u32 = (o) => dv.getUint32(o, true), u64 = (o) => dv.getBigUint64(o, true);
    const cstr = (o) => { let s = ""; while (o < bin.length && bin[o]) s += String.fromCharCode(bin[o++]); return s; };
    const H = (v, w) => "0x" + v.toString(16).toUpperCase().padStart(w || 0, "0");
    const flags = (v, tbl) => Object.keys(tbl).filter((k) => v & Number(k)).map((k) => tbl[k]).join(" | ") || "—";
    const F = [];
    const add = (g, name, off, size, val, desc, extra) => F.push(Object.assign({ g, name, off, size, val, desc }, extra || {}));
    const lf = u32(0x3C), fh = lf + 4, oh = fh + 20;
    const nsec = u16(fh + 2), sohdr = u16(fh + 16), st = oh + sohdr;
    const secs = [];
    for (let i = 0; i < nsec; i++) {
      const o = st + 40 * i;
      secs.push({ o, name: cstr(o).slice(0, 8), vs: u32(o + 8), va: u32(o + 12), rs: u32(o + 16), rp: u32(o + 20), ch: u32(o + 36) });
    }
    const rva2off = (r) => { for (const s of secs) if (r >= s.va && r < s.va + Math.max(s.vs, s.rs)) return s.rs && r - s.va < s.rs ? { off: r - s.va + s.rp, s } : { off: null, s }; return r < u32(oh + 60) ? { off: r, s: null } : null; };
    const off2rva = (o) => { for (const s of secs) if (s.rs && o >= s.rp && o < s.rp + s.rs) return { rva: o - s.rp + s.va, s }; return o < u32(oh + 60) ? { rva: o, s: null } : null; };
    const rwx = (c) => (c & 0x40000000 ? "R" : "-") + (c & 0x80000000 ? "W" : "-") + (c & 0x20000000 ? "X" : "-");

    add("DOS Header", "e_magic", 0, 2, '"MZ"', "أول byteين في أي PE: <b>MZ</b> (Mark Zbikowski). أداة بتدوّر على PE مخبّي جوه ملف أو في الذاكرة بتبدأ من هنا.");
    add("DOS Header", "e_lfanew", 0x3C, 4, H(lf), "الحقل الوحيد المهم في الـ DOS header: <b>offset الـ PE header</b>. الـ loader بيقرا الرقم ده ويقفز له.");
    add("DOS Stub", "DOS stub", 0x40, lf - 0x40, '"This program cannot be run in DOS mode."', "برنامج DOS صغير بيطبع الرسالة دي. ملوش لازمة النهارده — الـ packers أحيانًا بيخبّوا فيه بيانات. (في ملفات MSVC بيبقى بعده الـ <b>Rich header</b>.)");
    add("NT Headers", "Signature", lf, 4, '"PE\\0\\0"', "<code>50 45 00 00</code> = بداية الـ NT headers.");
    const mach = u16(fh);
    add("File Header", "Machine", fh, 2, H(mach, 4) + " = " + ({ 0x8664: "AMD64 (x64)", 0x14C: "i386 (x86)", 0xAA64: "ARM64" }[mach] || "?"), "المعمارية. <code>0x14C</code> = 32-bit، <code>0x8664</code> = 64-bit.");
    add("File Header", "NumberOfSections", fh + 2, 2, String(nsec), "عدد الـ section headers اللي بعد الـ optional header.");
    const ts = u32(fh + 4);
    add("File Header", "TimeDateStamp", fh + 4, 4, H(ts) + " = " + new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC", "وقت الـ link (ثواني من 1970). مفيد لربط samples بحملة — بس سهل يتزوّر (وفي الـ builds الـ reproducible بيبقى hash).");
    add("File Header", "SizeOfOptionalHeader", fh + 16, 2, H(sohdr), "حجم الـ optional header: <code>0xF0</code> لـ PE32+ و<code>0xE0</code> لـ PE32.");
    const fch = u16(fh + 18);
    add("File Header", "Characteristics", fh + 18, 2, H(fch, 4) + " = " + flags(fch, { 1: "RELOCS_STRIPPED", 2: "EXECUTABLE", 4: "LINE_NUMS_STRIPPED", 0x20: "LARGE_ADDRESS_AWARE", 0x100: "32BIT", 0x200: "DEBUG_STRIPPED", 0x2000: "DLL" }), "flags: لو فيه <b>DLL</b> (0x2000) يبقى ده DLL مش EXE.");
    const magic = u16(oh);
    add("Optional Header", "Magic", oh, 2, H(magic, 3) + " = " + (magic === 0x20B ? "PE32+ (64-bit)" : "PE32 (32-bit)"), "<code>0x10B</code> = PE32، <code>0x20B</code> = PE32+. ده اللي بيحدد شكل باقي الـ header (ImageBase 8 bytes في الـ 64).");
    const ep = u32(oh + 16), ib = u64(oh + 24);
    add("Optional Header", "AddressOfEntryPoint", oh + 16, 4, H(ep) + " (RVA) → VA " + H(ib + BigInt(ep)), "<b>أول instruction بتتنفذ</b> (RVA). أول مكان تحط فيه breakpoint — بس افتكر الـ TLS callbacks بتشتغل قبله. entry point في section غريب (مش .text) = علامة packer.");
    add("Optional Header", "ImageBase", oh + 24, 8, H(ib), "العنوان المفضّل للتحميل. الـ EXE 64-bit الافتراضي <code>0x140000000</code>، والـ DLL <code>0x180000000</code>، والـ 32-bit <code>0x400000</code>. مع ASLR العنوان الحقيقي بيتغير ← اشتغل دايمًا بالـ <b>RVA</b>.");
    add("Optional Header", "SectionAlignment", oh + 32, 4, H(u32(oh + 32)), "محاذاة الـ sections في <b>الذاكرة</b> (صفحة = 0x1000).");
    add("Optional Header", "FileAlignment", oh + 36, 4, H(u32(oh + 36)), "محاذاة الـ sections في <b>الملف</b> (0x200). الفرق بين الاتنين هو ليه offset في الملف ≠ RVA.");
    add("Optional Header", "SizeOfImage", oh + 56, 4, H(u32(oh + 56)), "حجم الصورة كلها في الذاكرة (مضاعف SectionAlignment).");
    add("Optional Header", "SizeOfHeaders", oh + 60, 4, H(u32(oh + 60)), "حجم الـ headers في الملف — أول section بيبدأ بعدها.");
    add("Optional Header", "CheckSum", oh + 64, 4, H(u32(oh + 64)), "بيتفحص للـ drivers والـ DLLs الحساسة بس. EXE عادي ممكن يبقى 0.");
    const sub = u16(oh + 68);
    add("Optional Header", "Subsystem", oh + 68, 2, sub + " = " + ({ 2: "WINDOWS_GUI", 3: "WINDOWS_CUI (console)", 1: "NATIVE (driver)" }[sub] || "?"), "GUI ولا console. malware GUI من غير أي نافذة = شائع جدًا (عشان ميظهرش console).");
    const dch = u16(oh + 70);
    add("Optional Header", "DllCharacteristics", oh + 70, 2, H(dch, 4) + " = " + flags(dch, { 0x20: "HIGH_ENTROPY_VA", 0x40: "DYNAMIC_BASE (ASLR)", 0x100: "NX_COMPAT (DEP)", 0x400: "NO_SEH", 0x4000: "GUARD_CF", 0x8000: "TERMINAL_SERVER_AWARE" }), "إعدادات الحماية: ASLR وDEP وCFG.");
    const nrva = u32(oh + 108);
    add("Optional Header", "NumberOfRvaAndSizes", oh + 108, 4, String(nrva), "عدد الـ data directories (عادة 16).");
    const DD = ["Export", "Import", "Resource", "Exception", "Security", "BaseReloc", "Debug", "Architecture", "GlobalPtr", "TLS", "LoadConfig", "BoundImport", "IAT", "DelayImport", "CLR (.NET)", "Reserved"];
    const DDD = { Export: "الدوال اللي الـ DLL بيصدّرها.", Import: "جدول الـ DLLs والدوال المستوردة — قلب التحليل الأولي.", Resource: "أيقونات، dialogs، وأحيانًا payload متشفر.", Exception: ".pdata: unwind info لكل دالة (مفيد لإيجاد حدود الدوال في x64).", BaseReloc: "أماكن العناوين المطلقة اللي بتتصلح مع ASLR.", Debug: "مسار الـ PDB — أحيانًا بيفضح اسم المستخدم/المشروع عند الـ author!", TLS: "TLS callbacks: كود بيشتغل قبل الـ entry point.", IAT: "مكان جدول العناوين اللي الـ loader بيملاه.", "CLR (.NET)": "لو موجود ← ده .NET: استخدم dnSpy مش IDA." };
    for (let i = 0; i < Math.min(nrva, 16); i++) {
      const o = oh + 112 + 8 * i, r = u32(o), sz = u32(o + 4);
      if (r || sz) add("Data Directories", "[" + i + "] " + DD[i], o, 8, "RVA " + H(r) + " · size " + H(sz), (DDD[DD[i]] || "") + " كل directory = RVA + size.", { rva: r });
    }
    secs.forEach((s) => {
      add("Section Headers", s.name, s.o, 40, "VA " + H(s.va) + " · VSize " + H(s.vs) + " · Raw " + H(s.rp) + " · RawSize " + H(s.rs) + " · " + rwx(s.ch),
        "<b>VirtualAddress</b> = مكانه في الذاكرة (RVA)، <b>PointerToRawData</b> = مكانه في الملف. " + (s.rs === 0 ? "<b>RawSize = 0</b> مع VSize > 0 ← section موجود في الذاكرة بس (زي .bss) — لو ده section كود في sample يبقى الـ packer هيفك فيه!" : "الصلاحيات " + rwx(s.ch) + (s.ch & 0x80000000 && s.ch & 0x20000000 ? " ⚠ <b>RWX</b> = علامة packer/shellcode." : ".")));
      if (s.rs) add("Sections (raw data)", s.name + " data", s.rp, s.rs, s.rs + " bytes في الملف", "محتوى الـ section في الملف. " + (s.name === ".text" ? "الكود (entry point هنا)." : s.name === ".rdata" ? "بيانات read-only: strings وثوابت." : s.name === ".idata" ? "جداول الـ imports." : ""));
    });
    const impR = u32(oh + 112 + 8), impO = rva2off(impR);
    if (impR && impO && impO.off !== null) {
      for (let o = impO.off; ; o += 20) {
        const ilt = u32(o), nm = u32(o + 12), iat = u32(o + 16);
        if (!nm) { add("Imports", "null descriptor", o, 20, "كله أصفار", "descriptor فاضي = نهاية القايمة."); break; }
        const dll = cstr(rva2off(nm).off);
        add("Imports", dll + " descriptor", o, 20, "ILT " + H(ilt) + " · Name " + H(nm) + " · IAT " + H(iat), "IMAGE_IMPORT_DESCRIPTOR لكل DLL: <b>OriginalFirstThunk</b> (ILT = أسماء)، <b>Name</b>، <b>FirstThunk</b> (IAT = اللي هيتملي عناوين).");
        let p = rva2off(ilt).off, k = 0;
        for (;;) {
          const e = Number(u64(p));
          if (!e) break;
          const hn = rva2off(e).off, fn = cstr(hn + 2);
          add("Imports", dll + "!" + fn, hn, 2 + fn.length + 1, "hint " + u16(hn) + " · IAT slot RVA " + H(iat + 8 * k) + " → VA " + H(ib + BigInt(iat + 8 * k)),
            "الـ loader بيدوّر على <b>" + esc(fn) + "</b> في " + esc(dll) + " ويكتب عنوانها في الـ IAT slot. في الملف الـ slot ده لسه فيه RVA الاسم (" + H(e) + ") — بعد التحميل بيبقى عنوان حقيقي. الكود بيناديها بـ <code>call [rip+…]</code> للـ slot ده.", { also: [rva2off(iat + 8 * k).off, 8] });
          p += 8; k++;
        }
      }
    }
    const epo = rva2off(ep);
    if (epo && epo.off !== null) add("Code", "Entry point code", epo.off, 16, "أول 16 byte: " + Array.from(bin.slice(epo.off, epo.off + 16), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" "),
      "<code>48 83 EC 28</code> = <code>sub rsp, 0x28</code> (shadow space + alignment) ثم <code>B9 F5 FF FF FF</code> = <code>mov ecx, -11</code> ثم <code>FF 15 …</code> = <code>call [rip+…]</code> لـ GetStdHandle عن طريق الـ IAT.");

    // regions for colouring
    const region = new Array(bin.length).fill("r-pad");
    const paint = (a, n, c) => { for (let i = a; i < Math.min(bin.length, a + n); i++) region[i] = c; };
    paint(0, 0x40, "r-dos"); paint(0x40, lf - 0x40, "r-stub"); paint(lf, st - lf, "r-nt"); paint(st, 40 * nsec, "r-sec");
    secs.forEach((s) => { if (s.rs) { let last = s.rp + s.rs; while (last > s.rp && !bin[last - 1]) last--; paint(s.rp, last - s.rp, s.name === ".text" ? "r-text" : s.name === ".idata" ? "r-idata" : "r-data"); } });

    const groups = [];
    F.forEach((f, i) => { let g = groups.find((x) => x.n === f.g); if (!g) groups.push(g = { n: f.g, items: [] }); g.items.push(i); });
    let hex = "";
    for (let r = 0; r < bin.length; r += 16) {
      let cells = "", asc = "";
      for (let c = 0; c < 16 && r + c < bin.length; c++) {
        const b = bin[r + c];
        cells += '<span class="pb ' + region[r + c] + '" data-o="' + (r + c) + '">' + b.toString(16).padStart(2, "0").toUpperCase() + "</span>";
        asc += b >= 32 && b < 127 ? esc(String.fromCharCode(b)) : ".";
      }
      hex += '<div class="ph-row" data-r="' + r + '"><span class="ph-off">' + r.toString(16).padStart(8, "0").toUpperCase() + "</span>" + cells + '<span class="ph-asc">' + asc + "</span></div>";
    }
    box.innerHTML = '<div class="widget-head"><span class="w-ico">🗂️</span><h4>PE Explorer: ملف EXE حقيقي (' + bin.length + ' bytes)</h4><span class="w-sub">دوس على أي field أو أي byte</span></div>' +
      '<div class="widget-body"><div class="pe-wrap"><div class="pe-tree">' + groups.map((g) => '<div class="pt-g"><div class="pt-h">' + esc(g.n) + "</div>" + g.items.map((i) => '<button class="pt-i" data-f="' + i + '">' + esc(F[i].name) + "</button>").join("") + "</div>").join("") + "</div>" +
      '<div class="pe-main"><div class="pe-info"></div><div class="pe-legend"><span class="r-dos">DOS</span><span class="r-stub">stub</span><span class="r-nt">NT headers</span><span class="r-sec">section table</span><span class="r-text">.text</span><span class="r-data">.rdata</span><span class="r-idata">.idata</span><span class="r-pad">padding</span></div><div class="pe-hex">' + hex + "</div>" +
      '<div class="pe-conv"><span class="w-lbl">RVA / VA</span><input class="w-in" value="0x2000" aria-label="RVA"><span class="pc-out"></span></div></div></div></div>';
    const hexBox = $(".pe-hex", box), info = $(".pe-info", box), bytes = $$(".pb", box);
    let selected = [];
    const mark = (ranges) => {
      selected.forEach((el) => el.classList.remove("sel"));
      selected = [];
      ranges.forEach(([a, n]) => { for (let i = a; i < a + n && i < bytes.length; i++) { bytes[i].classList.add("sel"); selected.push(bytes[i]); } });
      if (selected[0]) { const row = selected[0].parentElement; hexBox.scrollTo({ top: row.offsetTop - 40, behavior: "smooth" }); }
    };
    const pick = (i) => {
      const f = F[i];
      $$(".pt-i", box).forEach((b) => b.classList.toggle("on", Number(b.dataset.f) === i));
      const raw = Array.from(bin.slice(f.off, f.off + Math.min(f.size, 16)), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ") + (f.size > 16 ? " …" : "");
      const rv = off2rva(f.off);
      info.innerHTML = '<div class="pi-t">' + esc(f.g) + " › <b>" + esc(f.name) + '</b></div><div class="pi-grid"><span>file offset</span><code>' + H(f.off) + "</code><span>RVA</span><code>" + (rv ? H(rv.rva) : "—") + "</code><span>size</span><code>" + f.size + " B</code><span>bytes</span><code>" + raw + '</code><span>value</span><code class="pi-v">' + esc(f.val) + '</code></div><div class="pi-d">' + f.desc + "</div>";
      mark([[f.off, f.size]].concat(f.also ? [f.also] : []));
    };
    $$(".pt-i", box).forEach((b) => b.addEventListener("click", () => pick(Number(b.dataset.f))));
    hexBox.addEventListener("click", (e) => {
      const t = e.target.closest(".pb"); if (!t) return;
      const o = Number(t.dataset.o);
      let best = -1;
      F.forEach((f, i) => { if (o >= f.off && o < f.off + f.size && (best < 0 || f.size < F[best].size)) best = i; });
      if (best >= 0) pick(best); else { info.innerHTML = '<div class="pi-t">offset ' + H(o) + "</div><div class=\"pi-d\">padding / بيانات مالهاش field — " + (off2rva(o) ? "RVA " + H(off2rva(o).rva) : "برا أي section") + "</div>"; mark([[o, 1]]); }
    });
    const conv = () => {
      const inp = $(".pe-conv input", box), out = $(".pc-out", box);
      let v = parseNum(inp.value, 64);
      if (v === null) { out.textContent = "اكتب رقم hex"; return; }
      if (v >= ib) v -= ib;
      const r = Number(v), x = rva2off(r);
      if (!x) { out.innerHTML = "RVA " + H(r) + " ← برا الصورة"; return; }
      if (x.off === null) { out.innerHTML = "RVA " + H(r) + " في <b>" + esc(x.s.name) + "</b> بس <b>مالهاش bytes في الملف</b> (جزء الذاكرة بس — زي .bss)"; return; }
      out.innerHTML = "RVA " + H(r) + " = VA " + H(ib + BigInt(r)) + " ← " + (x.s ? "<b>" + esc(x.s.name) + "</b>: " + H(r) + " − " + H(x.s.va) + " + " + H(x.s.rp) + " = " : "headers: ") + "file offset <b>" + H(x.off) + "</b>";
      mark([[x.off, 1]]);
    };
    $(".pe-conv input", box).addEventListener("input", conv);
    pick(1); conv(); pick(1);
  }

  /* ================================================================ CFG */
  const JMP_RE = /^(jmp|j[a-z]{1,4}|loop\w*|jrcxz|jecxz)$/i;
  function parseListing(text) {
    const items = [];
    text.split("\n").forEach((raw) => {
      let line = raw.replace(/\s;.*$|^;.*$/, "").replace(/\s#.*$/, "").replace(/\t/g, " ");
      if (!line.trim()) return;
      let m;
      if (/^\s*\S+\s+(PROC|ENDP)\b/.test(line) || /^\s*[\w$@?]+\s*=\s*-?\d+/.test(line) || /^\s*\.(file|text|globl|type|size|section|p2align|align|cfi_|ident|intel_syntax|att_syntax)/.test(line)) return;
      while ((m = /^\s*([\w.$@?]+):\s*(.*)$/.exec(line))) { items.push({ label: m[1] }); line = m[2]; if (!line.trim()) break; }
      if (!line.trim() || /^\s*\./.test(line)) return;
      const t = line.trim().replace(/\s+/g, " ");
      const mn = t.split(" ")[0].toLowerCase();
      const op = t.slice(mn.length).trim();
      items.push({ ins: t, mn, op });
    });
    return items;
  }
  function buildCFG(text) {
    const items = parseListing(text);
    const labels = new Set(items.filter((x) => x.label).map((x) => x.label));
    const blocks = [];
    let cur = null;
    const start = (label) => { cur = { id: blocks.length, labels: label ? [label] : [], ins: [], out: [] }; blocks.push(cur); };
    let ended = true;
    items.forEach((it) => {
      if (it.label) {
        if (cur && !cur.ins.length && !ended) { cur.labels.push(it.label); return; }
        start(it.label); ended = false; return;
      }
      if (!cur || ended) start(null);
      ended = false;
      cur.ins.push(it);
      if (JMP_RE.test(it.mn) || /^ret[nq]?$/.test(it.mn) || it.mn === "ud2") ended = true;
    });
    const byLabel = new Map();
    blocks.forEach((b) => b.labels.forEach((l) => byLabel.set(l, b.id)));
    blocks.forEach((b, k) => {
      const last = b.ins[b.ins.length - 1];
      const next = k + 1 < blocks.length ? k + 1 : null;
      if (!last) { if (next !== null) b.out.push({ to: next, kind: "u" }); return; }
      const tgtName = last.op.replace(/^(short|near)\s+/, "").replace(/^qword ptr\s+/, "").split(/[\s,]/)[0];
      const tgt = byLabel.has(tgtName) ? byLabel.get(tgtName) : null;
      if (/^ret[nq]?$/.test(last.mn) || last.mn === "ud2") { b.exit = true; return; }
      if (last.mn === "jmp") { if (tgt !== null) b.out.push({ to: tgt, kind: "u" }); else b.exit = true; return; }
      if (JMP_RE.test(last.mn)) { if (tgt !== null) b.out.push({ to: tgt, kind: "t" }); if (next !== null) b.out.push({ to: next, kind: "f" }); return; }
      if (next !== null) b.out.push({ to: next, kind: "u" });
    });
    void labels;
    return blocks;
  }
  function renderCFG(text, mount) {
    const blocks = buildCFG(text);
    if (!blocks.length) { mount.textContent = "مفيش كود"; return; }
    const CW = 7.1, LH = 16, PADX = 10, PADY = 8;
    blocks.forEach((b) => {
      const lines = (b.labels.length ? [b.labels.join(", ") + ":"] : []).concat(b.ins.map((i) => i.ins));
      b.lines = lines.map((l) => (l.length > 46 ? l.slice(0, 45) + "…" : l));
      b.w = Math.max(90, Math.max(...b.lines.map((l) => l.length)) * CW + PADX * 2);
      b.h = b.lines.length * LH + PADY * 2;
    });
    // DFS for back edges + order
    const state = new Array(blocks.length).fill(0);
    const visit = (u) => { state[u] = 1; blocks[u].out.forEach((e) => { if (state[e.to] === 1) e.back = true; else if (state[e.to] === 0) visit(e.to); }); state[u] = 2; };
    visit(0);
    blocks.forEach((b, k) => { if (!state[k]) visit(k); });
    // layers = longest path on DAG
    const layer = new Array(blocks.length).fill(0);
    for (let it = 0; it < blocks.length + 2; it++) {
      let ch = false;
      blocks.forEach((b) => b.out.forEach((e) => { if (!e.back && layer[e.to] < layer[b.id] + 1) { layer[e.to] = layer[b.id] + 1; ch = true; } }));
      if (!ch) break;
    }
    const L = [];
    blocks.forEach((b) => { (L[layer[b.id]] = L[layer[b.id]] || []).push(b); });
    // barycenter ordering
    const pos = new Map();
    L.forEach((row) => row.forEach((b, k) => pos.set(b.id, k)));
    for (let pass = 0; pass < 2; pass++) {
      L.forEach((row, li) => {
        if (!li) return;
        row.forEach((b) => {
          const ps = blocks.filter((p) => p.out.some((e) => e.to === b.id && !e.back));
          b.bc = ps.length ? ps.reduce((s, p) => s + pos.get(p.id) + (p.out.find((e) => e.to === b.id).kind === "t" ? -0.3 : p.out.find((e) => e.to === b.id).kind === "f" ? 0.3 : 0), 0) / ps.length : pos.get(b.id);
        });
        row.sort((a, c) => a.bc - c.bc);
        row.forEach((b, k) => pos.set(b.id, k));
      });
    }
    const GX = 46, GY = 56;
    const widthOf = (row) => row.reduce((s, b) => s + b.w, 0) + GX * (row.length - 1);
    const W = Math.max(...L.map(widthOf)) + 200;
    let y = 16;
    L.forEach((row) => {
      let x = (W - 200 - widthOf(row)) / 2 + 80;
      const rh = Math.max(...row.map((b) => b.h));
      row.forEach((b) => { b.x = x; b.y = y; x += b.w + GX; });
      y += rh + GY;
    });
    const H = y;
    const svg = [];
    svg.push('<svg viewBox="0 0 ' + W + " " + H + '" width="' + Math.min(W, 1600) + '" xmlns="http://www.w3.org/2000/svg"><defs>');
    [["t", "#4ade80"], ["f", "#ff6b81"], ["u", "#57b8ff"]].forEach(([k, c]) => svg.push('<marker id="ah-' + k + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="' + c + '"/></marker>'));
    svg.push("</defs>");
    let backLane = 0;
    blocks.forEach((b) => {
      const outs = b.out;
      outs.forEach((e, k) => {
        const t = blocks[e.to];
        const off = outs.length > 1 ? (k === 0 ? -b.w * 0.22 : b.w * 0.22) : 0;
        const x1 = b.x + b.w / 2 + off, y1 = b.y + b.h;
        const x2 = t.x + t.w / 2 + (e.kind === "t" ? -8 : e.kind === "f" ? 8 : 0), y2 = t.y;
        let d;
        const skip = layer[e.to] - layer[b.id] > 1 && blocks.some((o) => layer[o.id] > layer[b.id] && layer[o.id] < layer[e.to] &&
          o.x < Math.max(x1, x2) + 10 && o.x + o.w > Math.min(x1, x2) - 10);
        if (e.back || t.y <= b.y) {
          backLane++;
          const lx = Math.max(b.x + b.w, t.x + t.w) + 18 + backLane * 10;
          d = "M" + x1 + "," + y1 + " L" + x1 + "," + (y1 + 14) + " L" + lx + "," + (y1 + 14) + " L" + lx + "," + (y2 - 16) + " L" + x2 + "," + (y2 - 16) + " L" + x2 + "," + y2;
        } else if (skip) {
          // edge jumps over a whole layer: route it around the blocks in between (left side)
          backLane++;
          const between = blocks.filter((o) => layer[o.id] > layer[b.id] && layer[o.id] < layer[e.to]);
          const lx = Math.min(b.x, t.x, ...between.map((o) => o.x)) - 16 - backLane * 8;
          d = "M" + x1 + "," + y1 + " L" + x1 + "," + (y1 + 14) + " L" + lx + "," + (y1 + 14) + " L" + lx + "," + (y2 - 16) + " L" + x2 + "," + (y2 - 16) + " L" + x2 + "," + y2;
        } else {
          const my = (y1 + y2) / 2;
          d = "M" + x1 + "," + y1 + " C" + x1 + "," + (my + 4) + " " + x2 + "," + (my - 4) + " " + x2 + "," + y2;
        }
        svg.push('<path class="cfg-edge ' + e.kind + (e.back ? " back" : "") + '" d="' + d + '" marker-end="url(#ah-' + e.kind + ')"/>');
      });
    });
    blocks.forEach((b, k) => {
      svg.push('<g class="cfg-node' + (k === 0 ? " entry" : "") + (b.exit ? " exit" : "") + '"><rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="8"/>');
      b.lines.forEach((l, i) => {
        const isLbl = i === 0 && b.labels.length;
        const yy = b.y + PADY + (i + 1) * LH - 4;
        if (isLbl) svg.push('<text class="lb" x="' + (b.x + PADX) + '" y="' + yy + '">' + esc(l) + "</text>");
        else {
          const sp = l.indexOf(" ");
          svg.push('<text x="' + (b.x + PADX) + '" y="' + yy + '"><tspan class="mn" style="fill:#82aaff">' + esc(sp < 0 ? l : l.slice(0, sp)) + "</tspan>" + (sp < 0 ? "" : esc(l.slice(sp))) + "</text>");
        }
      });
      svg.push("</g>");
    });
    svg.push("</svg>");
    mount.innerHTML = svg.join("");
  }
  function openCFG(host, getText, anchor) {
    let wrap = host.querySelector(":scope > .cfg-wrap");
    if (wrap) { wrap.hidden = !wrap.hidden; return; }
    wrap = document.createElement("div");
    wrap.className = "cfg-wrap";
    wrap.innerHTML = '<div class="cfg-head">⧉ CONTROL-FLOW GRAPH (زي IDA Graph View)<span class="lg"><span><i style="background:#4ade80"></i>الشرط اتحقق</span><span><i style="background:#ff6b81"></i>مش متحقق</span><span><i style="background:#57b8ff"></i>دايمًا</span></span></div><div class="cfg-scroll"></div>';
    (anchor || host.lastElementChild).insertAdjacentElement("afterend", wrap);
    renderCFG(getText(), $(".cfg-scroll", wrap));
  }

  /* ================================================================ init */
  function initAll(api) {
    API = api;
    const labs = $$(".lab");
    const make = (el) => { if (el.dataset.ready) return; el.dataset.ready = "1"; try { el._lab = new Lab(el); } catch (e) { el.innerHTML = '<div class="lab-loading">تعذّر تحميل المعمل: ' + esc(e.message) + "</div>"; console.error(e); } };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { make(en.target); io.unobserve(en.target); } }), { rootMargin: "600px 0px" });
      labs.forEach((el) => io.observe(el));
    } else labs.forEach(make);
    // Safety net: build any lab the observer has not reached yet, a few at a time in idle moments.
    const pending = () => labs.filter((el) => !el.dataset.ready);
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 60));
    const pump = () => idle((dl) => {
      const list = pending();
      for (let k = 0; k < list.length && (dl.timeRemaining() > 4 || k === 0); k++) make(list[k]);
      if (pending().length) setTimeout(pump, 120);
    }, { timeout: 800 });
    setTimeout(pump, 1500);
    labs.forEach((el) => el.addEventListener("pointerdown", () => make(el), { once: true }));
    const W = { conv: wConverter, regs: wRegs, flags: wFlags, encoder: wEncoder, endian: wEndian, addr: wAddr, simd: wSimd, fcmp: wFcmp, idioms: wIdioms, walk: wWalk, pe: wPE };
    $$("[data-widget]").forEach((b) => { const f = W[b.dataset.widget]; if (f) { try { f(b); } catch (e) { console.error(e); } } });
  }

  window.AsmLab = { initAll, Lab, renderCFG, openCFG, buildCFG, parseNum };
})();
