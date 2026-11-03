import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RATING } from '../src/shared/learning.js'
import { fsrs, generatorParameters } from 'ts-fsrs'
import { IMPLICIT_MIN_RETENTION, implicitReview, learnCard, reviewCard, serializeCard } from '../src/main/review.js'

// Days between reviews are local days; these tests use a zone with an offset.
process.env.TZ = 'Europe/Madrid'

const DAY = 86400000

test('intervals grow with the rating', () => {
  const now = new Date('2026-11-03T10:00:00Z')
  const days = (r) => (learnCard(r, now).due - now) / DAY
  assert.ok(days(RATING.again) < days(RATING.hard))
  assert.ok(days(RATING.hard) < days(RATING.good))
})

test('a review with the clock behind the last review does not fail', () => {
  const learnedAt = new Date(Date.now() + 5 * DAY) // e.g. data from a machine ahead in time
  const stored = serializeCard(learnCard(RATING.good, learnedAt))
  const card = reviewCard(stored, RATING.good, new Date())
  assert.equal(card.reps, 2)
  assert.ok(card.due > learnedAt)
})

test('days since the last review are counted in local days, not UTC days', () => {
  // 23:30 and 00:30 in Madrid: the next local day, the same UTC day.
  const late = learnCard(RATING.good, new Date('2026-11-02T22:30:00Z'))
  assert.equal(reviewCard(serializeCard(late), RATING.good, new Date('2026-11-02T23:30:00Z')).elapsed_days, 1)
  // 00:10 and 21:00 in Madrid: the same local day, different UTC days.
  const early = learnCard(RATING.good, new Date('2026-11-02T23:10:00Z'))
  assert.equal(reviewCard(serializeCard(early), RATING.good, new Date('2026-11-03T20:00:00Z')).elapsed_days, 0)
})

test('an implicit repetition moves only the due date: towards a Good review, within the retention floor', () => {
  const now = new Date('2026-11-03T10:00:00Z')
  const learned = learnCard(RATING.good, new Date(now.getTime() - DAY))
  const dueTomorrow = new Date(now.getTime() + DAY)
  const stored = serializeCard({ ...learned, due: dueTomorrow })
  const good = reviewCard(stored, RATING.good, now)
  const implicit = implicitReview(stored, now)
  assert.ok(implicit.due > dueTomorrow)
  assert.ok(implicit.due < good.due)
  // Recall, with the stability unchanged, is still predicted at 85% or more.
  const floor = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false, request_retention: IMPLICIT_MIN_RETENTION }))
  assert.ok(implicit.due <= new Date(learned.last_review.getTime() + floor.next_interval(learned.stability, 0) * DAY))
  assert.deepEqual({ ...implicit, due: dueTomorrow }, { ...learned, due: dueTomorrow })
})

test('no implicit credit for a card already due, or one a Good review would not move later', () => {
  const now = new Date('2026-11-03T10:00:00Z')
  const learned = learnCard(RATING.good, new Date(now.getTime() - DAY))
  const overdue = serializeCard({ ...learned, due: new Date(now.getTime() - 3600000) })
  assert.equal(implicitReview(overdue, now), null)
  const farAway = serializeCard({ ...learned, due: new Date(now.getTime() + 365 * DAY) })
  assert.equal(implicitReview(farAway, now), null)
})
