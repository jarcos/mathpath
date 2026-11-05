import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import {
  BackupError,
  checkBackup,
  exportProgress,
  getActivity,
  getDueReviews,
  getLearningState,
  getMissesToday,
  getRecentLessons,
  getReviewSummary,
  getSetting,
  getTodayStudy,
  importProgress,
  initDb,
  progressCounts,
  recordAttempt,
  resetProgress,
  setLessonCompleted,
  setSetting,
  startPlan
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
  assert.equal(db.pragma('user_version', { simple: true }), 4)
  assert.equal(getSetting('language'), 'es')

  // The pre-migration database is kept, untouched, next to it.
  const backup = new Database(`${path}.before-v4`, { readonly: true })
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
  assert.equal(db.pragma('user_version', { simple: true }), 4)
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
  assert.equal(db.pragma('user_version', { simple: true }), 4)

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

test("today's study: lessons completed today (not by placement) and reviews answered today", () => {
  const db = initDb(':memory:')
  setLessonCompleted('l-manual', 's', true, 'manual')
  setLessonCompleted('l-mastery', 's', true, 'mastery')
  setLessonCompleted('l-placed', 's', true, 'placement')
  setLessonCompleted('l-undone', 's', true, 'manual')
  setLessonCompleted('l-undone', 's', false)
  // Completed on another day.
  db.prepare("UPDATE lesson_progress SET completed_at = ? WHERE lesson_id = 'l-mastery'").run(inDays(-3))

  recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: true, schedule: 'learn' }) // learned, not a review
  recordAttempt({ exerciseId: 'e2', lessonId: 'l1', correct: true, schedule: 'learn' })
  recordAttempt({ exerciseId: 'e2', lessonId: 'l1', correct: false, schedule: 'review' }) // a review today

  const today = getTodayStudy()
  assert.deepEqual(today.lessons, ['l-manual'])
  assert.equal(today.reviews, 1)
  // Reviews of exercises the app no longer ships don't count.
  assert.equal(getTodayStudy(['e1', 'e2']).reviews, 1)
  assert.equal(getTodayStudy(['e1']).reviews, 0)
  assert.equal(db.prepare("SELECT source FROM lesson_progress WHERE lesson_id = 'l-undone'").get().source, null)
})

test('activity counts answers per local day', () => {
  const path = legacyDb() // 4 answers, 30 days ago
  initDb(path)
  recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: true, schedule: 'learn' })
  recordAttempt({ exerciseId: 'e1', lessonId: 'l1', correct: true })
  const today = new Date()
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  assert.deepEqual(getActivity(inDays(-1)), [{ day: key, attempts: 2 }])
  assert.equal(getActivity(inDays(-60)).reduce((n, d) => n + d.attempts, 0), 6)
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

test('learning state: a solve is first try only with no wrong try before it', () => {
  const db = initDb(':memory:')
  recordAttempt({ exerciseId: 'first', lessonId: 'l1', correct: true, misses: 0, schedule: 'learn' })
  recordAttempt({ exerciseId: 'second', lessonId: 'l1', correct: false, misses: 0, schedule: 'learn' })
  recordAttempt({ exerciseId: 'second', lessonId: 'l1', correct: true, misses: 1, schedule: 'learn' })
  // An answer from before migration 4 (no misses recorded) gets the benefit of the doubt.
  db.prepare("INSERT INTO attempts (exercise_id, lesson_id, correct, user_answer, created_at) VALUES ('old', 'l1', 1, 'x', ?)").run(
    inDays(-5)
  )
  const solved = Object.fromEntries(getLearningState(inDays(30)).solved.map((r) => [r.exercise_id, [r.clean, r.firstTry]]))
  assert.deepEqual(solved, { first: [true, true], second: [true, false], old: [true, true] })

  // Answering it right again in the lesson doesn't make it first time...
  recordAttempt({ exerciseId: 'second', lessonId: 'l1', correct: true, misses: 0, mode: 'lesson' })
  const again = getLearningState(inDays(30)).solved.find((r) => r.exercise_id === 'second')
  assert.equal(again.firstTry, false)
  // ...answering it right first time in a later review does.
  recordAttempt({ exerciseId: 'second', lessonId: 'l1', correct: true, misses: 0, mode: 'review', schedule: 'review' })
  const reviewed = getLearningState(inDays(30)).solved.find((r) => r.exercise_id === 'second')
  assert.equal(reviewed.firstTry, true)
})

