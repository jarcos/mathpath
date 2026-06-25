#!/usr/bin/env node
/**
 * Copies the locally-installed Pyodide distribution into the renderer's static
 * folder so the app can run Python fully OFFLINE (no CDN, no runtime network).
 *
 * Runs automatically after `npm install` (postinstall) and can be re-run with
 * `npm run setup:pyodide`. The destination is git-ignored — it is a build
 * artifact, not source. If Pyodide isn't installed yet, this is a no-op so a
 * fresh checkout doesn't fail before deps are present.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEST = join(ROOT, 'src', 'renderer', 'public', 'pyodide')

let src
try {
  const require = createRequire(import.meta.url)
  // Resolve the installed pyodide package directory.
  src = dirname(require.resolve('pyodide/package.json'))
} catch {
  console.log('[copy-pyodide] pyodide not installed yet — skipping (run after npm install).')
  process.exit(0)
}

if (!existsSync(src)) {
  console.log('[copy-pyodide] pyodide dist not found — skipping.')
  process.exit(0)
}

rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })
// Copy the whole distribution (loader + wasm + stdlib + bundled wheels). This is
// large (~hundreds of MB with all wheels) but guarantees offline execution; the
// folder is git-ignored.
cpSync(src, DEST, { recursive: true })
console.log(`[copy-pyodide] copied Pyodide → ${DEST}`)
