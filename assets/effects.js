/* ASM Mastery: visual polish layer (independent of app.js). */
(function () {
  "use strict";
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

  function heroCPU() {
    var box = document.getElementById("heroCpu");
    if (!box || !window.AsmEmu) return;
    var E = window.AsmEmu;
    var src = [
      "sum:                 ; rax = 5+4+3+2+1",
      "    xor   eax, eax",
      "    mov   ecx, 5",
      ".loop:",
      "    add   eax, ecx",
      "    dec   ecx",
      "    jnz   .loop      ; ZF=0 → ارجع",
      "    ret"
    ].join("\n");
    var prog = E.assemble(src);
    if (!prog.ok) return;
    var lines = src.split("\n");
    var codeEl = box.querySelector(".hc-code"), regEl = box.querySelector(".hc-regs"), noteEl = box.querySelector(".hc-note");
    var hl = window.AsmCourse ? window.AsmCourse.highlightAsm : function (s) { return s; };
    codeEl.innerHTML = lines.map(function (l, i) {
      var I = prog.ins.find(function (x) { return x.line === i + 1; });
      var bytes = I ? I.bytes.map(function (b) { return ("0" + b.toString(16)).slice(-2).toUpperCase(); }).join(" ") : "";
      return '<div class="hc-ln" data-l="' + (i + 1) + '"><span class="hc-ad">' + (I ? I.addr.toString(16).toUpperCase() : "") + '</span><span class="hc-by">' + bytes + '</span><span class="hc-tx">' + hl(l) + "</span></div>";
    }).join("");
    var m, prev, timer;
    function reg(name, val, chg) { return '<div class="hc-r' + (chg ? " chg" : "") + '"><b>' + name + "</b><span>" + val + "</span></div>"; }
    function draw(res) {
      var cur = prog.byAddr.get(m.rip);
      Array.prototype.forEach.call(codeEl.children, function (d) { d.classList.toggle("cur", !!cur && Number(d.dataset.l) === cur.line); });
      var f = m.flags();
      regEl.innerHTML =
        reg("RAX", "0x" + m.regs[0].toString(16).toUpperCase(), prev && prev[0] !== m.regs[0]) +
        reg("RCX", "0x" + m.regs[1].toString(16).toUpperCase(), prev && prev[1] !== m.regs[1]) +
        reg("RIP", m.rip === E.EXIT_ADDR ? "ret ↩" : "0x" + m.rip.toString(16).toUpperCase(), true) +
        reg("ZF", f.ZF ? "1" : "0", res && res.snap && ((res.snap.fl >> 6) & 1) !== (f.ZF ? 1 : 0));
      if (res && res.ins) {
        var I = res.ins, t = I.text;
        if (I.form === "jcc") noteEl.textContent = t + "  →  " + (res.info.taken ? "القفز حصل (ZF=0)" : "مفيش قفز (ZF=1) — الـ loop خلصت");
        else if (I.mn === "ret") noteEl.textContent = "ret → الدالة رجعت والنتيجة في RAX = " + m.regs[0];
        else noteEl.textContent = t;
      } else noteEl.textContent = "الـ CPU بينفّذ instruction ورا التانية…";
    }
    function start() { m = new E.Machine(prog, ""); prev = m.regs.slice(); draw(null); }
    function tick() {
      if (m.halted) { timer = setTimeout(function () { start(); timer = setTimeout(tick, 1100); }, 2600); return; }
      prev = m.regs.slice();
      var r = m.step();
      draw(r);
      timer = setTimeout(tick, 1000);
    }
    start();
    if (reduced) return;
    var visible = true;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      if (visible && !timer) timer = setTimeout(tick, 600);
      if (!visible && timer) { clearTimeout(timer); timer = null; }
    }).observe(box);
    else timer = setTimeout(tick, 900);
  }

  function start() {
    if (fine) {
      document.addEventListener("pointermove", function (e) {
        var c = e.target.closest && e.target.closest(".card, .source");
        if (!c) return;
        var b = c.getBoundingClientRect();
        c.style.setProperty("--mx", e.clientX - b.left + "px");
        c.style.setProperty("--my", e.clientY - b.top + "px");
      }, { passive: true });
    }
    var term = document.querySelector(".hero .terminal");
    if (term && fine && !reduced) {
      term.addEventListener("pointermove", function (e) {
        var b = term.getBoundingClientRect();
        term.style.setProperty("--ry", (((e.clientX - b.left) / b.width - 0.5) * 4).toFixed(2) + "deg");
        term.style.setProperty("--rx", (-((e.clientY - b.top) / b.height - 0.5) * 4).toFixed(2) + "deg");
      });
      term.addEventListener("pointerleave", function () { term.style.setProperty("--ry", "0deg"); term.style.setProperty("--rx", "0deg"); });
    }
    heroCPU();

    var secs = document.querySelectorAll(".section");
    if ("IntersectionObserver" in window) {
      var seen = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("fx-seen"); seen.unobserve(x.target); } }); }, { rootMargin: "0px 0px -15% 0px" });
      secs.forEach(function (s) { seen.observe(s); });
    } else secs.forEach(function (s) { s.classList.add("fx-seen"); });

    // reading size
    var SIZES = ["sm", "md", "lg", "xl"], root = document.documentElement, cur = "md";
    var apply = function (s) { if (s === "md") root.removeAttribute("data-size"); else root.setAttribute("data-size", s); };
    try { cur = localStorage.getItem("asmMastery.size") || "md"; } catch (e) {}
    if (SIZES.indexOf(cur) === -1) cur = "md";
    apply(cur);
    document.querySelectorAll("[data-size-step]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = SIZES.indexOf(cur) + Number(b.getAttribute("data-size-step"));
        cur = SIZES[Math.max(0, Math.min(SIZES.length - 1, i))]; apply(cur);
        try { localStorage.setItem("asmMastery.size", cur); } catch (e) {}
      });
    });

    // hero backdrop: "opcode rain" made of real x86-64 instruction bytes
    var canvas = document.getElementById("hexRain");
    if (canvas && !reduced && canvas.getContext) {
      var ctx = canvas.getContext("2d"), cols = [], colW = 28, rowH = 20, dpr = Math.min(window.devicePixelRatio || 1, 2), vis = true, last = 0;
      var OPS = ["55", "48", "89", "E5", "C3", "CC", "90", "E8", "FF", "0F", "05", "31", "C0", "74", "75", "EB", "E9", "8B", "8D", "83", "EC", "C9", "4C", "41", "5D", "B8", "3C", "50", "58", "0F", "84", "85", "C7", "45", "F8"];
      var resize = function () {
        var b = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, b.width * dpr); canvas.height = Math.max(1, b.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cols = []; for (var i = 0; i < Math.ceil(b.width / colW); i++) cols.push({ y: Math.random() * b.height, sp: 8 + Math.random() * 22, hot: Math.random() < 0.12 });
      };
      resize(); window.addEventListener("resize", resize);
      if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { vis = e[0].isIntersecting; }).observe(canvas);
      var frame = function (now) {
        requestAnimationFrame(frame);
        if (!vis || document.hidden) { last = now; return; }
        var dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
        var h = canvas.height / dpr, w = canvas.width / dpr;
        ctx.clearRect(0, 0, w, h); ctx.font = "12px 'JetBrains Mono', Consolas, monospace";
        for (var i = 0; i < cols.length; i++) {
          var c = cols[i]; c.y += c.sp * dt;
          if (c.y > h + rowH * 8) { c.y = -rowH * 4; c.hot = Math.random() < 0.12; }
          for (var k = 0; k < 8; k++) {
            var y = c.y - k * rowH; if (y < -rowH || y > h + rowH) continue;
            var seed = (i * 31 + Math.floor(y / rowH) * 17) % OPS.length;
            var a = (1 - k / 8) * (k === 0 ? 0.55 : 0.22);
            ctx.fillStyle = c.hot ? "rgba(180,140,255," + a + ")" : "rgba(63,208,232," + a + ")";
            ctx.fillText(OPS[seed], i * colW, y);
          }
        }
      };
      requestAnimationFrame(frame);
    }

    var top = document.createElement("button");
    top.type = "button"; top.className = "fx-top"; top.setAttribute("aria-label", "الرجوع لأعلى الصفحة"); top.textContent = "↑";
    top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); });
    document.body.appendChild(top);
    var tk = false;
    window.addEventListener("scroll", function () { if (tk) return; tk = true; requestAnimationFrame(function () { top.classList.toggle("show", window.scrollY > 900); tk = false; }); }, { passive: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
