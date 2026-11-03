// Cross-subject study planner: spreads the lessons still needed for a goal
// over the coming days by their estimated minutes, leaving room for reviews.
// Pure functions, covered by test/planner.test.js.

// Rough cost of one review, and the share of each future day kept for reviews
// (the real count is only known for today).
export const REVIEW_MINUTES = 2
export const FUTURE_REVIEW_SHARE = 0.25

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/**
 * @param lessons [{ id, minutes }] still to study, in study order
 * @param minutesPerDay the learner's daily budget
 * @param reviewsDue reviews due today
 * @param doneToday minutes already studied today, taken off today's budget
 * @returns {{ days: [{ date, reviewMinutes, lessons: string[] }], finish: Date|null, totalMinutes }}
 *   One entry per study day, starting today. A lesson longer than a day's
 *   time is listed on the day it starts and fills the days after it.
 */
export function planStudy({ lessons, minutesPerDay, reviewsDue = 0, doneToday = 0, today = new Date() }) {
  const budget = Math.max(5, Number(minutesPerDay) || 0)
  const todayReview = Math.min(reviewsDue * REVIEW_MINUTES, Math.floor(budget / 2))
  const futureReview = Math.round(budget * FUTURE_REVIEW_SHARE)
  const days = []
  let day = -1
  let cap = 0 // study minutes of the current day
  let left = 0 // of which still free
  const newDay = () => {
    day++
    const reviewMinutes = day === 0 ? todayReview : futureReview
    days.push({ date: addDays(today, day), reviewMinutes, lessons: [] })
    cap = budget - reviewMinutes
    left = Math.max(0, cap - (day === 0 ? Math.max(0, Number(doneToday) || 0) : 0))
  }
  newDay()
  for (const { id, minutes } of lessons) {
    const need = Math.max(1, minutes || 0)
    // A lesson starts today if it fits, or if at least half a day of study
    // time is left (it carries on tomorrow); otherwise it starts tomorrow.
    if (left <= 0 || left < Math.min(need, cap / 2)) newDay()
    days[day].lessons.push(id)
    let rest = need - left
    left -= need
    while (rest > 0) {
      newDay()
      left -= rest
      rest = -left
    }
  }
  const totalMinutes = lessons.reduce((sum, l) => sum + Math.max(1, l.minutes || 0), 0)
  const finish = lessons.length ? days[days.length - 1].date : null
  return { days, finish, totalMinutes }
}

/** Local calendar day of a date, as YYYY-MM-DD. */
export function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Consecutive days with activity, ending today — or yesterday, so a streak
 * isn't lost before the learner has studied today.
 * @param activeDays Set of YYYY-MM-DD local days with activity
 */
export function streak(activeDays, today = new Date()) {
  let d = new Date(today)
  if (!activeDays.has(dayKey(d))) d = addDays(d, -1)
  let n = 0
  while (activeDays.has(dayKey(d))) {
    n++
    d = addDays(d, -1)
  }
  return n
}
