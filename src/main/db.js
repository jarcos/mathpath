import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'

let db

/**
 * Opens (and lazily creates) the local SQLite database in the OS user-data
 * folder. All learner state — progress, attempts, study plans, settings —
 * lives here. Lesson *content* is shipped read-only inside the app bundle.
 */
export function initDb() {
  const dbPath = join(app.getPath('userData'), 'mathpath.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
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
  `)

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
export function recordAttempt({ exerciseId, lessonId, correct, userAnswer }) {
  db.prepare(
    `INSERT INTO attempts (exercise_id, lesson_id, correct, user_answer, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(exerciseId, lessonId, correct ? 1 : 0, userAnswer ?? '', new Date().toISOString())
  return true
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
