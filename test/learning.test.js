import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RATING,
  endOfLocalDay,
  interleave,
  isMastered,
  masteryLevel,
  ratingFor
} from '../src/shared/learning.js'

test('ratingFor: unaided first-time answers are good', () => {
  assert.equal(ratingFor({ correct: true }), RATING.good)
})

test('ratingFor: a hint or earlier misses make it hard', () => {
  assert.equal(ratingFor({ correct: true, usedHint: true }), RATING.hard)
  assert.equal(ratingFor({ correct: true, misses: 2 }), RATING.hard)
})

test('ratingFor: wrong, or right only after the solution, is again', () => {
  assert.equal(ratingFor({ correct: false }), RATING.again)
  assert.equal(ratingFor({ correct: true, usedSolution: true }), RATING.again)
  assert.equal(ratingFor({ correct: true, usedSolution: true, usedHint: true }), RATING.again)
})

test('isMastered: 80% of the exercises, solved without the solution', () => {
  assert.equal(isMastered(4, 5), true)
  assert.equal(isMastered(3, 5), false)
  assert.equal(isMastered(3, 4), false)
  assert.equal(isMastered(4, 4), true)
  assert.equal(isMastered(0, 0), false)
})

test('masteryLevel', () => {
  assert.equal(masteryLevel({ total: 5, solved: 0, clean: 0, due: 0, completed: false }), 'new')
  assert.equal(masteryLevel({ total: 5, solved: 2, clean: 2, due: 0, completed: false }), 'practiced')
  assert.equal(masteryLevel({ total: 5, solved: 5, clean: 3, due: 0, completed: true }), 'practiced')
  assert.equal(masteryLevel({ total: 5, solved: 4, clean: 4, due: 0, completed: false }), 'mastered')
  assert.equal(masteryLevel({ total: 5, solved: 5, clean: 5, due: 1, completed: true }), 'review')
  // Reading-only lessons follow the completed flag.
  assert.equal(masteryLevel({ total: 0, solved: 0, clean: 0, due: 0, completed: true }), 'mastered')
  assert.equal(masteryLevel({ total: 0, solved: 0, clean: 0, due: 0, completed: false }), 'new')
})

test('interleave alternates groups and keeps order within each', () => {
  const items = ['a1', 'a2', 'a3', 'b1', 'c1', 'c2']
  assert.deepEqual(interleave(items, (s) => s[0]), ['a1', 'b1', 'c1', 'a2', 'c2', 'a3'])
  assert.deepEqual(interleave([], (s) => s), [])
})

test('endOfLocalDay is the last millisecond of the local day', () => {
  const now = new Date(2026, 10, 3, 9, 30)
  const end = new Date(endOfLocalDay(now))
  assert.equal(end.getFullYear(), 2026)
  assert.equal(end.getMonth(), 10)
  assert.equal(end.getDate(), 3)
  assert.equal(end.getHours(), 23)
  assert.equal(end.getMinutes(), 59)
  assert.equal(end.getMilliseconds(), 999)
})
