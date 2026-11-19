/* ============================================================
   ASM Explorer — animated, step-by-step "scenes" that show what
   happens inside the machine (inspired by protocol explorers):
   isometric stage · flying values · step list · facts · trace log
   · scene / sequence views · play / step / back / speed.
   Scenes live in assets/scenes.js (window.ASM_SCENES).
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const COLORS = { acc: "#3fd0e8", vio: "#b48cff", amb: "#ffb454", grn: "#4ade80", red: "#ff6b81", blu: "#57b8ff" };
  const KIND = {   // default packet kinds (scenes may add their own)
    data: ["DATA", "#57b8ff"], push: ["PUSH", "#ffb454"], pop: ["POP", "#4ade80"], jump: ["JUMP", "#b48cff"],
    call: ["CALL", "#ffb454"], ret: ["RET", "#4ade80"], read: ["READ", "#3fd0e8"], write: ["WRITE", "#ff8d9d"],
    sys: ["SYSCALL", "#b48cff"], api: ["API", "#3fd0e8"], bad: ["ATTACK", "#ff6b81"], fetch: ["FETCH", "#3fd0e8"],
    exec: ["EXEC", "#4ade80"], ctrl: ["CONTROL", "#b48cff"], net: ["NET", "#ffb454"]
  };

  /* ---------------- isometric art ---------------- */
  const P = (cx, cy, x, y, z) => [cx + (x - y) * 0.866, cy + (x + y) * 0.5 - z];
  const pts = (arr) => arr.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  function isoBox(cx, cy, x0, y0, a, b, h, col, extra) {
    const z0 = (extra && extra.z) || 0;
    const top = [P(cx, cy, x0, y0, z0 + h), P(cx, cy, x0 + a, y0, z0 + h), P(cx, cy, x0 + a, y0 + b, z0 + h), P(cx, cy, x0, y0 + b, z0 + h)];
    const fx = [P(cx, cy, x0 + a, y0, z0), P(cx, cy, x0 + a, y0 + b, z0), P(cx, cy, x0 + a, y0 + b, z0 + h), P(cx, cy, x0 + a, y0, z0 + h)];
    const fy = [P(cx, cy, x0, y0 + b, z0), P(cx, cy, x0 + a, y0 + b, z0), P(cx, cy, x0 + a, y0 + b, z0 + h), P(cx, cy, x0, y0 + b, z0 + h)];
    return '<polygon class="ix-side" style="--c:' + col + '" points="' + pts(fx) + '"/>' +
      '<polygon class="ix-side2" style="--c:' + col + '" points="' + pts(fy) + '"/>' +
      '<polygon class="ix-top" style="--c:' + col + '" points="' + pts(top) + '"/>';
  }
  const ICONS = {
    cpu(c) {
      let s = isoBox(0, 0, -34, -34, 68, 68, 9, c);
      s += isoBox(0, 0, -17, -17, 34, 34, 5, c, { z: 9 });
      for (let i = -26; i <= 26; i += 13) {
        const a = P(0, 0, 34, i, 4), b = P(0, 0, 42, i, 4), d = P(0, 0, i, 34, 4), e = P(0, 0, i, 42, 4);
        s += '<line class="ix-line" style="--c:' + c + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
        s += '<line class="ix-line" style="--c:' + c + '" x1="' + d[0] + '" y1="' + d[1] + '" x2="' + e[0] + '" y2="' + e[1] + '"/>';
      }
      const t = P(0, 0, 0, 0, 14);
      return s + '<text class="ix-chip" x="' + t[0] + '" y="' + (t[1] + 4) + '" text-anchor="middle">x64</text>';
    },
    ram(c) {
      let s = isoBox(0, 0, -52, -12, 104, 24, 5, c);
      for (let i = 0; i < 4; i++) s += isoBox(0, 0, -46 + i * 24, -7, 18, 14, 4, c, { z: 5 });
      return s;
    },
    server(c) {
      let s = "";
      for (let k = 0; k < 3; k++) {
        s += isoBox(0, 0, -26, -26, 52, 52, 15, c, { z: k * 18 });
        const d = P(0, 0, 26, -14, k * 18 + 8), d2 = P(0, 0, 26, -6, k * 18 + 8);
        s += '<circle class="ix-led" cx="' + d[0] + '" cy="' + d[1] + '" r="2"/><circle class="ix-led b" cx="' + d2[0] + '" cy="' + d2[1] + '" r="2"/>';
      }
      return s;
    },
    file(c) {
      let s = isoBox(0, 0, -24, -4, 48, 8, 62, c);
      for (let k = 0; k < 5; k++) { const a = P(0, 0, -16, 4, 48 - k * 9), b = P(0, 0, 16 - (k % 2) * 10, 4, 48 - k * 9); s += '<line class="ix-line" style="--c:' + c + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>'; }
      return s;
    },
    kernel(c) {
      let s = isoBox(0, 0, -30, -30, 60, 60, 34, c);
      [[-30, -30], [18, -30], [-30, 18], [18, 18]].forEach(([x, y]) => { s += isoBox(0, 0, x, y, 12, 12, 10, c, { z: 34 }); });
      const t = P(0, 0, 0, 30, 18);
      return s + '<text class="ix-chip" x="' + (t[0] - 22) + '" y="' + (t[1] + 2) + '" text-anchor="middle">R0</text>';
    },
    proc(c) {
      let s = isoBox(0, 0, -36, -3, 72, 6, 52, c);
      const a = P(0, 0, -36, 3, 42), b = P(0, 0, 36, 3, 42);
      s += '<line class="ix-line" style="--c:' + c + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
      [-30, -24, -18].forEach((x) => { const d = P(0, 0, x, 3, 47); s += '<circle class="ix-led" cx="' + d[0] + '" cy="' + d[1] + '" r="1.6"/>'; });
      return s;
    },
    dll(c) {
      return isoBox(0, 0, -30, -20, 60, 40, 10, c) + isoBox(0, 0, -26, -16, 52, 32, 9, c, { z: 10 }) + isoBox(0, 0, -22, -12, 44, 24, 8, c, { z: 19 });
    },
    mmu(c) {
      let s = isoBox(0, 0, -32, -32, 64, 64, 12, c);
      for (let k = -16; k <= 16; k += 16) {
        const a = P(0, 0, k, -32, 12), b = P(0, 0, k, 32, 12), d = P(0, 0, -32, k, 12), e = P(0, 0, 32, k, 12);
        s += '<line class="ix-line" style="--c:' + c + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/><line class="ix-line" style="--c:' + c + '" x1="' + d[0] + '" y1="' + d[1] + '" x2="' + e[0] + '" y2="' + e[1] + '"/>';
      }
      return s;
    },
    cloud(c) {
      return '<path class="ix-top" style="--c:' + c + '" d="M-46,14 C-62,14 -62,-10 -44,-10 C-44,-30 -16,-36 -6,-20 C2,-38 34,-34 34,-12 C54,-14 58,14 38,14 Z"/>' +
        '<circle class="ix-line" style="--c:' + c + ';fill:none" cx="-4" cy="-2" r="11"/><path class="ix-line" style="--c:' + c + ';fill:none" d="M-15,-2 H7 M-4,-13 C-10,-6 -10,4 -4,9 M-4,-13 C2,-6 2,4 -4,9"/>';
    },
    bug(c) {
      let s = '<ellipse class="ix-top" style="--c:' + c + '" cx="0" cy="0" rx="17" ry="23"/><circle class="ix-side" style="--c:' + c + '" cx="0" cy="-24" r="9"/>';
      [-12, 0, 12].forEach((y) => { s += '<path class="ix-line" style="--c:' + c + ';fill:none" d="M-16,' + y + ' L-30,' + (y - 6) + ' M16,' + y + ' L30,' + (y - 6) + '"/>'; });
      return s + '<line class="ix-line" style="--c:' + c + '" x1="0" y1="-22" x2="0" y2="22"/>';
    },
    shield(c) {
      return '<path class="ix-top" style="--c:' + c + '" d="M0,-34 L28,-24 C28,6 18,24 0,34 C-18,24 -28,6 -28,-24 Z"/><path class="ix-line" style="--c:' + c + ';fill:none" d="M-10,0 L-2,8 L12,-10"/>';
    },
    user(c) {
      return '<circle class="ix-top" style="--c:' + c + '" cx="0" cy="-16" r="13"/><path class="ix-side" style="--c:' + c + '" d="M-24,26 C-24,4 24,4 24,26 Z"/>';
    }
  };

  /* ---------------- helpers ---------------- */
  function merge(base, upd) {
    const out = Object.assign({}, base);
    Object.keys(upd || {}).forEach((k) => {
      if (k === "regs" || k === "sub" || k === "box") {
        out[k] = Object.assign({}, base[k] || {});
        Object.keys(upd[k]).forEach((a) => { out[k][a] = (upd[k][a] && typeof upd[k][a] === "object" && !Array.isArray(upd[k][a])) ? Object.assign({}, (base[k] || {})[a], upd[k][a]) : upd[k][a]; });
      } else out[k] = upd[k];
    });
    return out;
  }

  class Explorer {
    constructor(el, sceneId, opts) {
      this.el = el;
      this.opts = opts || {};
      this.speed = 1;
      this.view = "scene";
      this.k = 0;
      this.playing = false;
      this.timer = null;
      this.animToken = 0;
      this.build();
      this.load(sceneId);
    }
    build() {
      this.el.classList.add("xp");
      this.el.innerHTML =
        '<div class="xp-head"><span class="xp-badge">🎬 EXPLORER</span><div class="xp-titles"><b class="xp-title"></b><span class="xp-sub"></span></div>' +
        '<div class="xp-views" role="group" aria-label="طريقة العرض"><button type="button" data-v="scene" class="on">◈ SCENE</button><button type="button" data-v="seq">⇅ SEQUENCE</button></div></div>' +
        '<div class="xp-body"><div class="xp-stage-wrap"><div class="xp-stage" dir="ltr"></div><div class="xp-seq" dir="ltr" hidden></div></div>' +
        '<aside class="xp-side"><div class="xp-side-t">STEPS</div><ol class="xp-steps"></ol><div class="xp-side-t">OVERVIEW</div><div class="xp-over"></div><dl class="xp-facts"></dl></aside></div>' +
        '<div class="xp-ctrl" dir="ltr"><button type="button" class="xp-b" data-c="speed" title="السرعة">1×</button><button type="button" class="xp-b" data-c="back" title="خطوة لورا (←)">◀</button>' +
        '<button type="button" class="xp-play" data-c="play" title="تشغيل / إيقاف (Space)">▶ PLAY</button><button type="button" class="xp-b" data-c="step" title="الخطوة الجاية (→)">STEP ▶</button>' +
        '<button type="button" class="xp-b" data-c="reset" title="من الأول">↺</button><div class="xp-prog"><i></i></div><span class="xp-count"></span></div>' +
        '<div class="xp-explain"></div>' +
        '<div class="xp-log" dir="ltr"><div class="xp-log-h"><b>TRACE</b><span class="xp-legend"></span></div><div class="xp-table-wrap"><table><thead><tr><th>NO.</th><th>STEP</th><th>FROM</th><th>TO</th><th>TYPE</th><th>INFO</th></tr></thead><tbody></tbody></table></div></div>';
      this.stage = $(".xp-stage", this.el);
      this.seqEl = $(".xp-seq", this.el);
      $$(".xp-views button", this.el).forEach((b) => b.addEventListener("click", () => this.setView(b.dataset.v)));
      $$("[data-c]", this.el).forEach((b) => b.addEventListener("click", () => this.ctrl(b.dataset.c)));
      this.el.tabIndex = 0;
      this.el.addEventListener("keydown", (e) => {
        if (e.target.closest("input,textarea")) return;
        if (e.key === " ") { e.preventDefault(); this.ctrl("play"); }
        else if (e.key === "ArrowRight") { e.preventDefault(); this.ctrl("step"); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); this.ctrl("back"); }
      });
    }
    load(id) {
      this.stop();
      const sc = (window.ASM_SCENES || {})[id];
      this.sc = sc;
      this.uid = (sc ? sc.id : 'x') + '-' + (Explorer.n = (Explorer.n || 0) + 1);
      if (!sc) { this.stage.innerHTML = '<div class="xp-missing">scene not found: ' + esc(id) + "</div>"; return; }
      this.kinds = Object.assign({}, KIND, sc.kinds || {});
      $(".xp-title", this.el).textContent = sc.title;
      $(".xp-sub", this.el).textContent = sc.sub || "";
      $(".xp-over", this.el).innerHTML = sc.overview || "";
      $(".xp-facts", this.el).innerHTML = (sc.facts || []).map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + v + "</dd>").join("");
      $(".xp-steps", this.el).innerHTML = sc.steps.map((s, i) => '<li data-i="' + (i + 1) + '"><span class="n">' + (i + 1) + '</span><span><b>' + esc(s.t) + "</b>" + (s.st ? "<small>" + esc(s.st) + "</small>" : "") + "</span></li>").join("");
      $$(".xp-steps li", this.el).forEach((li) => li.addEventListener("click", () => { this.stop(); this.go(Number(li.dataset.i), false); }));
      const usedKinds = new Set();
      sc.steps.forEach((s) => (s.fly || []).forEach((f) => usedKinds.add(f.kind || "data")));
      $(".xp-legend", this.el).innerHTML = Array.from(usedKinds).map((k) => '<span><i style="background:' + (this.kinds[k] || KIND.data)[1] + '"></i>' + (this.kinds[k] || KIND.data)[0] + "</span>").join("");
      // fixed panel heights (needed for anchors before the first render)
      sc.actors.forEach((a) => {
        if (!a.w) return;
        const RH = a.rh || 19;
        const n = a.type === "code" ? a.lines.length : a.type === "regs" ? a.names.length : Math.max((a.rows || []).length, a.minRows || 0, ((sc.init || {}).stack || []).length);
        a.h = 34 + n * RH;
      });
      // states
      this.states = [merge({ regs: {}, sub: {}, box: {}, stack: null, code: -1, glow: [], dim: [] }, sc.init || {})];
      sc.steps.forEach((s, i) => { this.states.push(merge(merge(this.states[i], { glow: [], dim: this.states[i].dim }), s.set || {})); });
      this.drawStage();
      this.go(0, false);
    }
    /* ---------- stage drawing ---------- */
    drawStage() {
      const sc = this.sc, W = sc.w || 960, H = sc.h || 440;
      let svg = '<svg viewBox="0 0 ' + W + " " + H + '" xmlns="' + NS + '" role="img" aria-label="' + esc(sc.title) + '"><defs>' +
        '<pattern id="xpgrid-' + this.uid + '" width="28" height="16" patternUnits="userSpaceOnUse"><path d="M0,8 L14,0 L28,8 L14,16 Z" fill="none" class="xp-gridline"/></pattern>' +
        '<filter id="xpglow-' + this.uid + '" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
        '<rect width="' + W + '" height="' + H + '" fill="url(#xpgrid-' + this.uid + ')" opacity=".6"/>';
      (sc.links || []).forEach((l) => {
        const a = this.anchor(l[0], l[1]), b = this.anchor(l[1], l[0]);
        svg += '<path class="xp-link" d="M' + a[0] + "," + a[1] + " L" + b[0] + "," + b[1] + '"/>';
      });
      svg += '<g class="xp-actors"></g><g class="xp-fx"></g></svg>';
      this.stage.innerHTML = svg;
      this.svg = $("svg", this.stage);
      this.gActors = $(".xp-actors", this.svg);
      this.gFx = $(".xp-fx", this.svg);
    }
    actor(id) { return this.sc.actors.find((a) => a.id === id); }
    anchor(id, toward) {
      const a = this.actor(id);
      if (!a) return [0, 0];
      if (a.w) {   // panel: nearest point on its border towards the other actor
        const t = this.actor(toward) || a;
        const tc = t.w ? [t.x + t.w / 2, t.y + (t.h || 100) / 2] : [t.x, t.y];
        const cx = a.x + a.w / 2, cy = a.y + (a.h || 100) / 2;
        const dx = tc[0] - cx, dy = tc[1] - cy;
        if (Math.abs(dx) * (a.h || 100) > Math.abs(dy) * a.w) return [dx > 0 ? a.x + a.w : a.x, cy];
        return [cx, dy > 0 ? a.y + (a.h || 100) : a.y];
      }
      return [a.x, a.y - 6];
    }
    renderActors(state, prev) {
      const out = [];
      this.sc.actors.forEach((a) => {
        const col = COLORS[a.color] || a.color || COLORS.acc;
        const glow = state.glow.includes(a.id);
        const dim = (state.dim || []).includes(a.id);
        const sub = state.sub[a.id] !== undefined ? state.sub[a.id] : a.sub;
        let g = '<g class="xp-actor' + (glow ? " on" : "") + (dim ? " dim" : "") + '" data-id="' + a.id + '"' + (glow ? ' filter="url(#xpglow-' + this.uid + ')"' : "") + ">";
        if (ICONS[a.type]) {
          g += '<g transform="translate(' + a.x + "," + a.y + ")" + (a.scale ? " scale(" + a.scale + ")" : "") + '">' + ICONS[a.type](col) + "</g>";
          const ly = a.y + (a.ly || 52);
          g += '<text class="xp-lbl" x="' + a.x + '" y="' + ly + '" text-anchor="middle">' + esc(a.label || "") + "</text>";
          if (sub) g += '<text class="xp-sublbl" x="' + a.x + '" y="' + (ly + 15) + '" text-anchor="middle">' + esc(sub) + "</text>";
        } else g += this.panel(a, state, prev, col);
        out.push(g + "</g>");
      });
      this.gActors.innerHTML = out.join("");
    }
    panel(a, state, prev, col) {
      const x = a.x, y = a.y, w = a.w;
      let rows = [], h;
      const head = '<text class="xp-ptitle" x="' + (x + 10) + '" y="' + (y + 17) + '" style="fill:' + col + '">' + esc(a.label || "") + "</text>" +
        (state.sub[a.id] || a.sub ? '<text class="xp-psub" x="' + (x + w - 10) + '" y="' + (y + 17) + '" text-anchor="end">' + esc(state.sub[a.id] !== undefined ? state.sub[a.id] : a.sub) + "</text>" : "");
      const RH = a.rh || 19;
      if (a.type === "code") {
        const cur = state[a.hk || "code"];   // a second code panel can follow its own key (e.g. hk: "code2")
        a.lines.forEach((ln, i) => {
          const yy = y + 30 + i * RH, on = (Array.isArray(cur) ? cur.includes(i) : cur === i);
          rows.push((on ? '<rect class="xp-hl" x="' + (x + 3) + '" y="' + (yy - 1) + '" width="' + (w - 6) + '" height="' + RH + '" rx="4"/>' : "") +
            '<text class="xp-caddr" x="' + (x + 10) + '" y="' + (yy + 13) + '">' + esc(ln[0] || "") + "</text>" +
            '<text class="xp-ctext' + (on ? " on" : "") + (ln[2] ? " " + ln[2] : "") + '" x="' + (x + (a.cx || 74)) + '" y="' + (yy + 13) + '">' + esc(ln[1]) + "</text>");
        });
        h = 34 + a.lines.length * RH;
      } else if (a.type === "regs") {
        const names = a.names;
        names.forEach((n, i) => {
          const yy = y + 30 + i * RH, v = state.regs[n] !== undefined ? state.regs[n] : "—";
          const chg = prev && prev.regs[n] !== undefined && prev.regs[n] !== v;
          rows.push((chg ? '<rect class="xp-chg" x="' + (x + 3) + '" y="' + (yy - 1) + '" width="' + (w - 6) + '" height="' + RH + '" rx="4"/>' : "") +
            '<text class="xp-rname" x="' + (x + 10) + '" y="' + (yy + 13) + '">' + esc(n.toUpperCase()) + "</text>" +
            '<text class="xp-rval' + (chg ? " chg" : "") + '" x="' + (x + w - 10) + '" y="' + (yy + 13) + '" text-anchor="end">' + esc(v) + "</text>");
        });
        h = 34 + names.length * RH;
      } else if (a.type === "stack" || a.type === "box") {
        const list = a.type === "stack" ? (state.stack || a.rows || []) : ((state.box[a.id] && state.box[a.id].rows) || a.rows || []);
        const hlI = a.type === "box" && state.box[a.id] ? state.box[a.id].hl : -1;
        const n = Math.max(list.length, a.minRows || 0);
        for (let i = 0; i < n; i++) {
          const r = list[i] || {};
          const yy = y + 30 + i * RH;
          const cls = (r.c || "") + (i === hlI ? " hl" : "");
          rows.push('<rect class="xp-srow ' + cls + '" x="' + (x + 3) + '" y="' + (yy - 1) + '" width="' + (w - 6) + '" height="' + (RH - 1) + '" rx="4"/>' +
            '<text class="xp-saddr" x="' + (x + 10) + '" y="' + (yy + 13) + '">' + esc(r.a || "") + "</text>" +
            '<text class="xp-sval ' + cls + '" x="' + (x + (a.vx || 92)) + '" y="' + (yy + 13) + '">' + esc(r.v || "") + "</text>" +
            '<text class="xp-snote ' + cls + '" x="' + (x + w - 10) + '" y="' + (yy + 13) + '" text-anchor="end">' + esc(r.n || "") + "</text>" +
            (r.p ? '<text class="xp-sptr" x="' + (x - 6) + '" y="' + (yy + 13) + '" text-anchor="end">' + esc(r.p) + " ▸</text>" : ""));
        }
        h = 34 + n * RH;
      }
      a.h = h;
      return '<rect class="xp-panel" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" style="--c:' + col + '"/>' + head + rows.join("");
    }
    /* ---------- flow ---------- */
    go(k, animate) {
      const sc = this.sc;
      k = Math.max(0, Math.min(sc.steps.length, k));
      const prevK = this.k;
      this.k = k;
      const token = ++this.animToken;
      const state = this.states[k];
      const prev = k > 0 ? this.states[k - 1] : null;
      const step = k > 0 ? sc.steps[k - 1] : null;
      // side list / counters / explanation / log
      $$(".xp-steps li", this.el).forEach((li) => { const i = Number(li.dataset.i); li.classList.toggle("cur", i === k); li.classList.toggle("done", i < k); });
      $(".xp-count", this.el).textContent = k + " / " + sc.steps.length;
      $(".xp-prog i", this.el).style.width = (100 * k / sc.steps.length) + "%";
      $(".xp-explain", this.el).innerHTML = step
        ? '<span class="xp-num">' + k + '</span><div><b>' + esc(step.t) + "</b><p>" + step.d + "</p></div>"
        : '<span class="xp-num">▶</span><div><b>جاهز</b><p>' + (sc.intro || "اضغط PLAY عشان المشهد يشتغل لوحده، أو STEP عشان تمشي خطوة خطوة (أو استخدم الأسهم ← → والـ Space).") + "</p></div>";
      this.renderLog(k);
      if (this.view === "seq") this.renderSeq(k);
      // stage
      const flies = step && animate && !REDUCED && k === prevK + 1 ? (step.fly || []) : [];
      if (!flies.length) { this.renderActors(state, prev); this.gFx.innerHTML = ""; return Promise.resolve(); }
      this.renderActors(merge(this.states[k - 1], { glow: (step.fly || []).flatMap((f) => [f.from, f.to]) }), null);
      return this.animate(flies, token).then(() => { if (token === this.animToken) { this.renderActors(state, prev); } });
    }
    animate(flies, token) {
      const dur = 900 / this.speed;
      const one = (f) => new Promise((res) => {
        const a = this.anchor(f.from, f.to), b = this.anchor(f.to, f.from);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.min(90, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.28) * (f.arc === undefined ? 1 : f.arc);
        const kind = this.kinds[f.kind || "data"] || KIND.data;
        const label = String(f.label || kind[0]);
        const tw = Math.max(34, label.length * 7.2 + 18);
        const g = document.createElementNS(NS, "g");
        g.innerHTML = '<path class="xp-trail" d="M' + a[0] + "," + a[1] + " Q" + mx + "," + my + " " + b[0] + "," + b[1] + '" style="stroke:' + kind[1] + '"/>' +
          '<g class="xp-pkt"><rect x="' + (-tw / 2) + '" y="-11" width="' + tw + '" height="22" rx="11" style="fill:' + kind[1] + '"/><text x="0" y="4" text-anchor="middle">' + esc(label) + "</text></g>";
        this.gFx.appendChild(g);
        const pkt = g.querySelector(".xp-pkt"), trail = g.querySelector(".xp-trail");
        const len = trail.getTotalLength();
        trail.style.strokeDasharray = len; trail.style.strokeDashoffset = len;
        const t0 = performance.now();
        const tick = (now) => {
          if (token !== this.animToken) { g.remove(); res(); return; }
          const p = Math.min(1, (now - t0) / dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          const pt = trail.getPointAtLength(len * e);
          pkt.setAttribute("transform", "translate(" + pt.x + "," + pt.y + ")");
          trail.style.strokeDashoffset = String(len * (1 - e));
          if (p < 1) requestAnimationFrame(tick);
          else { setTimeout(() => { g.classList.add("fade"); setTimeout(() => g.remove(), 500); }, 120); res(); }
        };
        requestAnimationFrame(tick);
      });
      return flies.reduce((pr, f) => pr.then(() => (token === this.animToken ? one(f) : null)), Promise.resolve());
    }
    renderLog(k) {
      const rows = [];
      let n = 0;
      this.sc.steps.slice(0, k).forEach((s, i) => (s.log || (s.fly || []).map((f) => ({ from: f.from, to: f.to, kind: f.kind, info: f.info || f.label }))).forEach((r) => {
        n++;
        const kd = this.kinds[r.kind || "data"] || KIND.data;
        const nm = (id) => { const a = this.actor(id); return a ? a.label : id; };
        rows.push('<tr class="' + (i === k - 1 ? "new" : "") + '"><td><span class="xp-dot" style="background:' + kd[1] + '">' + n + "</span></td><td>" + (i + 1) + "</td><td>" + esc(nm(r.from)) + "</td><td>" + esc(nm(r.to)) + '</td><td style="color:' + kd[1] + '">' + kd[0] + "</td><td>" + esc(r.info || "") + "</td></tr>");
      }));
      const tb = $(".xp-log tbody", this.el);
      tb.innerHTML = rows.join("") || '<tr><td colspan="6" class="xp-empty">الأحداث هتظهر هنا مع كل خطوة…</td></tr>';
      const wrap = $(".xp-table-wrap", this.el);
      wrap.scrollTop = wrap.scrollHeight;
    }
    renderSeq(k) {
      const sc = this.sc;
      const ids = [];
      sc.steps.forEach((s) => (s.fly || []).forEach((f) => { [f.from, f.to].forEach((x) => { if (!ids.includes(x)) ids.push(x); }); }));
      const order = sc.actors.map((a) => a.id).filter((x) => ids.includes(x));
      const W = Math.max(640, order.length * 170), colW = W / order.length;
      const msgs = [];
      sc.steps.forEach((s, i) => (s.fly || []).forEach((f) => msgs.push({ f, i: i + 1 })));
      const H = 70 + msgs.length * 40 + 20;
      const X = (id) => colW * order.indexOf(id) + colW / 2;
      let svg = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" xmlns="' + NS + '"><defs><marker id="xpah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#9fb3d4"/></marker></defs>';
      order.forEach((id) => {
        const a = this.actor(id), col = COLORS[a.color] || a.color || COLORS.acc;
        svg += '<rect class="xp-sq-head" x="' + (X(id) - 70) + '" y="10" width="140" height="34" rx="8" style="--c:' + col + '"/><text class="xp-lbl" x="' + X(id) + '" y="32" text-anchor="middle">' + esc(a.label) + "</text>" +
          '<line class="xp-life" x1="' + X(id) + '" y1="44" x2="' + X(id) + '" y2="' + (H - 6) + '"/>';
      });
      msgs.forEach((m, j) => {
        const y = 70 + j * 40, x1 = X(m.f.from), x2 = X(m.f.to), kd = this.kinds[m.f.kind || "data"] || KIND.data;
        const shown = m.i <= k, cur = m.i === k;
        const self = x1 === x2;
        const path = self ? "M" + x1 + "," + (y - 8) + " h40 v16 h-36" : "M" + x1 + "," + y + " L" + (x2 + (x2 > x1 ? -8 : 8)) + "," + y;
        svg += '<g class="xp-sq-msg' + (shown ? " shown" : "") + (cur ? " cur" : "") + '"><path d="' + path + '" style="stroke:' + kd[1] + '" marker-end="url(#xpah)"/>' +
          '<circle cx="' + (self ? x1 + 46 : x2 + (x2 > x1 ? -4 : 4)) + '" cy="' + (self ? y + 8 : y) + '" r="3.5" style="fill:' + kd[1] + '"/>' +
          '<text x="' + (self ? x1 + 52 : (x1 + x2) / 2) + '" y="' + (y - 7) + '" text-anchor="' + (self ? "start" : "middle") + '"><tspan class="n" style="fill:' + kd[1] + '">' + m.i + " </tspan>" + esc(m.f.label || kd[0]) + "</text></g>";
      });
      this.seqEl.innerHTML = svg + "</svg>";
    }
    setView(v) {
      this.view = v;
      $$(".xp-views button", this.el).forEach((b) => b.classList.toggle("on", b.dataset.v === v));
      $(".xp-stage", this.el).hidden = v !== "scene";
      this.seqEl.hidden = v !== "seq";
      if (v === "seq") this.renderSeq(this.k);
    }
    ctrl(c) {
      if (!this.sc) return;
      if (c === "play") { if (this.playing) this.stop(); else this.play(); return; }
      if (c === "speed") { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 0.5 : 1; $('[data-c="speed"]', this.el).textContent = this.speed + "×"; return; }
      this.stop();
      if (c === "step") this.go(this.k + 1, true);
      else if (c === "back") this.go(this.k - 1, false);
      else if (c === "reset") this.go(0, false);
    }
    play() {
      if (this.k >= this.sc.steps.length) this.go(0, false);
      this.playing = true;
      const b = $('[data-c="play"]', this.el); b.textContent = "❚❚ PAUSE"; b.classList.add("on");
      const next = () => {
        if (!this.playing) return;
        if (this.k >= this.sc.steps.length) { this.stop(); return; }
        this.go(this.k + 1, true).then(() => { if (this.playing) this.timer = setTimeout(next, 1250 / this.speed); });
      };
      next();
    }
    stop() {
      this.playing = false;
      clearTimeout(this.timer);
      const b = this.el && $('[data-c="play"]', this.el);
      if (b) { b.textContent = "▶ PLAY"; b.classList.remove("on"); }
    }
  }

  /* ---------------- hub (all scenes, protocol-explorer style) ---------------- */
  function buildHub(hub) {
    const S = window.ASM_SCENES || {};
    const ids = Object.keys(S);
    const groups = [];
    ids.forEach((id) => { const g = S[id].group || "Scenes"; let G = groups.find((x) => x.name === g); if (!G) { G = { name: g, ids: [] }; groups.push(G); } G.ids.push(id); });
    hub.innerHTML = '<div class="xh-side"><div class="xh-search"><input type="search" placeholder="دوّر على مشهد… (stack, PEB, syscall)" aria-label="بحث في المشاهد"></div><div class="xh-list"></div></div><div class="xh-main"><div class="explorer"></div></div>';
    const list = $(".xh-list", hub);
    list.innerHTML = groups.map((G) => '<div class="xh-group">' + esc(G.name) + "</div>" + G.ids.map((id) => '<button type="button" class="xh-item" data-id="' + id + '"><span class="ic">' + (S[id].icon || "◈") + '</span><span><b>' + esc(S[id].title) + "</b><small>" + esc(S[id].sub || "") + "</small></span></button>").join("")).join("");
    const ex = new Explorer($(".explorer", hub), ids[0]);
    hub._explorer = ex;
    const select = (id) => { $$(".xh-item", hub).forEach((b) => b.classList.toggle("on", b.dataset.id === id)); ex.load(id); };
    $$(".xh-item", hub).forEach((b) => b.addEventListener("click", () => select(b.dataset.id)));
    select(ids[0]);
    $(".xh-search input", hub).addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$(".xh-item", hub).forEach((b) => { const s = S[b.dataset.id]; b.hidden = q && (s.title + " " + (s.sub || "") + " " + (s.keys || "") + " " + b.dataset.id).toLowerCase().indexOf(q) === -1; });
    });
  }

  function init() {
    $$(".explorer-hub").forEach(buildHub);
    $$(".explorer[data-scene]").forEach((el) => { try { el._explorer = new Explorer(el, el.dataset.scene); } catch (e) { el.textContent = "explorer error: " + e.message; console.error(e); } });
  }
  window.AsmExplorer = { Explorer, init, ICONS };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
