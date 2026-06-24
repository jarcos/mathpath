// Adaptive 30-day study plan.
//
// If the learner falls behind, the remaining lessons are re-spread evenly
// across whatever days are left until the deadline — so the plan always shows
// a realistic "what to do today", never an impossible backlog.

const MS_PER_DAY = 86400000

function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toIso(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function addDays(iso, n) {
  const d = toDate(iso)
  d.setDate(d.getDate() + n)
  return toIso(d)
}
function dayDiff(aIso, bIso) {
  return Math.round((toDate(aIso) - toDate(bIso)) / MS_PER_DAY)
}

export function todayIso() {
  return toIso(new Date())
}

/**
 * @param {object[]} lessons      ordered lesson objects for the subject
 * @param {Set<string>} completed set of completed lesson ids
 * @param {{start_date:string,target_days:number}|null} planRow
 * @param {string} today          ISO date (defaults to real today)
 */
export function computePlan(lessons, completed, planRow, today = todayIso()) {
  const total = lessons.length
  const completedCount = lessons.filter((l) => completed.has(l.id)).length
  const percent = total ? Math.round((completedCount / total) * 100) : 0

  if (!planRow) {
    return {
      started: false,
      total,
      completedCount,
      percent,
      schedule: lessons.map((l) => ({ lesson: l, date: null, status: completed.has(l.id) ? 'done' : 'upcoming' })),
      todayLessons: [],
      onTrack: true,
      finished: completedCount === total && total > 0,
      daysLeft: planRow ? 0 : null
    }
  }

  const { start_date, target_days } = planRow
  const deadline = addDays(start_date, target_days - 1)
  const daysLeftRaw = dayDiff(deadline, today) + 1 // inclusive of today
  const daysLeft = Math.max(1, daysLeftRaw)

  const remaining = lessons.filter((l) => !completed.has(l.id))
  const perDay = remaining.length ? Math.ceil(remaining.length / daysLeft) : 0

  const schedule = []
  // Completed lessons first, marked done.
  for (const l of lessons) {
    if (completed.has(l.id)) schedule.push({ lesson: l, date: null, status: 'done' })
  }
  // Spread the remaining lessons starting today.
  const todayLessons = []
  remaining.forEach((l, i) => {
    const offset = perDay > 0 ? Math.floor(i / perDay) : 0
    const date = addDays(today, offset)
    const status = offset === 0 ? 'today' : 'upcoming'
    if (status === 'today') todayLessons.push(l)
    schedule.push({ lesson: l, date, status })
  })

  // Pacing health: how many "should" be done by now under even pacing.
  const elapsed = Math.min(target_days, Math.max(0, dayDiff(today, start_date) + 1))
  const expectedDone = Math.min(total, Math.round((total * elapsed) / target_days))
  const onTrack = completedCount >= expectedDone

  return {
    started: true,
    total,
    completedCount,
    percent,
    deadline,
    daysLeft,
    perDay,
    expectedDone,
    onTrack,
    finished: completedCount === total && total > 0,
    todayLessons,
    schedule
  }
}
