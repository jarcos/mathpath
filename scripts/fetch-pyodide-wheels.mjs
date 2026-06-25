#!/usr/bin/env node
/**
 * Downloads the Pyodide package wheels needed for in-app code execution into the
 * local bundle, so the runtime is FULLY OFFLINE (no CDN at runtime).
 *
 * This is a one-time SETUP step (network used here, never at runtime). It reads
 * Pyodide's own lockfile to resolve the exact dependency closure of the packages
 * MathPath uses, then fetches each wheel from the official CDN matching the
 * installed Pyodide version. Re-run with `npm run setup:pyodide:wheels`.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEST = join(ROOT, 'src', 'renderer', 'public', 'pyodide')

// Top-level packages MathPath lessons import. Their dependencies are resolved
// automatically from the lockfile.
const WANT = ['numpy', 'pandas', 'scipy', 'scikit-learn', 'sympy']

const require = createRequire(import.meta.url)
const version = require('pyodide/package.json').version
const CDN = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`

const lockPath = existsSync(join(DEST, 'pyodide-lock.json'))
  ? join(DEST, 'pyodide-lock.json')
  : join(dirname(require.resolve('pyodide/package.json')), 'pyodide-lock.json')
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
const pkgs = lock.packages

// Resolve the full dependency closure (BFS over `depends`).
const closure = new Set()
const queue = [...WANT]
while (queue.length) {
  const name = queue.shift()
  const key = pkgs[name] ? name : Object.keys(pkgs).find((k) => k.toLowerCase() === name.toLowerCase())
  if (!key) {
    console.warn(`  ! ${name} not in lockfile — skipping`)
    continue
  }
  if (closure.has(key)) continue
  closure.add(key)
  for (const dep of pkgs[key].depends || []) queue.push(dep)
}

console.log(`Pyodide ${version} — ${closure.size} wheels to ensure (from ${WANT.join(', ')})`)

let downloaded = 0
let skipped = 0
let bytes = 0

for (const key of closure) {
  const file = pkgs[key].file_name
  const out = join(DEST, file)
  if (existsSync(out)) {
    skipped++
    bytes += statSync(out).size
    continue
  }
  const url = CDN + file
  process.stdout.write(`  ↓ ${file} … `)
  const res = await fetch(url)
  if (!res.ok) {
    console.log(`FAILED (${res.status})`)
    process.exitCode = 1
    continue
  }
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(out, buf)
  bytes += buf.length
  downloaded++
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`)
}

console.log(
  `\nDone: ${downloaded} downloaded, ${skipped} already present. ` +
    `Total wheel size ≈ ${(bytes / 1e6).toFixed(0)} MB in ${DEST}`
)
