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

/** File name of the learner's code in tracebacks; the grader runs as GRADER_FILE. */
export const LEARNER_FILE = '<exec>'
export const GRADER_FILE = '<grader>'

/**
 * Python run after the learner's code (LEARNER_FILE), in the same namespace,
 * as GRADER_FILE. Calls `funcName(*args)` for every entry of `_mp_inputs`, and
 * the same for each source in `_mp_mistakes` (known wrong implementations of
 * the exercise), each in a namespace of its own. Leaves `_mp_result`:
 *
 *   { missing, results: [case…], mistakes: [[case…] | null …] }
 *
 * where a case is { value } or { error: { type, message, line } } (line: in
 * the learner's code, or null), so one test raising (or calling sys.exit)
 * doesn't hide the others. Every call gets its own copy of the test's args,
 * so code that changes its arguments can't change what later calls see; what
 * the mistakes print is dropped.
 * Return values are turned into plain JSON-like data before they cross into
 * JS: NumPy arrays and scalars via tolist(), tuples as lists, dict keys as
 * strings — the same leniency verify-code.py applies in CPython. Integers too
 * big for a JS number become floats, as the expected values are. Anything
 * else (a set, an object) becomes { $repr }, which equals no expected value.
 * Builtins are reached through `_mp_b`, so learner code that rebinds `list`
 * or `str` at module level can't break the grading.
 */
export function casesProgram(funcName) {
  return `
import builtins as _mp_b
import contextlib as _mp_ctx
import copy as _mp_copy
import io as _mp_io
import traceback as _mp_tb

def _mp_plain(x):
    if _mp_b.hasattr(x, "tolist") and _mp_b.callable(x.tolist):
        x = x.tolist()
    if _mp_b.isinstance(x, _mp_b.dict):
        return {_mp_b.str(k): _mp_plain(v) for k, v in x.items()}
    if _mp_b.isinstance(x, (_mp_b.list, _mp_b.tuple)):
        return [_mp_plain(v) for v in x]
    if _mp_b.isinstance(x, _mp_b.int) and not _mp_b.isinstance(x, _mp_b.bool) and _mp_b.abs(x) > 2 ** 53:
        return _mp_b.float(x)
    if x is None or _mp_b.isinstance(x, (_mp_b.bool, _mp_b.int, _mp_b.float, _mp_b.str)):
        return x
    return {"$repr": _mp_b.repr(x)}

def _mp_error(e):
    line = None
    for fr in _mp_tb.extract_tb(e.__traceback__):
        if fr.filename == ${JSON.stringify(LEARNER_FILE)}:
            line = fr.lineno
    msg = "".join(_mp_tb.format_exception_only(_mp_b.type(e), e)).strip()
    return {"type": _mp_b.type(e).__name__, "message": msg, "line": line}

def _mp_cases(fn):
    out = []
    for a in _mp_inputs:
        try:
            out.append({"value": _mp_plain(fn(*_mp_copy.deepcopy(a)))})
        except (_mp_b.Exception, _mp_b.SystemExit) as e:
            out.append({"error": _mp_error(e)})
    return out

def _mp_mistake(src):
    ns = {"__name__": "_mp_mistake"}
    with _mp_ctx.redirect_stdout(_mp_io.StringIO()), _mp_ctx.redirect_stderr(_mp_io.StringIO()):
        try:
            _mp_b.exec(_mp_b.compile(src, "<mistake>", "exec"), ns)
        except _mp_b.Exception:
            return None
        fn = ns.get(${JSON.stringify(funcName)})
        return _mp_cases(fn) if _mp_b.callable(fn) else None

_mp_fn = _mp_b.globals().get(${JSON.stringify(funcName)})
if _mp_b.callable(_mp_fn):
    _mp_result = {
        "missing": False,
        "results": _mp_cases(_mp_fn),
        "mistakes": [_mp_mistake(s) for s in (_mp_b.globals().get("_mp_mistakes") or [])],
    }
else:
    _mp_result = {"missing": True, "results": [], "mistakes": []}
`
}

/** The globals a casesProgram run needs: the tests' args and the mistakes' code. */
export function casesGlobals(exercise) {
  return {
    _mp_inputs: exercise.tests.map((tt) => tt.args || []),
    _mp_mistakes: (exercise.mistakes || []).map((m) => m.code)
  }
}

// Tolerant deep compare for returned values (numbers within tolerance).
export function valuesClose(a, e, tol = 1e-9) {
  if (typeof a === 'bigint') a = Number(a)
  if (typeof e === 'bigint') e = Number(e)
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

const isCase = (c) => !!c && typeof c === 'object' && ('value' in c || 'error' in c)

/** Grades the per-test results ({ value } | { error }) of a code exercise; one boolean per test. */
export function gradeCases(results, tests) {
  return tests.map((tt, i) => {
    const c = results[i]
    return isCase(c) && !c.error && valuesClose(c.value, tt.expected, tt.tol ?? 1e-9)
  })
}

/**
 * The first known mistake whose results match the learner's on every test:
 * the same value (within the test's tolerance) or the same kind of error.
 * Only for an answer that fails; -1 when none matches.
 */
export function matchMistake(results, mistakeResults, tests) {
  if (gradeCases(results, tests).every(Boolean)) return -1
  const same = (a, b, tt) => {
    if (!isCase(a) || !isCase(b)) return false
    if (a.error || b.error) return !!a.error && !!b.error && a.error.type === b.error.type
    return valuesClose(a.value, b.value, tt.tol ?? 1e-9)
  }
  return (mistakeResults || []).findIndex(
    (m) => Array.isArray(m) && m.length === tests.length && tests.every((tt, i) => same(results[i], m[i], tt))
  )
}

// ---- Showing values the way Python prints them ----------------------------

const MAX_REPR = 400

function reprOf(x) {
  if (x === null || x === undefined) return 'None'
  if (x === true) return 'True'
  if (x === false) return 'False'
  if (typeof x === 'number') {
    if (Number.isNaN(x)) return 'nan'
    if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf'
    // 12 significant digits: enough to see any difference the tests care about.
    return String(Number.isInteger(x) ? x : +x.toPrecision(12))
  }
  if (typeof x === 'string') {
    // Python's choice of quotes: single, unless the text has ' and no ".
    const q = x.includes("'") && !x.includes('"') ? '"' : "'"
    const body = x.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
    return q + (q === "'" ? body.replace(/'/g, "\\'") : body) + q
  }
  if (typeof x === 'bigint') return String(x)
  if (Array.isArray(x)) return `[${x.map(reprOf).join(', ')}]`
  if (typeof x === 'object') {
    if (typeof x.$repr === 'string' && Object.keys(x).length === 1) return x.$repr
    return `{${Object.entries(x)
      .map(([k, v]) => `${reprOf(k)}: ${reprOf(v)}`)
      .join(', ')}}`
  }
  return String(x)
}

const clip = (s) => (s.length > MAX_REPR ? s.slice(0, MAX_REPR - 1) + '…' : s)

/** A JSON-like value as Python would print it, cut to a readable length. */
export function pyRepr(x) {
  return clip(reprOf(x))
}

/** The call a test makes, as Python: `softmax([1, 2])`. */
export function callRepr(funcName, args = []) {
  return clip(`${funcName}(${args.map(reprOf).join(', ')})`)
}
