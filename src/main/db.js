import { rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import { ratingFor } from '../shared/learning.js'
import { learnCard, reviewCard, serializeCard } from './review.js'

let db

const DAY = 86400000
// Past solves that get their first review card at once are spread out: at
// least this many come due per day, over about this many days.
const BACKFILL_PER_DAY = 10
const BACKFILL_DAYS = 14

// Schema changes, applied in order and tracked with PRAGMA user_version. Never
// edit a shipped migration; add a new one. Each runs in a transaction.
const MIGRATIONS = [
  // 1 — the original schema (created with IF NOT EXISTS before versioning, so
  // this is a no-op on databases from 0.1.x).
  (d) =>
    d.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS subject_plan (
        subject_id  TEXT PRIMARY KEY,
        start_date  TEXT NOT NULL,   -- ISO date the learner started the subject
        target_days INTEGER NOT NULL -- size of the study window, e.g. 30
      );

      CREATE TABLE IF NOT EXISTS lesson_progress (
        lesson_id    TEXT PRIMARY KEY,
        subject_id   TEXT NOT NULL,
        completed    INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS attempts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        exercise_id TEXT NOT NULL,
        lesson_id   TEXT NOT NULL,
        correct     INTEGER NOT NULL,
        user_answer TEXT,
        created_at  TEXT NOT NULL
      );
    `),

  // 2 — how each attempt went, and a spaced-repetition card per solved
  // exercise (created by syncCards, also for the exercises already solved).
  (d) =>
    d.exec(`
      ALTER TABLE attempts ADD COLUMN used_hint     INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE attempts ADD COLUMN used_solution INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE attempts ADD COLUMN time_ms       INTEGER;
      CREATE INDEX IF NOT EXISTS attempts_lesson   ON attempts(lesson_id);
      CREATE INDEX IF NOT EXISTS attempts_exercise ON attempts(exercise_id);

      CREATE TABLE review_cards (
        exercise_id TEXT PRIMARY KEY,
        lesson_id   TEXT NOT NULL,
        due         TEXT NOT NULL, -- ISO timestamp, copied from card.due for queries
        card        TEXT NOT NULL, -- FSRS card state (JSON)
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX review_cards_due ON review_cards(due);
    `)
]

function insertCard(d, exerciseId, lessonId, card, now) {
  d.prepare(
    `INSERT INTO review_cards (exercise_id, lesson_id, due, card, updated_at)
     VALUES (@exerciseId, @lessonId, @due, @card, @now)
     ON CONFLICT(exercise_id) DO UPDATE SET due = @due, card = @card, updated_at = @now`
  ).run({ exerciseId, lessonId, due: card.due.toISOString(), card: serializeCard(card), now })
}

function migrate(d, dbPath) {
  const from = d.pragma('user_version', { simple: true })
  if (from >= MIGRATIONS.length) return
  // Before changing the schema of a database that already holds progress,
  // keep a consistent copy next to it (mathpath.db.before-v2, …).
  const hasTables = d.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n > 0
  if (dbPath !== ':memory:' && hasTables) {
    const copy = `${dbPath}.before-v${MIGRATIONS.length}`
    rmSync(copy, { force: true })
    d.prepare('VACUUM INTO ?').run(copy)
  }
  MIGRATIONS.slice(from).forEach((m, i) => {
    d.transaction(() => {
      m(d)
      d.pragma(`user_version = ${from + i + 1}`)
    })()
  })
}

/**
 * Gives a review card to every solved exercise that has none: all past solves
 * the first time this version runs, and any solved while running an older
 * version. A card is learned at the first correct attempt (wrong tries before
 * it make it "hard"). Cards already overdue are spread over the coming days
 * instead of all falling due at once.
 */
function syncCards(d, now = new Date()) {
  const missing = d
    .prepare(
      `SELECT a.exercise_id, a.lesson_id, a.created_at,
              (SELECT COUNT(*) FROM attempts b
                WHERE b.exercise_id = a.exercise_id AND b.correct = 0 AND b.id < a.id) AS misses
         FROM attempts a
        WHERE a.correct = 1
          AND a.id = (SELECT MIN(id) FROM attempts c WHERE c.exercise_id = a.exercise_id AND c.correct = 1)
          AND NOT EXISTS (SELECT 1 FROM review_cards r WHERE r.exercise_id = a.exercise_id)
        ORDER BY a.id`
    )
    .all()
  if (!missing.length) return
  const cards = missing.map((s) => {
    const at = new Date(s.created_at)
    const learnedAt = Number.isNaN(at.getTime()) || at > now ? now : at
    return { s, card: learnCard(ratingFor({ correct: true, misses: s.misses }), learnedAt) }
  })
  const overdue = cards.filter(({ card }) => card.due <= now)
  const perDay = Math.max(BACKFILL_PER_DAY, Math.ceil(overdue.length / BACKFILL_DAYS))
  overdue.forEach(({ card }, k) => {
    card.due = new Date(now.getTime() + Math.floor(k / perDay) * DAY)
  })
  d.transaction(() => {
    for (const { s, card } of cards) insertCard(d, s.exercise_id, s.lesson_id, card, now.toISOString())
  })()
}

/**
 * Opens (and creates or migrates) the local SQLite database. In the app this
 * is mathpath.db in the OS user-data folder; tests pass ':memory:'. All
 * learner state — progress, attempts, review cards, study plans, settings —
 * lives here. Lesson *content* is shipped read-only inside the app bundle.
 */
export function initDb(dbPath) {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db, dbPath)
  try {
    syncCards(db)
  } catch (e) {
    // Reviews can catch up on a later start; never block opening the app.
    console.error('review card sync failed', e)
  }

  // Sensible defaults.
  const hasLang = db.prepare('SELECT value FROM settings WHERE key = ?').get('language')
  if (!hasLang) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('language', 'en')
  }
  return db
}

/* ---------- settings ---------- */
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : null
}
export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = @value`
  ).run({ key, value: String(value) })
  return true
}

/* ---------- progress ---------- */
export function getProgress() {
  return db.prepare('SELECT lesson_id, subject_id, completed, completed_at FROM lesson_progress').all()
}
export function setLessonCompleted(lessonId, subjectId, completed) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO lesson_progress (lesson_id, subject_id, completed, completed_at)
     VALUES (@lessonId, @subjectId, @completed, @completedAt)
     ON CONFLICT(lesson_id) DO UPDATE SET
       completed    = @completed,
       completed_at = CASE WHEN @completed = 1 THEN @completedAt ELSE NULL END`
  ).run({
    lessonId,
    subjectId,
    completed: completed ? 1 : 0,
    completedAt: completed ? now : null
  })
  return true
}

/* ---------- attempts ---------- */

/**
 * Records one answer. `schedule` says what it means for spaced repetition:
 *   'learn'  — answered in a lesson: the first solve creates the review card
 *   'review' — first answer in a review session: rates the card
 *   absent   — retries; recorded only
 * Returns the exercise's next review date (ISO) when it has a card, else null.
 */
export function recordAttempt({
  exerciseId,
  lessonId,
  correct,
  userAnswer,
  usedHint = false,
  usedSolution = false,
  timeMs = null,
  misses = 0,
  schedule
}) {
  const now = new Date()
  const iso = now.toISOString()
  return db.transaction(() => {
    db.prepare(
      `INSERT INTO attempts (exercise_id, lesson_id, correct, user_answer, created_at, used_hint, used_solution, time_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(exerciseId, lessonId, correct ? 1 : 0, userAnswer ?? '', iso, usedHint ? 1 : 0, usedSolution ? 1 : 0, timeMs)

    const row = db.prepare('SELECT due, card FROM review_cards WHERE exercise_id = ?').get(exerciseId)
    const rating = ratingFor({ correct, usedHint, usedSolution, misses })
    try {
      if (schedule === 'review' && row) {
        const card = reviewCard(row.card, rating, now)
        insertCard(db, exerciseId, lessonId, card, iso)
        return card.due.toISOString()
      }
      if ((schedule === 'learn' || schedule === 'review') && correct && !row) {
        const card = learnCard(rating, now)
        insertCard(db, exerciseId, lessonId, card, iso)
        return card.due.toISOString()
      }
    } catch (e) {
      // A scheduling problem must not lose the attempt itself.
      console.error('review scheduling failed', e)
    }
    return row ? row.due : null
  })()
}

