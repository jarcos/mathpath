#!/usr/bin/env node
/**
 * Runs the code content through the Pyodide build the app ships, the way the
 * app runs it. verify-code.py checks the same content in CPython; this catches
 * what only differs in-app: Pyodide's library versions and print formats, and
 * the in-app grader (value conversion + valuesClose).
 *
 *   1. Every code-exercise reference solution is graded with the app's harness
 *      (src/shared/pygrade.js) and must pass all of its tests.
 *   2. Every runnable snippet (EN + ES) must print its expectedOutput.
 *
 * Needs the bundled runtime + wheels (offline, never fetched from here):
 *   npm run setup:pyodide && npm run setup:pyodide:wheels
 *
 * Exit code is non-zero on any failure, so this can gate a build.
 */
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { loadPyodide } from 'pyodide'
import { RUNTIME_SETUP, casesProgram, gradeCases, packagesFor } from '../src/shared/pygrade.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTENT = join(ROOT, 'content')
const PYODIDE_DIR = join(ROOT, 'src', 'renderer', 'public', 'pyodide')

const problems = []
const fail = (where, msg) => problems.push(`✗ ${where}: ${msg}`)

// Same normalisation and float tolerance as verify-code.py's outputs_match.
const normOutput = (s) =>
  String(s)
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .join('\n')
function outputsMatch(actual, expected, tol = 1e-6) {
  const a = normOutput(actual)
  const e = normOutput(expected)
  if (a === e) return true
  const fa = Number(a)
  const fe = Number(e)
  if (a !== '' && e !== '' && Number.isFinite(fa) && Number.isFinite(fe)) {
    return Math.abs(fa - fe) <= Math.max(tol * Math.max(Math.abs(fa), Math.abs(fe)), tol)
  }
  return false
}

if (!existsSync(join(PYODIDE_DIR, 'pyodide-lock.json'))) {
  console.error(`✗ No bundled Pyodide in ${PYODIDE_DIR}. Run: npm run setup:pyodide && npm run setup:pyodide:wheels`)
  process.exit(1)
}
const lock = JSON.parse(readFileSync(join(PYODIDE_DIR, 'pyodide-lock.json'), 'utf8')).packages

// Collect the work from subjects.json (the curriculum the app actually ships).
const exercises = []
const snippets = []
const subjects = JSON.parse(readFileSync(join(CONTENT, 'subjects.json'), 'utf8')).subjects
for (const subject of subjects) {
  for (const rel of subject.lessons || []) {
    const lesson = JSON.parse(readFileSync(join(CONTENT, rel), 'utf8'))
    lesson.sections.forEach((s, i) => {
      if (s.type === 'code' && s.runnable === true) snippets.push({ where: `${lesson.id} section[${i}]`, s })
    })
    for (const ex of lesson.exercises || []) {
      if (ex.answerType === 'code') exercises.push({ where: `${lesson.id}/${ex.id}`, ex })
    }
  }
}

// Every wheel the content needs must be bundled, or Pyodide would try the CDN.
const wanted = new Set([...snippets.map(({ s }) => s.lib), ...exercises.map(({ ex }) => ex.lib)].flatMap((l) => packagesFor(l)))
const closure = new Set()
const queue = [...wanted]
while (queue.length) {
  const name = queue.shift()
  if (closure.has(name)) continue
  closure.add(name)
  const pkg = lock[name]
  if (!pkg) {
    fail('pyodide', `package "${name}" is not in pyodide-lock.json`)
    continue
  }
  if (!existsSync(join(PYODIDE_DIR, pkg.file_name))) {
    fail('pyodide', `wheel ${pkg.file_name} is not bundled. Run: npm run setup:pyodide:wheels`)
  }
  queue.push(...(pkg.depends || []))
}
if (problems.length) {
  problems.forEach((p) => console.error(p))
  process.exit(1)
}

const started = Date.now()
const py = await loadPyodide({ indexURL: PYODIDE_DIR + '/' })
await py.runPythonAsync(RUNTIME_SETUP)
await py.loadPackage([...wanted], { messageCallback: () => {} })

async function runProgram(sources, inputs) {
  py.setStdout({ batched: () => {} })
  py.setStderr({ batched: () => {} })
  const globals = py.toPy({})
  try {
    globals.set('_mp_inputs', py.toPy(inputs))
    for (const src of sources) await py.runPythonAsync(src, { globals })
    const r = globals.get('_mp_result')
    const value = r.toJs({ dict_converter: Object.fromEntries, create_proxies: false })
    r.destroy()
    return value
  } finally {
    globals.destroy()
  }
}

async function runSnippet(code) {
  let out = ''
  const sink = { batched: (s) => (out += s + '\n') }
  py.setStdout(sink)
  py.setStderr(sink)
  const globals = py.toPy({ __name__: '__main__' })
  try {
    await py.runPythonAsync(code, { globals })
    return { ok: true, out }
  } catch (e) {
    return { ok: false, out: String(e?.message || e).trim().split('\n').pop() }
  } finally {
    globals.destroy()
  }
}

for (const { where, ex } of exercises) {
  try {
    const value = await runProgram([ex.solution, casesProgram(ex.funcName)], ex.tests.map((t) => t.args || []))
    if (value.missing) {
      fail(where, `solution defines no function '${ex.funcName}'`)
      continue
    }
    gradeCases(value.results, ex.tests).forEach((ok, i) => {
      if (!ok) {
        fail(where, `test ${i + 1} gave ${JSON.stringify(value.results[i])}, expected ${JSON.stringify(ex.tests[i].expected)}`)
      }
    })
  } catch (e) {
    fail(where, `reference solution failed: ${String(e?.message || e).trim().split('\n').pop()}`)
  }
}

let ran = 0
for (const { where, s } of snippets) {
  for (const lang of ['en', 'es']) {
    const code = s.code?.[lang]
    if (!code) continue
    ran++
    const { ok, out } = await runSnippet(code)
    if (!ok) fail(`${where} [${lang}]`, `execution failed: ${out}`)
    else if (!outputsMatch(out, s.expectedOutput)) {
      fail(`${where} [${lang}]`, `output ${JSON.stringify(normOutput(out))} != expected ${JSON.stringify(normOutput(s.expectedOutput))}`)
    }
  }
}

console.log(`\nMathPath Pyodide verification`)
console.log(`  code exercises graded: ${exercises.length}`)
console.log(`  snippets executed:     ${ran}`)
console.log(`  packages:              ${[...wanted].join(', ') || '(none)'}`)
console.log(`  time:                  ${((Date.now() - started) / 1000).toFixed(1)} s`)

if (problems.length) {
  console.log(`\n${problems.length} problem(s) found:\n`)
  problems.forEach((p) => console.log('  ' + p))
  console.log('')
  process.exit(1)
} else {
  console.log(`\n✓ All code runs and grades the same in Pyodide.\n`)
}
