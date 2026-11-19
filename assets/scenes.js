/* ============================================================
   ASM Explorer — scene data (Arabic narration, real encodings)
   Each step: t (title), st (sub-title in the list), d (HTML text),
   fly [{from,to,label,kind,info}], set {regs, code, stack, box, sub, glow, dim}
   ============================================================ */
window.ASM_SCENES = window.ASM_SCENES || {};
(function (S) {
  "use strict";

  /* ---------------------------------------------------------- fetch / decode / execute */
  S.fetch = {
    id: "fetch", group: "الآلة من جوه", icon: "⚙️", title: "Fetch → Decode → Execute", sub: "الـ CPU بينفّذ 4 instructions حقيقية", keys: "cpu rip cycle opcode",
    overview: "كل instruction بتعدّي بـ 3 مراحل: <b>Fetch</b> (اقرا الـ bytes اللي عند <code>RIP</code>)، <b>Decode</b> (افهم هي إيه وطولها كام)، <b>Execute</b> (نفّذ). الـ bytes هنا حقيقية بالظبط زي ما NASM بيطلعها.",
    facts: [["RIP", "عنوان الـ instruction الجاية"], ["طول الـ instruction", "1 → 15 byte"], ["Encoding", "<code>B8</code> = mov r32, imm32"], ["الدرس", "المرحلة 01 و19"]],
    actors: [
      { id: "regs", type: "regs", x: 30, y: 24, w: 230, label: "REGISTERS", names: ["rip", "rax", "rbx"] },
      { id: "cpu", type: "cpu", x: 150, y: 262, label: "CPU", sub: "idle" },
      { id: "dec", type: "box", x: 330, y: 250, w: 270, label: "DECODER", minRows: 4, vx: 88 },
      { id: "ram", type: "code", x: 630, y: 40, w: 310, label: "RAM · .text", sub: "0x401000", cx: 70, lines: [
        ["401000", "B8 01 00 00 00   mov eax, 1"], ["401005", "83 C0 02         add eax, 2"], ["401008", "89 C3            mov ebx, eax"], ["40100A", "C3               ret"]] }
    ],
    links: [["cpu", "ram"], ["cpu", "dec"]],
    init: { regs: { rip: "0x401000", rax: "0x0", rbx: "0x0" }, box: { dec: { rows: [{ a: "opcode", v: "—" }, { a: "operands", v: "—" }, { a: "length", v: "—" }, { a: "next RIP", v: "—" }], hl: -1 } } },
    steps: [
      { t: "Fetch", st: "اقرا الـ bytes عند RIP", d: "الـ CPU بيبعت العنوان اللي في <code>RIP = 0x401000</code> للذاكرة ويقرا الـ bytes اللي هناك: <code>B8 01 00 00 00</code>. لحد دلوقتي هي مجرد أرقام — الـ CPU لسه ميعرفش هي instruction إيه ولا طولها كام.",
        fly: [{ from: "ram", to: "cpu", label: "B8 01 00 00 00", kind: "fetch", info: "fetch bytes @ 0x401000" }], set: { code: 0, sub: { cpu: "fetch @401000" } } },
      { t: "Decode", st: "B8 = mov eax, imm32", d: "الـ decoder بيبص على أول byte: <code>B8</code> معناه <code>mov r32, imm32</code> والـ register رقم 0 = <code>eax</code>. يبقى بعده 4 bytes هما الرقم (little-endian) = <code>1</code>. الطول الكلي 5 bytes، فـ <code>RIP</code> بيتحدّث فورًا لـ <code>0x401005</code> — قبل التنفيذ.",
        fly: [{ from: "cpu", to: "dec", label: "B8", kind: "ctrl", info: "decode → mov eax, 1 (5 bytes)" }],
        set: { regs: { rip: "0x401005" }, sub: { cpu: "decode" }, box: { dec: { rows: [{ a: "opcode", v: "B8 = mov r32, imm32" }, { a: "operands", v: "eax ← 0x00000001" }, { a: "length", v: "5 bytes" }, { a: "next RIP", v: "0x401005" }], hl: 0 } } } },
      { t: "Execute", st: "eax ← 1", d: "الـ execution unit بينفّذ: <code>eax = 1</code>. ولأنها كتابة 32-bit، الـ 32 bit العليا من <code>rax</code> اتصفّرت. الـ <code>mov</code> مبتغيرش الـ flags.",
        fly: [{ from: "dec", to: "cpu", label: "eax ← 1", kind: "exec", info: "rax = 0x1" }], set: { regs: { rax: "0x1" }, sub: { cpu: "execute" }, box: { dec: { hl: 1 } } } },
      { t: "Fetch #2", st: "83 C0 02", d: "نفس اللفة: <code>RIP = 0x401005</code> ← الـ CPU بيجيب <code>83 C0 02</code>.",
        fly: [{ from: "ram", to: "cpu", label: "83 C0 02", kind: "fetch", info: "fetch bytes @ 0x401005" }], set: { code: 1, sub: { cpu: "fetch @401005" } } },
      { t: "Decode + Execute", st: "add eax, 2", d: "<code>83</code> = مجموعة عمليات حسابية مع imm8، والـ ModRM <code>C0</code> = (mod=11، reg=000 ⇐ <b>add</b>، rm=000 ⇐ <b>eax</b>)، والـ <code>02</code> هو الرقم. يعني <code>add eax, 2</code> ← <code>eax = 3</code>، والـ flags بتتحدث (ZF=0, SF=0, CF=0, OF=0).",
        fly: [{ from: "cpu", to: "dec", label: "83 C0 02", kind: "ctrl", info: "decode → add eax, 2 (3 bytes)" }],
        set: { regs: { rip: "0x401008", rax: "0x3" }, sub: { cpu: "ZF=0 SF=0 CF=0" }, box: { dec: { rows: [{ a: "opcode", v: "83 /0 = add r/m32, imm8" }, { a: "operands", v: "eax += 0x02" }, { a: "length", v: "3 bytes" }, { a: "next RIP", v: "0x401008" }], hl: 0 } } } },
      { t: "mov ebx, eax", st: "89 C3 — ModRM", d: "<code>89</code> = <code>mov r/m32, r32</code>. الـ ModRM <code>C3</code> = 11 000 011: الـ reg = 000 (<b>eax</b> مصدر) والـ rm = 011 (<b>ebx</b> هدف). النتيجة <code>ebx = 3</code>. طولها 2 bytes.",
        fly: [{ from: "ram", to: "cpu", label: "89 C3", kind: "fetch", info: "fetch @ 0x401008 → mov ebx, eax" }],
        set: { code: 2, regs: { rip: "0x40100A", rbx: "0x3" }, sub: { cpu: "execute" }, box: { dec: { rows: [{ a: "opcode", v: "89 = mov r/m32, r32" }, { a: "operands", v: "ModRM C3: ebx ← eax" }, { a: "length", v: "2 bytes" }, { a: "next RIP", v: "0x40100A" }], hl: 1 } } } },
      { t: "ret", st: "C3 — رجوع للـ caller", d: "<code>C3</code> = <code>ret</code>: byte واحد. بتعمل <code>pop</code> لعنوان الرجوع من الـ stack وتحطه في <code>RIP</code> — والـ CPU يكمّل اللفة من هناك. اللفة دي بتحصل <b>مليارات المرات في الثانية</b>.",
        fly: [{ from: "ram", to: "cpu", label: "C3", kind: "fetch", info: "fetch @ 0x40100A → ret" }],
        set: { code: 3, regs: { rip: "caller (pop)" }, sub: { cpu: "return" }, box: { dec: { rows: [{ a: "opcode", v: "C3 = ret" }, { a: "operands", v: "rip ← [rsp], rsp += 8" }, { a: "length", v: "1 byte" }, { a: "next RIP", v: "return address" }], hl: 1 } } } }
    ]
  };

  /* ---------------------------------------------------------- Linux syscall */
  S.syscall = {
    id: "syscall", group: "الآلة من جوه", icon: "🐧", title: "syscall: من Ring 3 للـ kernel", sub: "write(1, \"Hello, world\\n\", 13) وexit(0)", keys: "syscall kernel ring write exit rcx r11",
    overview: "البرنامج العادي (Ring 3) مقدرش يكتب على الشاشة لوحده. بيحط رقم الخدمة في <code>rax</code> والـ arguments في <code>rdi, rsi, rdx, r10, r8, r9</code> وينفّذ <code>syscall</code>: الـ CPU بيقفز للـ kernel (Ring 0) اللي بيعمل الشغل ويرجّع النتيجة في <code>rax</code>.",
    facts: [["رقم الـ syscall", "<code>rax</code> (1 = write، 60 = exit)"], ["الـ args", "<code>rdi rsi rdx r10 r8 r9</code>"], ["بيبوّظ", "<code>rcx</code> (RIP) و<code>r11</code> (RFLAGS)"], ["الخطأ", "rax = −errno (سالب)"], ["الدرس", "المرحلة 01 و13"]],
    w: 960, h: 420,
    actors: [
      { id: "code", type: "code", x: 30, y: 20, w: 300, label: "hello · .text", lines: [
        ["401000", "mov eax, 1      ; write"], ["401005", "mov edi, 1      ; stdout"], ["40100A", "lea rsi, [msg]"], ["401011", "mov edx, 13"], ["401016", "syscall"], ["401018", "mov eax, 60     ; exit"], ["40101D", "xor edi, edi"], ["40101F", "syscall"]] },
      { id: "regs", type: "regs", x: 30, y: 240, w: 300, label: "REGISTERS", names: ["rax", "rdi", "rsi", "rdx", "rcx", "r11"] },
      { id: "proc", type: "proc", x: 480, y: 150, label: "hello", sub: "Ring 3 · running" },
      { id: "kernel", type: "kernel", x: 690, y: 300, color: "vio", label: "Linux kernel", sub: "Ring 0" },
      { id: "term", type: "proc", x: 860, y: 120, color: "grn", label: "terminal", sub: "fd 1 (stdout)" }
    ],
    links: [["proc", "kernel"], ["kernel", "term"]],
    init: { regs: { rax: "?", rdi: "?", rsi: "?", rdx: "?", rcx: "?", r11: "?" } },
    steps: [
      { t: "رقم الـ syscall", st: "rax = 1 (write)", d: "أول حاجة: رقم الخدمة اللي عايزها في <code>rax</code>. على Linux x86-64 <code>1</code> = <code>write</code>. (الأرقام دي مختلفة بين 32-bit و64-bit، ومختلفة تمامًا على Windows.)", set: { code: 0, regs: { rax: "1" }, glow: ["regs"] } },
      { t: "الـ argument الأول", st: "rdi = 1 (fd)", d: "<code>write(fd, buf, count)</code>: الـ fd في <code>rdi</code>. <code>1</code> = stdout.", set: { code: 1, regs: { rdi: "1" }, glow: ["regs"] } },
      { t: "الـ buffer والطول", st: "rsi = &msg, rdx = 13", d: "<code>rsi</code> = عنوان الـ string في <code>.data</code>، و<code>rdx</code> = عدد الـ bytes. الـ kernel مبيعرفش حاجة اسمها NUL terminator — بياخد الطول صريح.", set: { code: [2, 3], regs: { rsi: "0x402000", rdx: "13" }, glow: ["regs"] } },
      { t: "syscall!", st: "انتقال لـ Ring 0", d: "الـ instruction <code>syscall</code> بتقفز للـ kernel. وقبلها الـ CPU بيحفظ <code>RIP</code> الجاي في <code>rcx</code> و<code>RFLAGS</code> في <code>r11</code> — عشان كده الاتنين بيتبوّظوا بعد أي syscall. البرنامج متجمّد لحد ما الـ kernel يخلص.",
        fly: [{ from: "proc", to: "kernel", label: "syscall #1", kind: "sys", info: "write(1, 0x402000, 13)" }],
        set: { code: 4, regs: { rcx: "0x401018", r11: "0x246" }, sub: { proc: "Ring 3 · waiting", kernel: "Ring 0 · sys_write" } } },
      { t: "الـ kernel بيشتغل", st: "بينسخ الـ bytes للـ terminal", d: "الـ kernel بيتأكد إن العنوان ده تبع البرنامج فعلًا (لو لأ: <code>-EFAULT</code>)، وبيبعت الـ 13 byte للـ terminal.",
        fly: [{ from: "kernel", to: "term", label: "Hello, world\\n", kind: "write", info: "13 bytes → tty" }], set: { sub: { term: "Hello, world" } } },
      { t: "الرجوع (sysret)", st: "rax = 13", d: "الـ kernel بيرجع لـ <code>RIP = rcx</code>، والنتيجة في <code>rax</code> = عدد الـ bytes اللي اتكتبت (13). لو كان فيه خطأ كانت هتبقى رقم <b>سالب</b> (<code>−errno</code>) — وده اللي لازم تفحصه.",
        fly: [{ from: "kernel", to: "proc", label: "rax = 13", kind: "ret", info: "return to 0x401018" }], set: { code: 5, regs: { rax: "13" }, sub: { proc: "Ring 3 · running", kernel: "Ring 0 · idle" } } },
      { t: "exit(0)", st: "rax = 60", d: "<code>rax = 60</code> (exit) و<code>rdi = 0</code> (الـ status) و<code>syscall</code> تاني. الـ kernel بيقفل الـ process ومبيرجعش خالص. من غير السطور دي، البرنامج هيكمّل يقرا زبالة بعد آخر instruction ويعمل crash.",
        fly: [{ from: "proc", to: "kernel", label: "exit(0)", kind: "sys", info: "exit(0) — no return" }], set: { code: [5, 6, 7], regs: { rax: "60", rdi: "0" }, sub: { proc: "terminated", kernel: "cleanup" }, dim: ["proc"] } }
    ]
  };

  /* ---------------------------------------------------------- virtual memory */
  S.vmem = {
    id: "vmem", group: "الآلة من جوه", icon: "🗺️", title: "Virtual → Physical", sub: "إزاي العنوان بيتترجم وإمتى بيحصل Segfault", keys: "paging mmu page table page fault segfault permissions",
    overview: "كل عنوان في البرنامج <b>افتراضي</b>. الـ MMU بيقسمه لـ <b>page number</b> (الـ bits العليا) و<b>offset</b> (آخر 12 bit، لأن الـ page = 4 KB)، ويدور في جدول الـ pages بتاع الـ process على الـ frame الحقيقي والصلاحيات.",
    facts: [["Page", "4 KB = 0x1000"], ["Offset", "آخر 12 bit (3 hex digits)"], ["الجدول", "بيتشاور عليه CR3"], ["الخطأ", "#PF → SIGSEGV / Access Violation"], ["الدرس", "المرحلة 04"]],
    w: 960, h: 420,
    actors: [
      { id: "cpu", type: "cpu", x: 120, y: 130, label: "CPU", sub: "" },
      { id: "code", type: "code", x: 30, y: 230, w: 260, label: "INSTRUCTIONS", cx: 14, lines: [["", "mov al, [0x402010]"], ["", "mov [0x401000], al"], ["", "mov al, [0x500000]"]] },
      { id: "mmu", type: "mmu", x: 410, y: 140, label: "MMU + TLB", sub: "" },
      { id: "pt", type: "box", x: 330, y: 260, w: 300, label: "PAGE TABLE (CR3)", vx: 118, rows: [{ a: "VPN 0x401", v: "→ frame 0x1A3", n: "r-x" }, { a: "VPN 0x402", v: "→ frame 0x1A4", n: "rw-" }, { a: "VPN 0x7FFFFFFFE", v: "→ frame 0x2B0", n: "rw-" }, { a: "VPN 0x500", v: "not present", n: "---" }] },
      { id: "ram", type: "box", x: 680, y: 30, w: 260, label: "PHYSICAL RAM", vx: 104, rows: [{ a: "0x1A3000", v: "our .text", n: "" }, { a: "0x1A4000", v: "our .data", n: "" }, { a: "0x1A4010", v: "0x2A", n: "" }, { a: "0x2B0000", v: "our stack", n: "" }, { a: "0x3C7000", v: "other process", n: "" }] },
      { id: "kernel", type: "kernel", x: 800, y: 330, color: "vio", label: "kernel", sub: "page-fault handler" }
    ],
    links: [["cpu", "mmu"], ["mmu", "pt"], ["mmu", "ram"], ["mmu", "kernel"]],
    steps: [
      { t: "قراية من عنوان افتراضي", st: "VA = 0x402010", d: "الـ instruction عايزة byte من <code>0x402010</code>. الـ CPU بيسلّم العنوان ده للـ MMU.", fly: [{ from: "cpu", to: "mmu", label: "VA 0x402010", kind: "read", info: "load byte" }], set: { code: 0 } },
      { t: "تقسيم العنوان", st: "page + offset", d: "<code>0x402010</code> = page number <code>0x402</code> + offset <code>0x010</code>. آخر 3 hex digits (12 bit) = مكان الـ byte جوه الـ page، والباقي = رقم الـ page.", set: { sub: { mmu: "VPN 0x402 | off 0x010" }, glow: ["mmu"] } },
      { t: "البحث في الجدول", st: "VPN 0x402 → ?", d: "الـ MMU بيدور في جدول الـ pages بتاع الـ process (الـ CPU بيعرف مكانه من <code>CR3</code>؛ وفيه cache اسمه <b>TLB</b> عشان ميدورش كل مرة).", fly: [{ from: "mmu", to: "pt", label: "VPN 0x402 ?", kind: "ctrl", info: "page walk" }], set: { box: { pt: { hl: 1 } } } },
      { t: "الترجمة والصلاحيات", st: "frame 0x1A4, rw-", d: "الـ page موجودة في الـ frame الفعلي <code>0x1A4</code> وصلاحياتها <code>rw-</code> — القراية مسموحة. العنوان الفعلي = <code>0x1A4 &lt;&lt; 12 | 0x010</code> = <code>0x1A4010</code>.", fly: [{ from: "pt", to: "mmu", label: "0x1A4 · rw-", kind: "data", info: "PTE: present, rw-" }], set: { sub: { mmu: "PA 0x1A4010" } } },
      { t: "الوصول للـ RAM", st: "PA = 0x1A4010", d: "دلوقتي بس الـ RAM بتتلمس بالعنوان الحقيقي.", fly: [{ from: "mmu", to: "ram", label: "PA 0x1A4010", kind: "read", info: "physical read" }], set: { box: { ram: { hl: 2 } } } },
      { t: "القيمة رجعت", st: "al = 0x2A", d: "القيمة <code>0x2A</code> رجعت للـ CPU. كل ده حصل في nanoseconds — والبرنامج مش شايف أي حاجة من دي.", fly: [{ from: "ram", to: "cpu", label: "0x2A", kind: "data", info: "al = 0x2A" }], set: { sub: { cpu: "al = 0x2A" } } },
      { t: "كتابة في الكود", st: "write → r-x ✗", d: "التانية بتكتب في <code>0x401000</code> (الـ .text). الـ page صلاحياتها <code>r-x</code> — مفيش <b>w</b>. الـ MMU بيرفض ويطلّع <b>Page Fault</b> للـ kernel، والـ kernel بيبعت <code>SIGSEGV</code> (على Windows: Access Violation <code>0xC0000005</code>).",
        fly: [{ from: "cpu", to: "mmu", label: "write VA 0x401000", kind: "write", info: "store byte" }, { from: "mmu", to: "kernel", label: "#PF: write to r-x", kind: "bad", info: "protection fault" }], set: { code: 1, box: { pt: { hl: 0 } }, sub: { kernel: "SIGSEGV → process", cpu: "fault!" } } },
      { t: "عنوان مش موجود", st: "VA 0x500000 → not present", d: "التالتة بتقرا من page مش موجودة. لو دي ذاكرة اتحجزت ولسه مخدتش frame (lazy allocation) أو اتنقلت للـ swap — الـ kernel بيجيبها ويكمّل عادي. لو مش متعملها map أصلًا ← <b>Segmentation fault</b>.",
        fly: [{ from: "cpu", to: "mmu", label: "VA 0x500000", kind: "read", info: "load byte" }, { from: "mmu", to: "kernel", label: "#PF: not present", kind: "bad", info: "page fault" }], set: { code: 2, box: { pt: { hl: 3 } }, sub: { kernel: "unmapped → SIGSEGV" } } }
    ]
  };

  /* ---------------------------------------------------------- build pipeline */
  S.build = {
    id: "build", group: "الآلة من جوه", icon: "🛠️", title: "من .asm لـ process شغّال", sub: "nasm → ld → execve → _start", keys: "nasm ld elf linker loader execve object file",
    overview: "الـ assembler بيحوّل النص لـ bytes ويسيب "+"<b>علامات</b> للأماكن اللي محتاجة عناوين (relocations). الـ linker بيرتّب الـ sections ويحدد العناوين النهائية ويكتب ELF. والـ loader (جزء من الـ kernel) بيعمل map للملف في الذاكرة ويقفز لـ <code>_start</code>.",
    facts: [["Assembler", "<code>nasm -f elf64</code>"], ["Linker", "<code>ld</code>"], ["Entry", "<code>_start</code> → 0x401000"], ["الدرس", "المرحلة 05 و20"]],
    w: 960, h: 440,
    actors: [
      { id: "src", type: "file", x: 80, y: 150, label: "hello.asm", sub: "text" },
      { id: "nasm", type: "proc", x: 240, y: 300, color: "vio", label: "nasm", sub: "assembler" },
      { id: "obj", type: "file", x: 400, y: 150, color: "vio", label: "hello.o", sub: "relocatable" },
      { id: "ld", type: "proc", x: 560, y: 300, color: "amb", label: "ld", sub: "linker" },
      { id: "elf", type: "file", x: 720, y: 150, color: "amb", label: "hello", sub: "ELF executable" },
      { id: "kernel", type: "kernel", x: 870, y: 320, color: "vio", label: "loader", sub: "execve()" },
      { id: "mem", type: "box", x: 280, y: 360, w: 360, label: "PROCESS MEMORY", vx: 128, minRows: 1, rows: [{ a: "", v: "(empty)", n: "" }] }
    ],
    links: [["src", "nasm"], ["nasm", "obj"], ["obj", "ld"], ["ld", "elf"], ["elf", "kernel"]],
    steps: [
      { t: "Assemble", st: "nasm -f elf64 hello.asm", d: "NASM بيقرا النص ويحوّل كل instruction لـ bytes (machine code)، والـ data لـ bytes كمان.", fly: [{ from: "src", to: "nasm", label: "source text", kind: "data", info: "nasm -f elf64 hello.asm" }] },
      { t: "Object file", st: "كود + symbols + relocations", d: "الـ <code>hello.o</code> فيه الـ bytes، وجدول <b>symbols</b> (<code>_start</code>، <code>msg</code>)، و<b>relocations</b>: \"الـ 4 bytes دول محتاجين عنوان msg لما يتعرف\". لسه مفيش عناوين نهائية — جرّب <code>objdump -d hello.o</code> هتلاقي العناوين من 0.", fly: [{ from: "nasm", to: "obj", label: ".text + .data + relocs", kind: "write", info: "write hello.o" }] },
      { t: "Link", st: "ld hello.o -o hello", d: "الـ linker بيحط الـ .text عند <code>0x401000</code> والـ .data بعدها على page جديدة، ويحل الـ relocations (يكتب العناوين الحقيقية جوه الكود)، ويحدد الـ entry point.", fly: [{ from: "obj", to: "ld", label: "hello.o", kind: "data", info: "resolve symbols & relocations" }] },
      { t: "ELF executable", st: "headers + segments", d: "الملف النهائي: ELF header (فيه الـ entry = <code>0x401000</code>) + program headers بتقول \"اعمل map للجزء ده كـ r-x وده كـ rw-\".", fly: [{ from: "ld", to: "elf", label: "ELF, entry=0x401000", kind: "write", info: "write ./hello" }] },
      { t: "execve", st: "./hello", d: "لما تكتب <code>./hello</code>، الـ shell بيعمل syscall اسمها <code>execve</code>. الـ kernel بيقرا الـ headers.", fly: [{ from: "elf", to: "kernel", label: "execve(\"./hello\")", kind: "sys", info: "load program" }] },
      { t: "Mapping", st: "pages بصلاحيات", d: "الـ loader بيعمل map لكل segment بالصلاحيات المطلوبة، ويجهز stack فيه <code>argc</code> و<code>argv</code> و<code>envp</code>.", fly: [{ from: "kernel", to: "mem", label: "mmap segments", kind: "write", info: ".text r-x · .data rw- · stack rw-" }],
        set: { box: { mem: { rows: [{ a: "0x401000", v: ".text", n: "r-x" }, { a: "0x402000", v: ".data", n: "rw-" }, { a: "0x7FFF…", v: "stack (argc, argv)", n: "rw-" }], hl: -1 } } } },
      { t: "Jump to _start", st: "RIP = 0x401000", d: "آخر خطوة: الـ kernel بيرجع لـ user mode و<code>RIP</code> = الـ entry point. أول instruction في <code>_start</code> بتتنفذ — والباقي اتعلمته في المشهد الأول.", fly: [{ from: "kernel", to: "mem", label: "RIP = 0x401000", kind: "jump", info: "start executing _start" }],
        set: { box: { mem: { rows: [{ a: "0x401000", v: ".text  ← RIP", n: "r-x", c: "hl" }, { a: "0x402000", v: ".data", n: "rw-" }, { a: "0x7FFF…", v: "stack  ← RSP", n: "rw-" }], hl: 0 } } } }
    ]
  };

  /* ---------------------------------------------------------- C2 jump table */
  S.jumptable = {
    id: "jumptable", group: "التحكم والدوال", icon: "🔀", title: "C2 Dispatcher: الـ Jump Table", sub: "switch على أمر جاي من السيرفر", keys: "switch jump table c2 backdoor rat dispatcher indirect jump",
    overview: "أي backdoor بيستقبل رقم أمر من الـ C2 ويوديه لـ handler. الـ compiler بيحوّل الـ <code>switch</code> لـ <b>bounds check</b> + <b>جدول عناوين</b> + <b>indirect jump</b>. لو فهمت المشهد ده، هتلاقي قايمة قدرات أي RAT في دقايق.",
    facts: [["Bounds check", "<code>cmp edi, 5</code> + <code>ja</code> (unsigned)"], ["الجدول", "8-byte عناوين (gcc) / 4-byte RVAs (MSVC)"], ["الـ jump", "<code>jmp [rdx+rdi*8]</code>"], ["الدرس", "المرحلة 09"]],
    actors: [
      { id: "c2", type: "server", x: 100, y: 150, color: "amb", label: "C2 server", sub: "198.51.100.7" },
      { id: "imp", type: "proc", x: 250, y: 330, color: "red", label: "implant", sub: "waiting for cmd" },
      { id: "code", type: "code", x: 370, y: 20, w: 290, label: "dispatch()", cx: 14, lines: [["", "cmp edi, 5"], ["", "ja .default"], ["", "lea rdx, [rel table]"], ["", "jmp [rdx+rdi*8]"]] },
      { id: "table", type: "box", x: 370, y: 170, w: 290, label: "JUMP TABLE (.rodata)", vx: 70, rows: [{ a: "[0]", v: "0x401400  cmd_shell" }, { a: "[1]", v: "0x401440  cmd_upload" }, { a: "[2]", v: "0x401480  cmd_download" }, { a: "[3]", v: "0x4014C0  cmd_sleep" }, { a: "[4]", v: "0x401500  cmd_info" }, { a: "[5]", v: "0x401540  cmd_exit" }] },
      { id: "h", type: "box", x: 710, y: 60, w: 230, label: "HANDLERS", vx: 14, rows: [{ v: "cmd_shell → CreateProcess" }, { v: "cmd_upload → WriteFile" }, { v: "cmd_download → ReadFile+send" }, { v: "cmd_sleep → Sleep" }, { v: "cmd_info → GetComputerName" }, { v: "cmd_exit → ExitProcess" }] }
    ],
    links: [["c2", "imp"], ["imp", "code"], ["code", "table"], ["table", "h"]],
    steps: [
      { t: "الأمر وصل", st: "cmd = 2", d: "السيرفر بيبعت packet فيها رقم الأمر <code>2</code>. الـ implant بيفك الـ packet (ده لوحده ممكن يبقى XOR / RC4) ويستخرج الرقم.", fly: [{ from: "c2", to: "imp", label: "cmd = 2", kind: "net", info: "recv() → command id 2" }], set: { sub: { imp: "cmd = 2" } } },
      { t: "النداء", st: "dispatch(edi = 2)", d: "الرقم بيتحط في <code>edi</code> (أول argument على Linux) ويتنادى الـ dispatcher.", fly: [{ from: "imp", to: "code", label: "edi = 2", kind: "call", info: "call dispatch" }], set: { code: 0 } },
      { t: "Bounds check", st: "cmp edi, 5 / ja", d: "<code>cmp edi, 5</code> + <code>ja .default</code>: لو الرقم أكبر من 5 <b>كـ unsigned</b> روح للـ default. حيلة: الرقم السالب (−1 = 0xFFFFFFFF) أكبر رقم unsigned فبيترفض هو كمان. <code>2 ≤ 5</code> ← نكمّل.", set: { code: [0, 1], glow: ["code"] } },
      { t: "قراية الجدول", st: "table[2]", d: "<code>rdx</code> = بداية الجدول، والعنصر رقم 2 عند <code>rdx + 2*8</code> = <code>0x401480</code>.", fly: [{ from: "code", to: "table", label: "table[2]", kind: "read", info: "load [rdx+rdi*8]" }], set: { code: [2, 3], box: { table: { hl: 2 } } } },
      { t: "Indirect jump", st: "jmp 0x401480", d: "قفزة لعنوان <b>جاي من الذاكرة</b> مش ثابت في الكود. ده اللي بيخلي الـ disassemblers محتاجين يفهموا الجدول عشان يكملوا الـ graph.", fly: [{ from: "table", to: "h", label: "jmp 0x401480", kind: "jump", info: "→ cmd_download" }], set: { box: { h: { hl: 2 } } } },
      { t: "الـ handler بيشتغل", st: "exfiltration", d: "<code>cmd_download</code> بيقرا ملف ويبعته للسيرفر. كمحلل: سمّي كل handler حسب الـ APIs اللي بيستخدمها وهتبقى عندك قايمة capabilities كاملة.", fly: [{ from: "h", to: "c2", label: "file bytes", kind: "net", info: "send() → C2" }] },
      { t: "أمر غلط", st: "cmd = 9 → default", d: "لو جه <code>9</code>: <code>9 &gt; 5</code> فالـ <code>ja</code> بتقفز للـ default ومفيش وصول للجدول خالص — من غيرها كان هيقرا عنوان من برا الجدول ويقفز عليه (ثغرة!).", fly: [{ from: "c2", to: "imp", label: "cmd = 9", kind: "net", info: "recv() → command id 9" }, { from: "imp", to: "code", label: "edi = 9", kind: "call", info: "ja → .default" }], set: { code: 1, box: { table: { hl: -1 }, h: { hl: -1 } } } }
    ]
  };

  /* ---------------------------------------------------------- call / ret */
  const stk = (rows) => rows;
  S.callret = {
    id: "callret", group: "التحكم والدوال", icon: "📞", title: "call و ret", sub: "عنوان الرجوع على الـ stack", keys: "call ret return address stack push pop rsp rip",
    overview: "<code>call</code> = <b>push</b> عنوان الـ instruction اللي بعدها + <b>jmp</b> للدالة. و<code>ret</code> = <b>pop</b> العنوان ده في <code>RIP</code>. الـ stack هو اللي بيفتكر "+"\"أرجع فين\" — وعشان كده الـ buffer overflow اللي بيوصل للعنوان ده بيتحكم في البرنامج.",
    facts: [["call", "push next RIP ; jmp target"], ["ret", "pop rip"], ["الـ stack", "بيكبر لتحت (عناوين أصغر)"], ["الدرس", "المرحلة 10"]],
    actors: [
      { id: "code", type: "code", x: 24, y: 20, w: 300, label: ".text", lines: [["", "main:", "lbl"], ["401000", "  mov edi, 5"], ["401005", "  call square"], ["40100A", "  add eax, 1"], ["40100D", "  ret"], ["", "square:", "lbl"], ["401010", "  mov eax, edi"], ["401012", "  imul eax, edi"], ["401015", "  ret"]] },
      { id: "regs", type: "regs", x: 24, y: 250, w: 300, label: "REGISTERS", names: ["rip", "rsp", "rdi", "rax"] },
      { id: "cpu", type: "cpu", x: 470, y: 300, label: "CPU", sub: "" },
      { id: "stack", type: "stack", x: 610, y: 30, w: 330, label: "STACK", sub: "high addresses ↓", vx: 92, minRows: 5 }
    ],
    links: [["cpu", "stack"], ["cpu", "code"]],
    init: { regs: { rip: "0x401000", rsp: "0x7FFE0F0", rdi: "?", rax: "?" }, code: 1,
      stack: stk([{ a: "7FFE0E0", v: "", n: "" }, { a: "7FFE0E8", v: "", n: "" }, { a: "7FFE0F0", v: "0x401234", n: "ret → _start", c: "ret", p: "rsp" }, { a: "7FFE0F8", v: "…", n: "caller data" }, { a: "7FFE100", v: "…", n: "" }]) },
    steps: [
      { t: "تجهيز الـ argument", st: "mov edi, 5", d: "<code>edi = 5</code> — الـ argument الأول (Linux). <code>RSP</code> بيشاور على عنوان الرجوع بتاع <code>main</code> نفسها.", set: { regs: { rdi: "5", rip: "0x401005" }, code: 2 } },
      { t: "call = push", st: "push 0x40100A", d: "<code>call</code> بتحسب عنوان الـ instruction اللي بعدها (<code>0x40100A</code>) وبتعمله <b>push</b>: <code>RSP -= 8</code> وبتكتبه في <code>[RSP]</code>.",
        fly: [{ from: "cpu", to: "stack", label: "0x40100A", kind: "push", info: "[0x7FFE0E8] ← 0x40100A (return address)" }],
        set: { regs: { rsp: "0x7FFE0E8" }, stack: stk([{ a: "7FFE0E0", v: "", n: "" }, { a: "7FFE0E8", v: "0x40100A", n: "ret → main+A", c: "ret new", p: "rsp" }, { a: "7FFE0F0", v: "0x401234", n: "ret → _start", c: "ret" }, { a: "7FFE0F8", v: "…", n: "caller data" }, { a: "7FFE100", v: "…", n: "" }]) } },
      { t: "call = jmp", st: "RIP = 0x401010", d: "وبعدين بتقفز: <code>RIP = square</code>. الـ CPU دلوقتي جوه الدالة.", fly: [{ from: "cpu", to: "code", label: "jmp square", kind: "jump", info: "rip = 0x401010" }], set: { regs: { rip: "0x401010" }, code: 6, stack: stk([{ a: "7FFE0E0", v: "", n: "" }, { a: "7FFE0E8", v: "0x40100A", n: "ret → main+A", c: "ret", p: "rsp" }, { a: "7FFE0F0", v: "0x401234", n: "ret → _start", c: "ret" }, { a: "7FFE0F8", v: "…", n: "caller data" }, { a: "7FFE100", v: "…", n: "" }]) } },
      { t: "جسم الدالة", st: "eax = 5", d: "<code>mov eax, edi</code> ← <code>eax = 5</code>.", set: { regs: { rax: "5", rip: "0x401012" }, code: 7 } },
      { t: "الحساب", st: "eax = 25", d: "<code>imul eax, edi</code> ← <code>eax = 25</code>. القيمة الراجعة دايمًا في <code>rax</code>/<code>eax</code>.", set: { regs: { rax: "25", rip: "0x401015" }, code: 8 } },
      { t: "ret = pop rip", st: "RIP = 0x40100A", d: "<code>ret</code> بتعمل <b>pop</b>: بتقرا <code>[RSP]</code> (<code>0x40100A</code>) وتحطه في <code>RIP</code>، و<code>RSP += 8</code>. القيمة القديمة لسه في الذاكرة بس بقت <b>تحت RSP</b> = ميتة.",
        fly: [{ from: "stack", to: "cpu", label: "0x40100A", kind: "pop", info: "rip ← [0x7FFE0E8]; rsp += 8" }],
        set: { regs: { rip: "0x40100A", rsp: "0x7FFE0F0" }, code: 3, stack: stk([{ a: "7FFE0E0", v: "", n: "" }, { a: "7FFE0E8", v: "0x40100A", n: "(stale)", c: "dim" }, { a: "7FFE0F0", v: "0x401234", n: "ret → _start", c: "ret", p: "rsp" }, { a: "7FFE0F8", v: "…", n: "caller data" }, { a: "7FFE100", v: "…", n: "" }]) } },
      { t: "رجعنا للـ caller", st: "eax = 26", d: "<code>main</code> بتكمّل من بعد الـ call: <code>add eax, 1</code> ← <code>26</code>. والـ <code>ret</code> الجاية هترجع لـ <code>_start</code> بنفس الطريقة.", set: { regs: { rax: "26", rip: "0x40100D" }, code: 4 } },
      { t: "ret تاني", st: "pop 0x401234", d: "نفس العملية: <code>pop</code> عنوان الرجوع بتاع <code>main</code>. كل call ليها ret بتفك نفس الـ 8 bytes بالظبط — لو الـ stack اتلخبط في النص، الـ ret هترجع لعنوان غلط.",
        fly: [{ from: "stack", to: "cpu", label: "0x401234", kind: "pop", info: "rip ← [0x7FFE0F0]; rsp += 8" }],
        set: { regs: { rip: "0x401234", rsp: "0x7FFE0F8" }, code: -1, stack: stk([{ a: "7FFE0E0", v: "", n: "" }, { a: "7FFE0E8", v: "0x40100A", n: "(stale)", c: "dim" }, { a: "7FFE0F0", v: "0x401234", n: "(stale)", c: "dim" }, { a: "7FFE0F8", v: "…", n: "caller data", p: "rsp" }, { a: "7FFE100", v: "…", n: "" }]) } }
    ]
  };

  /* ---------------------------------------------------------- stack frame */
  const F = (rows) => rows;
  S.frame = {
    id: "frame", group: "التحكم والدوال", icon: "🏗️", title: "Stack Frame", sub: "prologue · locals · epilogue", keys: "stack frame rbp rsp prologue epilogue leave locals push rbp",
    overview: "كل دالة بتبني <b>frame</b> خاص بيها على الـ stack: <code>push rbp</code> + <code>mov rbp, rsp</code> (الـ prologue)، <code>sub rsp, N</code> عشان المتغيرات المحلية، وفي الآخر <code>leave</code> + <code>ret</code>. المتغيرات المحلية بتبان كـ <code>[rbp-4]</code> و<code>[rbp-8]</code>.",
    facts: [["الـ prologue", "push rbp; mov rbp, rsp; sub rsp, N"], ["locals", "<code>[rbp−x]</code>"], ["args على الـ stack", "<code>[rbp+16]</code>…"], ["leave", "mov rsp, rbp; pop rbp"], ["الدرس", "المرحلة 10"]],
    actors: [
      { id: "code", type: "code", x: 24, y: 20, w: 320, label: "f(int a)  — a=7", cx: 14, lines: [["", "push rbp"], ["", "mov rbp, rsp"], ["", "sub rsp, 16"], ["", "mov [rbp-4], edi    ; a"], ["", "mov eax, [rbp-4]"], ["", "add eax, eax"], ["", "mov [rbp-8], eax    ; x = 2a"], ["", "add eax, [rbp-4]    ; x + a"], ["", "leave"], ["", "ret"]] },
      { id: "regs", type: "regs", x: 24, y: 260, w: 320, label: "REGISTERS", names: ["rsp", "rbp", "rax"] },
      { id: "cpu", type: "cpu", x: 470, y: 320, label: "CPU", sub: "" },
      { id: "stack", type: "stack", x: 590, y: 24, w: 350, label: "STACK", sub: "high ↓", vx: 86, minRows: 6 }
    ],
    links: [["cpu", "stack"]],
    init: { regs: { rsp: "…E0E8", rbp: "…E110 (caller)", rax: "?" },
      stack: F([{ a: "…E0D0", v: "", n: "" }, { a: "…E0D8", v: "", n: "" }, { a: "…E0E0", v: "", n: "" }, { a: "…E0E8", v: "0x401020", n: "return address", c: "ret", p: "rsp" }, { a: "…E0F0", v: "…", n: "caller frame" }, { a: "…E0F8", v: "…", n: "caller frame" }]) },
    steps: [
      { t: "دخلنا الدالة", st: "[rsp] = return address", d: "الـ <code>call</code> لسه حاطة عنوان الرجوع، و<code>rbp</code> لسه بتاع الـ caller. أول حاجة الدالة لازم تحافظ عليه.", set: { code: 0, glow: ["stack"] } },
      { t: "push rbp", st: "حفظ rbp القديم", d: "<code>push rbp</code>: الـ frame pointer بتاع الـ caller اتحفظ تحت عنوان الرجوع مباشرة.",
        fly: [{ from: "cpu", to: "stack", label: "old rbp", kind: "push", info: "[…E0E0] ← rbp (caller)" }],
        set: { code: 1, regs: { rsp: "…E0E0" }, stack: F([{ a: "…E0D0", v: "", n: "" }, { a: "…E0D8", v: "", n: "" }, { a: "…E0E0", v: "…E110", n: "saved rbp", c: "rbp new", p: "rsp" }, { a: "…E0E8", v: "0x401020", n: "return address", c: "ret" }, { a: "…E0F0", v: "…", n: "caller frame" }, { a: "…E0F8", v: "…", n: "caller frame" }]) } },
      { t: "mov rbp, rsp", st: "rbp = قاعدة الـ frame", d: "<code>rbp</code> بقى ثابت على نص الـ frame: فوقه (<code>rbp+8</code>) عنوان الرجوع، وتحته المتغيرات المحلية (<code>rbp−x</code>). الـ rbp ده مبيتحركش طول الدالة.",
        set: { code: 2, regs: { rbp: "…E0E0" }, stack: F([{ a: "…E0D0", v: "", n: "" }, { a: "…E0D8", v: "", n: "" }, { a: "…E0E0", v: "…E110", n: "saved rbp ← rbp", c: "rbp", p: "rsp" }, { a: "…E0E8", v: "0x401020", n: "rbp+8: return", c: "ret" }, { a: "…E0F0", v: "…", n: "rbp+16" }, { a: "…E0F8", v: "…", n: "caller frame" }]) } },
      { t: "sub rsp, 16", st: "مكان للمتغيرات", d: "حجز 16 byte للـ locals. الذاكرة دي <b>مبتتصفرش</b> — فيها زبالة من استخدام قديم (عشان كده المتغير المحلي من غير قيمة في C بيبقى garbage).",
        set: { code: 3, regs: { rsp: "…E0D0" }, stack: F([{ a: "…E0D0", v: "0x????????", n: "rbp-16 (garbage)", p: "rsp" }, { a: "…E0D8", v: "0x????????", n: "rbp-8 (garbage)" }, { a: "…E0E0", v: "…E110", n: "saved rbp ← rbp", c: "rbp" }, { a: "…E0E8", v: "0x401020", n: "return address", c: "ret" }, { a: "…E0F0", v: "…", n: "caller frame" }, { a: "…E0F8", v: "…", n: "caller frame" }]) } },
      { t: "a = 7", st: "[rbp-4] ← edi", d: "الـ <code>-O0</code> بيخزن كل argument على الـ stack الأول. <code>a</code> (4 bytes) راح عند <code>rbp-4</code> = النص العالي من الـ qword اللي عند <code>…E0D8</code>.",
        fly: [{ from: "cpu", to: "stack", label: "a = 7", kind: "write", info: "dword [rbp-4] ← 7" }],
        set: { code: 4, regs: { rax: "?" }, stack: F([{ a: "…E0D0", v: "0x????????", n: "rbp-16", p: "rsp" }, { a: "…E0D8", v: "0x00000007_????????", n: "a @ rbp-4", c: "buf new" }, { a: "…E0E0", v: "…E110", n: "saved rbp ← rbp", c: "rbp" }, { a: "…E0E8", v: "0x401020", n: "return address", c: "ret" }, { a: "…E0F0", v: "…", n: "caller frame" }, { a: "…E0F8", v: "…", n: "caller frame" }]) } },
      { t: "x = 2a", st: "[rbp-8] ← 14", d: "<code>eax = a + a = 14</code> واتخزن في <code>x</code> عند <code>rbp-8</code>. دلوقتي الـ qword عند <code>…E0D8</code> = <code>0x000000070000000E</code> (a فوق، x تحت — little-endian).",
        fly: [{ from: "stack", to: "cpu", label: "a = 7", kind: "read", info: "eax ← [rbp-4]" }, { from: "cpu", to: "stack", label: "x = 14", kind: "write", info: "dword [rbp-8] ← 14" }],
        set: { code: [5, 6], regs: { rax: "14" }, stack: F([{ a: "…E0D0", v: "0x????????", n: "rbp-16", p: "rsp" }, { a: "…E0D8", v: "0x00000007_0000000E", n: "a@-4 · x@-8", c: "buf" }, { a: "…E0E0", v: "…E110", n: "saved rbp ← rbp", c: "rbp" }, { a: "…E0E8", v: "0x401020", n: "return address", c: "ret" }, { a: "…E0F0", v: "…", n: "caller frame" }, { a: "…E0F8", v: "…", n: "caller frame" }]) } },
      { t: "القيمة الراجعة", st: "eax = 21", d: "<code>eax = x + a = 21</code>. الـ return value جاهز في <code>eax</code>.", set: { code: 7, regs: { rax: "21" } } },
      { t: "leave", st: "rsp = rbp; pop rbp", d: "<code>leave</code> = <code>mov rsp, rbp</code> (شيل الـ locals كلها مرة واحدة) + <code>pop rbp</code> (رجّع rbp الـ caller). المتغيرات لسه في الذاكرة بس تحت RSP — اتشالت منطقيًا.",
        fly: [{ from: "stack", to: "cpu", label: "old rbp", kind: "pop", info: "rbp ← […E0E0]" }],
        set: { code: 8, regs: { rsp: "…E0E8", rbp: "…E110 (caller)" }, stack: F([{ a: "…E0D0", v: "0x????????", n: "(dead)", c: "dim" }, { a: "…E0D8", v: "0x00000007_0000000E", n: "(dead)", c: "dim" }, { a: "…E0E0", v: "…E110", n: "(dead)", c: "dim" }, { a: "…E0E8", v: "0x401020", n: "return address", c: "ret", p: "rsp" }, { a: "…E0F0", v: "…", n: "caller frame" }, { a: "…E0F8", v: "…", n: "caller frame" }]) } },
      { t: "ret", st: "pop rip", d: "رجوع للـ caller بـ <code>eax = 21</code>، والـ stack رجع زي ما كان بالظبط قبل الـ call. ده العقد بين أي دالتين.",
        fly: [{ from: "stack", to: "cpu", label: "0x401020", kind: "pop", info: "rip ← […E0E8]" }],
        set: { code: 9, regs: { rsp: "…E0F0" }, stack: F([{ a: "…E0D0", v: "", n: "", c: "dim" }, { a: "…E0D8", v: "", n: "", c: "dim" }, { a: "…E0E0", v: "", n: "", c: "dim" }, { a: "…E0E8", v: "0x401020", n: "(dead)", c: "dim" }, { a: "…E0F0", v: "…", n: "caller frame", p: "rsp" }, { a: "…E0F8", v: "…", n: "caller frame" }]) } }
    ]
  };

  /* ---------------------------------------------------------- stack buffer overflow */
  S.overflow = {
    id: "overflow", group: "التحكم والدوال", icon: "💥", title: "Stack Buffer Overflow", sub: "إزاي input طويل بيخطف RIP", keys: "buffer overflow return address hijack exploit canary gets strcpy",
    overview: "الـ buffer المحلي بيتخزن <b>تحت</b> الـ saved rbp وعنوان الرجوع. لو الكود نسخ input أطول من الـ buffer (<code>gets</code>، <code>strcpy</code>، <code>memcpy</code> بطول غلط)، الكتابة بتطلع لفوق وتغطّي عنوان الرجوع — والـ <code>ret</code> بتقفز لأي عنوان المهاجم عايزه.",
    facts: [["السبب", "نسخ من غير فحص الطول"], ["الهدف", "عنوان الرجوع"], ["الحماية", "Stack canary · NX · ASLR · CET"], ["الدرس", "المرحلة 10 و24"]],
    actors: [
      { id: "att", type: "user", x: 110, y: 110, color: "red", label: "input", sub: "attacker controlled" },
      { id: "code", type: "code", x: 24, y: 200, w: 310, label: "vuln()", cx: 14, lines: [["", "push rbp"], ["", "mov rbp, rsp"], ["", "sub rsp, 16          ; char buf[16]"], ["", "lea rdi, [rbp-16]"], ["", "call gets            ; no length!"], ["", "leave"], ["", "ret"]] },
      { id: "cpu", type: "cpu", x: 470, y: 330, label: "CPU", sub: "" },
      { id: "stack", type: "stack", x: 590, y: 30, w: 350, label: "STACK of vuln()", sub: "high ↓", vx: 92, minRows: 5 }
    ],
    links: [["att", "code"], ["cpu", "stack"]],
    init: { code: 4, stack: [{ a: "…E0D0", v: "????????????????", n: "buf[0..7]", c: "buf", p: "rsp" }, { a: "…E0D8", v: "????????????????", n: "buf[8..15]", c: "buf" }, { a: "…E0E0", v: "0x7FFE0F30", n: "saved rbp", c: "rbp" }, { a: "…E0E8", v: "0x401167", n: "return → main", c: "ret" }, { a: "…E0F0", v: "…", n: "main's frame" }] },
    steps: [
      { t: "الـ frame جاهز", st: "buf[16] تحت عنوان الرجوع", d: "<code>buf</code> = 16 byte عند <code>rbp-16</code>. فوقه مباشرة: <code>saved rbp</code> وبعده <b>عنوان الرجوع</b>. والـ <code>gets</code> مبتعرفش حجم الـ buffer أصلًا.", set: { glow: ["stack"] } },
      { t: "input عادي", st: "\"hello\"", d: "input قصير: <code>68 65 6C 6C 6F 00</code> بيتكتب من أول الـ buffer لفوق (عناوين أكبر). كله جوه الـ 16 byte — تمام.",
        fly: [{ from: "att", to: "stack", label: "\"hello\\0\"", kind: "write", info: "gets → 6 bytes" }],
        set: { stack: [{ a: "…E0D0", v: "68 65 6C 6C 6F 00 ?? ??", n: "\"hello\"", c: "buf", p: "rsp" }, { a: "…E0D8", v: "????????????????", n: "buf[8..15]", c: "buf" }, { a: "…E0E0", v: "0x7FFE0F30", n: "saved rbp", c: "rbp" }, { a: "…E0E8", v: "0x401167", n: "return → main", c: "ret" }, { a: "…E0F0", v: "…", n: "main's frame" }] } },
      { t: "input طويل", st: "32 byte", d: "المهاجم بيبعت 32 byte: <code>'A'×16</code> للـ buffer، <code>'B'×8</code> فوق الـ saved rbp، و8 bytes = عنوان دالة اختارها (<code>0x4011D6</code> بالـ little-endian).",
        fly: [{ from: "att", to: "stack", label: "A×16 B×8 D6 11 40 00…", kind: "bad", info: "gets → 32 bytes (+ \\0)" }],
        set: { stack: [{ a: "…E0D0", v: "4141414141414141", n: "AAAAAAAA", c: "bad", p: "rsp" }, { a: "…E0D8", v: "4141414141414141", n: "AAAAAAAA", c: "bad" }, { a: "…E0E0", v: "4242424242424242", n: "saved rbp ✗", c: "bad" }, { a: "…E0E8", v: "0x00000000004011D6", n: "return ✗✗", c: "bad" }, { a: "…E0F0", v: "00 …", n: "the \\0 lands here" }] } },
      { t: "leave", st: "rbp = 0x4242…", d: "<code>leave</code> بيرجّع <code>rbp</code> من الـ stack — لكن القيمة دلوقتي <code>0x4242424242424242</code>. ده لوحده كفاية يعمل crash لو الـ caller استخدم rbp.",
        fly: [{ from: "stack", to: "cpu", label: "0x4242…", kind: "pop", info: "rbp ← 0x4242424242424242" }], set: { code: 5, sub: { cpu: "rbp = 0x4242…" }, stack: [{ a: "…E0D0", v: "4141414141414141", n: "", c: "dim" }, { a: "…E0D8", v: "4141414141414141", n: "", c: "dim" }, { a: "…E0E0", v: "4242424242424242", n: "", c: "dim" }, { a: "…E0E8", v: "0x00000000004011D6", n: "return ✗✗", c: "bad", p: "rsp" }, { a: "…E0F0", v: "00 …", n: "" }] } },
      { t: "ret = خطف التحكم", st: "RIP = 0x4011D6", d: "<code>ret</code> بتعمل pop للعنوان اللي المهاجم كتبه. <b>RIP بقى في إيد المهاجم</b>: ممكن يقفز لدالة موجودة (ret2win)، أو لسلسلة gadgets (ROP)، أو لـ shellcode. لو كان كتب <code>AAAAAAAA</code> بدل عنوان: crash عند <code>0x4141414141414141</code> (non-canonical).",
        fly: [{ from: "stack", to: "cpu", label: "0x4011D6", kind: "bad", info: "rip ← attacker value" }], set: { code: 6, sub: { cpu: "RIP = 0x4011D6 ☠" } } },
      { t: "الحماية: canary", st: "fs:[0x28]", d: "الـ compilers بيحطوا <b>stack canary</b> (قيمة عشوائية من <code>fs:[28h]</code> على Linux أو <code>__security_cookie</code> على Windows) بين الـ buffer والـ saved rbp، ويفحصوها قبل الـ ret: لو اتغيرت ← <code>__stack_chk_fail</code> والبرنامج يقفل قبل ما الـ ret تنفّذ. ومعاها <b>NX</b> (الـ stack مش executable) و<b>ASLR</b> (العناوين عشوائية) و<b>CET shadow stack</b> في المعالجات الحديثة.",
        set: { glow: ["stack"], sub: { cpu: "with canary: abort()" } } }
    ]
  };

  /* ---------------------------------------------------------- Win64 call */
  // stack slots from …FEE8 (lowest) to …FF28 (return address of our caller)
  const W64 = (vals, rspAt, callee) => {
    const addrs = ["…FEE8", "…FEF0", "…FEF8", "…FF00", "…FF08", "…FF10", "…FF18", "…FF20", "…FF28"];
    const base = callee ? 0 : 1;   // offsets are relative to rsp (callee rsp = …FEE8, caller rsp = …FEF0)
    const names = ["home rcx", "home rdx", "home r8", "home r9", "arg5", "(pad)", "(pad)"];
    return addrs.map((a, i) => {
      const v = vals[i] !== undefined ? vals[i] : (i === 8 ? "ret → …" : "");
      const off = i - base;
      let n = "", c = vals["c" + i] || "";
      if (i >= 1 && i <= 7 && rspAt !== null) n = "rsp+" + (off * 8).toString(16).toUpperCase().padStart(2, "0") + " " + names[i - 1];
      if (i >= 1 && i <= 4 && !c) c = "rbp";
      if (i === 5 && !c) c = "buf";
      if (i === 8) c = "ret";
      return { a, v, n, c, p: i === rspAt ? "rsp" : undefined };
    });
  };
  S.win64 = {
    id: "win64", group: "التحكم والدوال", icon: "🪟", title: "Windows x64 calling convention", sub: "rcx, rdx, r8, r9 + shadow space", keys: "windows x64 calling convention shadow space home space rcx rdx r8 r9 fifth argument",
    overview: "على Windows x64: أول 4 arguments في <code>rcx, rdx, r8, r9</code>، والباقي على الـ stack. والـ caller <b>لازم</b> يحجز 32 byte اسمها <b>shadow space</b> (home space) فوق عنوان الرجوع، حتى لو الدالة مش محتاجاها. وقبل الـ call الـ stack لازم يبقى aligned على 16.",
    facts: [["args 1-4", "<code>rcx rdx r8 r9</code>"], ["arg 5+", "<code>[rsp+20h]</code> قبل الـ call"], ["shadow space", "32 byte"], ["volatile", "rax rcx rdx r8-r11"], ["الدرس", "المرحلة 11"]],
    actors: [
      { id: "code", type: "code", x: 24, y: 20, w: 330, label: "caller → sum5(1,2,3,4,5)", cx: 14, lines: [["", "sub rsp, 38h"], ["", "mov dword [rsp+20h], 5"], ["", "mov r9d, 4"], ["", "mov r8d, 3"], ["", "mov edx, 2"], ["", "mov ecx, 1"], ["", "call sum5"], ["", "add rsp, 38h"]] },
      { id: "regs", type: "regs", x: 24, y: 230, w: 330, label: "REGISTERS", names: ["rsp", "rcx", "rdx", "r8", "r9", "rax"] },
      { id: "cpu", type: "cpu", x: 480, y: 340, label: "CPU", sub: "" },
      { id: "stack", type: "stack", x: 600, y: 14, w: 340, label: "STACK", sub: "high ↓", vx: 74, minRows: 9 }
    ],
    links: [["cpu", "stack"]],
    init: { regs: { rsp: "…FF28", rcx: "?", rdx: "?", r8: "?", r9: "?", rax: "?" }, stack: W64({}, 8, false).map((r, i) => (i < 8 ? { a: r.a, v: "", n: "" } : r)) },
    steps: [
      { t: "حجز المكان", st: "sub rsp, 38h", d: "الـ caller بيحجز <code>0x38</code> = 56 byte: 32 للـ shadow space + 8 للـ argument الخامس + 16 padding. عند دخول الدالة كان <code>rsp ≡ 8 (mod 16)</code>، فبعد طرح 56 بيبقى aligned على 16 — والـ call هتعمل push لـ 8 زي ما الـ ABI متوقع.",
        set: { code: 0, regs: { rsp: "…FEF0" }, stack: W64({ 1: "(shadow)", 2: "(shadow)", 3: "(shadow)", 4: "(shadow)" }, 1, false) } },
      { t: "الـ argument الخامس", st: "[rsp+20h] = 5", d: "اللي بعد الرابع بيروح على الـ stack <b>فوق</b> الـ shadow space مباشرة: <code>[rsp+20h]</code>. ده اللي شفناه في MSVC <code>ui$[rsp]</code>.",
        fly: [{ from: "cpu", to: "stack", label: "arg5 = 5", kind: "write", info: "dword [rsp+20h] ← 5" }],
        set: { code: 1, stack: W64({ 1: "(shadow)", 2: "(shadow)", 3: "(shadow)", 4: "(shadow)", 5: "5", c5: "buf new" }, 1, false) } },
      { t: "الـ registers", st: "r9, r8, rdx, rcx", d: "الأربعة الأوائل في الـ registers. الـ compilers غالبًا بيحمّلوهم بترتيب عكسي (r9 الأول) — مش مهم الترتيب، المهم القيم لحظة الـ call.", set: { code: [2, 3, 4, 5], regs: { r9: "4", r8: "3", rdx: "2", rcx: "1" }, glow: ["regs"] } },
      { t: "call", st: "push return address", d: "<code>call</code> بتعمل push لعنوان الرجوع. من جوه الدالة اتغيرت كل الـ offsets بـ 8: <code>[rsp]</code> = الرجوع، <code>[rsp+8..+20h]</code> = الـ shadow space، و<code>[rsp+28h]</code> = الـ arg الخامس.",
        fly: [{ from: "cpu", to: "stack", label: "ret addr", kind: "push", info: "[…FEE8] ← return address" }],
        set: { code: 6, regs: { rsp: "…FEE8" }, stack: W64({ 0: "ret → caller", c0: "ret new", 1: "(shadow)", 2: "(shadow)", 3: "(shadow)", 4: "(shadow)", 5: "5" }, 0, true) } },
      { t: "الـ callee بيستخدم الـ shadow", st: "mov [rsp+8], rcx …", d: "الـ shadow space ملك الـ callee: في الـ debug builds بيعمل <code>mov [rsp+8], rcx</code> و<code>mov [rsp+10h], rdx</code>… (spill) عشان الـ debugger يشوف الـ parameters. وفي الـ release بيستخدمه كمساحة مؤقتة.",
        fly: [{ from: "cpu", to: "stack", label: "rcx=1 rdx=2 r8=3 r9=4", kind: "write", info: "home the 4 register args" }],
        set: { stack: W64({ 0: "ret → caller", c0: "ret", 1: "1", c1: "rbp new", 2: "2", c2: "rbp new", 3: "3", c3: "rbp new", 4: "4", c4: "rbp new", 5: "5" }, 0, true) } },
      { t: "النتيجة", st: "rax = 15 ; ret", d: "<code>sum5</code> بتقرا الخامس من <code>[rsp+28h]</code> وترجع <code>1+2+3+4+5 = 15</code> في <code>rax</code>، وتعمل <code>ret</code>. على Windows الـ callee <b>مش</b> بيشيل الـ arguments — الـ caller هو اللي بيعمل <code>add rsp, 38h</code> بعدين.",
        fly: [{ from: "stack", to: "cpu", label: "ret", kind: "pop", info: "rip ← return address" }],
        set: { code: 7, regs: { rax: "15", rsp: "…FEF0" }, stack: W64({ 0: "ret → caller", c0: "dim", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" }, 1, false) } }
    ]
  };
  /* ---------------------------------------------------------- rep movsb */
  (function () {
    const word = "HELLO";
    const srcRows = (hl) => word.split("").map((c, i) => ({ a: (0x402000 + i).toString(16).toUpperCase(), v: c.charCodeAt(0).toString(16).toUpperCase() + "  '" + c + "'", n: "", c: i === hl ? "hl" : "" }));
    const dstRows = (n, hl) => word.split("").map((c, i) => ({ a: (0x402100 + i).toString(16).toUpperCase(), v: i < n ? c.charCodeAt(0).toString(16).toUpperCase() + "  '" + c + "'" : "00", n: "", c: i === hl ? "new" : (i < n ? "buf" : "") }));
    const steps = [{ t: "التجهيز", st: "rsi, rdi, rcx, DF", d: "<code>rsi</code> = المصدر، <code>rdi</code> = الهدف، <code>rcx</code> = العدد، و<code>cld</code> بتخلي <code>DF = 0</code> (امشي لقدّام). ده بالظبط <code>memcpy(dst, src, 5)</code>.", set: { code: [0, 1, 2, 3], regs: { rsi: "0x402000", rdi: "0x402100", rcx: "5", df: "0" }, box: { src: { rows: srcRows(-1) }, dst: { rows: dstRows(0, -1) } }, glow: ["regs"] } }];
    for (let i = 0; i < 5; i++) {
      steps.push({ t: "لفة " + (i + 1), st: "[rdi] ← [rsi], rcx = " + (4 - i), d: i === 0
        ? "<code>rep movsb</code> = لفة: انسخ byte من <code>[rsi]</code> لـ <code>[rdi]</code>، زوّد الاتنين بـ 1 (لأن DF = 0)، ونقّص <code>rcx</code>. وكرر لحد ما <code>rcx = 0</code>. كل ده instruction <b>واحدة</b>."
        : "نفس اللفة: byte رقم " + (i + 1) + " ('" + word[i] + "')" + (i === 4 ? " — و<code>rcx</code> وصل صفر فالـ rep بتقف. الـ CPU الحديث بيعمل الـ rep movsb بسرعة رهيبة (ERMSB)، فالـ compilers بيستخدموها لـ memcpy كمان." : "."),
        fly: [{ from: "src", to: "dst", label: "'" + word[i] + "'", kind: "data", info: "byte [" + (0x402100 + i).toString(16) + "] ← [" + (0x402000 + i).toString(16) + "]" }],
        set: { code: 4, regs: { rsi: "0x" + (0x402001 + i).toString(16).toUpperCase(), rdi: "0x" + (0x402101 + i).toString(16).toUpperCase(), rcx: String(4 - i) }, box: { src: { rows: srcRows(i), hl: -1 }, dst: { rows: dstRows(i + 1, i), hl: -1 } } } });
    }
    steps.push({ t: "DF = 1؟", st: "النسخ لورا", d: "لو كان <code>std</code> (DF = 1)، rsi وrdi <b>بيقلّوا</b> بعد كل byte — بتستخدم للنسخ لورا لما المصدر والهدف متداخلين (memmove). الـ ABI بيطلب <code>DF = 0</code> عند أي call، فلو شفت <code>std</code> في كود لازم يرجعها بـ <code>cld</code>.", set: { regs: { df: "0" }, glow: ["regs"] } });
    S.repmovs = {
      id: "repmovs", group: "التحكم والدوال", icon: "🔁", title: "rep movsb", sub: "memcpy في instruction واحدة", keys: "rep movsb movs stos string memcpy rsi rdi rcx direction flag",
      overview: "الـ string instructions بتشتغل على <code>[rsi]</code> و<code>[rdi]</code> وبتحرك الـ pointers أوتوماتيك. ومع <code>rep</code> بتتكرر <code>rcx</code> مرة. ده شكل <code>memcpy</code> / <code>memset</code> في كود كتير — وفي الـ shellcode.",
      facts: [["movsb", "[rdi] ← [rsi]; rsi++, rdi++"], ["rep", "كرر rcx مرة"], ["DF", "0 = لقدّام، 1 = لورا"], ["الدرس", "المرحلة 12"]],
      actors: [
        { id: "code", type: "code", x: 24, y: 20, w: 300, label: ".text", cx: 14, lines: [["", "lea rsi, [rel src]"], ["", "lea rdi, [rel dst]"], ["", "mov ecx, 5"], ["", "cld"], ["", "rep movsb"]] },
        { id: "regs", type: "regs", x: 24, y: 160, w: 300, label: "REGISTERS", names: ["rsi", "rdi", "rcx", "df"] },
        { id: "cpu", type: "cpu", x: 180, y: 360, label: "CPU", sub: "" },
        { id: "src", type: "box", x: 400, y: 60, w: 240, label: "SOURCE ← rsi", vx: 92, rows: srcRows(-1) },
        { id: "dst", type: "box", x: 700, y: 60, w: 240, label: "DEST ← rdi", vx: 92, rows: dstRows(0, -1) }
      ],
      links: [["src", "dst"], ["cpu", "src"]],
      init: { regs: { rsi: "?", rdi: "?", rcx: "?", df: "?" } },
      steps
    };
  })();
  /* ---------------------------------------------------------- linked list walk */
  (function () {
    const node = (addr, next, val, hl) => ({ rows: [{ a: "+0x00", v: next, n: "next", c: hl === 0 ? "hl" : "" }, { a: "+0x08", v: val, n: "value", c: hl === 1 ? "hl" : "" }] });
    S.linkedlist = {
      id: "linkedlist", group: "البيانات والهياكل", icon: "🔗", title: "Linked list walk", sub: "mov rdi, [rdi] — أهم loop في الـ RE", keys: "linked list next pointer struct traversal peb ldr",
      overview: "كل node فيها pointer للي بعدها (<code>next</code> عند offset 0) وقيمة (عند offset 8). الـ loop: اقرا القيمة، و<code>rdi = [rdi]</code> عشان تروح للـ node اللي بعدها، لحد ما توصل <code>NULL</code>. الـ nodes مش لازم تبقى جنب بعض في الذاكرة — الـ pointers هي اللي بتربطهم. نفس الشكل بالظبط هتلاقيه في <b>PEB → Ldr → module list</b> اللي الـ shellcode بيمشي فيها.",
      facts: [["next", "<code>[node+0]</code>"], ["value", "<code>[node+8]</code>"], ["نهاية", "<code>next == NULL</code>"], ["الدرس", "المرحلة 14 و22"]],
      actors: [
        { id: "code", type: "code", x: 24, y: 20, w: 280, label: "list_sum (gcc -O2)", cx: 14, lines: [["", "xor eax, eax"], ["", "test rdi, rdi"], ["", "je .done"], ["", ".L12:", "lbl"], ["", "  add eax, [rdi+8]"], ["", "  mov rdi, [rdi]"], ["", "  test rdi, rdi"], ["", "  jne .L12"], ["", ".done: ret", "lbl"]] },
        { id: "regs", type: "regs", x: 24, y: 236, w: 280, label: "REGISTERS", names: ["rdi", "eax"] },
        { id: "cpu", type: "cpu", x: 150, y: 380, label: "CPU", sub: "", ly: 44 },
        { id: "na", type: "box", x: 370, y: 40, w: 250, label: "node A @ 0x403000", vx: 66, rows: node(0, "0x403020", "10").rows },
        { id: "nb", type: "box", x: 690, y: 40, w: 250, label: "node B @ 0x403020", vx: 66, rows: node(0, "0x403010", "20").rows },
        { id: "nc", type: "box", x: 530, y: 260, w: 250, label: "node C @ 0x403010", vx: 66, rows: node(0, "NULL (0)", "12").rows }
      ],
      links: [["na", "nb"], ["nb", "nc"]],
      init: { regs: { rdi: "0x403000 (head)", eax: "?" } },
      steps: [
        { t: "البداية", st: "rdi = head", d: "<code>rdi</code> = أول node (الـ argument). <code>eax = 0</code> (المجموع)، والـ <code>test rdi, rdi</code> بتتأكد إن القايمة مش فاضية.", set: { code: [0, 1, 2], regs: { eax: "0" }, glow: ["na"] } },
        { t: "اقرا القيمة", st: "eax += [rdi+8]", d: "<code>[rdi+8]</code> = field الـ value في node A = 10.", fly: [{ from: "na", to: "regs", label: "10", kind: "read", info: "eax += [0x403008]" }], set: { code: 4, regs: { eax: "10" }, box: { na: { hl: 1 } } } },
        { t: "روح للي بعدها", st: "rdi = [rdi]", d: "<code>mov rdi, [rdi]</code>: اقرا الـ pointer اللي في أول الـ node وحطه في <code>rdi</code>. ده \"p = p->next\". لاحظ إن B عنوانها <code>0x403020</code> — بعد C في الذاكرة، والترتيب جاي من الـ pointers بس.", fly: [{ from: "na", to: "nb", label: "next = 0x403020", kind: "jump", info: "rdi ← [0x403000]" }], set: { code: [5, 6, 7], regs: { rdi: "0x403020" }, box: { na: { hl: 0 } } } },
        { t: "node B", st: "eax = 30", d: "نفس اللفة: القيمة 20 ← المجموع 30.", fly: [{ from: "nb", to: "regs", label: "20", kind: "read", info: "eax += [0x403028]" }], set: { code: 4, regs: { eax: "30" }, box: { na: { hl: -1 }, nb: { hl: 1 } } } },
        { t: "next", st: "rdi = 0x403010", d: "<code>next</code> بتاع B بيشاور على C عند <code>0x403010</code>.", fly: [{ from: "nb", to: "nc", label: "next = 0x403010", kind: "jump", info: "rdi ← [0x403020]" }], set: { code: [5, 6, 7], regs: { rdi: "0x403010" }, box: { nb: { hl: 0 } } } },
        { t: "node C", st: "eax = 42", d: "القيمة 12 ← المجموع <b>42</b>.", fly: [{ from: "nc", to: "regs", label: "12", kind: "read", info: "eax += [0x403018]" }], set: { code: 4, regs: { eax: "42" }, box: { nb: { hl: -1 }, nc: { hl: 1 } } } },
        { t: "NULL = النهاية", st: "test rdi, rdi → 0", d: "<code>next</code> بتاع C = 0. الـ <code>test rdi, rdi</code> بيرفع ZF والـ <code>jne</code> مبتقفزش ← <code>ret</code> بـ 42. في الـ PEB list الشرط بيختلف: القايمة <b>دايرية</b> (آخر node بترجع للرأس) فالـ loop بتقف لما ترجع للبداية.", fly: [{ from: "nc", to: "regs", label: "next = NULL", kind: "ret", info: "rdi ← 0 → exit loop" }], set: { code: [5, 6, 7, 8], regs: { rdi: "0" }, box: { nc: { hl: 0 } } } }
      ]
    };
  })();
  /* ---------------------------------------------------------- startup: how to find main */
  S.startup = {
    id: "startup", group: "الهندسة العكسية", icon: "🚦", title: "من _start لـ main", sub: "إزاي تلاقي main في binary من غير symbols", keys: "_start entry point __libc_start_main main stripped crt init_array constructor tls callback",
    overview: "الـ entry point في الـ ELF مش <code>main</code> — ده <code>_start</code> (من الـ C runtime). بيجهز argc/argv وبينادي <code>__libc_start_main(main, argc, argv, …)</code>. يعني <b>أول argument</b> (<code>rdi</code>) = عنوان main. دي أسرع طريقة تلاقي main في binary متشال منه الـ symbols.",
    facts: [["Entry (ELF header)", "<code>_start</code> ≠ main"], ["main =", "أول arg لـ __libc_start_main"], ["قبل main", "<code>.init_array</code> (constructors)"], ["Windows", "mainCRTStartup → main / WinMain"], ["الدرس", "المرحلة 18"]],
    w: 960, h: 470,
    actors: [
      { id: "code", type: "code", x: 24, y: 20, w: 330, label: "_start  (crt1.o)", lines: [
        ["401040", "endbr64"], ["401044", "xor ebp, ebp"], ["401046", "mov r9, rdx       ; rtld_fini"], ["401049", "pop rsi           ; argc"], ["40104A", "mov rdx, rsp      ; argv"],
        ["40104D", "and rsp, -16"], ["401051", "push rax"], ["401052", "push rsp"], ["401053", "xor r8d, r8d"], ["401056", "xor ecx, ecx"],
        ["401058", "lea rdi, [rip+0xD7]"], ["40105F", "call [__libc_start_main]"], ["401065", "hlt"]] },
      { id: "libc", type: "dll", x: 480, y: 120, color: "vio", label: "libc.so.6", sub: "__libc_start_main" },
      { id: "kernel", type: "kernel", x: 480, y: 360, color: "vio", label: "Linux kernel", sub: "execve / exit_group" },
      { id: "regs", type: "regs", x: 636, y: 20, w: 300, label: "REGISTERS", names: ["rip", "rsp", "rbp", "rdi", "rsi", "rdx"] },
      { id: "main", type: "code", x: 636, y: 200, w: 300, hk: "code2", label: "main  (sub_401136)", lines: [
        ["401136", "push rbp"], ["401137", "mov rbp, rsp"], ["40113A", "…  your program  …"], ["401150", "mov eax, 0"], ["401155", "pop rbp"], ["401156", "ret"]] }
    ],
    links: [["code", "libc"], ["libc", "main"], ["libc", "kernel"], ["kernel", "code"]],
    init: { regs: { rip: "?", rsp: "?", rbp: "?", rdi: "?", rsi: "?", rdx: "?" }, code: -1, code2: -1 },
    steps: [
      { t: "execve", st: "RIP = e_entry", d: "الـ kernel عمل map للملف، وبنى الـ stack: <code>[rsp]</code> = argc، وبعده pointers الـ argv، ثم NULL، ثم envp، ثم الـ auxv. وحط <code>RIP</code> = الـ entry اللي في الـ ELF header = <code>_start</code> (مش main!).",
        fly: [{ from: "kernel", to: "code", label: "RIP = 0x401040", kind: "jump", info: "jump to e_entry (_start)" }],
        set: { code: 0, regs: { rip: "0x401040", rsp: "…F50 → argc" } } },
      { t: "xor ebp, ebp", st: "rbp = 0", d: "<code>rbp = 0</code> = علامة «ده أول frame». الـ debugger بيوقف الـ backtrace لما يلاقي rbp = 0.",
        set: { code: 1, regs: { rbp: "0", rip: "0x401044" } } },
      { t: "argc وargv", st: "rsi = argc · rdx = argv", d: "<code>pop rsi</code> = argc من أعلى الـ stack، و<code>mov rdx, rsp</code> = عنوان أول pointer في argv. (و<code>r9</code> = اللي الـ dynamic linker بعته في rdx: دالة تتنادي عند الخروج.)",
        set: { code: [2, 3, 4], regs: { rsi: "1 (argc)", rdx: "…F58 (argv)", rsp: "…F58", rip: "0x40104D" } } },
      { t: "Alignment", st: "and rsp, -16", d: "الـ ABI بيطلب rsp مضاعف 16 قبل أي call. الـ <code>push rax</code> و<code>push rsp</code> بيحافظوا على الـ alignment ويحطوا قيمة للـ stack_end. وr8/rcx = 0 (init/fini بقوا NULL من glibc 2.34).",
        set: { code: [5, 6, 7, 8, 9], regs: { rsp: "…F40", rip: "0x401058" } } },
      { t: "🎯 عنوان main", st: "rdi = 0x401136", d: "<b>أهم سطر:</b> <code>lea rdi, [rip+0xD7]</code> ← <code>0x40105F + 0xD7 = 0x401136</code>. ده أول argument لـ <code>__libc_start_main</code> = <b>main</b>. في IDA/Ghidra: اضغط على الـ operand ده ← وصلت لـ main، سمّيه.",
        set: { code: 10, regs: { rdi: "0x401136 = main!", rip: "0x40105F" }, glow: ["main"] } },
      { t: "call __libc_start_main", st: "(main, argc, argv, …)", d: "النداء عن طريق الـ GOT (dynamic linking). الـ <code>hlt</code> اللي بعده مبيتنفذش أبدًا — لأن libc هتنادي <code>exit</code> بنفسها.",
        fly: [{ from: "code", to: "libc", label: "main, argc, argv", kind: "call", info: "call [rip+GOT] → __libc_start_main" }],
        set: { code: 11, regs: { rip: "libc" } } },
      { t: "قبل main!", st: ".init_array", d: "libc بتشغّل الـ constructors (<code>.preinit_array</code> و<code>.init_array</code>) <b>قبل</b> main. الـ malware بيحب يحط كود هنا (<code>__attribute__((constructor))</code>) — لو بدأت التحليل من main بس هتفوّته. ومقابلها في Windows: <b>TLS callbacks</b> (مرحلة 24).",
        set: { code: -1, glow: ["libc"] } },
      { t: "main(argc, argv, envp)", st: "RIP = 0x401136", d: "دلوقتي بس main بتبدأ — والـ arguments في <code>edi/rsi/rdx</code> زي أي دالة عادية.",
        fly: [{ from: "libc", to: "main", label: "main(1, argv, envp)", kind: "call", info: "call main" }],
        set: { code2: 0, regs: { rip: "0x401136", rdi: "1 (argc)", rsi: "argv", rdx: "envp" } } },
      { t: "return 0", st: "eax = 0", d: "<code>main</code> رجّعت <code>eax = 0</code> ← لـ libc (مش للـ kernel).",
        fly: [{ from: "main", to: "libc", label: "eax = 0", kind: "ret", info: "ret → __libc_start_main" }],
        set: { code2: [3, 4, 5], regs: { rip: "libc" } } },
      { t: "exit(0)", st: "exit_group(0)", d: "libc بتنادي <code>exit(eax)</code>: تشغّل الـ atexit handlers وتعمل flush للـ stdio، وبعدين syscall <code>exit_group</code>. ده سبب إن <code>printf</code> من غير <code>\\n</code> بيطبع برضه لما main ترجع، بس مش لو عملت <code>_exit</code> مباشرة.",
        fly: [{ from: "libc", to: "kernel", label: "exit_group(0)", kind: "sys", info: "process ends" }],
        set: { code2: -1 } }
    ]
  };
  /* ---------------------------------------------------------- instruction decoding */
  (function () {
    const FIELDS = (o) => [
      { a: "REX", v: o.rex || "—", n: o.rexn || "", c: o.c === 0 ? "hl" : "" },
      { a: "Opcode", v: o.op || "—", n: o.opn || "", c: o.c === 1 ? "hl" : "" },
      { a: "ModRM", v: o.modrm || "—", n: o.modrmn || "", c: o.c === 2 ? "hl" : "" },
      { a: "SIB", v: o.sib || "—", n: o.sibn || "", c: o.c === 3 ? "hl" : "" },
      { a: "Disp", v: o.disp || "—", n: o.dispn || "", c: o.c === 4 ? "hl" : "" }
    ];
    const MEM = (hl) => ({ rows: [{ a: "401000", v: "48", n: "" }, { a: "401001", v: "8B", n: "" }, { a: "401002", v: "44", n: "" }, { a: "401003", v: "CB", n: "" }, { a: "401004", v: "10", n: "" }, { a: "401005", v: "C3", n: "next" }], hl: hl });
    const d1 = { rex: "48", rexn: "0100 W=1 R=0 X=0 B=0" }, d2 = Object.assign({}, d1, { op: "8B", opn: "MOV r64, r/m64" }),
      d3 = Object.assign({}, d2, { modrm: "44", modrmn: "01 000 100" }), d4 = Object.assign({}, d3, { sib: "CB", sibn: "11 001 011" }),
      d5 = Object.assign({}, d4, { disp: "10", dispn: "disp8 = +0x10" });
    S.decode = {
      id: "decode", group: "الهندسة العكسية", icon: "🧬", title: "الـ CPU بيفك instruction", sub: "48 8B 44 CB 10 → mov rax, [rbx+rcx*8+0x10]", keys: "decode encoding rex modrm sib displacement opcode machine code anti-disassembly desync",
      overview: "الـ CPU (والـ disassembler) بيقرا الـ bytes بالترتيب: prefixes ← REX ← opcode ← ModRM ← SIB ← displacement ← immediate. كل byte بيحدد هل فيه byte تاني وإيه معناه. الطول مش ثابت (1–15 byte) — وعشان كده لو بدأت الفك من byte غلط هتطلع instructions مختلفة تمامًا.",
      facts: [["الطول", "1 → 15 byte"], ["REX", "0x40–0x4F: W R X B"], ["ModRM", "mod · reg · r/m"], ["SIB", "scale · index · base"], ["الدرس", "المرحلة 19"]],
      w: 960, h: 440,
      actors: [
        { id: "mem", type: "box", x: 24, y: 20, w: 290, label: "MEMORY  (.text)", vx: 92, rows: MEM(-1).rows },
        { id: "cpu", type: "cpu", x: 470, y: 120, label: "Decoder", sub: "front-end" },
        { id: "fields", type: "box", x: 620, y: 20, w: 320, label: "DECODED FIELDS", vx: 90, rows: FIELDS({}) },
        { id: "out", type: "box", x: 330, y: 300, w: 610, label: "RESULT", vx: 14, rows: [{ v: "?" }] }
      ],
      links: [["mem", "cpu"], ["cpu", "fields"], ["cpu", "out"]],
      init: {},
      steps: [
        { t: "Fetch", st: "اقرا من RIP", d: "<code>RIP = 0x401000</code>. الـ decoder بيسحب bytes (لحد 15) من غير ما يعرف لسه الـ instruction طولها كام.",
          fly: [{ from: "mem", to: "cpu", label: "48 8B 44 CB 10 C3…", kind: "fetch", info: "fetch from 0x401000" }], set: { box: { mem: MEM(-1) } } },
        { t: "REX = 48", st: "0100 1000", d: "أي byte من <code>0x40</code> لـ <code>0x4F</code> في الـ 64-bit = <b>REX prefix</b>. الـ 4 bits الصغيرة: <b>W</b>=1 ← العملية 64-bit (rax مش eax)، و<b>R/X/B</b> = bit رابع للـ registers (r8–r15). هنا كلهم 0.",
          set: { box: { mem: MEM(0), fields: { rows: FIELDS(Object.assign({ c: 0 }, d1)) } } } },
        { t: "Opcode = 8B", st: "MOV reg, r/m", d: "<code>8B</code> = <b>MOV r, r/m</b>: الـ destination register والـ source ممكن register أو ذاكرة. (<code>89</code> = نفس الحاجة بالعكس: <code>mov r/m, r</code>.) الـ opcode ده بيقول: «فيه ModRM جاي».",
          set: { box: { mem: MEM(1), fields: { rows: FIELDS(Object.assign({ c: 1 }, d2)) } } } },
        { t: "ModRM = 44", st: "mod=01 reg=000 r/m=100", d: "<code>0x44 = 01 000 100</code>. <b>mod=01</b> ← operand في الذاكرة + displacement 1 byte. <b>reg=000</b> ← <code>rax</code> (الـ destination). <b>r/m=100</b> ← قيمة خاصة: «العنوان معقد، فيه <b>SIB</b> byte جاي».",
          set: { box: { mem: MEM(2), fields: { rows: FIELDS(Object.assign({ c: 2 }, d3)) } } } },
        { t: "SIB = CB", st: "scale=8 index=rcx base=rbx", d: "<code>0xCB = 11 001 011</code>. <b>scale=11</b> ← ×8، <b>index=001</b> ← <code>rcx</code>، <b>base=011</b> ← <code>rbx</code>. يعني <code>rbx + rcx*8</code> — شكل <code>array[i]</code> لعناصر 8 byte.",
          set: { box: { mem: MEM(3), fields: { rows: FIELDS(Object.assign({ c: 3 }, d4)) } } } },
        { t: "Displacement = 10", st: "+0x10", d: "الـ mod=01 قال disp8: byte واحد <code>0x10</code> (signed، فـ <code>0xF0</code> كانت هتبقى −16). مفيش immediate للـ opcode ده ← خلصنا: <b>5 bytes</b>.",
          set: { box: { mem: MEM(4), fields: { rows: FIELDS(Object.assign({ c: 4 }, d5)) } } } },
        { t: "النتيجة", st: "RIP += 5", d: "<code>mov rax, [rbx + rcx*8 + 0x10]</code> — مثلًا <code>x = items[i].field</code> لو كل struct 8 bytes والـ field عند offset 16… أو <code>arr[i+2]</code>. والـ RIP الجاي = <code>0x401005</code>.",
          fly: [{ from: "cpu", to: "out", label: "mov rax, [rbx+rcx*8+0x10]", kind: "exec", info: "length = 5 → rip = 0x401005" }],
          set: { box: { mem: MEM(5), fields: { rows: FIELDS(d5) }, out: { rows: [{ v: "mov rax, [rbx + rcx*8 + 0x10]        ; 48 8B 44 CB 10" }], hl: 0 } } } },
        { t: "bit واحد بيفرق", st: "4C … → mov r8, …", d: "لو أول byte كان <code>4C</code> بدل <code>48</code> (R=1) ← الـ reg بقى 1000 = <code>r8</code>: <code>mov r8, [rbx+rcx*8+0x10]</code>. ولو <code>49</code> (B=1) ← الـ base = <code>r11</code>. ومن غير REX خالص ← <code>mov eax, …</code> (32-bit).",
          set: { box: { out: { rows: [{ v: "48 8B 44 CB 10  →  mov rax, [rbx+rcx*8+0x10]" }, { v: "4C 8B 44 CB 10  →  mov r8,  [rbx+rcx*8+0x10]" }, { v: "49 8B 44 CB 10  →  mov rax, [r11+rcx*8+0x10]" }, { v: "   8B 44 CB 10  →  mov eax, [rbx+rcx*8+0x10]" }], hl: 1 } } } },
        { t: "⚠ Desync", st: "ابدأ من byte غلط", d: "نفس الـ bytes لو الفك بدأ من <code>0x401002</code>: <code>44</code> = REX.R لوحده و<code>CB</code> = <code>retf</code>! كود مختلف تمامًا. ده أساس <b>anti-disassembly</b>: الـ malware بيقفز لنص instruction عشان الـ disassembler (اللي بيقرا خطي) يطلع زبالة. الحل: <b>اعمل undefine (U) ثم code (C)</b> من العنوان الصح في IDA.",
          set: { box: { mem: MEM(2), out: { rows: [{ v: "من 0x401000:  mov rax, [rbx+rcx*8+0x10] ; ret" }, { v: "من 0x401001:  mov eax, [rbx+rcx*8+0x10] ; ret" }, { v: "من 0x401002:  rex.R retf  ; adc bl, al …   ← زبالة" }], hl: 2 } } } }
      ]
    };
  })();
  /* ---------------------------------------------------------- PE loading + IAT */
  (function () {
    const IAT = (v, hl) => ({ rows: [
      { a: "4070", v: v[0], n: "ExitProcess" }, { a: "4078", v: v[1], n: "GetStdHandle" }, { a: "4080", v: v[2], n: "WriteFile" },
      { a: "4088", v: "0", n: "end KERNEL32" }, { a: "4090", v: v[3], n: "MessageBoxA" }, { a: "4098", v: "0", n: "end USER32" }], hl: hl });
    const DISK = ["0x40A0 → name", "0x40AE → name", "0x40BE → name", "0x40CA → name"];
    const K = ["0x7FFB2C21E3B0", "0x7FFB2C2141A0", "0x7FFB2C225A80"], U = "0x7FFB2DA8C9E0";
    S.iat = {
      id: "iat", group: "الهندسة العكسية", icon: "🗂️", title: "الـ Loader والـ IAT", sub: "إزاي call [rip+X] بتوصل لـ WriteFile", keys: "pe loader import address table iat ilt import descriptor loadlibrary getprocaddress iat hook scylla unpacking",
      overview: "الـ EXE مش عارف عناوين دوال الـ DLLs وقت الـ compile (بتتغير مع كل boot بسبب ASLR). فبيسيب <b>جدول فاضي</b> (الـ IAT) وجنبه أسماء الدوال. الـ <b>loader</b> بيحمّل كل DLL، يدوّر على كل دالة في الـ export table بتاعتها، ويكتب عنوانها في الـ IAT. الكود بينادي <code>call [IAT slot]</code> — نداء غير مباشر.",
      facts: [["الـ IAT", "جدول عناوين (8 bytes لكل دالة)"], ["الـ ILT", "نفس الشكل بس بيفضل أسماء"], ["النداء", "<code>FF 15</code> call [rip+x]"], ["الملف", "الـ PE الحقيقي في المرحلة 20"], ["الدرس", "المرحلة 20"]],
      w: 960, h: 460,
      actors: [
        { id: "file", type: "file", x: 80, y: 110, label: "hello.exe", sub: "on disk" },
        { id: "ldr", type: "kernel", x: 80, y: 330, color: "vio", label: "Windows loader", sub: "ntdll!Ldr…" },
        { id: "iat", type: "box", x: 200, y: 20, w: 400, label: "IAT  @ 0x140004070  (.idata)", vx: 64, rows: IAT(DISK, -1).rows },
        { id: "code", type: "code", x: 200, y: 250, w: 400, label: ".text", cx: 92, lines: [
          ["140001004", "mov ecx, -11"], ["140001009", "call [rip+0x3069]  ; [140004078]"], ["14000102F", "call [rip+0x304B]  ; [140004080]"], ["14000104B", "call [rip+0x303F]  ; [140004090]"], ["140001053", "call [rip+0x3017]  ; [140004070]"]] },
        { id: "k32", type: "dll", x: 720, y: 110, color: "grn", label: "KERNEL32.dll", sub: "exports: 1600+" },
        { id: "u32", type: "dll", x: 880, y: 110, color: "amb", label: "USER32.dll", sub: "exports: 1000+" },
        { id: "cpu", type: "cpu", x: 720, y: 330, label: "CPU", sub: "" },
        { id: "hook", type: "bug", x: 880, y: 330, color: "red", label: "IAT hook", sub: "malware" }
      ],
      links: [["file", "ldr"], ["ldr", "iat"], ["ldr", "k32"], ["ldr", "u32"], ["code", "iat"], ["cpu", "k32"]],
      init: { code: -1, dim: ["hook"] },
      steps: [
        { t: "على الـ disk", st: "IAT = RVAs لأسماء", d: "في الملف، كل slot في الـ IAT فيه <b>RVA لاسم الدالة</b> (hint/name) — زي الـ ILT بالظبط. مثلًا <code>0x40AE</code> بيشاور على <code>\"GetStdHandle\"</code>. لسه مفيش ولا عنوان حقيقي.",
          set: { box: { iat: IAT(DISK, -1) }, glow: ["file"] } },
        { t: "Map", st: "sections → memory", d: "الـ loader بيعمل map لكل section في مكانه (RVA + ImageBase)، ويطبّق الـ relocations لو الـ base اتغير بسبب ASLR.",
          fly: [{ from: "file", to: "ldr", label: "map image @ 0x140000000", kind: "data", info: "NtMapViewOfSection" }] },
        { t: "KERNEL32.dll", st: "load DLL", d: "أول import descriptor: <code>KERNEL32.dll</code>. لو مش محمّل، الـ loader بيحمّله (ومعاه الـ DLLs اللي هو محتاجها — recursion).",
          fly: [{ from: "ldr", to: "k32", label: "LoadLibrary(\"KERNEL32.dll\")", kind: "api", info: "map + run its DllMain" }] },
        { t: "Resolve", st: "export lookup", d: "لكل اسم: binary search في الـ <b>export table</b> بتاعة kernel32 (الـ hint بيسرّع البحث) ← العنوان الحقيقي، ويتكتب في الـ slot. الـ 3 دوال اتحلّوا.",
          fly: [{ from: "k32", to: "iat", label: "3 addresses", kind: "write", info: "IAT[0..2] ← real addresses" }],
          set: { box: { iat: IAT([K[0], K[1], K[2], DISK[3]], 1) } } },
        { t: "USER32.dll", st: "MessageBoxA", d: "نفس العملية للـ descriptor التاني. دلوقتي الـ IAT كله عناوين حقيقية (العناوين هنا مثال — بتتغير كل boot).",
          fly: [{ from: "ldr", to: "u32", label: "LoadLibrary(\"USER32.dll\")", kind: "api", info: "" }, { from: "u32", to: "iat", label: U, kind: "write", info: "IAT[4] ← MessageBoxA" }],
          set: { box: { iat: IAT([K[0], K[1], K[2], U], 4) } } },
        { t: "التنفيذ", st: "call [rip+0x3069]", d: "<code>FF 15 69 30 00 00</code>: الـ CPU بيحسب <code>0x14000100F + 0x3069 = 0x140004078</code>، يقرا الـ 8 bytes اللي هناك (عنوان GetStdHandle)، ويقفز لها. IDA بيعرضها <code>call cs:GetStdHandle</code> لأنه عارف الـ slot ده بتاع مين.",
          fly: [{ from: "code", to: "iat", label: "read [0x140004078]", kind: "read", info: "" }, { from: "cpu", to: "k32", label: "→ GetStdHandle", kind: "call", info: "rip = " + K[1] }],
          set: { code: 1, box: { iat: { hl: 1 } } } },
        { t: "Unpacking & Scylla", st: "dump + rebuild", d: "الـ packed malware بيعمل الخطوات دي <b>بنفسه</b> (LoadLibrary + GetProcAddress) بعد ما يفك الكود. لما تعمل dump للـ process، الـ IAT فيه عناوين مش أسماء — أداة <b>Scylla</b> (جوه x64dbg) بتعرف كل عنوان بتاع أنهي API وتبني جدول imports جديد عشان الـ dump يتفتح في IDA صح.",
          set: { code: -1, glow: ["iat"] } },
        { t: "IAT hooking", st: "slot ← evil", d: "أي حد جوه الـ process يقدر يكتب في الـ IAT (بعد <code>VirtualProtect</code>): يغيّر slot الـ WriteFile لدالته هو ← كل نداء بيعدّي عليه الأول. أسهل من الـ inline hook (مفيش تعديل في كود الـ DLL). في التحليل: قارن كل slot بالـ export الحقيقي — لو بيشاور برا الـ DLL بتاعه = hook.",
          fly: [{ from: "hook", to: "iat", label: "IAT[WriteFile] = evil_WriteFile", kind: "bad", info: "VirtualProtect + overwrite" }],
          set: { dim: [], glow: ["hook"], box: { iat: IAT([K[0], K[1], "0x0000020A1F3B0000 ⚠", U], 2) } } }
      ]
    };
  })();
  /* ---------------------------------------------------------- 32-bit cdecl call */
  (function () {
    const R = (o) => [
      { a: "0019FF60", v: "", n: "" },
      { a: "0019FF64", v: o.ebp || "", n: o.ebp ? "saved ebp" : "", c: o.ebp ? (o.stale ? "dim" : "rbp") : "", p: o.p === 0 ? o.pl || "esp" : "" },
      { a: "0019FF68", v: o.ret || "", n: o.ret ? "return address" : "", c: o.ret ? (o.stale ? "dim" : "ret") : "", p: o.p === 1 ? o.pl || "esp" : "" },
      { a: "0019FF6C", v: o.a1 || "", n: o.a1 ? (o.lbl ? "[ebp+8]  p" : "arg1  p") : "", c: o.a1 ? (o.dead ? "dim" : "buf") : "", p: o.p === 2 ? o.pl || "esp" : "" },
      { a: "0019FF70", v: o.a2 || "", n: o.a2 ? (o.lbl ? "[ebp+12] n" : "arg2  n") : "", c: o.a2 ? (o.dead ? "dim" : "buf") : "", p: o.p === 3 ? o.pl || "esp" : "" },
      { a: "0019FF74", v: o.a3 || "", n: o.a3 ? (o.lbl ? "[ebp+16] seed" : "arg3  seed") : "", c: o.a3 ? (o.dead ? "dim" : "buf") : "", p: o.p === 4 ? o.pl || "esp" : "" },
      { a: "0019FF78", v: "…", n: "caller's data", p: o.p === 5 ? o.pl || "esp" : "" }
    ];
    S.call32 = {
      id: "call32", group: "الهندسة العكسية", icon: "📦", title: "x86 32-bit: الـ args على الـ stack", sub: "cdecl: push · call · [ebp+8] · add esp", keys: "x86 32-bit cdecl stdcall push arguments ebp+8 frame ret n add esp caller cleanup",
      overview: "في الـ 32-bit مفيش arguments في registers (غير fastcall/thiscall): الـ caller بيعمل <code>push</code> للـ args <b>من اليمين للشمال</b>، والدالة بتقراهم بـ <code>[ebp+8]</code>، <code>[ebp+12]</code>… الـ <b>cdecl</b>: الـ caller بينضف (<code>add esp, N</code>). الـ <b>stdcall</b> (WinAPI): الدالة بتنضف بـ <code>ret N</code>.",
      facts: [["arg1", "<code>[ebp+8]</code>"], ["arg2", "<code>[ebp+12]</code>"], ["return", "<code>[ebp+4]</code>"], ["cdecl", "<code>add esp, 4×n</code> بعد الـ call"], ["stdcall", "<code>ret 4×n</code>"], ["الدرس", "المرحلة 21"]],
      w: 960, h: 460,
      actors: [
        { id: "code", type: "code", x: 24, y: 20, w: 380, label: "caller → checksum(p, 6, 7)", lines: [
          ["401000", "push 7            ; seed (last arg first)"], ["401002", "push 6            ; n"], ["401004", "push 0x404000     ; p"], ["401009", "call checksum"], ["40100E", "add esp, 12       ; cdecl cleanup"],
          ["", "checksum:", "lbl"], ["401020", "push ebp"], ["401021", "mov ebp, esp"], ["401023", "mov eax, [ebp+16] ; seed"], ["401026", "mov ecx, [ebp+8]  ; p"], ["401029", "…  h = h*31 + p[i]  …"], ["401040", "leave"], ["401041", "ret               ; stdcall: ret 12"]] },
        { id: "regs", type: "regs", x: 24, y: 300, w: 380, label: "REGISTERS (32-bit)", names: ["eip", "esp", "ebp", "eax", "ecx"] },
        { id: "cpu", type: "cpu", x: 500, y: 330, label: "CPU", sub: "i386" },
        { id: "stack", type: "stack", x: 620, y: 30, w: 320, label: "STACK", sub: "high ↓", vx: 92, minRows: 7 }
      ],
      links: [["cpu", "stack"], ["cpu", "code"]],
      init: { regs: { eip: "0x401000", esp: "0x0019FF78", ebp: "0x0019FFA0 (caller)", eax: "?", ecx: "?" }, code: 0, stack: R({ p: 5 }) },
      steps: [
        { t: "push 7", st: "آخر arg الأول", d: "الـ args بتتعمل push <b>من اليمين للشمال</b>: آخر واحد (<code>seed = 7</code>) الأول، عشان أول arg يبقى أقرب حاجة لعنوان الرجوع.",
          fly: [{ from: "cpu", to: "stack", label: "7", kind: "push", info: "esp -= 4 ; [esp] = 7" }], set: { code: 0, regs: { esp: "0x0019FF74", eip: "0x401002" }, stack: R({ a3: "7", p: 4 }) } },
        { t: "push 6 · push p", st: "esp = 0x19FF6C", d: "كل push = 4 bytes. بعد التلاتة: <code>[esp]</code> = p، <code>[esp+4]</code> = n، <code>[esp+8]</code> = seed.",
          fly: [{ from: "cpu", to: "stack", label: "6 · 0x404000", kind: "push", info: "two more pushes" }], set: { code: [1, 2], regs: { esp: "0x0019FF6C", eip: "0x401009" }, stack: R({ a3: "7", a2: "6", a1: "0x00404000", p: 2 }) } },
        { t: "call", st: "push 0x40100E", d: "<code>call</code> = push عنوان الرجوع (4 bytes) + jmp. دلوقتي الـ args فوق عنوان الرجوع مباشرة.",
          fly: [{ from: "cpu", to: "stack", label: "0x40100E", kind: "call", info: "push return address ; jmp 0x401020" }], set: { code: 3, regs: { esp: "0x0019FF68", eip: "0x401020" }, stack: R({ a3: "7", a2: "6", a1: "0x00404000", ret: "0x0040100E", p: 1 }) } },
        { t: "الـ frame", st: "push ebp / mov ebp, esp", d: "الـ prologue الكلاسيكي. بعده <code>ebp</code> ثابت: <code>[ebp]</code> = ebp القديم، <code>[ebp+4]</code> = عنوان الرجوع، و<b><code>[ebp+8]</code> = أول argument</b>. القاعدة دي هتشوفها في كل function 32-bit.",
          fly: [{ from: "cpu", to: "stack", label: "old ebp", kind: "push", info: "push ebp" }], set: { code: [6, 7], regs: { esp: "0x0019FF64", ebp: "0x0019FF64", eip: "0x401023" }, stack: R({ a3: "7", a2: "6", a1: "0x00404000", ret: "0x0040100E", ebp: "0x0019FFA0", lbl: 1, p: 0, pl: "esp=ebp" }) } },
        { t: "قراية الـ args", st: "eax = [ebp+16]", d: "<code>[ebp+16]</code> = seed = 7، و<code>[ebp+8]</code> = p. IDA بيسمّيهم <code>arg_0</code>، <code>arg_4</code>، <code>arg_8</code> (offset من بعد عنوان الرجوع) — وأول ما تفهم معناهم سمّيهم.",
          fly: [{ from: "stack", to: "cpu", label: "seed = 7", kind: "read", info: "mov eax, [ebp+16]" }, { from: "stack", to: "cpu", label: "p = 0x404000", kind: "read", info: "mov ecx, [ebp+8]" }],
          set: { code: [8, 9], regs: { eax: "7", ecx: "0x00404000", eip: "0x401029" } } },
        { t: "الحساب", st: "eax = 0x1F436B0B", d: "الـ loop بتحسب الـ hash على \"beacon\" والنتيجة في <code>eax</code> (الـ return value في 32-bit برضه eax، و<code>edx:eax</code> لو 64-bit).",
          set: { code: 10, regs: { eax: "0x1F436B0B", eip: "0x401040" } } },
        { t: "leave · ret", st: "esp = 0x19FF6C", d: "<code>leave</code> = <code>mov esp, ebp / pop ebp</code>، و<code>ret</code> = pop eip. لاحظ: الـ args <b>لسه على الـ stack</b> — في cdecl الدالة مش مسؤولة عنهم.",
          fly: [{ from: "stack", to: "cpu", label: "0x40100E", kind: "ret", info: "pop eip" }], set: { code: [11, 12], regs: { esp: "0x0019FF6C", ebp: "0x0019FFA0 (caller)", eip: "0x40100E" }, stack: R({ a3: "7", a2: "6", a1: "0x00404000", ret: "0x0040100E", ebp: "0x0019FFA0", stale: 1, p: 2 }) } },
        { t: "add esp, 12", st: "caller بينضف", d: "<b>cdecl</b>: الـ caller بيشيل 3 × 4 = 12 byte. لو شفت <code>add esp, 0Ch</code> بعد call ← الدالة بتاخد 3 args (حيلة سريعة لعدّ الـ args!). في <b>stdcall</b> (كل الـ WinAPI) الدالة نفسها بتعمل <code>ret 0Ch</code> ومفيش add esp بعد الـ call — وMSVC بيكتب ده في الاسم: <code>_MessageBoxA@16</code> = 16 byte args.",
          set: { code: 4, regs: { esp: "0x0019FF78", eip: "0x401011" }, stack: R({ a3: "7", a2: "6", a1: "0x00404000", ret: "0x0040100E", ebp: "0x0019FFA0", stale: 1, dead: 1, p: 5 }) } }
      ]
    };
  })();
  /* ---------------------------------------------------------- PEB walk */
  S.pebwalk = {
    id: "pebwalk", group: "Windows والـ Malware", icon: "🧭", title: "PEB Walk: إيجاد kernel32", sub: "gs:[60h] → Ldr → InMemoryOrderModuleList", keys: "peb teb ldr inmemoryordermodulelist ldr_data_table_entry dllbase kernel32 shellcode api resolution",
    overview: "الـ shellcode مالوش imports. عشان ينادي أي API لازم يلاقي <code>kernel32.dll</code> في الذاكرة بنفسه: من الـ <b>TEB</b> (<code>gs:[0]</code>) للـ <b>PEB</b>، للـ <b>Ldr</b>، لقايمة الـ modules المتحمّلة (linked list دايرية)، وياخد <code>DllBase</code>. بعدها يقرا الـ export table.",
    facts: [["PEB", "<code>gs:[60h]</code> (x64) · <code>fs:[30h]</code> (x86)"], ["Ldr", "<code>PEB+18h</code> · (x86: <code>+0Ch</code>)"], ["InMemoryOrder", "<code>Ldr+20h</code> · (x86: <code>+14h</code>)"], ["DllBase", "<code>[entry+20h]</code> من الـ link"], ["الدرس", "المرحلة 22"]],
    w: 960, h: 470,
    actors: [
      { id: "code", type: "code", x: 24, y: 20, w: 370, label: "x64 shellcode", cx: 14, lines: [
        ["", "mov rax, gs:[0x60]    ; PEB"], ["", "mov rax, [rax+0x18]   ; PEB->Ldr"], ["", "mov rsi, [rax+0x20]   ; InMemoryOrder.Flink"], ["", "lodsq                 ; rax = next (ntdll)"], ["", "xchg rax, rsi"], ["", "lodsq                 ; rax = next (kernel32)"], ["", "mov rbx, [rax+0x20]   ; DllBase"]] },
      { id: "regs", type: "regs", x: 24, y: 215, w: 370, label: "REGISTERS", names: ["rax", "rsi", "rbx"] },
      { id: "teb", type: "box", x: 430, y: 20, w: 240, label: "TEB  (gs:0)", vx: 52, rows: [{ a: "+30", v: "Self" }, { a: "+60", v: "PEB → 0x2F1000" }] },
      { id: "peb", type: "box", x: 430, y: 115, w: 240, label: "PEB  0x2F1000", vx: 52, rows: [{ a: "+02", v: "BeingDebugged = 0" }, { a: "+10", v: "ImageBaseAddress" }, { a: "+18", v: "Ldr → 0x7FFB…C4E0" }, { a: "+BC", v: "NtGlobalFlag" }] },
      { id: "ldr", type: "box", x: 430, y: 255, w: 240, label: "PEB_LDR_DATA", vx: 52, rows: [{ a: "+10", v: "InLoadOrder" }, { a: "+20", v: "InMemoryOrder.Flink" }] },
      { id: "exe", type: "box", x: 700, y: 20, w: 240, label: "entry #1: app.exe", vx: 52, rows: [{ a: "+10", v: "Flink → ntdll" }, { a: "+30", v: "DllBase 0x7FF6…0000" }, { a: "+58", v: "\"app.exe\"" }] },
      { id: "ntdll", type: "box", x: 700, y: 150, w: 240, label: "entry #2: ntdll.dll", vx: 52, rows: [{ a: "+10", v: "Flink → kernel32" }, { a: "+30", v: "DllBase 0x7FFB…0000" }, { a: "+58", v: "\"ntdll.dll\"" }] },
      { id: "k32", type: "box", x: 700, y: 280, w: 240, color: "grn", label: "entry #3: KERNEL32.DLL", vx: 52, rows: [{ a: "+10", v: "Flink → KERNELBASE" }, { a: "+30", v: "DllBase 0x7FFB2C200000" }, { a: "+58", v: "\"KERNEL32.DLL\"" }] }
    ],
    links: [["teb", "peb"], ["peb", "ldr"], ["ldr", "exe"], ["exe", "ntdll"], ["ntdll", "k32"]],
    init: { regs: { rax: "?", rsi: "?", rbx: "?" }, code: -1 },
    steps: [
      { t: "الـ PEB", st: "rax = gs:[0x60]", d: "في x64 الـ register <code>gs</code> بيشاور على الـ <b>TEB</b> (بيانات الـ thread). عند <code>+0x60</code> pointer للـ <b>PEB</b> (بيانات الـ process). ده السطر اللي هتلاقيه في كل shellcode وكل anti-debug — حفظه.",
        fly: [{ from: "teb", to: "regs", label: "PEB", kind: "read", info: "mov rax, gs:[0x60]" }], set: { code: 0, regs: { rax: "0x2F1000 (PEB)" }, box: { teb: { hl: 1 } } } },
      { t: "Ldr", st: "rax = PEB->Ldr", d: "<code>PEB+0x18</code> = <code>Ldr</code>: بيانات الـ loader، وفيها 3 قوايم للـ modules المتحمّلة (بترتيب التحميل، بترتيب الذاكرة، بترتيب الـ init). لاحظ <code>+0x02 BeingDebugged</code> جنبه — anti-debug المرحلة 24.",
        fly: [{ from: "peb", to: "regs", label: "Ldr", kind: "read", info: "mov rax, [rax+0x18]" }], set: { code: 1, regs: { rax: "0x7FFB…C4E0 (Ldr)" }, box: { teb: { hl: -1 }, peb: { hl: 2 } } } },
      { t: "أول entry", st: "rsi = Flink", d: "<code>Ldr+0x20</code> = <code>InMemoryOrderModuleList.Flink</code> ← بيشاور على الـ <code>InMemoryOrderLinks</code> جوه أول <code>LDR_DATA_TABLE_ENTRY</code> (الـ exe نفسه) — يعني على <b>+0x10</b> من بداية الـ entry، مش على بدايته. عشان كده كل الـ offsets بعد كده ناقص 0x10.",
        fly: [{ from: "ldr", to: "exe", label: "Flink", kind: "jump", info: "mov rsi, [rax+0x20]" }], set: { code: 2, regs: { rsi: "entry #1 (+0x10)" }, box: { peb: { hl: -1 }, ldr: { hl: 1 }, exe: { hl: 0 } } } },
      { t: "ntdll", st: "lodsq", d: "<code>lodsq</code> = <code>rax = [rsi]; rsi += 8</code> ← <code>rax</code> = الـ Flink بتاع الـ exe = entry #2: <b>ntdll.dll</b> (دايمًا تاني واحد).",
        fly: [{ from: "exe", to: "ntdll", label: "Flink", kind: "jump", info: "lodsq" }], set: { code: 3, regs: { rax: "entry #2 (ntdll)" }, box: { ldr: { hl: -1 }, exe: { hl: -1 }, ntdll: { hl: 0 } } } },
      { t: "kernel32", st: "xchg + lodsq", d: "نفس الحركة مرة كمان ← entry #3: <b>KERNEL32.DLL</b>. الترتيب ده (exe ← ntdll ← kernel32) ثابت في كل إصدارات Windows الحديثة، والـ shellcode القديم بيعتمد عليه. الكود الأمتن بيقارن الاسم (<code>+0x58</code> = BaseDllName) أو الـ hash بتاعه.",
        fly: [{ from: "ntdll", to: "k32", label: "Flink", kind: "jump", info: "xchg rax, rsi ; lodsq" }], set: { code: [4, 5], regs: { rsi: "entry #2 +8", rax: "entry #3 (kernel32)" }, box: { ntdll: { hl: -1 }, k32: { hl: 0 } } } },
      { t: "DllBase", st: "rbx = 0x7FFB2C200000", d: "<code>[rax+0x20]</code> = DllBase (لأن rax = entry+0x10، وDllBase عند entry+0x30). <code>rbx</code> = عنوان الـ <code>MZ</code> بتاع kernel32 في الذاكرة. من هنا: <code>e_lfanew</code> ← export directory ← <code>GetProcAddress</code> / <code>LoadLibraryA</code> ← أي API (المعمل تحت).",
        fly: [{ from: "k32", to: "regs", label: "DllBase", kind: "read", info: "mov rbx, [rax+0x20]" }], set: { code: 6, regs: { rbx: "0x7FFB2C200000 ✓" }, box: { k32: { hl: 1 } }, glow: ["k32"] } }
    ]
  };

  /* ---------------------------------------------------------- API path vs direct syscall */
  S.dsyscall = {
    id: "dsyscall", group: "Windows والـ Malware", icon: "⚡", title: "Direct Syscalls وهوكات الـ EDR", sub: "VirtualAlloc → ntdll → kernel، والطريق المختصر", keys: "direct syscall indirect syscall ssn ntdll hook edr hell's gate halo's gate syswhispers ntallocatevirtualmemory",
    overview: "كل API في kernel32 بينزل لـ <b>ntdll</b>، وntdll فيه stubs صغيرة: <code>mov r10, rcx / mov eax, SSN / syscall</code>. الـ <b>EDR</b> بيحط hook في الـ stubs دي عشان يشوف كل حاجة. الـ malware بيتخطى الـ hook بإنه يعمل الـ <code>syscall</code> <b>بنفسه</b> بنفس رقم الخدمة (SSN).",
    facts: [["الـ stub", "<code>4C 8B D1 B8 xx xx 00 00</code>"], ["SSN", "رقم الخدمة في eax (بيتغير بين إصدارات Windows)"], ["Hell's Gate", "اقرا الـ SSN من ntdll في الذاكرة"], ["الدرس", "المرحلة 22"]],
    w: 960, h: 450,
    actors: [
      { id: "mal", type: "proc", x: 80, y: 110, color: "red", label: "malware.exe", sub: "user mode" },
      { id: "k32", type: "dll", x: 240, y: 110, label: "kernel32", sub: "VirtualAlloc" },
      { id: "kb", type: "dll", x: 400, y: 110, label: "kernelbase", sub: "VirtualAlloc" },
      { id: "ntdll", type: "dll", x: 570, y: 110, color: "amb", label: "ntdll", sub: "NtAllocateVirtualMemory" },
      { id: "edr", type: "shield", x: 570, y: 330, color: "grn", label: "EDR hook", sub: "inspect / block" },
      { id: "kern", type: "kernel", x: 850, y: 230, color: "vio", label: "ntoskrnl", sub: "Ring 0 · SSDT[0x18]" },
      { id: "stub", type: "code", x: 24, y: 250, w: 420, label: "ntdll!NtAllocateVirtualMemory (Win10/11 x64)", cx: 14, lines: [
        ["", "mov r10, rcx            ; 4C 8B D1"], ["", "mov eax, 0x18           ; B8 18 00 00 00   (SSN)"], ["", "test byte [7FFE0308h], 1"], ["", "jnz  .int2e"], ["", "syscall                 ; 0F 05"], ["", "ret"]] }
    ],
    links: [["mal", "k32"], ["k32", "kb"], ["kb", "ntdll"], ["ntdll", "kern"], ["ntdll", "edr"]],
    init: { code: -1 },
    steps: [
      { t: "الطريق العادي", st: "VirtualAlloc", d: "الـ malware بينادي <code>VirtualAlloc(…, PAGE_EXECUTE_READWRITE)</code> العادية من الـ IAT ← kernel32 (wrapper) ← kernelbase (المنطق الحقيقي).",
        fly: [{ from: "mal", to: "k32", label: "VirtualAlloc", kind: "call", info: "call [IAT]" }, { from: "k32", to: "kb", label: "jmp", kind: "call", info: "forward" }] },
      { t: "ntdll", st: "NtAllocateVirtualMemory", d: "kernelbase بينادي الـ <b>Native API</b> في ntdll. الـ stub: <code>mov r10, rcx</code> (لأن syscall بيبوّظ rcx)، <code>mov eax, 0x18</code> = رقم الخدمة، و<code>syscall</code>.",
        fly: [{ from: "kb", to: "ntdll", label: "NtAllocateVirtualMemory", kind: "call", info: "native API" }], set: { code: [0, 1] } },
      { t: "الـ EDR بيشوف", st: "hook = E9 …", d: "الـ EDR غيّر أول bytes في الـ stub لـ <code>jmp</code> للـ DLL بتاعه (inline hook — مرحلة 19). قبل الـ syscall، الـ EDR بيشوف: «process بيعمل allocate لذاكرة RWX» ← يسجّل، يقارن مع سلوك تاني، وممكن يقتل الـ process.",
        fly: [{ from: "ntdll", to: "edr", label: "jmp detour", kind: "bad", info: "first bytes patched: E9 xx xx xx xx" }], set: { glow: ["edr"] } },
      { t: "Kernel", st: "syscall", d: "لو الـ EDR سمح: يرجع للـ trampoline ← <code>syscall</code> ← الـ kernel بيدوّر في جدول الخدمات (SSDT) على رقم <code>0x18</code> ← <code>NtAllocateVirtualMemory</code> الحقيقية.",
        fly: [{ from: "edr", to: "ntdll", label: "allowed", kind: "ret", info: "back to trampoline" }, { from: "ntdll", to: "kern", label: "syscall 0x18", kind: "sys", info: "Ring 3 → Ring 0" }], set: { code: 4 } },
      { t: "⚡ Direct syscall", st: "malware → kernel", d: "الـ malware فيه نسخة من الـ stub <b>جوه الـ EXE نفسه</b>: <code>mov r10, rcx / mov eax, 0x18 / syscall</code>. مفيش kernel32 ولا ntdll ← الـ hook عمره ما اتنفّذ. أدوات زي <b>SysWhispers</b> بتولّد الـ stubs دي.",
        fly: [{ from: "mal", to: "kern", label: "syscall (SSN 0x18)", kind: "sys", info: "own stub inside malware.exe" }], set: { glow: ["mal"], dim: ["k32", "kb", "edr"] } },
      { t: "Hell's Gate", st: "SSN ديناميكي", d: "المشكلة: الـ SSN بيتغير بين إصدارات Windows. الحل (<b>Hell's Gate</b>): اقرا الـ stub من ntdll في الذاكرة، ولو أول bytes = <code>4C 8B D1 B8</code> ← الـ SSN = الـ dword اللي بعدهم. ولو الـ stub متعمله hook (<b>Halo's Gate</b>): بص على الـ stubs اللي جنبه (الأرقام متسلسلة) وزوّد/انقص.",
        set: { dim: ["k32", "kb"], glow: ["ntdll"], code: [0, 1] } },
      { t: "الكشف", st: "syscall من برا ntdll", d: "الـ kernel يقدر يشوف إن الـ <code>syscall</code> جه من عنوان <b>برا ntdll</b> (الـ return address في الـ EXE) — ده نفسه indicator. فالـ malware الأحدث بيعمل <b>indirect syscall</b>: يجهّز الـ registers وبعدين <code>jmp</code> للـ <code>syscall</code> instruction اللي جوه ntdll. للـ analyst: <code>0F 05</code> جوه EXE عادي = علامة حمرا.",
        set: { dim: [], glow: [] } }
    ]
  };
  /* ---------------------------------------------------------- classic remote injection */
  (function () {
    const MEM = (v, n, hl, c) => ({ rows: [{ a: "0x1F0000", v: v, n: n, c: c || "" }, { a: "0x1F0010", v: hl >= 1 ? "29 0A 50 48 B8 70 77 6E …" : "", n: "" }], hl: hl === undefined ? -1 : 0 });
    S.inject = {
      id: "inject", group: "Windows والـ Malware", icon: "💉", title: "Process Injection الكلاسيكي", sub: "OpenProcess → VirtualAllocEx → WriteProcessMemory → CreateRemoteThread", keys: "process injection openprocess virtualallocex writeprocessmemory createremotethread shellcode rwx edr",
      overview: "الـ malware مش عايز يشتغل تحت اسمه. بيفتح process شرعي (notepad، explorer)، يحجز فيه ذاكرة، يكتب الـ shellcode، ويعمل thread جديد يبدأ من الـ shellcode. النتيجة: الكود الخبيث شغال جوه process «نضيف» — والاتصال بالـ C2 طالع من notepad.",
      facts: [["1", "<code>OpenProcess</code> (PROCESS_ALL_ACCESS)"], ["2", "<code>VirtualAllocEx</code> (0x3000, 0x40)"], ["3", "<code>WriteProcessMemory</code>"], ["4", "<code>CreateRemoteThread</code>"], ["الدرس", "المرحلة 23"]],
      w: 960, h: 470,
      actors: [
        { id: "mal", type: "proc", x: 100, y: 110, color: "red", label: "loader.exe", sub: "PID 4412" },
        { id: "kern", type: "kernel", x: 470, y: 110, color: "vio", label: "Windows kernel", sub: "handles · memory · threads" },
        { id: "vic", type: "proc", x: 840, y: 110, color: "grn", label: "notepad.exe", sub: "PID 7020 · victim" },
        { id: "code", type: "code", x: 24, y: 240, w: 470, label: "loader (C)", cx: 14, lines: [
          ["", "h = OpenProcess(PROCESS_ALL_ACCESS, FALSE, 7020);"], ["", "p = VirtualAllocEx(h, NULL, 0x1000, 0x3000, 0x40);"], ["", "WriteProcessMemory(h, p, sc, sizeof sc, NULL);"], ["", "CreateRemoteThread(h, NULL, 0, p, NULL, 0, NULL);"]] },
        { id: "vmem", type: "box", x: 540, y: 240, w: 400, label: "notepad.exe memory", vx: 92, rows: MEM("(free)", "").rows },
        { id: "c2", type: "cloud", x: 840, y: 400, color: "amb", label: "C2", sub: "203.0.113.50:443" }
      ],
      links: [["mal", "kern"], ["kern", "vic"], ["vic", "c2"]],
      init: { code: -1 },
      steps: [
        { t: "OpenProcess", st: "handle لـ notepad", d: "<code>OpenProcess(0x1FFFFF, …, pid)</code>: الـ loader بيطلب handle بكل الصلاحيات للـ process الهدف (لاقاه قبلها بـ <code>CreateToolhelp32Snapshot</code> + <code>Process32Next</code> بالاسم).",
          fly: [{ from: "mal", to: "kern", label: "OpenProcess(7020)", kind: "api", info: "returns handle 0x1A4" }], set: { code: 0 } },
        { t: "VirtualAllocEx", st: "RWX في الضحية", d: "<code>VirtualAllocEx(h, NULL, 0x1000, MEM_COMMIT|MEM_RESERVE, PAGE_EXECUTE_READWRITE)</code> ← صفحة RWX <b>جوه notepad</b>. ذاكرة private قابلة للتنفيذ ومش جاية من ملف = أقوى indicator للـ memory scanners.",
          fly: [{ from: "kern", to: "vmem", label: "alloc RWX @0x1F0000", kind: "write", info: "NtAllocateVirtualMemory" }], set: { code: 1, box: { vmem: MEM("00 00 00 00 00 00 00 00 …", "RWX · private", 0) } } },
        { t: "WriteProcessMemory", st: "نسخ الـ shellcode", d: "الـ bytes بتتنسخ من الـ loader لذاكرة الضحية. لو شفت الـ buffer اللي بيتبعت هنا في الـ debugger ← ده الـ payload: اعمله dump فورًا.",
          fly: [{ from: "mal", to: "vmem", label: "48 B8 20 61 73 6D …", kind: "write", info: "NtWriteVirtualMemory" }], set: { code: 2, box: { vmem: MEM("48 B8 20 61 73 6D 20 3A …", "shellcode", 1, "hl") } } },
        { t: "CreateRemoteThread", st: "thread @0x1F0000", d: "thread جديد جوه notepad، الـ start address = الـ shellcode. الـ kernel بيبلّغ الـ EDR (thread creation callback) إن process عمل thread في process تاني — عشان كده الطريقة دي «صوتها عالي».",
          fly: [{ from: "kern", to: "vic", label: "new thread → 0x1F0000", kind: "exec", info: "NtCreateThreadEx" }], set: { code: 3, glow: ["vic"] } },
        { t: "الـ payload شغال", st: "notepad بيكلم الـ C2", d: "الـ shellcode بيعمل الـ PEB walk، يحل الـ APIs، ويفتح اتصال. أي firewall/EDR هيشوف <b>notepad.exe</b> بيتصل بالإنترنت — ده الهدف من الـ injection.",
          fly: [{ from: "vic", to: "c2", label: "TLS beacon", kind: "net", info: "connect from notepad.exe" }], set: { code: -1, glow: ["c2"] } },
        { t: "البدائل", st: "نفس الفكرة بأشكال تانية", d: "<b>APC injection</b> (<code>QueueUserAPC</code>)، <b>thread hijacking</b> (<code>SuspendThread</code> + <code>SetThreadContext</code>)، <b>process hollowing</b> (<code>CreateProcess</code> suspended + <code>NtUnmapViewOfSection</code>)، <b>module stomping</b> (كتابة فوق DLL شرعية عشان الذاكرة تبان image-backed). كلهم: <i>ذاكرة في process تاني + طريقة تنفيذ</i>.",
          set: { glow: [] } }
      ]
    };

    /* ------------------------------------------------------ XOR decoder stub (jmp-call-pop) */
    const ENC = ["E2 12 8A CB D9 C7 8A 90", "83 A0 FA E2 12 DA DD C4", "… (42 bytes total)"];
    const DEC = ["48 B8 20 61 73 6D 20 3A", "29 0A 50 48 B8 70 77 6E", "… (42 bytes total)"];
    const P = (rows, hl) => ({ rows: rows.map((v, i) => ({ a: "+" + (i * 8).toString(16).toUpperCase().padStart(2, "0"), v: v, n: i < 2 ? (rows === DEC || (Array.isArray(hl) && hl.includes(i)) ? "decoded" : "encoded") : "" , c: rows[i] === DEC[i] && i < 2 ? "hl" : "" })), hl: -1 });
    S.decoder = {
      id: "decoder", group: "Windows والـ Malware", icon: "🔓", title: "Decoder Stub: الـ shellcode بيفك نفسه", sub: "jmp-call-pop + XOR loop + jmp payload", keys: "shellcode decoder stub jmp call pop getpc xor encoder msfvenom self-modifying",
      overview: "الـ payload الحقيقي متشفّر (عشان يعدّي من الـ signatures ومفيهوش null bytes)، وقدامه <b>decoder stub</b> صغير: يعرف مكانه (GetPC)، يفك الـ bytes <b>في مكانها</b>، ويقفز لها. أي shellcode متعمله encode بـ msfvenom شكله كده.",
      facts: [["GetPC", "jmp → call → pop"], ["الفك", "<code>xor byte [rsi+rcx-1], key</code>"], ["المفتاح", "byte مش موجود في الـ payload (عشان مفيش 0x00)"], ["الدرس", "المرحلة 23"]],
      w: 960, h: 440,
      actors: [
        { id: "code", type: "code", x: 24, y: 20, w: 400, label: "decoder stub", cx: 14, lines: [
          ["", "    jmp short get_payload"], ["", "decoder:"], ["", "    pop rsi              ; rsi = &payload"], ["", "    mov ecx, 42          ; length"], ["", ".l: xor byte [rsi+rcx-1], 0xAA"], ["", "    loop .l"], ["", "    jmp rsi              ; run it"], ["", "get_payload:"], ["", "    call decoder         ; pushes &payload"], ["", "payload: db 0xE2, 0x12, 0x8A, 0xCB, …"]] },
        { id: "regs", type: "regs", x: 24, y: 255, w: 400, label: "REGISTERS", names: ["rip", "rsi", "rcx", "[rsp]"] },
        { id: "pay", type: "box", x: 470, y: 20, w: 470, label: "payload bytes (in place)", vx: 52, rows: P(ENC).rows },
        { id: "cpu", type: "cpu", x: 700, y: 300, label: "CPU", sub: "" }
      ],
      links: [["cpu", "pay"], ["cpu", "code"]],
      init: { regs: { rip: "stub+0", rsi: "?", rcx: "?", "[rsp]": "?" }, code: 0 },
      steps: [
        { t: "jmp لتحت", st: "jmp get_payload", d: "الـ stub مش عارف هو متحمّل فين. أول حاجة: يقفز لتحت، لآخر الكود، قبل الـ payload مباشرة.", set: { code: 0, regs: { rip: "get_payload" } } },
        { t: "call لفوق", st: "push &payload", d: "<code>call decoder</code> = push عنوان الـ instruction اللي «بعدها» — واللي بعدها هو الـ payload نفسه (بيانات مش كود)! وبيقفز لـ decoder. الـ call لورا (offset سالب) = مفيش null bytes في الـ rel32 (<code>E8 F?FFFFFF</code>).",
          fly: [{ from: "cpu", to: "code", label: "push &payload", kind: "call", info: "call decoder" }], set: { code: 8, regs: { rip: "decoder", "[rsp]": "&payload" } } },
        { t: "pop rsi", st: "GetPC ✓", d: "<code>pop rsi</code> ← <code>rsi</code> = عنوان الـ payload الحقيقي في الذاكرة. ده الـ <b>jmp-call-pop</b> الكلاسيكي — في x64 ممكن <code>lea rsi, [rip+payload]</code> بس الـ encoders بيستخدموا الطريقة دي لأنها شغالة في الـ 32 كمان.",
          set: { code: 2, regs: { rsi: "&payload", "[rsp]": "—" } } },
        { t: "XOR loop", st: "rcx: 42 → 21", d: "<code>xor byte [rsi+rcx-1], 0xAA</code> + <code>loop</code> (rcx−− وقفز لو ≠ 0): بيفك من الآخر للأول. الذاكرة لازم تبقى <b>Writable</b> وExecutable — self-modifying code.",
          fly: [{ from: "cpu", to: "pay", label: "xor 0xAA", kind: "write", info: "[rsi+rcx-1] ^= 0xAA" }], set: { code: [3, 4, 5], regs: { rcx: "21" }, box: { pay: P([ENC[0], DEC[1], ENC[2]], [1]) } } },
        { t: "اتفك", st: "rcx = 0", d: "الـ 42 byte رجعوا لأصلهم: <code>48 B8 20 61 73 6D …</code> = <code>mov rax, …</code> — الـ shellcode بتاع المثال اللي فوق بالظبط. ولاحظ: المفتاح 0xAA مش موجود في الـ payload الأصلي، فمفيش byte اتحوّل لـ 0x00.",
          fly: [{ from: "cpu", to: "pay", label: "xor 0xAA", kind: "write", info: "loop until rcx = 0" }], set: { code: [4, 5], regs: { rcx: "0" }, box: { pay: P(DEC) } } },
        { t: "jmp rsi", st: "تنفيذ الـ payload", d: "<code>jmp rsi</code> ← الـ CPU بيبدأ ينفّذ الـ bytes المفكوكة. <b>للـ analyst</b>: حط breakpoint على الـ <code>jmp rsi</code> (أو على أول byte في الـ payload) واعمل dump — مش محتاج تفهم الـ decoder خالص. أو شغّله في emulator (speakeasy، scdbg).",
          fly: [{ from: "cpu", to: "pay", label: "jmp rsi", kind: "exec", info: "execute decoded shellcode" }], set: { code: 6, regs: { rip: "&payload" }, glow: ["pay"] } }
      ]
    };
  })();
  /* ---------------------------------------------------------- anti-debug: decoy path */
  S.antidebug = {
    id: "antidebug", group: "Windows والـ Malware", icon: "🛡️", title: "Anti-Debug: الـ malware بيكتشفك", sub: "PEB.BeingDebugged → decoy path", keys: "anti debug beingdebugged peb isdebuggerpresent ntglobalflag scyllahide decoy",
    overview: "قبل ما الـ payload يشتغل، الـ malware بيسأل «حد بيراقبني؟». لو آه: يا إما يقفل، يا إما — الأذكى — يمشي في <b>مسار مزيف</b> بريء عشان المحلل يفتكر إنه مش ضار. لازم تلاقي الـ check وتعطّله.",
    facts: [["الـ check", "<code>movzx eax, byte [peb+2]</code>"], ["NtGlobalFlag", "<code>[peb+0BCh] & 0x70</code>"], ["الحل", "ScyllaHide / patch / عدّل الـ PEB"], ["الدرس", "المرحلة 24"]],
    w: 960, h: 450,
    actors: [
      { id: "code", type: "code", x: 24, y: 20, w: 400, label: "malware.exe", cx: 14, lines: [
        ["", "mov rax, gs:[0x60]         ; PEB"], ["", "movzx ecx, byte [rax+2]    ; BeingDebugged"], ["", "mov edx, [rax+0xBC]        ; NtGlobalFlag"], ["", "and edx, 0x70"], ["", "or ecx, edx"], ["", "jnz decoy                  ; debugger? play nice"], ["", "call decrypt_payload"], ["", "call inject"]] },
      { id: "peb", type: "box", x: 470, y: 20, w: 250, label: "PEB", vx: 56, rows: [{ a: "+02", v: "BeingDebugged = 1", c: "hl" }, { a: "+BC", v: "NtGlobalFlag = 0x70", c: "hl" }] },
      { id: "dbg", type: "bug", x: 850, y: 90, color: "amb", label: "x64dbg", sub: "attached" },
      { id: "decoy", type: "box", x: 470, y: 170, w: 470, label: "decoy path", vx: 14, rows: [{ v: "MessageBox(\"Update failed. Try again later.\")" }, { v: "ExitProcess(0)" }] },
      { id: "real", type: "box", x: 470, y: 300, w: 470, label: "real path", vx: 14, rows: [{ v: "decrypt payload → inject into explorer.exe → C2" }] },
      { id: "cpu", type: "cpu", x: 230, y: 330, label: "CPU", sub: "" }
    ],
    links: [["dbg", "peb"], ["cpu", "peb"], ["cpu", "decoy"], ["cpu", "real"]],
    init: { code: -1, dim: ["real"] },
    steps: [
      { t: "الـ debugger شغال", st: "PEB.BeingDebugged = 1", d: "لما x64dbg يشغّل البرنامج، Windows بيكتب <code>BeingDebugged = 1</code> في الـ PEB، و<code>NtGlobalFlag</code> بيبقى فيه <code>0x70</code> (heap debug flags) لو الـ process اتعمل من debugger.",
        fly: [{ from: "dbg", to: "peb", label: "BeingDebugged = 1", kind: "write", info: "set by the OS" }], set: { glow: ["peb"] } },
      { t: "الـ check", st: "اقرا الـ PEB", d: "نفس الحاجة اللي <code>IsDebuggerPresent()</code> بتعملها — بس inline، فمفيش API تحط عليها breakpoint ولا تشوفها في الـ imports.",
        fly: [{ from: "peb", to: "cpu", label: "1 | 0x70", kind: "read", info: "byte [peb+2], dword [peb+0xBC]" }], set: { code: [0, 1, 2, 3, 4], glow: [] } },
      { t: "Decoy", st: "jnz decoy", d: "ecx ≠ 0 ← المسار البريء: رسالة خطأ وخروج. محلل مستعجل هيكتب «الملف مش بيعمل حاجة». <b>القاعدة</b>: لو sample بيخرج بسرعة جوه الـ debugger ← دوّر على anti-debug قبل ما تحكم.",
        fly: [{ from: "cpu", to: "decoy", label: "jnz decoy", kind: "jump", info: "debugger detected" }], set: { code: 5, glow: ["decoy"] } },
      { t: "الحل", st: "BeingDebugged = 0", d: "<b>ScyllaHide</b> (plugin في x64dbg) بيصفّر الحقول دي ويعمل hook لعشرات الـ checks التانية تلقائيًا. أو يدويًا: في الـ dump اكتب 0 في <code>[peb+2]</code>، أو patch الـ <code>jnz</code> لـ NOPs.",
        fly: [{ from: "dbg", to: "peb", label: "ScyllaHide: 0", kind: "write", info: "patch PEB fields" }], set: { code: -1, glow: ["dbg"], box: { peb: { rows: [{ a: "+02", v: "BeingDebugged = 0" }, { a: "+BC", v: "NtGlobalFlag = 0" }] } } } },
      { t: "المسار الحقيقي", st: "payload", d: "دلوقتي الـ check بيعدّي والـ malware بيكشف سلوكه الحقيقي. نفس المنطق ينطبق على الـ anti-VM (cpuid، MAC، processes) والـ timing checks.",
        fly: [{ from: "cpu", to: "real", label: "fall through", kind: "exec", info: "decrypt → inject" }], set: { code: [6, 7], dim: ["decoy"], glow: ["real"] } }
    ]
  };

  /* ---------------------------------------------------------- unpacking UPX-style */
  S.unpack = {
    id: "unpack", group: "Windows والـ Malware", icon: "📦", title: "Unpacking: لحد الـ OEP", sub: "stub → decompress → IAT → tail jump → dump", keys: "unpacking packer upx oep tail jump pushad popad esp trick scylla dump iat rebuild",
    overview: "الـ packer بيضغط/يشفّر الـ EXE الأصلي ويحط قدامه <b>stub</b>. لما يشتغل: الـ stub يفك الكود الأصلي في الذاكرة، يحل الـ imports، ويقفز للـ <b>OEP</b> (Original Entry Point). الـ analyst بيستنى اللحظة دي، يعمل dump، ويصلّح الـ IAT.",
    facts: [["UPX0", "RawSize 0 — هيتملي"], ["UPX1", "البيانات المضغوطة + الـ stub"], ["الـ tail jump", "<code>jmp</code> بعيد لـ section تاني"], ["الأدوات", "x64dbg + Scylla"], ["الدرس", "المرحلة 24"]],
    w: 960, h: 460,
    actors: [
      { id: "file", type: "file", x: 80, y: 110, color: "red", label: "packed.exe", sub: "EP in UPX1" },
      { id: "mem", type: "box", x: 200, y: 20, w: 380, label: "process memory", vx: 104, rows: [{ a: "UPX0", v: "zeros  (VSize 0x58000)" }, { a: "UPX1", v: "compressed data + stub  ← EP" }, { a: "IAT", v: "(empty)" }] },
      { id: "stub", type: "code", x: 200, y: 175, w: 380, label: "UPX stub (x64)", cx: 14, lines: [
        ["", "push rbx / push rsi / push rdi / push rbp"], ["", "…  decompress UPX1 → UPX0  …"], ["", "…  LoadLibraryA / GetProcAddress loop  …"], ["", "pop rbp / pop rdi / pop rsi / pop rbx"], ["", "jmp 0x140001A2C          ; tail jump → OEP"]] },
      { id: "dbg", type: "bug", x: 700, y: 110, color: "amb", label: "x64dbg", sub: "analyst" },
      { id: "scylla", type: "shield", x: 860, y: 110, color: "grn", label: "Scylla", sub: "dump + IAT fix" },
      { id: "out", type: "file", x: 780, y: 340, color: "grn", label: "unpacked.exe", sub: "→ IDA" }
    ],
    links: [["file", "mem"], ["dbg", "stub"], ["dbg", "scylla"], ["scylla", "out"]],
    init: { code: -1 },
    steps: [
      { t: "الملف packed", st: "EP في UPX1", d: "علامات: section <code>UPX0</code> بـ RawSize = 0 وVirtualSize كبير، entropy عالية في <code>UPX1</code>، imports قليلة جدًا، والـ entry point في آخر section. (UPX نفسه: <code>upx -d</code> وخلاص — لكن نفس الخطوات تحت بتشتغل مع packers تانية.)",
        fly: [{ from: "file", to: "mem", label: "map sections", kind: "data", info: "loader maps the packed image" }], set: { box: { mem: { hl: 1 } } } },
      { t: "الـ stub بيحفظ الـ registers", st: "push … (أو pushad)", d: "أول حاجة: يحفظ الـ registers (في الـ 32-bit: <code>pushad</code>). <b>ESP trick</b>: اعمل hardware breakpoint على الذاكرة اللي على الـ stack بعد الـ push — هتقف لما الـ stub يعمل pop قبل الـ tail jump مباشرة.",
        set: { code: 0 } },
      { t: "Decompress", st: "UPX1 → UPX0", d: "الـ loop الكبيرة: بتفك الكود الأصلي في <code>UPX0</code>. متتبعهاش instruction instruction — حط breakpoint بعدها.",
        fly: [{ from: "stub", to: "mem", label: "original code → UPX0", kind: "write", info: "decompression loop" }], set: { code: 1, box: { mem: { rows: [{ a: "UPX0", v: "original .text/.data ✓" }, { a: "UPX1", v: "compressed data + stub" }, { a: "IAT", v: "(empty)" }], hl: 0 } } } },
      { t: "Imports", st: "LoadLibrary / GetProcAddress", d: "الـ stub بيبني الـ IAT بنفسه: loop على أسماء الـ DLLs والدوال. (breakpoint على <code>GetProcAddress</code> هنا بيوريك كل API الـ malware هيستخدمها.)",
        fly: [{ from: "stub", to: "mem", label: "IAT ← addresses", kind: "write", info: "resolve imports" }], set: { code: 2, box: { mem: { rows: [{ a: "UPX0", v: "original .text/.data ✓" }, { a: "UPX1", v: "compressed data + stub" }, { a: "IAT", v: "filled: 87 APIs ✓" }], hl: 2 } } } },
      { t: "Tail jump", st: "jmp OEP", d: "<code>pop</code> للـ registers ثم <code>jmp</code> لعنوان <b>في section تاني</b> (من UPX1 لـ UPX0) — ده الـ tail jump. في الـ graph: jump بعيد بعده زبالة/أصفار. وقف عليه بـ F7 خطوة واحدة ← إنت عند الـ <b>OEP</b>.",
        fly: [{ from: "dbg", to: "stub", label: "bp on tail jump", kind: "ctrl", info: "F7 → OEP 0x140001A2C" }], set: { code: [3, 4], glow: ["dbg"] } },
      { t: "Dump + IAT fix", st: "Scylla", d: "عند الـ OEP: Scylla ← <b>IAT Autosearch</b> ← <b>Get Imports</b> ← <b>Dump</b> ← <b>Fix Dump</b>. الناتج ملف بالـ entry point الأصلي وimport table سليم.",
        fly: [{ from: "dbg", to: "scylla", label: "OEP + process", kind: "data", info: "dump memory, rebuild imports" }, { from: "scylla", to: "out", label: "unpacked.exe", kind: "write", info: "EP = OEP, imports fixed" }], set: { code: -1, glow: ["out"] } },
      { t: "ابدأ التحليل", st: "IDA", d: "الـ dump بيتفتح في IDA بـ strings وimports حقيقية. للـ packers المعقدة (VMProtect، Themida) الطريقة مش بتنفع دايمًا (الكود نفسه virtualized) — ساعتها التحليل الـ dynamic والـ API tracing أحسن.",
        set: { glow: [] } }
    ]
  };
  /* ---------------------------------------------------------- C++ virtual call */
  S.vcall = {
    id: "vcall", group: "Windows والـ Malware", icon: "🧱", title: "C++: الـ virtual call والـ vtable", sub: "this → vptr → vftable[i] → method", keys: "c++ vtable vftable vptr virtual call this rcx rtti complete object locator class informer polymorphism",
    overview: "كل object من class فيها دوال <code>virtual</code> أول 8 bytes فيه = <b>vptr</b>: pointer لجدول عناوين الدوال (vtable) في <code>.rdata</code>. النداء <code>c-&gt;run(5)</code> بيبقى: اقرا الـ vptr، اقرا الخانة رقم i، اقفز. ومن الـ vtable تقدر توصل للـ <b>RTTI</b> = اسم الـ class الحقيقي!",
    facts: [["this", "<code>rcx</code> (MSVC) · <code>rdi</code> (gcc) · <code>ecx</code> (x86 thiscall)"], ["النداء", "<code>mov rax, [rcx]</code> / <code>call [rax+8]</code>"], ["RTTI", "<code>vftable[-1]</code> → Complete Object Locator"], ["الدرس", "المرحلة 25"]],
    w: 960, h: 450,
    actors: [
      { id: "code", type: "code", x: 24, y: 20, w: 390, label: "MSVC x64", cx: 14, lines: [
        ["", "caller:"], ["", "  mov rcx, rbx         ; this = Exfil object"], ["", "  mov edx, 5           ; arg"], ["", "  call dispatch"], ["", "dispatch:"], ["", "  mov rax, [rcx]       ; vptr"], ["", "  jmp [rax+8]          ; vftable[1] = run"]] },
      { id: "regs", type: "regs", x: 24, y: 205, w: 390, label: "REGISTERS", names: ["rcx", "rdx", "rax", "rip"] },
      { id: "obj", type: "box", x: 450, y: 20, w: 230, label: "Exfil @0x2A1F30 (heap)", vx: 44, rows: [{ a: "+0", v: "vptr → Exfil::vftable" }, { a: "+8", v: "id = 0" }, { a: "+16", v: "bytes = 0" }] },
      { id: "vt", type: "box", x: 450, y: 200, w: 230, label: "Exfil::vftable (.rdata)", vx: 44, rows: [{ a: "-8", v: "→ RTTI locator" }, { a: "+0", v: "vector deleting dtor" }, { a: "+8", v: "Exfil::run" }] },
      { id: "fn", type: "box", x: 715, y: 200, w: 225, label: "Exfil::run(int)", vx: 14, rows: [{ v: "add [rcx+16], edx" }, { v: "mov eax, 1" }, { v: "ret" }] },
      { id: "rtti", type: "box", x: 715, y: 20, w: 225, label: "RTTI (.rdata)", vx: 14, rows: [{ v: ".?AUExfil@@" }, { v: "base: .?AUCommand@@" }] }
    ],
    links: [["obj", "vt"], ["vt", "fn"], ["vt", "rtti"]],
    init: { regs: { rcx: "?", rdx: "?", rax: "?", rip: "caller" }, code: -1 },
    steps: [
      { t: "this + arg", st: "rcx = object", d: "في MSVC x64 الـ <code>this</code> = أول argument = <code>rcx</code>، وبعده الـ args العادية (<code>edx</code> = 5). أي function بتستخدم <code>[rcx+…]</code> كتير من غير ما تكتب rcx = غالبًا method.",
        set: { code: [1, 2, 3], regs: { rcx: "0x2A1F30 (this)", rdx: "5", rip: "dispatch" } } },
      { t: "اقرا الـ vptr", st: "rax = [rcx]", d: "أول qword في الـ object = عنوان الـ vtable بتاع الـ class <b>الحقيقية</b> (Exfil) — حتى لو الـ pointer نوعه <code>Command*</code>. ده سر الـ polymorphism.",
        fly: [{ from: "obj", to: "regs", label: "vptr", kind: "read", info: "mov rax, [rcx]" }], set: { code: 5, regs: { rax: "Exfil::vftable" }, box: { obj: { hl: 0 } } } },
      { t: "الخانة رقم 1", st: "jmp [rax+8]", d: "<code>[rax+8]</code> = الخانة التانية في الجدول = <code>run</code>. الـ offset بيقولك <b>رقم</b> الـ virtual method (index × 8) — في gcc نفس الـ run كانت <code>+16</code> لأن عنده destructorين في الأول.",
        fly: [{ from: "vt", to: "regs", label: "&Exfil::run", kind: "read", info: "load [rax+8]" }, { from: "regs", to: "fn", label: "jmp", kind: "jump", info: "tail call via vtable" }], set: { code: 6, regs: { rip: "Exfil::run" }, box: { obj: { hl: -1 }, vt: { hl: 2 } } } },
      { t: "الـ method", st: "this->bytes += 5", d: "<code>add [rcx+16], edx</code> ← field عند offset 16 في الـ object اتغير. كده عرفت إن Exfil عنده field عند +16 (هتسمّيه بعد ما تفهم بيتستخدم في إيه).",
        fly: [{ from: "fn", to: "obj", label: "+= 5", kind: "write", info: "[this+16] += arg" }], set: { box: { vt: { hl: -1 }, fn: { hl: 0 }, obj: { rows: [{ a: "+0", v: "vptr → Exfil::vftable" }, { a: "+8", v: "id = 0" }, { a: "+16", v: "bytes = 5" }], hl: 2 } } } },
      { t: "RTTI = الأسماء", st: "vftable[-1]", d: "الخانة اللي <b>قبل</b> الـ vtable ← Complete Object Locator ← Type Descriptor فيه الاسم <code>.?AUExfil@@</code> (U = struct، V = class) وقايمة الـ base classes. plugin زي <b>ClassInformer</b> بيعمل ده لكل الـ classes في الـ binary — malware C++ بيبقى فجأة مقروء.",
        fly: [{ from: "vt", to: "rtti", label: "COL → TypeDescriptor", kind: "read", info: "class name + hierarchy" }], set: { box: { fn: { hl: -1 }, rtti: { hl: 0 } }, glow: ["rtti"] } }
    ]
  };
  /* ---------------------------------------------------------- ARM64 bl / lr / stp */
  (function () {
    const ST = (o) => [
      { a: "FFFFEFE0", v: o.fp || "", n: o.fp ? "saved x29 (fp)" : "", c: o.fp ? "rbp" : "", p: o.p === 0 ? "sp" : "" },
      { a: "FFFFEFE8", v: o.lr || "", n: o.lr ? "saved x30 (lr)" : "", c: o.lr ? "ret" : "" },
      { a: "FFFFEFF0", v: o.x19 || "", n: o.x19 ? "saved x19" : "", c: o.x19 ? "buf" : "" },
      { a: "FFFFEFF8", v: "", n: "" },
      { a: "FFFFF000", v: "…", n: "caller frame", p: o.p === 4 ? "sp" : "" }
    ];
    S.arm64call = {
      id: "arm64call", group: "الهندسة العكسية", icon: "📱", title: "ARM64: bl والـ Link Register", sub: "عنوان الرجوع في x30 مش على الـ stack", keys: "arm64 aarch64 bl ret lr x30 x29 fp stp ldp prologue epilogue leaf function",
      overview: "في ARM64 الـ <code>bl</code> مش بتكتب في الذاكرة خالص: عنوان الرجوع بيتحط في register اسمه <b>x30 (LR)</b>، و<code>ret</code> بتقفز له. الدالة اللي هتنادي حد تاني لازم تحفظ x30 بنفسها (<code>stp x29, x30, [sp, -N]!</code>) — وإلا الـ <code>bl</code> الجاية هتمسحه.",
      facts: [["bl", "x30 = pc + 4 ; pc = target"], ["ret", "pc = x30"], ["prologue", "<code>stp x29, x30, [sp, -N]!</code>"], ["epilogue", "<code>ldp x29, x30, [sp], N</code>"], ["الدرس", "المرحلة 26"]],
      w: 960, h: 470,
      actors: [
        { id: "code", type: "code", x: 24, y: 20, w: 400, label: "AArch64 (gcc -O2)", lines: [
          ["4005F0", "bl send_status"], ["", "send_status:", "lbl"], ["400600", "stp x29, x30, [sp, -32]!"], ["400604", "mov w1, 4919        ; 0x1337"], ["400608", "mov x29, sp"], ["40060C", "str x19, [sp, 16]"], ["400610", "mov x19, x0"], ["400614", "bl report"], ["400618", "ldr w1, [x19]       ; b->id"], ["40061C", "ldr x19, [sp, 16]"], ["400620", "add w0, w0, w1"], ["400624", "ldp x29, x30, [sp], 32"], ["400628", "ret"]] },
        { id: "regs", type: "regs", x: 470, y: 20, w: 240, label: "REGISTERS", names: ["pc", "sp", "x0", "x1", "x19", "x29", "x30"] },
        { id: "cpu", type: "cpu", x: 590, y: 340, label: "CPU", sub: "AArch64" },
        { id: "stack", type: "stack", x: 740, y: 20, w: 200, label: "STACK", sub: "high ↓", vx: 78, minRows: 5 }
      ],
      links: [["cpu", "stack"], ["cpu", "regs"]],
      init: { regs: { pc: "0x4005F0", sp: "0xFFFFF000", x0: "b = 0x41A2C0", x1: "?", x19: "caller's", x29: "caller fp", x30: "caller lr" }, code: 0, stack: ST({ p: 4 }) },
      steps: [
        { t: "bl", st: "x30 = 0x4005F4", d: "<code>bl send_status</code>: <b>مفيش push</b>. الـ CPU بيحط عنوان الرجوع (<code>pc + 4</code>، كل instruction 4 bytes) في <code>x30</code> ويقفز. الـ stack متلمسش.",
          set: { code: 0, regs: { pc: "0x400600", x30: "0x4005F4 (return)" } } },
        { t: "احفظ fp وlr", st: "stp x29, x30, [sp, -32]!", d: "الدالة دي هتعمل <code>bl report</code> ← الـ bl دي هتكتب فوق <code>x30</code>. فلازم تحفظه: <code>stp</code> = store pair. الـ <code>!</code> = pre-index: <code>sp -= 32</code> الأول وبعدين خزّن. (ده المقابل لـ <code>push rbp</code> + عنوان الرجوع في x86.)",
          fly: [{ from: "cpu", to: "stack", label: "x29, x30", kind: "push", info: "sp -= 32 ; [sp] = x29 ; [sp+8] = x30" }], set: { code: 2, regs: { pc: "0x400604", sp: "0xFFFFEFE0" }, stack: ST({ fp: "caller fp", lr: "0x4005F4", p: 0 }) } },
        { t: "frame + arg", st: "x29 = sp · w1 = 0x1337", d: "<code>mov x29, sp</code> = frame pointer. <code>w1</code> = تاني argument (<code>x0–x7</code> = args 1–8). لاحظ الـ compiler خلط الترتيب — عادي.",
          set: { code: [3, 4], regs: { pc: "0x40060C", x1: "0x1337", x29: "0xFFFFEFE0" } } },
        { t: "callee-saved", st: "x19 ← b", d: "<code>x0</code> هيتمسح بالـ return value. عشان يحتفظ بـ <code>b</code> بعد النداء، بيحطه في <code>x19</code> (callee-saved: <code>x19–x28</code>) — بس الأول يحفظ قيمة x19 القديمة على الـ stack.",
          fly: [{ from: "cpu", to: "stack", label: "old x19", kind: "write", info: "str x19, [sp, 16]" }], set: { code: [5, 6], regs: { pc: "0x400614", x19: "b = 0x41A2C0" }, stack: ST({ fp: "caller fp", lr: "0x4005F4", x19: "caller's x19", p: 0 }) } },
        { t: "bl report", st: "x30 = 0x400618", d: "<code>x30</code> اتمسح فعلًا: بقى عنوان الرجوع لـ send_status. لو مكناش حفظناه كان الـ <code>ret</code> الأخيرة هترجع غلط. <code>report</code> رجّعت قيمتها في <code>w0</code>.",
          set: { code: 7, regs: { pc: "0x400618", x30: "0x400618", x0: "r (from report)" } } },
        { t: "رجّع الحاجات", st: "w0 = r + b->id", d: "<code>ldr w1, [x19]</code> ← <code>b-&gt;id</code> (offset 0)، رجّع x19 القديم، واجمع. القيمة الراجعة في <code>w0</code>/<code>x0</code>.",
          fly: [{ from: "stack", to: "cpu", label: "old x19", kind: "read", info: "ldr x19, [sp, 16]" }], set: { code: [8, 9, 10], regs: { pc: "0x400624", x1: "b->id", x19: "caller's", x0: "r + b->id" } } },
        { t: "ldp + ret", st: "pc = x30", d: "<code>ldp x29, x30, [sp], 32</code> = post-index: اقرا وبعدين <code>sp += 32</code>. و<code>ret</code> = <code>pc = x30</code> = <code>0x4005F4</code>. الدوال <b>leaf</b> (اللي مبتناديش حد، زي <code>get_port</code>) مبتلمسش الـ stack خالص: <code>ldr w0, [x0, 4]</code> / <code>ret</code>.",
          fly: [{ from: "stack", to: "cpu", label: "x29, x30", kind: "pop", info: "restore fp/lr ; sp += 32" }], set: { code: [11, 12], regs: { pc: "0x4005F4", sp: "0xFFFFF000", x29: "caller fp", x30: "0x4005F4" }, stack: ST({ p: 4 }) } }
      ]
    };
  })();
})(window.ASM_SCENES);
