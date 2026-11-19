#!/usr/bin/env python3
"""Print real compiler output for a C file (authoring helper; uses the build cache).
    python tools/peek.py file.c gcc-O0,gcc-O2,msvc-O2
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build  # noqa: E402

for s in (sys.stdout,):
    s.reconfigure(encoding="utf-8", errors="replace")
src = Path(sys.argv[1]).read_text(encoding="utf-8")
for t in sys.argv[2].split(","):
    print(f"===== {t} =====")
    print(build.ce_compile(t, src))
