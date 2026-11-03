import { masteryLevel } from '@shared/learning.js'

// A lesson's progress from the learning state in AppContext.
export function lessonStats(lesson, learning, completed) {
  let solved = 0
  let clean = 0
  let due = 0
  for (const { id } of lesson.exercises) {
    const s = learning.solved.get(id)
    if (s) {
      solved++
      if (s.clean) clean++
    }
    if (learning.due.has(id)) due++
  }
  const total = lesson.exercises.length
  const done = completed.has(lesson.id)
  return {
    total,
    solved,
    clean,
    due,
    level: masteryLevel({ total, solved, clean, due, completed: done })
  }
}

const DAY = 86400000

// "tomorrow", "in 3 days", "mañana"… for a review date (ISO).
export function relativeDay(iso, lang) {
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(new Date(iso)) - day(new Date())) / DAY)
  return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(days, 'day')
}
