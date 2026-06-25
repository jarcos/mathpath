#!/usr/bin/env node
/**
 * Glossary verifier (M22).
 *
 *   1. Structural integrity of content/glossary.json (bilingual everywhere,
 *      unique ids, detect-forms present).
 *   2. Runs the shared symbol-detection over every lesson to prove it works and
 *      to report coverage (how many symbols each lesson surfaces).
 *
 * Exit code is non-zero on any integrity failure, so it can gate a build.
 */
import { readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { getLessonSymbols, buildMatchers } from '../src/shared/notation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTENT = join(ROOT, 'content')

const problems = []
const glossary = JSON.parse(readFileSync(join(CONTENT, 'glossary.json'), 'utf8'))

// --- 1. glossary integrity -------------------------------------------------
const ids = new Set()
for (const s of glossary.symbols || []) {
  const where = `symbol "${s.id || '(no id)'}"`
  if (!s.id) problems.push('A symbol is missing an id')
  else if (ids.has(s.id)) problems.push(`Duplicate id: ${s.id}`)
  else ids.add(s.id)
  if (!s.display) problems.push(`${where}: missing display (TeX)`)
  if (!s.read?.en || !s.read?.es) problems.push(`${where}: read needs en + es`)
  if (!s.meaning?.en || !s.meaning?.es) problems.push(`${where}: meaning needs en + es`)
  if (!s.category) problems.push(`${where}: missing category`)
  const hasDetect = (s.tex && s.tex.length) || (s.uni && s.uni.length)
  if (!hasDetect) problems.push(`${where}: needs at least one tex or uni detect form`)
}

// --- 2. run detection over every lesson ------------------------------------
const matchers = buildMatchers(glossary)
let lessonCount = 0
let withSymbols = 0
let totalDetections = 0
const dirs = readdirSync(CONTENT, { withFileTypes: true }).filter((d) => d.isDirectory())
for (const d of dirs) {
  const files = readdirSync(join(CONTENT, d.name)).filter((f) => /^lesson-.*\.json$/.test(f))
  for (const f of files) {
    let lesson
    try {
      lesson = JSON.parse(readFileSync(join(CONTENT, d.name, f), 'utf8'))
    } catch (e) {
      problems.push(`${d.name}/${f}: invalid JSON (${e.message})`)
      continue
    }
    lessonCount++
    try {
      const syms = getLessonSymbols(lesson, glossary, matchers)
      if (syms.length) withSymbols++
      totalDetections += syms.length
    } catch (e) {
      problems.push(`${d.name}/${f}: detection threw (${e.message})`)
    }
  }
}

console.log('\nMathPath glossary verification')
console.log(`  glossary symbols:        ${(glossary.symbols || []).length}`)
console.log(`  lessons scanned:         ${lessonCount}`)
console.log(`  lessons with symbols:    ${withSymbols}`)
console.log(`  avg symbols / lesson:    ${(totalDetections / Math.max(1, lessonCount)).toFixed(1)}`)

if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):`)
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
console.log('\n✓ Glossary verified.\n')
