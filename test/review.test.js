import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RATING } from '../src/shared/learning.js'
import { learnCard, reviewCard, serializeCard } from '../src/main/review.js'

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
