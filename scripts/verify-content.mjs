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

// Multiple-choice integrity (graded in-app by the `correct` flag, not mathjs).
function checkMcq(ex, where) {
  exerciseCount++
  hasBoth(ex.prompt, 'prompt', where)
  if (!Array.isArray(ex.choices) || ex.choices.length < 2) {
    fail(where, 'mcq needs at least 2 choices')
    return
  }
  const correct = ex.choices.filter((c) => c.correct)
  if (correct.length !== 1) fail(where, `mcq must have exactly one correct choice (has ${correct.length})`)
  ex.choices.forEach((c, i) => {
    hasBoth(c.text, `choice ${i + 1} text`, where)
    hasBoth(c.why, `choice ${i + 1} explanation`, where)
  })
}

// Code-exercise integrity (executed for real by verify-code.py).
function checkCodeExercise(ex, where) {
  exerciseCount++
  hasBoth(ex.prompt, 'prompt', where)
  if (!ex.funcName) fail(where, 'code exercise missing funcName')
  if (!ex.solution || typeof ex.solution !== 'string') fail(where, 'code exercise missing reference solution')
  hasBoth(ex.starter, 'starter', where)
  if (!Array.isArray(ex.tests) || ex.tests.length === 0) {
    fail(where, 'code exercise needs at least one test')
  } else {
    ex.tests.forEach((t, i) => {
      if (!('expected' in t)) fail(where, `test ${i + 1} missing expected`)
      if (!Array.isArray(t.args)) fail(where, `test ${i + 1} args must be an array`)
    })
  }
}

function checkExercise(ex, where) {
  if (ex.answerType === 'mcq') return checkMcq(ex, where)
  if (ex.answerType === 'code') return checkCodeExercise(ex, where)

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

function checkCodeSection(section, where) {
  // The code itself is executed by verify-code.py; here we check structure only.
  hasBoth(section.code, 'code', where)
  if (!Array.isArray(section.lib)) fail(where, 'code section needs a lib array (may be empty)')
  if (section.runnable === true && (section.expectedOutput == null || section.expectedOutput === '')) {
    fail(where, 'runnable code section needs expectedOutput')
  }
  if (typeof section.runnable !== 'boolean') fail(where, 'code section needs a boolean runnable')
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
    else if (section.type === 'code') checkCodeSection(section, where)
    else if (section.type === 'prereq') {
      hasBoth(section.note, 'prereq note', where)
      if (!Array.isArray(section.lessons) || section.lessons.length === 0) {
        fail(where, 'prereq section needs a non-empty lessons array')
      }
    } else if (section.content) hasBoth(section.content, `${section.type} content`, where)
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
