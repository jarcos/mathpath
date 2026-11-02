// Lazy, offline Pyodide runtime for in-app code execution.
//
// OFFLINE-FIRST: Pyodide core + the stdlib wheels (numpy, pandas, scikit-learn,
// sympy, scipy) must be BUNDLED locally under the app's static `pyodide/` folder
// (copied from node_modules/pyodide at build time — see BUILD.md). Nothing here
// ever hits the network at runtime; `indexURL` points at the local copy.
//
// Python runs in a Web Worker (pyodide.worker.js), never on the UI thread, one
// job at a time; the queue lives here so each job can be cancelled on its own.
// Stopping the running job, or letting it go past RUN_TIMEOUT_MS, terminates
// the worker; the next job starts a fresh one (and reloads Pyodide).
import { RUNTIME_SETUP, casesProgram, packagesFor } from '@shared/pygrade.js'

// Resolve relative to the current document so it works under the dev server and
// the packaged loopback server alike (absolute URL avoids file:// pitfalls).
const PYODIDE_BASE = new URL('pyodide/', document.baseURI).href

// Counted from when the code starts executing, not while Pyodide loads.
const RUN_TIMEOUT_MS = 30000

let worker = null
let nextId = 0
const waiting = [] // jobs not sent to the worker yet: { id, msg, resolve }
let current = null // the job the worker is running: { id, msg, resolve, timer }

function finishCurrent(res) {
  const job = current
  current = null
  clearTimeout(job.timer)
  job.resolve(res)
  pump()
}

function killCurrent(reason) {
  worker.terminate()
  worker = null
  finishCurrent({ ok: false, reason })
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./pyodide.worker.js', import.meta.url))
  worker.onmessage = (e) => {
    const { id, phase, ...res } = e.data
    if (!current || id !== current.id) return
    if (phase === 'running') {
      current.timer = setTimeout(() => killCurrent('timeout'), RUN_TIMEOUT_MS)
      return
    }
    finishCurrent(res)
  }
  worker.onerror = (e) => {
    e.preventDefault()
    worker.terminate()
    worker = null
    if (current) finishCurrent({ ok: false, error: e.message || 'Could not load the local Pyodide runtime.' })
  }
  return worker
}

function pump() {
  if (current || !waiting.length) return
  current = waiting.shift()
  getWorker().postMessage({ ...current.msg, id: current.id, base: PYODIDE_BASE, setup: RUNTIME_SETUP })
}

// Queues a job. Aborting `signal` cancels just this job: it is dropped if still
// waiting, or its worker is terminated if running. Either way the call resolves
// with `{ ok: false, reason: 'stopped' }`; a run past the limit gets 'timeout'.
function post(msg, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ ok: false, reason: 'stopped' })
    const job = { id: ++nextId, msg, resolve, timer: null }
    signal?.addEventListener(
      'abort',
      () => {
        if (current === job) return killCurrent('stopped')
        const i = waiting.indexOf(job)
        if (i !== -1) {
          waiting.splice(i, 1)
          resolve({ ok: false, reason: 'stopped' })
        }
      },
      { once: true }
    )
    waiting.push(job)
    pump()
  })
}

// Run a snippet, capturing stdout + stderr as one string. Each snippet gets a
// fresh namespace, as in the verifiers.
export async function runCode(code, libs = [], signal) {
  const res = await post({ kind: 'snippet', packages: packagesFor(libs), code }, signal)
  return {
    ok: !!res.ok,
    reason: res.reason,
    output: String(res.output ?? res.error ?? '').replace(/\n+$/, '')
  }
}

// Define the learner's code, call funcName(*args) for each test, return JS values.
export async function runFunctionCases(userCode, funcName, argsList, libs = [], signal) {
  const res = await post(
    {
      kind: 'program',
      packages: packagesFor(libs),
      sources: [userCode, casesProgram(funcName)],
      inputs: argsList
    },
    signal
  )
  if (!res.ok) return { ok: false, reason: res.reason, error: res.error }
  if (res.value.missing) return { ok: false, error: 'missing_function' }
  return { ok: true, results: res.value.results }
}
