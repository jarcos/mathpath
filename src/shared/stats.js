/**
 * The statistics page's numbers (pure, shared by the renderer and the tests).
 *
 * `totals`: per-lesson rows from the database ({ lesson_id, answers, correct,
 * time_ms }); `solved`: ids of exercises solved at least once; `completed`:
 * ids of completed lessons.
 */
import { dayKey } from './planner.js'

const byLesson = (totals) => new Map(totals.map((r) => [r.lesson_id, r]))

/** Per available subject: lessons, exercises, answers, right ones and time. */
export function subjectStats(subjects, totals, solved, completed) {
  const rows = byLesson(totals)
  return subjects
    .filter((s) => s.status === 'available' && s.lessonObjects.length)
    .map((subject) => {
      const r = { subject, lessons: 0, done: 0, exercises: 0, solved: 0, answers: 0, correct: 0, timeMs: 0 }
      for (const lesson of subject.lessonObjects) {
        r.lessons++
        if (completed.has(lesson.id)) r.done++
        for (const e of lesson.exercises || []) {
          r.exercises++
          if (solved.has(e.id)) r.solved++
        }
        const t = rows.get(lesson.id)
        if (t) {
          r.answers += t.answers
          r.correct += t.correct || 0
          r.timeMs += t.time_ms || 0
        }
      }
      return r
    })
}

/** Right answers as a share of answers, or null with none. */
export const accuracy = (r) => (r.answers ? r.correct / r.answers : null)

/**
 * Lessons practised enough (`min` answers) whose answers are right less than
 * `below` of the time, the weakest first.
 */
export function weakLessons(subjects, totals, { min = 4, below = 0.6, limit = 8 } = {}) {
  const rows = byLesson(totals)
  const out = []
  for (const subject of subjects) {
    for (const lesson of subject.lessonObjects || []) {
      const t = rows.get(lesson.id)
      if (!t || t.answers < min) continue
      const share = (t.correct || 0) / t.answers
      if (share < below) out.push({ lesson, subject, answers: t.answers, accuracy: share })
    }
  }
  return out.sort((a, b) => a.accuracy - b.accuracy || b.answers - a.answers).slice(0, limit)
}

/** The longest run of consecutive days (YYYY-MM-DD local days) with activity. */
export function longestStreak(activeDays) {
  const days = [...activeDays].sort()
  let best = 0
  let run = 0
  let prev = null
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d, 12)
    if (prev) {
      const next = new Date(prev)
      next.setDate(next.getDate() + 1)
      run = dayKey(next) === key ? run + 1 : 1
    } else {
      run = 1
    }
    best = Math.max(best, run)
    prev = date
  }
  return best
}

/**
 * The next `days` local days, from today, each with the reviews due then
 * (`rows`: [{ day, reviews }], the overdue ones already counted today).
 */
export function forecastDays(rows, days = 14, today = new Date()) {
  const due = new Map(rows.map((r) => [r.day, r.reviews]))
  const out = []
  const d = new Date(today)
  d.setHours(12, 0, 0, 0)
  for (let i = 0; i < days; i++) {
    const key = dayKey(d)
    out.push({ day: key, reviews: due.get(key) || 0 })
    d.setDate(d.getDate() + 1)
  }
  return out
}