test('a multiple-choice question failed until its answer shows gets a card, to come back soon', () => {
  const db = initDb(':memory:')
  recordAttempt({ exerciseId: 'q', lessonId: 'l1', correct: false, misses: 0, schedule: 'learn' })
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM review_cards').get().n, 0)
  const due = recordAttempt({ exerciseId: 'q', lessonId: 'l1', correct: false, misses: 1, schedule: 'learn', revealed: true })
  assert.ok(due > new Date().toISOString() && due <= inDays(2))
  assert.equal(cardOf(db, 'q').reps, 1)
})

test("today's misses: wrong tries today on a lesson's exercises never answered right", () => {
  const db = initDb(':memory:')
  recordAttempt({ exerciseId: 'q1', lessonId: 'l1', correct: false })
  recordAttempt({ exerciseId: 'q1', lessonId: 'l1', correct: false })
  recordAttempt({ exerciseId: 'q2', lessonId: 'l1', correct: false })
  recordAttempt({ exerciseId: 'q2', lessonId: 'l1', correct: true }) // answered right: not counted
  recordAttempt({ exerciseId: 'q3', lessonId: 'l1', correct: false })
  db.prepare("UPDATE attempts SET created_at = ? WHERE exercise_id = 'q3'").run(inDays(-2)) // another day
  recordAttempt({ exerciseId: 'q4', lessonId: 'l2', correct: false }) // another lesson
  // Misses in a review, an exam or a placement test don't count against the lesson.
  recordAttempt({ exerciseId: 'q5', lessonId: 'l1', correct: false, mode: 'review' })
  recordAttempt({ exerciseId: 'q5', lessonId: 'l1', correct: false, mode: 'placement' })
  recordAttempt({ exerciseId: 'q1', lessonId: 'l1', correct: false, mode: 'lesson' })
  assert.deepEqual(getMissesToday('l1'), { q1: 3 })
})

test('a clean review also credits the lessons it builds on: partly, and only when it went well', () => {
  const db = initDb(':memory:')
  const learn = (id, lessonId) => recordAttempt({ exerciseId: id, lessonId, correct: true, schedule: 'learn' })
  learn('base-soon', 'base')
  learn('base-overdue', 'base')
  learn('base-later', 'base')
  learn('other-soon', 'other')
  learn('adv', 'advanced')
  const setDue = (id, iso) => {
    const card = { ...cardOf(db, id), due: iso }
    db.prepare('UPDATE review_cards SET due = ?, card = ? WHERE exercise_id = ?').run(iso, JSON.stringify(card), id)
  }
  setDue('base-soon', inDays(1))
  setDue('other-soon', inDays(1))
  setDue('base-later', inDays(30))
  setDue('base-overdue', inDays(-1))
  const before = (id) => cardOf(db, id)
  const overdue = before('base-overdue')
  const soon = before('base-soon')
  const later = before('base-later')
  const other = before('other-soon')

  // A review after a hint (Hard) gives no credit...
  recordAttempt({ exerciseId: 'adv', lessonId: 'advanced', correct: true, usedHint: true, schedule: 'review', buildsOn: ['base'] })
  assert.deepEqual(cardOf(db, 'base-soon'), soon)
  // ...a clean one (Good) moves a base card due soon later, keeping its memory state.
  recordAttempt({ exerciseId: 'adv', lessonId: 'advanced', correct: true, schedule: 'review', buildsOn: ['base'] })
  const credited = cardOf(db, 'base-soon')
  assert.ok(credited.due > soon.due)
  assert.deepEqual({ ...credited, due: soon.due }, soon)
  assert.equal(db.prepare("SELECT due FROM review_cards WHERE exercise_id = 'base-soon'").get().due, credited.due)
  // Cards already due (left for their own review), beyond the window, or of
  // lessons it doesn't build on, are untouched.
  assert.deepEqual(cardOf(db, 'base-overdue'), overdue)
  assert.deepEqual(cardOf(db, 'base-later'), later)
  assert.deepEqual(cardOf(db, 'other-soon'), other)
})

