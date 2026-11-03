import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RATING } from '../src/shared/learning.js'
import { learnCard, reviewCard, serializeCard } from '../src/main/review.js'

// A zone behind UTC, with daylight saving (review.test.js uses one ahead).
process.env.TZ = 'America/Los_Angeles'

test('local days also hold behind UTC and across a daylight-saving change', () => {
  // 23:30 and 00:30 in Los Angeles (PST): the next local day, the same UTC day.
  const late = learnCard(RATING.good, new Date('2026-11-03T07:30:00Z'))
  assert.equal(reviewCard(serializeCard(late), RATING.good, new Date('2026-11-03T08:30:00Z')).elapsed_days, 1)
  // 22:00 PDT on 31 Oct and 01:00 PST on 2 Nov (clocks went back on 1 Nov): two local days.
  const beforeDst = learnCard(RATING.good, new Date('2026-11-01T05:00:00Z'))
  const after = reviewCard(serializeCard(beforeDst), RATING.good, new Date('2026-11-02T09:00:00Z'))
  assert.equal(after.elapsed_days, 2)
  assert.equal(after.last_review.toISOString(), '2026-11-02T09:00:00.000Z')
})
