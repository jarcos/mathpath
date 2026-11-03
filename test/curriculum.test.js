import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCurriculum, checkCurriculum, dependentsOf, lessonsNeeded } from '../src/shared/curriculum.js'

const lesson = (id, links = []) => ({ id, sections: links.length ? [{ type: 'prereq', lessons: links }] : [] })
const subjects = [
  { id: 'alg', lessons: [lesson('a1'), lesson('a2'), lesson('a3')] },
  { id: 'calc', requires: ['alg'], lessons: [lesson('c1'), lesson('c2', ['a1'])] },
  { id: 'stats', lessons: [lesson('s1'), lesson('s2')] },
  { id: 'ml', requires: ['calc', 'stats'], lessons: [lesson('m1'), lesson('m2', ['c1'])] }
]

test('prerequisites: previous lesson, linked lessons, required subjects', () => {
  const { prereqs } = buildCurriculum(subjects)
  assert.deepEqual(prereqs.get('a1'), [])
  assert.deepEqual(prereqs.get('a2'), ['a1'])
  assert.deepEqual(prereqs.get('c1'), ['a3']) // first lesson: end of the required subject
  assert.deepEqual(prereqs.get('c2').sort(), ['a1', 'c1'])
  assert.deepEqual(prereqs.get('m1').sort(), ['c2', 's2'])
  assert.deepEqual(prereqs.get('s1'), [])
})

test('lessonsNeeded follows the graph and keeps study order', () => {
  const g = buildCurriculum(subjects)
  assert.deepEqual(lessonsNeeded(g, 'c2'), ['a1', 'a2', 'a3', 'c1', 'c2'])
  assert.deepEqual(lessonsNeeded(g, 'm1'), ['a1', 'a2', 'a3', 'c1', 'c2', 's1', 's2', 'm1'])
  assert.deepEqual(lessonsNeeded(g, 's2'), ['s1', 's2'])
  assert.deepEqual(lessonsNeeded(g, 'nope'), [])
})

test('dependentsOf lists direct dependents', () => {
  const g = buildCurriculum(subjects)
  assert.deepEqual(dependentsOf(g, 'c1').sort(), ['c2', 'm2'])
})

test('checkCurriculum: unknown ids and forward links are reported', () => {
  const bad = [
    { id: 'x', requires: ['ghost'], lessons: [lesson('x1', ['y1']), lesson('x2', ['zz'])] },
    { id: 'y', lessons: [lesson('y1')] }
  ]
  const problems = checkCurriculum(bad, buildCurriculum(bad))
  assert.equal(problems.length, 3)
  assert.match(problems.join('\n'), /unknown subject "ghost"/)
  assert.match(problems.join('\n'), /"y1" comes later/)
  assert.match(problems.join('\n'), /"zz" is not a lesson/)
  assert.deepEqual(checkCurriculum(subjects, buildCurriculum(subjects)), [])
})