// Some progress of every kind: settings, a plan, lessons, answers and cards.
function someProgress() {
  const db = initDb(':memory:')
  setSetting('theme', 'light')
  setSetting('zoom', 1.25)
  setSetting('studyGoal', JSON.stringify({ subjectId: 'calculus', minutes: 30 }))
  startPlan('calculus', 30)
  setLessonCompleted('l1', 'calculus', true)
  setLessonCompleted('l2', 'calculus', true, 'placement')
  recordAttempt({ exerciseId: 'a', lessonId: 'l1', correct: false, userAnswer: '3', mode: 'lesson', schedule: 'learn' })
  recordAttempt({ exerciseId: 'a', lessonId: 'l1', correct: true, userAnswer: '2', misses: 1, mode: 'lesson', schedule: 'learn' })
  recordAttempt({ exerciseId: 'b', lessonId: 'l1', correct: true, userAnswer: 'x^2', mode: 'lesson', schedule: 'learn' })
  recordAttempt({ exerciseId: 'b', lessonId: 'l1', correct: true, userAnswer: 'x^2', mode: 'review', schedule: 'review' })
  return db
}
const rowsOf = (backup) => JSON.parse(JSON.stringify(backup.tables))
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof BackupError && e.code === code)

test('a backup holds every table and restores it exactly, replacing what was there', () => {
  someProgress()
  const backup = exportProgress('0.5.0')
  assert.equal(backup.app, 'MathPath')
  assert.equal(backup.schema, 4)
  assert.equal(backup.appVersion, '0.5.0')
  assert.deepEqual(progressCounts(), { lessons: 2, answers: 4, reviews: 2 })
  assert.deepEqual(checkBackup(backup), {
    exportedAt: backup.exportedAt,
    appVersion: '0.5.0',
    lessons: 2,
    answers: 4,
    reviews: 2
  })

  // Into a database with other progress: the backup replaces it all.
  initDb(':memory:')
  setSetting('language', 'es')
  recordAttempt({ exerciseId: 'other', lessonId: 'l9', correct: true, schedule: 'learn' })
  importProgress(JSON.parse(JSON.stringify(backup)))
  assert.deepEqual(rowsOf(exportProgress('0.5.0')), rowsOf(backup))
  assert.equal(getSetting('language'), 'en')
  assert.equal(getSetting('zoom'), '1.25')
  // New answers carry on after the restored ones.
  recordAttempt({ exerciseId: 'c', lessonId: 'l1', correct: true, schedule: 'learn' })
  assert.equal(progressCounts().answers, 5)
})

test('a backup from an older schema loads with the defaults of the newer columns', () => {
  someProgress()
  const backup = exportProgress()
  backup.schema = 3
  for (const r of backup.tables.attempts) {
    delete r.misses
    delete r.mode
  }
  initDb(':memory:')
  importProgress(backup)
  const rows = exportProgress().tables.attempts
  assert.equal(rows.length, 4)
  assert.ok(rows.every((r) => r.misses === null && r.mode === null))
})

