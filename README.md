# ASM Mastery for Reverse Engineers — Assembly من الصفر للاحتراف 🔬

**🌐 الموقع: https://sonic-x01.github.io/ASM-Mastery/**

كورس Assembly تفاعلي بالعربي (RTL)، من أول الـ bits والـ registers لحد الـ PEB walk والـ shellcode والـ unpacking، ومصمم بالكامل لـ **الـ Reverse Engineering وتحليل الـ Malware**: مش بس تكتب Assembly، لكن تقرا اللي الـ compilers بيطلعوه وتفك اللي الـ malware بيخبّيه.

> الأكواد والتعليقات والمخرجات **بالإنجليزية**، والشرح **بالعربي**. الـ syntax: **NASM / Intel**. المعمارية الأساسية **x86-64**، مع **x86 32-bit** و**ARM64**.

## المحتوى

| الجزء | المراحل |
|---|---|
| **1 · الآلة من جوه** | الكمبيوتر والـ fetch-decode-execute · الأنظمة العددية وtwo's complement وIEEE-754 · الـ registers · الذاكرة والعناوين والـ addressing modes · الأدوات (NASM، ld، gdb، x64dbg) |
| **2 · الـ Instructions** | نقل البيانات · الحساب والـ flags (والـ magic numbers) · الـ bitwise والـ shifts (XOR decoders، ROR13) · التحكم في التدفق (jump tables) · الـ stack والدوال (frames، canaries) · الـ calling conventions (SysV، Win64، cdecl/stdcall/fastcall/thiscall) |
| **3 · البرمجة الحقيقية** | الـ strings والـ rep · الـ syscalls · هياكل البيانات (structs، linked lists) · Assembly مع C وNASM macros وبرامج Windows x64 بالـ WinAPI · Floating point وSIMD |
| **4 · الهندسة العكسية** | أنماط الـ compilers · منهجية قراية الـ disassembly · الـ machine code والـ patching · PE وELF · x86 32-bit (SEH، GetPC، Heaven's Gate) · Windows internals (PEB، export tables، API hashing، direct syscalls) · الـ shellcode والـ injection · Anti-debug/Anti-VM/Obfuscation/Unpacking · C++ (vtables، RTTI) وGo/Rust/.NET · ARM64 |
| **5 · التطبيق** | 5 crackmes (منهم keygens بتتحقق في المعمل) · 6 مشاريع (hexdump بـ Assembly، API hash resolver، PE parser، YARA rules، تقرير shellcode، crackme + keygen) · Cheat Sheet قابل للبحث · مصادر وخريطة طريق |

- **168 سؤال** بشرح لكل إجابة.
- **38 lab challenge** بتتصحح في المعمل (اختبارات + قيود زي «من غير jumps» أو «بحد أقصى N instructions»)، و**13 تحدي** بيتصحح على Linux حقيقي.
- **64 مهمة RE** (تقرا كود وتطلع إجابة) — اللي ينفع منها اتأكدت إجابته بتشغيل الكود.
- **23 مشهد في الـ ASM Explorer** (فكرة protocol-explorer): CPU، syscalls، virtual memory، jump tables، call/ret، frames، buffer overflow، Win64، الـ loader والـ IAT، decoding، PEB walk، direct syscalls، injection، decoder stubs، anti-debug، unpacking، vtables، ARM64…
- **11 أداة تفاعلية**: محوّل أنظمة، RAX من جوه، حاسبة flags وjumps، encoder (نفس bytes الـ NASM)، endianness، حاسبة عناوين، SIMD lanes، مقارنة floats، بطاقات idioms، walkthrough تحليل دالة، و**PE Explorer لملف EXE حقيقي**.
- **32 compiled view** من gcc / clang / MSVC (x64 و32-bit) / ARM64 بمستويات optimization مختلفة، مع **CFG بشكل IDA**.

## المعمل (Emulator) — ليه تثق فيه

الصفحة فيها **x86-64 emulator** مكتوب للكورس (assembler + encoder + CPU) بيشغّل الكود خطوة بخطوة بـ debugger كامل (breakpoints، step back، registers، flags، stack، memory):

- اتعمله **differential testing** ضد معالج حقيقي: **23,000+ instruction** عشوائية بنفس الـ registers والـ flags (`tools/test_cpu.py`).
- الـ encoder طلّع **نفس الـ bytes بالظبط** زي NASM في **3,237 حالة** (`tools/test_encoder.py`).
- كل مثال NASM بيتشغّل على **Linux حقيقي** (Compiler Explorer) وقت البناء، ومخرجاته لازم تطابق الـ emulator وإلا البناء بيفشل.

## البناء

```bash
python tools/build.py           # يبني index.html ويتحقق من كل حاجة
python tools/build.py --draft   # أسرع: من غير فحص الروابط الداخلية
```

البناء بيشغّل كل مثال وحل على Compiler Explorer (النتائج بتتخزن في `tools/.ce-cache.json`)، وكل lab/RE task في الـ emulator عن طريق Node (`tools/verify_emu.js`). لو أي إجابة أو مخرج غلط، البناء بيقف ويقولك فين. قواعد الكتابة في [`tools/AUTHORING.md`](tools/AUTHORING.md).

## التشغيل

الصفحة **static بالكامل**: افتح `index.html`، أو شغّل أي static server:

```bash
python -m http.server 8792
```

- أزرار **تشغيل** و**⚙ Bytes** بتبعت الكود لـ [Compiler Explorer](https://godbolt.org) (NASM 3.01 / gcc 15.2 على Linux x86-64) — محتاجة إنترنت، ومتحطش بيانات سرية في الكود. الـ **🔬 Debug** والـ labs شغّالين **offline** بالكامل.
- كل مثال معاه مخرجات متحقق منها مسبقًا بتظهر لو مفيش اتصال.
- التقدّم بيتحفظ في `localStorage` تحت `asmMastery.v1`.

## الأمان

كل الـ «malware» في الكورس **تعليمي ومن تأليفنا**: shellcode بيطبع سطر ويخرج، domains من نطاقات التوثيق (`*.example`، `203.0.113.0/24`)، وملف PE صغير بيعرض MessageBox. **حلّل الـ samples الحقيقية جوه VM معزولة بس.**
