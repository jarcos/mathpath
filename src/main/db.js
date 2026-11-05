import { rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import { RATING, ratingFor } from '../shared/learning.js'
import { IMPLICIT_WINDOW_DAYS, implicitReview, isStoredCard, learnCard, reviewCard, serializeCard } from './review.js'

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
    `),

  // 3 — how a lesson got completed: 'manual', 'mastery' or 'placement' (NULL
  // for completions from before this migration).
  (d) => d.exec('ALTER TABLE lesson_progress ADD COLUMN source TEXT;'),

  // 4 — wrong tries before each answer in its session, and where it was given
  // ('lesson', 'review' — also exams — or 'placement'); NULL before this
  // migration. A guessable answer (multiple choice, yes/no) counts towards
  // mastery only when right first time.
  (d) =>
    d.exec(`
      ALTER TABLE attempts ADD COLUMN misses INTEGER;
      ALTER TABLE attempts ADD COLUMN mode   TEXT;
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
const LESSON_SOURCES = ['manual', 'mastery', 'placement']

export function setLessonCompleted(lessonId, subjectId, completed, source = 'manual') {
  const now = new Date().toISOString()
  if (!LESSON_SOURCES.includes(source)) source = 'manual'
  db.prepare(
    `INSERT INTO lesson_progress (lesson_id, subject_id, completed, completed_at, source)
     VALUES (@lessonId, @subjectId, @completed, @completedAt, @source)
     ON CONFLICT(lesson_id) DO UPDATE SET
       completed    = @completed,
       completed_at = CASE WHEN @completed = 1 THEN @completedAt ELSE NULL END,
       source       = CASE WHEN @completed = 1 THEN @source ELSE NULL END`
  ).run({
    lessonId,
    subjectId,
    completed: completed ? 1 : 0,
    completedAt: completed ? now : null,
    source: completed ? source : null
  })
  return true
}

/**
 * What the learner has studied today (local day): lessons completed today,
 * except by a placement test, and how many reviews were answered today (of
 * the `known` exercise ids, when given; see SHIPPED).
 */
export function getTodayStudy(known) {
  const lessons = db
    .prepare(
      `SELECT lesson_id FROM lesson_progress
        WHERE completed = 1 AND (source IS NULL OR source != 'placement')
          AND date(completed_at, 'localtime') = date('now', 'localtime')`
    )
    .all()
    .map((r) => r.lesson_id)
  const reviews = db
    .prepare(
      `SELECT COUNT(*) AS n FROM review_cards
        WHERE json_extract(card, '$.reps') >= 2
          AND date(json_extract(card, '$.last_review'), 'localtime') = date('now', 'localtime')
          AND ${SHIPPED}`
    )
    .get({ known: knownParam(known) }).n
  return { lessons, reviews }
}

/* ---------- attempts ---------- */

/**
 * Records one answer. `schedule` says what it means for spaced repetition:
 *   'learn'  — answered in a lesson: the first solve creates the review card
 *              (so does a multiple-choice question failed until its answer
 *              is `revealed`, rated Again so it comes back soon)
 *   'review' — first answer in a review session: rates the card; if it went
 *              well, the lessons it `buildsOn` get implicit credit
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
  schedule,
  mode = null,
  revealed = false,
  buildsOn = []
}) {
  const now = new Date()
  const iso = now.toISOString()
  return db.transaction(() => {
    db.prepare(
      `INSERT INTO attempts (exercise_id, lesson_id, correct, user_answer, created_at, used_hint, used_solution, time_ms, misses, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      exerciseId,
      lessonId,
      correct ? 1 : 0,
      userAnswer ?? '',
      iso,
      usedHint ? 1 : 0,
      usedSolution ? 1 : 0,
      timeMs,
      Number.isInteger(misses) && misses >= 0 ? misses : null,
      ATTEMPT_MODES.includes(mode) ? mode : null
    )

    const row = db.prepare('SELECT due, card FROM review_cards WHERE exercise_id = ?').get(exerciseId)
    const rating = ratingFor({ correct, usedHint, usedSolution, misses })
    try {
      if (schedule === 'review' && row) {
        const card = reviewCard(row.card, rating, now)
        insertCard(db, exerciseId, lessonId, card, iso)
        if (rating === RATING.good) {
          try {
            creditPrereqs(buildsOn, now)
          } catch (e) {
            console.error('implicit review credit failed', e)
          }
        }
        return card.due.toISOString()
      }
      if ((schedule === 'learn' || schedule === 'review') && (correct || revealed) && !row) {
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

const ATTEMPT_MODES = ['lesson', 'review', 'placement']

// Implicit repetition (see review.js): the cards of the lessons a clean review
// builds on that fall due within the window move partly later.
function creditPrereqs(lessonIds, now) {
  const ids = Array.isArray(lessonIds) ? lessonIds.filter((id) => typeof id === 'string').slice(0, 50) : []
  if (!ids.length) return
  const until = new Date(now.getTime() + IMPLICIT_WINDOW_DAYS * DAY).toISOString()
  const rows = db
    .prepare(
      `SELECT exercise_id, lesson_id, card FROM review_cards
        WHERE lesson_id IN (SELECT value FROM json_each(?)) AND due <= ?`
    )
    .all(JSON.stringify(ids), until)
  for (const r of rows) {
    const card = implicitReview(r.card, now)
    if (card) insertCard(db, r.exercise_id, r.lesson_id, card, now.toISOString())
  }
}

/**
 * Wrong answers given today, in the lesson itself, to the exercises of a lesson
 * that were never answered right, so a multiple-choice question locked after
 * its last try stays locked when the lesson is reopened the same day. (Misses
 * in reviews, exams or placement tests don't count against the lesson.)
 */
export function getMissesToday(lessonId) {
  const rows = db
    .prepare(
      `SELECT exercise_id, COUNT(*) AS n FROM attempts
        WHERE lesson_id = @lessonId AND correct = 0 AND (mode IS NULL OR mode = 'lesson')
          AND date(created_at, 'localtime') = date('now', 'localtime')
          AND exercise_id NOT IN (SELECT exercise_id FROM attempts WHERE lesson_id = @lessonId AND correct = 1)
        GROUP BY exercise_id`
    )
    .all({ lessonId })
  return Object.fromEntries(rows.map((r) => [r.exercise_id, r.n]))
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
 *            when one of those answers came without opening the solution,
 *            and `firstTry` when it was solved right first time (its first
 *            right answer had no wrong try or solution before it) or has been
 *            since in a review or exam. Answers from before migration 4 get
 *            the benefit of the doubt.
 *   due    — exercises whose review is due by `until` (ISO)
 */
export function getLearningState(until) {
  const solved = db
    .prepare(
      `SELECT exercise_id, lesson_id, MIN(used_solution) = 0 AS clean,
              MAX(used_solution = 0 AND (misses IS NULL OR misses = 0) AND (id = first_id OR mode = 'review')) AS first_try
         FROM (SELECT *, MIN(id) OVER (PARTITION BY exercise_id) AS first_id FROM attempts WHERE correct = 1)
        GROUP BY exercise_id`
    )
    .all()
    .map(({ first_try: firstTry, ...r }) => ({ ...r, clean: !!r.clean, firstTry: !!firstTry }))
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

/**
 * The lessons the learner worked on last, latest first: answers given in a
 * lesson (reviews, exams and placement tests don't count) and lessons marked
 * completed by hand. Answers from before migration 4 have no mode and count.
 */
export function getRecentLessons(limit = 10) {
  return db
    .prepare(
      `SELECT lesson_id, MAX(at) AS at FROM (
         SELECT lesson_id, created_at AS at FROM attempts WHERE mode IS NULL OR mode = 'lesson'
         UNION ALL
         SELECT lesson_id, completed_at AS at FROM lesson_progress
          WHERE completed = 1 AND source = 'manual' AND completed_at IS NOT NULL
       ) GROUP BY lesson_id ORDER BY at DESC, lesson_id LIMIT ?`
    )
    .all(Math.max(1, Math.min(50, Number(limit) || 10)))
    .map((r) => r.lesson_id)
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

/* ---------- backup ---------- */

// What a backup holds, in the order it is restored. Format 1 files come from
// schema 4 and later.
const BACKUP_TABLES = ['settings', 'subject_plan', 'lesson_progress', 'attempts', 'review_cards']
export const BACKUP_FORMAT = 1
// Settings that are preferences, not progress: a reset keeps them.
const PREFERENCES = ['language', 'theme', 'autoUpdate', 'zoom']
// Settings that belong to this computer: an import leaves them as they are.
// (Automatic updates are the learner's consent to go online from here.)
const LOCAL_SETTINGS = ['autoUpdate']

export class BackupError extends Error {
  // code: 'invalid' (not a MathPath backup, or damaged) or 'newer' (made by a
  // newer MathPath, whose data this version may not understand)
  constructor(code) {
    super(`backup ${code}`)
    this.code = code
  }
}

const isRow = (r) => r !== null && typeof r === 'object' && !Array.isArray(r)
// A value fits a column of this declared type: a number, not text, in an
// INTEGER column, and so on (NOT NULL is left to SQLite).
const fits = (type, v) =>
  v === null ||
  (type === 'INTEGER'
    ? Number.isFinite(v)
    : type === 'TEXT'
      ? typeof v === 'string'
      : typeof v === 'string' || Number.isFinite(v))
const isCardRow = (r) => typeof r.card === 'string' && isStoredCard(r.card) && !Number.isNaN(Date.parse(r.due))
const columnsOf = (table) => db.pragma(`table_info(${table})`)
// The names of the table `columns` a backup row has; null if one doesn't fit.
function knownCells(columns, row) {
  const cols = columns.filter((c) => row[c.name] !== undefined)
  return cols.length && cols.every((c) => fits(c.type, row[c.name])) ? cols.map((c) => c.name) : null
}

const countsOf = (tables) => ({
  lessons: tables.lesson_progress.filter((r) => Number(r.completed) === 1).length,
  answers: tables.attempts.length,
  reviews: tables.review_cards.length
})

/** Lessons completed, answers given and review cards, as a backup would count them. */
export function progressCounts() {
  const n = (sql) => db.prepare(sql).get().n
  return {
    lessons: n('SELECT COUNT(*) AS n FROM lesson_progress WHERE completed = 1'),
    answers: n('SELECT COUNT(*) AS n FROM attempts'),
    reviews: n('SELECT COUNT(*) AS n FROM review_cards')
  }
}

/** All progress and settings as plain rows, to save as a JSON file. */
export function exportProgress(appVersion = null) {
  return {
    app: 'MathPath',
    format: BACKUP_FORMAT,
    schema: db.pragma('user_version', { simple: true }),
    appVersion,
    exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(BACKUP_TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]))
  }
}

/**
 * Checks a parsed backup file and says what it holds: when and with which
 * version it was made, and its counts. Throws a BackupError.
 */
export function checkBackup(data) {
  if (!isRow(data) || data.app !== 'MathPath') throw new BackupError('invalid')
  if (data.format > BACKUP_FORMAT || data.schema > MIGRATIONS.length) throw new BackupError('newer')
  if (data.format !== BACKUP_FORMAT || !Number.isInteger(data.schema) || !isRow(data.tables)) {
    throw new BackupError('invalid')
  }
  for (const t of BACKUP_TABLES) {
    const rows = data.tables[t]
    const columns = columnsOf(t)
    if (!Array.isArray(rows) || !rows.every((r) => isRow(r) && knownCells(columns, r))) {
      throw new BackupError('invalid')
    }
  }
  // A card the scheduler can't read would break the reviews later.
  if (!data.tables.review_cards.every(isCardRow)) throw new BackupError('invalid')
  return {
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
    appVersion: typeof data.appVersion === 'string' ? data.appVersion : null,
    ...countsOf(data.tables)
  }
}

/**
 * Replaces all progress and settings with a backup's (except LOCAL_SETTINGS),
 * in one transaction: if any row is refused, nothing changes. Only the
 * columns this version knows are read, so a backup from an older schema gets
 * the defaults of newer columns. Throws a BackupError.
 */
export function importProgress(data) {
  checkBackup(data)
  const inserts = new Map()
  const insert = (table, cols) => {
    const key = `${table}(${cols})`
    if (!inserts.has(key)) {
      inserts.set(key, db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`))
    }
    return inserts.get(key)
  }
  const local = JSON.stringify(LOCAL_SETTINGS)
  try {
    db.transaction(() => {
      for (const t of BACKUP_TABLES) {
        if (t === 'settings') db.prepare('DELETE FROM settings WHERE key NOT IN (SELECT value FROM json_each(?))').run(local)
        else db.prepare(`DELETE FROM ${t}`).run()
      }
      for (const t of BACKUP_TABLES) {
        const columns = columnsOf(t)
        for (const row of data.tables[t]) {
          if (t === 'settings' && LOCAL_SETTINGS.includes(row.key)) continue
          const cols = knownCells(columns, row)
          insert(t, cols).run(cols.map((c) => row[c]))
        }
      }
    })()
  } catch (e) {
    // A missing required field, a duplicate id…: the backup is damaged.
    if (e instanceof BackupError) throw e
    throw new BackupError('invalid')
  }
  try {
    syncCards(db)
  } catch (e) {
    console.error('review card sync failed', e)
  }
}

/**
 * Deletes all progress — answers, completed lessons, review cards, study
 * plans and the study goal — and keeps the preferences.
 */
export function resetProgress() {
  db.transaction(() => {
    for (const t of ['attempts', 'lesson_progress', 'review_cards', 'subject_plan']) db.prepare(`DELETE FROM ${t}`).run()
    db.prepare('DELETE FROM settings WHERE key NOT IN (SELECT value FROM json_each(?))').run(JSON.stringify(PREFERENCES))
  })()
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