// Exercise IDs answered correctly at least once in this lesson, so the lesson
// view can restore "solved" state after a reload.
export function getSolvedExercises(lessonId) {
  return db
    .prepare(`SELECT DISTINCT exercise_id FROM attempts WHERE lesson_id = ? AND correct = 1`)
    .all(lessonId)
    .map((r) => r.exercise_id)
}

/**
 * Everything the UI needs for mastery levels, in one query each:
 *   solved — every exercise answered correctly at least once, with `clean`
 *            when one of those answers came without opening the solution
 *   due    — exercises whose review is due by `until` (ISO)
 */
export function getLearningState(until) {
  const solved = db
    .prepare(
      `SELECT exercise_id, lesson_id, MIN(used_solution) = 0 AS clean
         FROM attempts WHERE correct = 1 GROUP BY exercise_id`
    )
    .all()
    .map((r) => ({ ...r, clean: !!r.clean }))
  const due = db.prepare('SELECT exercise_id, lesson_id FROM review_cards WHERE due <= ?').all(until)
  return { solved, due }
}

/** Answers per local calendar day (YYYY-MM-DD) since `since` (ISO), oldest first. */
export function getActivity(since) {
  return db
    .prepare(
      `SELECT date(created_at, 'localtime') AS day, COUNT(*) AS attempts
         FROM attempts WHERE created_at >= ? GROUP BY day ORDER BY day`
    )
    .all(since)
}