test('a damaged or newer backup is refused and changes nothing', () => {
  someProgress()
  const good = exportProgress()
  const before = rowsOf(good)
  const broken = (change) => {
    const b = JSON.parse(JSON.stringify(good))
    change(b)
    return b
  }
  throwsCode(() => importProgress(null), 'invalid')
  throwsCode(() => importProgress([]), 'invalid')
  throwsCode(() => importProgress(broken((b) => (b.app = 'Other'))), 'invalid')
  throwsCode(() => importProgress(broken((b) => delete b.tables.attempts)), 'invalid')
  throwsCode(() => importProgress(broken((b) => (b.tables.attempts[0] = 'x'))), 'invalid')
  throwsCode(() => importProgress(broken((b) => (b.tables.review_cards[0].card = '{'))), 'invalid')
  throwsCode(() => importProgress(broken((b) => (b.tables.attempts[0].correct = true))), 'invalid')
  throwsCode(() => importProgress(broken((b) => (b.tables.attempts[0].correct = '1'))), 'invalid')
  throwsCode(() => importProgress(broken((b) => (b.tables.subject_plan[0].target_days = 'abc'))), 'invalid')
  // Cards the scheduler couldn't read would break the reviews later.
  throwsCode(() => importProgress(broken((b) => (b.tables.review_cards[0].card = '{}'))), 'invalid')
  const badDue = (b) => {
    const card = JSON.parse(b.tables.review_cards[0].card)
    b.tables.review_cards[0].card = JSON.stringify({ ...card, due: 'soon' })
  }
  throwsCode(() => importProgress(broken(badDue)), 'invalid')
  // These fail half-way through the restore, after the old rows are deleted.
  throwsCode(() => importProgress(broken((b) => delete b.tables.attempts[3].created_at)), 'invalid')
  throwsCode(() => importProgress(broken((b) => (b.tables.attempts[3].id = b.tables.attempts[0].id))), 'invalid')
  throwsCode(() => importProgress(broken((b) => (b.tables.attempts[3] = { unknown: 1 }))), 'invalid')
  throwsCode(() => importProgress(broken((b) => (b.schema = 5))), 'newer')
  throwsCode(() => importProgress(broken((b) => (b.format = 2))), 'newer')
  assert.deepEqual(rowsOf(exportProgress()), before)
})

test('a reset deletes the progress and keeps the preferences', () => {
  const db = someProgress()
  setSetting('autoUpdate', '1')
  resetProgress()
  assert.deepEqual(progressCounts(), { lessons: 0, answers: 0, reviews: 0 })
  for (const t of ['subject_plan', 'lesson_progress']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0)
  }
  assert.equal(getSetting('studyGoal'), null)
  assert.deepEqual(
    [getSetting('language'), getSetting('theme'), getSetting('zoom'), getSetting('autoUpdate')],
    ['en', 'light', '1.25', '1']
  )
})

test('an import keeps automatic updates as they are on this computer', () => {
  someProgress()
  setSetting('autoUpdate', '0')
  const backup = exportProgress()
  initDb(':memory:')
  setSetting('autoUpdate', '1')
  importProgress(backup)
  assert.equal(getSetting('autoUpdate'), '1')
  assert.equal(getSetting('theme'), 'light')
  initDb(':memory:')
  importProgress(backup)
  assert.equal(getSetting('autoUpdate'), null)
})

test('recent lessons: answers given in a lesson and lessons completed by hand, latest first', () => {
  const db = initDb(legacyDb()) // answers with no mode, 30 days ago: l1, then l2
  assert.deepEqual(getRecentLessons(), ['l2', 'l1'])
  const add = db.prepare('INSERT INTO attempts (exercise_id, lesson_id, correct, created_at, mode) VALUES (?, ?, 1, ?, ?)')
  add.run('r', 'l-review', inDays(-0.001), 'review')
  add.run('p', 'l-placement', inDays(-0.001), 'placement')
  add.run('a', 'l3', inDays(-0.002), 'lesson')
  add.run('b', 'l1', inDays(-0.003), 'lesson')
  const done = db.prepare(
    "INSERT INTO lesson_progress (lesson_id, subject_id, completed, completed_at, source) VALUES (?, 's', ?, ?, ?)"
  )
  done.run('l-by-hand', 1, inDays(-0.0005), 'manual')
  done.run('l-tested-out', 1, inDays(-0.0001), 'placement')
  done.run('l-mastered', 1, inDays(-0.0001), 'mastery')
  done.run('l-unmarked', 0, null, null)
  assert.deepEqual(getRecentLessons(), ['l-by-hand', 'l3', 'l1', 'l2'])
  assert.deepEqual(getRecentLessons(2), ['l-by-hand', 'l3'])
})
