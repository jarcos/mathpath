import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FUTURE_REVIEW_SHARE, dayKey, planStudy, streak } from '../src/shared/planner.js'

const today = new Date(2026, 10, 3, 9, 0)
const L = (id, minutes) => ({ id, minutes })

test('lessons fill each day up to the budget, leaving room for reviews', () => {
  // 60 min/day; today 5 reviews due = 10 min; later days keep 15 min for reviews.
  const { days, finish, totalMinutes } = planStudy({
    lessons: [L('a', 30), L('b', 20), L('c', 40), L('d', 10)],
    minutesPerDay: 60,
    reviewsDue: 5,
    today
  })
  assert.equal(60 * FUTURE_REVIEW_SHARE, 15)
  assert.deepEqual(days.map((d) => [dayKey(d.date), d.reviewMinutes, d.lessons]), [
    ['2026-11-03', 10, ['a', 'b']], // 50 of 50 minutes
    ['2026-11-04', 15, ['c']], // 40 of 45; d (10) no longer fits
    ['2026-11-05', 15, ['d']]
  ])
  assert.equal(dayKey(finish), '2026-11-05')
  assert.equal(totalMinutes, 100)
})

test('reviews never take more than half of today', () => {
  const { days } = planStudy({ lessons: [L('a', 10)], minutesPerDay: 30, reviewsDue: 100, today })
  assert.equal(days[0].reviewMinutes, 15)
  assert.deepEqual(days[0].lessons, ['a'])
})

test('a lesson longer than a day spans several days', () => {
  const { days } = planStudy({ lessons: [L('long', 100), L('next', 10)], minutesPerDay: 40, reviewsDue: 0, today })
  // 40 today, then 30/day (10 kept for reviews): 100 = 40 + 30 + 30, so the
  // long lesson fills three days and the next one starts on the fourth.
  assert.deepEqual(days.map((d) => d.lessons), [['long'], [], [], ['next']])
})

test('a lesson that spills over leaves the rest of that day for the next one', () => {
  // 45 min/day: 45 today, then 34 (11 kept for reviews). Each lesson is 40.
  const { days } = planStudy({ lessons: [L('a', 40), L('b', 40), L('c', 40)], minutesPerDay: 45, today })
  // a: today (5 left, too little to start b). b: 34 tomorrow + 6 the day after,
  // which leaves 28 — over half a day — so c starts that same day.
  assert.deepEqual(days.map((d) => d.lessons), [['a'], ['b'], ['c'], []])
})

test('time already studied today comes off today, not off later days', () => {
  const lessons = [L('a', 20), L('b', 20)]
  // 60 min/day, no reviews: both fit today...
  assert.deepEqual(planStudy({ lessons, minutesPerDay: 60, today }).days[0].lessons, ['a', 'b'])
  // ...after 30 min of study only one does (b needs 20, 10 left)...
  const half = planStudy({ lessons, minutesPerDay: 60, doneToday: 30, today })
  assert.deepEqual(half.days.map((d) => d.lessons), [['a'], ['b']])
  // ...with less than half a day left, a lesson that doesn't fit waits for tomorrow...
  const late = planStudy({ lessons: [L('a', 40)], minutesPerDay: 60, doneToday: 45, today })
  assert.deepEqual(late.days.map((d) => d.lessons), [[], ['a']])
  // ...and once the goal is met, the rest starts tomorrow.
  const met = planStudy({ lessons, minutesPerDay: 60, doneToday: 75, today })
  assert.deepEqual(met.days.map((d) => d.lessons), [[], ['a', 'b']])
})

test('a missing or broken daily budget still gives a sane plan', () => {
  for (const minutesPerDay of [undefined, null, 'abc', -10, 0]) {
    const { days } = planStudy({ lessons: [L('a', 10), L('b', 10)], minutesPerDay, today })
    assert.ok(days.length >= 2, `minutesPerDay=${minutesPerDay}`)
  }
})

test('nothing left to study: no finish date', () => {
  const { days, finish } = planStudy({ lessons: [], minutesPerDay: 30, today })
  assert.equal(finish, null)
  assert.equal(days.length, 1)
})

test('streak counts back from today, or from yesterday if today is still empty', () => {
  const days = (...keys) => new Set(keys)
  assert.equal(streak(days('2026-11-03', '2026-11-02', '2026-11-01'), today), 3)
  assert.equal(streak(days('2026-11-02', '2026-11-01'), today), 2)
  assert.equal(streak(days('2026-11-03', '2026-11-01'), today), 1)
  assert.equal(streak(days('2026-10-30'), today), 0)
})
