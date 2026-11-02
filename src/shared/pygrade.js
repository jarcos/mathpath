// Code-exercise grading and Pyodide runtime config, shared by the app (Pyodide
// worker) and the build-time verifier (scripts/verify-pyodide.mjs) so both run
// and grade code the same way.

const LIB_TO_PKG = {
  numpy: 'numpy',
  pandas: 'pandas',
  'scikit-learn': 'scikit-learn',
  sklearn: 'scikit-learn',
  sympy: 'sympy',
  scipy: 'scipy',
  matplotlib: 'matplotlib'
}

/** Pyodide package names for a lesson's `lib` list (unknown libs are skipped). */
export function packagesFor(libs = []) {
  return [...new Set(libs.map((l) => LIB_TO_PKG[l]).filter(Boolean))]
}

/**
 * Run once when Pyodide starts. Pandas in Pyodide warns on import that pyarrow
 * is missing, and that warning would show up in the learner's output.
 */
export const RUNTIME_SETUP = `
import warnings
warnings.filterwarnings("ignore", message=r"\\s*Pyarrow will become a required dependency", category=DeprecationWarning)
`

/**
 * Python run after the learner's code, in the same namespace. Calls
 * `funcName(*args)` for every entry of `_mp_inputs` and leaves `_mp_result`.
 * Return values are turned into plain JSON-like data before they cross into
 * JS: NumPy arrays and scalars via tolist(), tuples as lists, dict keys as
 * strings — the same leniency verify-code.py applies in CPython. Builtins are
 * reached through `_mp_b`, so learner code that rebinds `list` or `str` at
 * module level can't break the grading.
 */
export function casesProgram(funcName) {
  return `
import builtins as _mp_b

def _mp_plain(x):
    if _mp_b.hasattr(x, "tolist") and _mp_b.callable(x.tolist):
        x = x.tolist()
    if _mp_b.isinstance(x, _mp_b.dict):
        return {_mp_b.str(k): _mp_plain(v) for k, v in x.items()}
    if _mp_b.isinstance(x, (_mp_b.list, _mp_b.tuple)):
        return [_mp_plain(v) for v in x]
    return x

_mp_fn = _mp_b.globals().get(${JSON.stringify(funcName)})
if _mp_b.callable(_mp_fn):
    _mp_result = {"missing": False, "results": [_mp_plain(_mp_fn(*a)) for a in _mp_inputs]}
else:
    _mp_result = {"missing": True, "results": []}
`
}

// Tolerant deep compare for returned values (numbers within tolerance).
export function valuesClose(a, e, tol = 1e-9) {
  if (typeof e === 'boolean' || typeof a === 'boolean') return a === e
  if (typeof e === 'number' && typeof a === 'number') {
    const scale = Math.max(1, Math.abs(a), Math.abs(e))
    return Math.abs(a - e) <= tol * scale
  }
  if (Array.isArray(e) && Array.isArray(a)) {
    return a.length === e.length && a.every((x, i) => valuesClose(x, e[i], tol))
  }
  if (e && a && typeof e === 'object' && typeof a === 'object') {
    const ek = Object.keys(e)
    return ek.length === Object.keys(a).length && ek.every((k) => valuesClose(a[k], e[k], tol))
  }
  return a === e
}

/** Grades the per-test results of a code exercise; one boolean per test. */
export function gradeCases(results, tests) {
  return tests.map((tt, i) => valuesClose(results[i], tt.expected, tt.tol ?? 1e-9))
}
