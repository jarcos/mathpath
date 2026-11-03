import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import {
  getDueReviews,
  getLearningState,
  getReviewSummary,
  getSetting,
  initDb,
  recordAttempt
} from '../src/main/db.js'

const DAY = 86400000
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString()
const cardOf = (db, id) => JSON.parse(db.prepare('SELECT card FROM review_cards WHERE exercise_id = ?').get(id).card)

// A database as MathPath 0.1.x left it: no user_version, the original tables.
// `solves` adds that many more exercises solved first time, 30 days ago.
function legacyDb({ solves = 0 } = {}) {
  const path = join(mkdtempSync(join(tmpdir(), 'mathpath-test-')), 'mathpath.db')
  const d = new Database(path)
  d.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE subject_plan (subject_id TEXT PRIMARY KEY, start_date TEXT NOT NULL, target_days INTEGER NOT NULL);
    CREATE TABLE lesson_progress (lesson_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, completed_at TEXT);
    CREATE TABLE attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id TEXT NOT NULL, lesson_id TEXT NOT NULL, correct INTEGER NOT NULL, user_answer TEXT, created_at TEXT NOT NULL);
    INSERT INTO settings VALUES ('language', 'es');
  `)
  const add = d.prepare('INSERT INTO attempts (exercise_id, lesson_id, correct, user_answer, created_at) VALUES (?, ?, ?, ?, ?)')
  const t0 = Date.now() - 30 * DAY
  add.run('ex-first-try', 'l1', 1, '2', new Date(t0).toISOString())
  add.run('ex-after-miss', 'l1', 0, '3', new Date(t0 + 1000).toISOString())
  add.run('ex-after-miss', 'l1', 1, '2', new Date(t0 + 2000).toISOString())
  add.run('ex-never-solved', 'l2', 0, 'x', new Date(t0 + 3000).toISOString())
  for (let i = 0; i < solves; i++) add.run(`bulk-${i}`, 'l3', 1, '1', new Date(t0 + 4000 + i).toISOString())
  d.close()
  return path
}

test('migrates a 0.1.x database, keeping data and backfilling review cards', () => {
  const path = legacyDb()
  const db = initDb(path)
  assert.equal(db.pragma('user_version', { simple: true }), 2)
  assert.equal(getSetting('language'), 'es')

  // The pre-migration database is kept, untouched, next to it.
  const backup = new Database(`${path}.before-v2`, { readonly: true })
  assert.equal(backup.pragma('user_version', { simple: true }), 0)
  assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 4)
  backup.close()

  const cards = db.prepare('SELECT exercise_id FROM review_cards ORDER BY exercise_id').all()
  assert.deepEqual(cards.map((c) => c.exercise_id), ['ex-after-miss', 'ex-first-try'])
  // Learned 30 days ago and never reviewed: both are due now.
  assert.equal(getReviewSummary(new Date().toISOString()).due, 2)
  // A miss before the first solve rates it "hard": a less stable memory.
  const firstTry = cardOf(db, 'ex-first-try')
  const afterMiss = cardOf(db, 'ex-after-miss')
  assert.ok(afterMiss.stability < firstTry.stability)

  // Old attempts count as solved without the solution.
  const { solved } = getLearningState(new Date().toISOString())
  assert.deepEqual(
    solved.map((s) => [s.exercise_id, s.clean]).sort(),
    [['ex-after-miss', true], ['ex-first-try', true]]
  )
})

test('migrating again is a no-op, and 0.1.x code can still write attempts', () => {
  const path = legacyDb()
  initDb(path)
  const db = initDb(path)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_cards').get().n, 2)
  // What 0.1.5 does if the learner goes back to it.
  db.prepare(
    'INSERT INTO attempts (exercise_id, lesson_id, correct, user_answer, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run('ex-old-app', 'l1', 1, '1', new Date().toISOString())
  const row = db.prepare('SELECT used_hint, used_solution, time_ms FROM attempts WHERE exercise_id = ?').get('ex-old-app')
  assert.deepEqual({ ...row }, { used_hint: 0, used_solution: 0, time_ms: null })
})

test('a big backlog of past solves is spread out, not all due on day one', () => {
  initDb(legacyDb({ solves: 25 }))
  // 27 overdue cards, at least 10 a day: 10 today, 10 tomorrow, 7 the day after.
  const soon = (days) => new Date(Date.now() + days * DAY + 60000).toISOString()
  assert.equal(getReviewSummary(soon(0)).due, 10)
  assert.equal(getReviewSummary(soon(1)).due, 20)
  assert.equal(getReviewSummary(soon(2)).due, 27)
  // Oldest solves come first.
  assert.deepEqual(getDueReviews(soon(0), 2).map((r) => r.exercise_id), ['ex-first-try', 'ex-after-miss'])
})

test('solves made while running an older version get their card on the next start', () => {
  const path = legacyDb()
  initDb(path)
  // MathPath 0.1.5 writing to the migrated database: an attempt, no card.
  const old = new Database(path)
  old.prepare(
    'INSERT INTO attempts (exercise_id, lesson_id, correct, user_answer, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run('ex-solved-in-0.1.5', 'l2', 1, '7', new Date().toISOString())
  old.close()

  const db = initDb(path)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_cards').get().n, 3)
  assert.ok(cardOf(db, 'ex-solved-in-0.1.5').due > new Date().toISOString())
})

test('a corrupt attempt date does not stop the app from opening', () => {
  const path = legacyDb()
  const d = new Database(path)
  d.prepare('UPDATE attempts SET created_at = ? WHERE exercise_id = ?').run('not a date', 'ex-first-try')
  d.close()
  const db = initDb(path)
  assert.equal(db.pragma('user_version', { simple: true }), 2)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_cards').get().n, 2)
})

test('reviews of exercises no longer in the content are not shown or counted', () => {
  initDb(':memory:')
  recordAttempt({ exerciseId: 'kept', lessonId: 'l1', correct: true, schedule: 'learn' })
  recordAttempt({ exerciseId: 'removed', lessonId: 'l1', correct: true, schedule: 'learn' })
  const later = inDays(30)
  assert.deepEqual(getDueReviews(later, 20, ['kept', 'other']).map((r) => r.exercise_id), ['kept'])
  assert.deepEqual(
    { ...getReviewSummary(later, ['kept']), nextDue: null },
    { due: 1, total: 1, nextDue: null }
  )
  // Without the list, every card counts.
  assert.equal(getReviewSummary(later).due, 2)
})

test('a first solve in a lesson creates a card; retries and re-solves do not change it', () => {
  const db = initDb(':memory:')
  assert.equal(db.pragma('user_version', { simple: true }), 2)

  recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: false, userAnswer: '1', schedule: 'learn' })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_cards').get().n, 0)

  const due = recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: true, userAnswer: '2', misses: 1, schedule: 'learn' })
  assert.ok(due > new Date().toISOString())
  const card = cardOf(db, 'e1')
  assert.equal(card.reps, 1)

  // Solving it again in the lesson leaves the schedule alone.
  assert.equal(recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: true, schedule: 'learn' }), due)
  assert.deepEqual(cardOf(db, 'e1'), card)

  // Nothing is due today; everything is due within a couple of weeks.
  assert.equal(getDueReviews(new Date().toISOString()).length, 0)
  assert.deepEqual(getDueReviews(inDays(14)).map((r) => r.exercise_id), ['e1'])
  assert.deepEqual(getReviewSummary(new Date().toISOString()), { due: 0, total: 1, nextDue: due })
})

test('a review rates the card: a wrong answer is a lapse', () => {
  const db = initDb(':memory:')
  recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: true, schedule: 'learn' })
  const learned = cardOf(db, 'e1')

  recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: false, userAnswer: '0', schedule: 'review' })
  const reviewed = cardOf(db, 'e1')
  assert.equal(reviewed.reps, 2)
  assert.equal(reviewed.lapses, 1)
  assert.ok(reviewed.stability < learned.stability)

  // Retrying after the first answer is recorded but doesn't re-rate the card.
  recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: true, userAnswer: '2' })
  assert.deepEqual(cardOf(db, 'e1'), reviewed)
})

test('learning state: solves after opening the solution are not clean', () => {
  initDb(':memory:')
  recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: true, schedule: 'learn' })
  recordAttempt({ exerciseId: 'e2', lessonId: 'l1', correct: true, usedSolution: true, schedule: 'learn' })
  recordAttempt({ exerciseId: 'e3', lessonId: 'l2', correct: true, usedHint: true, schedule: 'learn' })
  recordAttempt({ exerciseId: 'e4', lessonId: 'l2', correct: false, schedule: 'learn' })

  const { solved, due } = getLearningState(inDays(30))
  assert.deepEqual(
    solved.map((s) => [s.exercise_id, s.lesson_id, s.clean]).sort(),
    [['e1', 'l1', true], ['e2', 'l1', false], ['e3', 'l2', true]]
  )
  assert.deepEqual(due.map((d) => d.exercise_id).sort(), ['e1', 'e2', 'e3'])
})
