/* global loadPyodide */
// Runs Pyodide off the UI thread, so a slow or endless snippet can never freeze
// the app: the page can always terminate this worker (see pyodide.js).
//
// A classic worker with no imports, so it can importScripts() the bundled
// loader from the local `pyodide/` folder. Jobs run one at a time.
//
//   { id, kind: 'snippet', base, setup, packages, code }
//       runs as __main__ in a fresh namespace → { ok, output }
//   { id, kind: 'program', base, setup, packages, sources, vars }
//       runs `sources` in order in a fresh namespace, with each entry of `vars`
//       set as a global, and returns the converted `_mp_result` plus what was
//       printed → { ok, value, output, outputCut }. The first source is the
//       learner's code and runs as "<exec>", the rest as "<grader>", so a
//       traceback can point at the learner's own lines.
//
// `setup` is Python run once, right after Pyodide loads. Before executing, each
// job posts { id, phase: 'running' } so the page can start its timeout only
// once Pyodide and the packages (declared or imported) are loaded.

let pyodide = null
const loadedPackages = new Set()
let queue = Promise.resolve()

async function ensure(base, setup, packages) {
  if (!pyodide) {
    importScripts(base + 'pyodide.js')
    const py = await loadPyodide({ indexURL: base })
    if (setup) await py.runPythonAsync(setup)
    pyodide = py
  }
  const missing = packages.filter((p) => !loadedPackages.has(p))
  if (missing.length) {
    await pyodide.loadPackage(missing)
    missing.forEach((p) => loadedPackages.add(p))
  }
  return pyodide
}

// Drops Pyodide's own frames, so a traceback starts at the learner's code.
function formatError(e) {
  const msg = String(e?.message || e)
  const i = msg.indexOf('  File "<exec>"')
  return i === -1 ? msg : 'Traceback (most recent call last):\n' + msg.slice(i)
}

async function runSnippet(py, code) {
  let out = ''
  const sink = { batched: (s) => (out += s + '\n') }
  py.setStdout(sink)
  py.setStderr(sink)
  const globals = py.toPy({ __name__: '__main__' })
  try {
    await py.runPythonAsync(code, { globals })
    return { ok: true, output: out }
  } catch (e) {
    return { ok: false, output: out + formatError(e) }
  } finally {
    globals.destroy()
  }
}

// What the learner's code prints is shown under the tests, up to this many
// characters (a print in a loop can write far more in 30 seconds).
const MAX_OUTPUT = 5000

async function runProgram(py, sources, vars) {
  let output = ''
  let outputCut = false
  const sink = {
    batched: (s) => {
      if (output.length + s.length + 1 <= MAX_OUTPUT) output += s + '\n'
      else {
        if (!outputCut) output += (s + '\n').slice(0, Math.max(0, MAX_OUTPUT - output.length))
        outputCut = true
      }
    }
  }
  py.setStdout(sink)
  py.setStderr(sink)
  const globals = py.toPy({})
  try {
    for (const [name, v] of Object.entries(vars || {})) {
      const pv = py.toPy(v ?? null)
      globals.set(name, pv)
      pv?.destroy?.()
    }
    // Synchronously: no top-level await is needed here, and a sys.exit() in
    // the learner's code then fails this run instead of escaping as an
    // unhandled error that would take the worker down.
    for (const [i, src] of sources.entries()) {
      py.runPython(src, { globals, filename: i === 0 ? '<exec>' : '<grader>' })
    }
    const r = globals.get('_mp_result')
    const value = r?.toJs ? r.toJs({ dict_converter: Object.fromEntries, create_proxies: false }) : r
    r?.destroy?.()
    return { ok: true, value, output, outputCut }
  } catch (e) {
    return { ok: false, error: formatError(e), output, outputCut }
  } finally {
    globals.destroy()
  }
}

async function handle(msg) {
  let py
  try {
    py = await ensure(msg.base, msg.setup, msg.packages || [])
    // Learners import what they like: also load any bundled package the code
    // imports (from the local copy, like everything else).
    for (const src of msg.kind === 'snippet' ? [msg.code] : msg.sources) {
      await py.loadPackagesFromImports(src)
    }
  } catch (e) {
    // The runtime itself failed to load: not something the learner's code did.
    return { ok: false, reason: 'unavailable', error: String(e?.message || e) }
  }
  self.postMessage({ id: msg.id, phase: 'running' })
  if (msg.kind === 'snippet') return runSnippet(py, msg.code)
  return runProgram(py, msg.sources, msg.vars)
}

self.onmessage = (e) => {
  const msg = e.data
  queue = queue
    .then(() => handle(msg))
    .then(
      (res) => self.postMessage({ id: msg.id, ...res }),
      (err) => self.postMessage({ id: msg.id, ok: false, error: String(err?.message || err) })
    )
}
