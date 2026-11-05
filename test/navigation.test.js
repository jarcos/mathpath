import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HISTORY_LIMIT,
  canGo,
  currentView,
  goBy,
  pickResume,
  pushView,
  replaceView,
  restoreView,
  startHistory,
  withScroll
} from '../src/shared/navigation.js'

const dash = { name: 'dashboard' }
const map = { name: 'map' }
const lesson = (id) => ({ name: 'lesson', lessonId: id, subjectId: 's' })

test('history: back and forward keep each view with its scroll', () => {
  let h = startHistory(dash)
  assert.equal(canGo(h, -1), false)
  h = pushView(withScroll(h, 420), map)
  h = pushView(withScroll(h, 80), lesson('l1'))
  assert.deepEqual(currentView(h), lesson('l1'))
  h = goBy(withScroll(h, 900), -1)
  assert.deepEqual(h.entries[h.index], { view: map, scroll: 80 })
  h = goBy(h, -1)
  assert.deepEqual(h.entries[h.index], { view: dash, scroll: 420 })
  assert.equal(goBy(h, -1), h)
  h = goBy(goBy(h, 1), 1)
  assert.deepEqual(h.entries[h.index], { view: lesson('l1'), scroll: 900 })
  assert.equal(canGo(h, 1), false)
})

test('history: a new view drops the ones ahead; the same view is not added twice', () => {
  let h = pushView(pushView(startHistory(dash), map), lesson('l1'))
  h = goBy(goBy(h, -1), -1)
  h = pushView(h, lesson('l2'))
  assert.deepEqual(
    h.entries.map((e) => e.view),
    [dash, lesson('l2')]
  )
  assert.equal(canGo(h, 1), false)
  assert.equal(pushView(h, lesson('l2')), h)
  const r = replaceView(withScroll(h, 50), { name: 'settings', notice: 'x' })
  assert.deepEqual(r.entries[r.index], { view: { name: 'settings', notice: 'x' }, scroll: 50 })
  assert.equal(r.entries.length, 2)
})

test('history: keeps the latest views only, and ignores a bad scroll', () => {
  let h = startHistory(dash)
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = pushView(h, lesson(`l${i}`))
  assert.equal(h.entries.length, HISTORY_LIMIT)
  assert.equal(h.index, HISTORY_LIMIT - 1)
  assert.deepEqual(currentView(h), lesson(`l${HISTORY_LIMIT + 9}`))
  assert.equal(withScroll(h, NaN).entries[h.index].scroll, 0)
  assert.equal(withScroll(h, -5).entries[h.index].scroll, 0)
  assert.equal(withScroll(h, 12.6).entries[h.index].scroll, 13)
})

test('restoring the last view: only what can still be opened', () => {
  const lookups = {
    lessonSubject: (id) => ({ l1: 'algebra' })[id] ?? null,
    isSubject: (id) => id === 'algebra'
  }
  const restore = (v) => restoreView(v, lookups)
  assert.deepEqual(restore({ name: 'lesson', lessonId: 'l1', subjectId: 'old' }), {
    name: 'lesson',
    lessonId: 'l1',
    subjectId: 'algebra'
  })
  assert.deepEqual(restore({ name: 'lesson', lessonId: 'gone' }), dash)
  assert.deepEqual(restore({ name: 'subject', subjectId: 'algebra' }), { name: 'subject', subjectId: 'algebra' })
  assert.deepEqual(restore({ name: 'exam', subjectId: 'algebra' }), { name: 'subject', subjectId: 'algebra' })
  assert.deepEqual(restore({ name: 'placement', subjectId: 'nope' }), dash)
  assert.deepEqual(restore({ name: 'settings', notice: { kind: 'imported' } }), { name: 'settings' })
  assert.deepEqual(restore({ name: 'map' }), map)
  for (const bad of [null, undefined, 'lesson', 3, {}, { name: 'unknown' }, { name: 'lesson', lessonId: 7 }]) {
    assert.deepEqual(restore(bad), dash)
  }
})

const lessons = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}` }))
const subjects = [
  { id: 'a', status: 'available', lessonObjects: lessons('a', 4) },
  { id: 'b', status: 'available', lessonObjects: lessons('b', 3) },
  { id: 'soon', status: 'coming', lessonObjects: lessons('c', 2) }
]
const ids = (r) => r && [r.subject.id, r.lesson.id, r.fresh]

test('continue: the lesson worked on last, or the next one to do in its subject', () => {
  const done = new Set(['a1', 'b1'])
  assert.deepEqual(ids(pickResume(subjects, done, ['b2', 'a1'])), ['b', 'b2', false])
  // Completed: on to the next one not done (b2 is done too).
  assert.deepEqual(ids(pickResume(subjects, new Set(['b1', 'b2']), ['b1'])), ['b', 'b3', false])
  // Nothing left after it: the first one not done in the subject.
  assert.deepEqual(ids(pickResume(subjects, new Set(['b2', 'b3']), ['b3'])), ['b', 'b1', false])
  // A finished subject: the next recent lesson decides.
  assert.deepEqual(ids(pickResume(subjects, new Set(['b1', 'b2', 'b3']), ['b2', 'a3'])), ['a', 'a3', false])
  // Lessons no longer in the course, or not available, are skipped.
  assert.deepEqual(ids(pickResume(subjects, done, ['gone', 'c1', 'a1'])), ['a', 'a2', false])
})

test('continue: with no recent lesson, a subject already started, else the first one', () => {
  assert.deepEqual(ids(pickResume(subjects, new Set(['b1']), [])), ['b', 'b2', false])
  assert.deepEqual(ids(pickResume(subjects, new Set(), [])), ['a', 'a1', true])
  const all = new Set(subjects.flatMap((s) => s.lessonObjects.map((l) => l.id)))
  assert.equal(pickResume(subjects, all, ['a1']), null)
})
