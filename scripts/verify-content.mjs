#!/usr/bin/env node
/**
 * Build-time content verifier.
 *
 * LLM-generated maths can be subtly wrong, so before any lesson is trusted we:
 *   1. Check structural integrity (EN + ES text everywhere).
 *   2. Parse every answer and graph function with mathjs.
 *   3. Confirm every `acceptedAlt` is mathematically equivalent to `answer`.
 *
 * Exit code is non-zero if anything fails, so this can gate a build.
 */
import { readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import * as math from 'mathjs'
import { assertEquivalent, validateAnswer } from '../src/shared/validate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTENT = join(ROOT, 'content')

const problems = []
let lessonCount = 0
let exerciseCount = 0
let checkCount = 0

const fail = (where, msg) => problems.push(`✗ ${where}: ${msg}`)

function hasBoth(obj, label, where) {
  if (!obj || typeof obj !== 'object' || !obj.en || !obj.es) {
    fail(where, `missing EN/ES for "${label}"`)
    return false
  }
  return true
}

function checkExercise(ex, where) {
  exerciseCount++
  hasBoth(ex.prompt, 'prompt', where)
  if (!ex.answer) fail(where, 'no answer')
  if (!Array.isArray(ex.solution) || ex.solution.length === 0) {
    fail(where, 'no worked solution steps')
  } else {
    ex.solution.forEach((step, i) => hasBoth(step, `solution step ${i + 1}`, where))
  }

  // The stated answer must validate against itself.
  checkCount++
  if (!validateAnswer(ex.answer, ex)) {
    fail(where, `the answer "${ex.answer}" does not validate against itself (answerType=${ex.answerType})`)
  }

  // Every alternative accepted form must be equivalent to the canonical answer.
  for (const alt of ex.acceptedAlt || []) {
    checkCount++
    let ok = false
    if (ex.answerType === 'set') {
      ok = validateAnswer(alt, ex)
    } else if (ex.answerType === 'text') {
      ok = validateAnswer(alt, ex)
    } else {
      ok = assertEquivalent(alt, ex.answer)
    }
    if (!ok) fail(where, `accepted form "${alt}" is NOT equivalent to answer "${ex.answer}"`)
  }
}

function checkGraph(section, where) {
  try {
    const node = math.parse(section.fn)
    node.compile().evaluate({ x: 1 })
  } catch (e) {
    fail(where, `graph fn "${section.fn}" failed to parse/evaluate: ${e.message}`)
  }
}

function checkLesson(lesson, file) {
  lessonCount++
  const where = `${file} (${lesson.id})`
  hasBoth(lesson.title, 'title', where)
  if (!lesson.subjectId) fail(where, 'missing subjectId')
  if (typeof lesson.order !== 'number') fail(where, 'missing numeric order')

  for (const section of lesson.sections || []) {
    if (section.type === 'graph') checkGraph(section, where)
    else if (section.content) hasBoth(section.content, `${section.type} content`, where)
  }
  for (const ex of lesson.exercises || []) checkExercise(ex, `${where} / ${ex.id}`)
}

// Walk subjects.json and load each referenced lesson.
const subjects = JSON.parse(readFileSync(join(CONTENT, 'subjects.json'), 'utf8')).subjects
for (const subject of subjects) {
  if (!subject.name?.en || !subject.name?.es) fail(subject.id, 'subject missing EN/ES name')
  for (const rel of subject.lessons || []) {
    let lesson
    try {
      lesson = JSON.parse(readFileSync(join(CONTENT, rel), 'utf8'))
    } catch (e) {
      fail(rel, `cannot read/parse: ${e.message}`)
      continue
    }
    checkLesson(lesson, rel)
  }
}

console.log(`\nMathPath content verification`)
console.log(`  lessons:   ${lessonCount}`)
console.log(`  exercises: ${exerciseCount}`)
console.log(`  equivalence/answer checks: ${checkCount}`)

if (problems.length) {
  console.log(`\n${problems.length} problem(s) found:\n`)
  problems.forEach((p) => console.log('  ' + p))
  console.log('')
  process.exit(1)
} else {
  console.log(`\n✓ All content passed verification.\n`)
}
