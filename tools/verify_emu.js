// Runs verification jobs for tools/build.py inside the same emulator the page uses.
//   node tools/verify_emu.js jobs.json results.json
"use strict";
const fs = require("fs");
const path = require("path");
const E = require(path.join(__dirname, "..", "assets", "emu.js"));
const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = jobs.map((j) => {
  try {
    const prog = E.assemble(j.src, { entry: j.entry || undefined });
    if (!prog.ok) return { ok: false, asmErrors: prog.errors };
    const userIns = prog.ins.filter((I) => !j.userLines || I.line <= j.userLines);
    const info = { ok: true, nIns: userIns.length, mnemonics: [...new Set(userIns.flatMap((I) => [I.mn, I.form === "jcc" ? "jcc" : I.form === "cmovcc" ? "cmov" : I.form === "setcc" ? "set" : I.mn]))] };
    if (j.kind === "run") {
      const m = new E.Machine(prog, j.setup || "");
      let st = m.run(j.limit || 2000000), g = 0;
      while (st.pause && g++ < 200) st = m.run(j.limit || 2000000);
      info.status = m.status;
      info.output = m.output;
      info.steps = m.steps;
      if (j.expect) info.fails = E.runTest(prog, { setup: j.setup || "", expect: j.expect }).fails;
      return info;
    }
    if (j.kind === "test") {
      info.results = j.tests.map((t) => {
        const r = E.runTest(prog, { setup: t.setup || "", expect: t.expect || "" }, { limit: 2000000 });
        return { pass: r.pass, fails: r.fails, status: r.status };
      });
      return info;
    }
    return info;
  } catch (e) {
    return { ok: false, crash: String(e && e.stack || e) };
  }
});
fs.writeFileSync(process.argv[3], JSON.stringify(out, (k, v) => (typeof v === "bigint" ? v.toString() : v)), "utf8");
