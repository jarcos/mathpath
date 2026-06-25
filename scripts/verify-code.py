#!/usr/bin/env python3
"""
MathPath code verifier (M23/M24).

Executes every runnable `code` section and every `code` exercise so their stated
output / test results are real, not hand-written. Mirrors what the learner runs
in-app (Pyodide) but uses CPython restricted to the Pyodide-supported library
set (numpy / pandas / scikit-learn / sympy / scipy). Heavy libraries that Pyodide
cannot run (tensorflow / torch) are a separate, *optional* tier: if they are not
installed, those static snippets are skipped with a notice rather than failing.

Snippets run IN-PROCESS (each in a fresh namespace) so shared libraries are
imported only once — this keeps the whole gate to a few seconds even with many
scikit-learn snippets. Content is first-party and trusted, so exec is fine here.

Exit code is non-zero on any failure, so it can gate a build.
"""
import json
import sys
import math
import io
import importlib
import contextlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"

OPTIONAL_HEAVY = {"tensorflow", "torch", "keras"}
IMPORT_NAME = {"scikit-learn": "sklearn"}

problems = []
ran = 0
skipped = 0

_importable_cache = {}


def lib_importable(lib):
    if lib not in _importable_cache:
        try:
            importlib.import_module(IMPORT_NAME.get(lib, lib))
            _importable_cache[lib] = True
        except Exception:
            _importable_cache[lib] = False
    return _importable_cache[lib]


def skip_for_heavy(libs):
    for l in libs or []:
        if l in OPTIONAL_HEAVY and not lib_importable(l):
            return f"{l} not installed"
    return None


def run_snippet(code):
    """Exec a snippet in a fresh namespace, capturing stdout. Returns (ok, out)."""
    buf = io.StringIO()
    ns = {"__name__": "__main__"}
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(code, "<snippet>", "exec"), ns)
        return True, buf.getvalue()
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def norm_output(s):
    return "\n".join(line.rstrip() for line in str(s).strip().splitlines())


def outputs_match(actual, expected, tol=1e-6):
    a, e = norm_output(actual), norm_output(expected)
    if a == e:
        return True
    try:
        if math.isclose(float(a), float(e), rel_tol=tol, abs_tol=tol):
            return True
    except ValueError:
        pass
    return False


def values_close(a, e, tol=1e-9):
    if isinstance(e, bool) or isinstance(a, bool):
        return a == e
    if isinstance(e, (int, float)) and isinstance(a, (int, float)):
        return math.isclose(a, e, rel_tol=tol, abs_tol=tol)
    if isinstance(e, (list, tuple)) and isinstance(a, (list, tuple)):
        return len(a) == len(e) and all(values_close(x, y, tol) for x, y in zip(a, e))
    if isinstance(e, dict) and isinstance(a, dict):
        return e.keys() == a.keys() and all(values_close(a[k], e[k], tol) for k in e)
    return a == e


def check_code_section(section, where):
    global ran, skipped
    reason = skip_for_heavy(section.get("lib", []))
    runnable = section.get("runnable", False)
    expected = section.get("expectedOutput")
    if reason:
        skipped += 1
        print(f"  ~ skip {where} ({reason})")
        return
    if not runnable and expected is None:
        return
    for lang in ("en", "es"):
        code = (section.get("code") or {}).get(lang)
        if not code:
            problems.append(f"{where}: code.{lang} missing")
            continue
        ok, out = run_snippet(code)
        ran += 1
        if not ok:
            problems.append(f"{where} [{lang}]: execution failed: {out}")
        elif expected is not None and not outputs_match(out, expected):
            problems.append(f"{where} [{lang}]: output {norm_output(out)!r} != expected {norm_output(expected)!r}")


def check_code_exercise(ex, where):
    global ran, skipped
    reason = skip_for_heavy(ex.get("lib", []))
    if reason:
        skipped += 1
        print(f"  ~ skip {where} ({reason})")
        return
    fn_name = ex.get("funcName")
    solution = ex.get("solution")
    tests = ex.get("tests", [])
    if not fn_name or not solution:
        return
    ns = {"__name__": "__main__"}
    try:
        exec(compile(solution, "<solution>", "exec"), ns)
    except Exception as e:
        problems.append(f"{where}: reference solution failed to load: {type(e).__name__}: {e}")
        return
    fn = ns.get(fn_name)
    if not callable(fn):
        problems.append(f"{where}: solution defines no function '{fn_name}'")
        return
    ran += 1
    for i, t in enumerate(tests):
        try:
            res = fn(*t.get("args", []))
        except Exception as e:
            problems.append(f"{where}: test {i+1} raised {type(e).__name__}: {e}")
            continue
        if hasattr(res, "tolist"):
            res = res.tolist()
        if isinstance(res, tuple):
            res = list(res)
        if not values_close(res, t["expected"], t.get("tol", 1e-9)):
            problems.append(f"{where}: test {i+1} gave {res!r}, expected {t['expected']!r}")
    for lang in ("en", "es"):
        starter = (ex.get("starter") or {}).get(lang)
        if starter:
            try:
                compile(starter, "<starter>", "exec")
            except SyntaxError as e:
                problems.append(f"{where}: starter.{lang} syntax error: {e}")


def main():
    code_sections = code_exercises = 0
    for sub in sorted(p for p in CONTENT.iterdir() if p.is_dir()):
        for f in sorted(sub.glob("lesson-*.json")):
            try:
                lesson = json.loads(f.read_text())
            except Exception as e:
                problems.append(f"{f.name}: invalid JSON ({e})")
                continue
            lid = lesson.get("id", f.name)
            for i, s in enumerate(lesson.get("sections", [])):
                if s.get("type") == "code":
                    code_sections += 1
                    check_code_section(s, f"{lid} section[{i}]")
            for ex in lesson.get("exercises", []):
                if ex.get("answerType") == "code":
                    code_exercises += 1
                    check_code_exercise(ex, f"{lid}/{ex.get('id')}")

    print("\nMathPath code verification")
    print(f"  code sections found:   {code_sections}")
    print(f"  code exercises found:  {code_exercises}")
    print(f"  snippets executed:     {ran}")
    print(f"  skipped (heavy libs):  {skipped}")
    if problems:
        print(f"\n✗ {len(problems)} problem(s):")
        for p in problems:
            print("  - " + p)
        sys.exit(1)
    print("\n✓ Code verified.\n")


if __name__ == "__main__":
    main()
