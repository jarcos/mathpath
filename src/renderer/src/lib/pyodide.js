// Lazy, offline Pyodide runtime for in-app code execution.
//
// OFFLINE-FIRST: Pyodide core + the stdlib wheels (numpy, pandas, scikit-learn,
// sympy, scipy) must be BUNDLED locally under the app's static `pyodide/` folder
// (copied from node_modules/pyodide at build time — see BUILD.md). Nothing here
// ever hits the network at runtime; `indexURL` points at the local copy.
//
// Pyodide is loaded by injecting its loader script and bundled wheels are read
// from `indexURL`, which avoids the bundler trying to pre-process the wasm.

// Resolve relative to the current document so it works under the dev http server
// and the packaged app:// scheme alike (absolute URL avoids file:// pitfalls).
const PYODIDE_BASE = new URL('pyodide/', document.baseURI).href

let _scriptPromise = null
let _pyodidePromise = null
const _loadedPkgs = new Set()

function loadScript() {
  if (_scriptPromise) return _scriptPromise
  _scriptPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.loadPyodide) return resolve()
    const s = document.createElement('script')
    s.src = PYODIDE_BASE + 'pyodide.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the local Pyodide runtime.'))
    document.head.appendChild(s)
  })
  return _scriptPromise
}

export async function getPyodide() {
  if (_pyodidePromise) return _pyodidePromise
  _pyodidePromise = (async () => {
    await loadScript()
    // eslint-disable-next-line no-undef
    return window.loadPyodide({ indexURL: PYODIDE_BASE })
  })()
  return _pyodidePromise
}

const LIB_TO_PKG = {
  numpy: 'numpy',
  pandas: 'pandas',
  'scikit-learn': 'scikit-learn',
  sklearn: 'scikit-learn',
  sympy: 'sympy',
  scipy: 'scipy',
  matplotlib: 'matplotlib'
}

async function ensurePackages(libs = []) {
  const py = await getPyodide()
  const pkgs = [...new Set(libs.map((l) => LIB_TO_PKG[l]).filter(Boolean))].filter(
    (p) => !_loadedPkgs.has(p)
  )
  if (pkgs.length) {
    await py.loadPackage(pkgs)
    pkgs.forEach((p) => _loadedPkgs.add(p))
  }
  return py
}

// Run a snippet, capturing stdout + stderr as one string.
export async function runCode(code, libs = []) {
  try {
    const py = await ensurePackages(libs)
    let out = ''
    const sink = { batched: (s) => (out += s + '\n') }
    py.setStdout(sink)
    py.setStderr(sink)
    await py.runPythonAsync(code)
    return { ok: true, output: out.replace(/\n+$/, '') }
  } catch (e) {
    return { ok: false, output: String(e?.message || e) }
  }
}

// Define the learner's code, call funcName(*args) for each test, return JS values.
export async function runFunctionCases(userCode, funcName, argsList, libs = []) {
  try {
    const py = await ensurePackages(libs)
    const globals = py.toPy({})
    await py.runPythonAsync(userCode, { globals })
    const fn = globals.get(funcName)
    if (!fn) return { ok: false, error: 'missing_function' }
    const results = []
    for (const args of argsList) {
      const pyArgs = (args || []).map((a) => py.toPy(a))
      const r = fn(...pyArgs)
      results.push(r?.toJs ? r.toJs({ create_proxies: false }) : r)
    }
    return { ok: true, results }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
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