/* ---------- reviews ---------- */

// Review queries take the exercise ids the app ships (`known`), so cards of
// exercises removed from the content are kept but never shown or counted.
// Without `known` every card counts.
const SHIPPED = '(@known IS NULL OR exercise_id IN (SELECT value FROM json_each(@known)))'
const knownParam = (known) => (known ? JSON.stringify(known) : null)

/** Cards due by `until` (ISO), most overdue first. */
export function getDueReviews(until, limit = 20, known = null) {
  return db
    .prepare(`SELECT exercise_id, lesson_id, due FROM review_cards WHERE due <= @until AND ${SHIPPED} ORDER BY due LIMIT @limit`)
    .all({ until, limit, known: knownParam(known) })
}

/** How many reviews are due by `until`, how many cards exist, and the next due date after it. */
export function getReviewSummary(until, known = null) {
  const p = { until, known: knownParam(known) }
  const due = db.prepare(`SELECT COUNT(*) AS n FROM review_cards WHERE due <= @until AND ${SHIPPED}`).get(p).n
  const total = db.prepare(`SELECT COUNT(*) AS n FROM review_cards WHERE ${SHIPPED}`).get(p).n
  const next = db.prepare(`SELECT MIN(due) AS d FROM review_cards WHERE due > @until AND ${SHIPPED}`).get(p).d
  return { due, total, nextDue: next || null }
}

/* ---------- study plan ---------- */
export function getPlan(subjectId) {
  return db.prepare('SELECT subject_id, start_date, target_days FROM subject_plan WHERE subject_id = ?').get(subjectId)
}
export function startPlan(subjectId, targetDays) {
  const existing = getPlan(subjectId)
  if (existing) return existing
  const start = new Date().toISOString().slice(0, 10)
  db.prepare(
    'INSERT INTO subject_plan (subject_id, start_date, target_days) VALUES (?, ?, ?)'
  ).run(subjectId, start, targetDays)
  return getPlan(subjectId)
}
export function resetPlan(subjectId, targetDays) {
  const start = new Date().toISOString().slice(0, 10)
  db.prepare(
    `INSERT INTO subject_plan (subject_id, start_date, target_days)
     VALUES (@subjectId, @start, @targetDays)
     ON CONFLICT(subject_id) DO UPDATE SET start_date = @start, target_days = @targetDays`
  ).run({ subjectId, start, targetDays })
  return getPlan(subjectId)
}
