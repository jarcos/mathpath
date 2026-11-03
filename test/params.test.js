import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawParams, fill, instantiate, leftovers } from '../src/shared/params.js'

const linear = {
  id: 'lin',
  answerType: 'number',
  params: { a: { int: [2, 9] }, x: { int: [-5, 5], exclude: [0] } },
  derived: { b: '-a * x' },
  prompt: { en: 'Solve $[[a]]x [[b|+]] = 0$', es: 'Resuelve $[[a]]x [[b|+]] = 0$' },
  answer: '[[x]]',
  acceptedAlt: ['-([[b]])/[[a]]'],
  solution: [{ tex: '[[a]]x = [[x]] \\cdot [[a]]', en: 'Divide by [[a]].', es: 'Divide entre [[a]].' }],
  check: 'a * answer + b == 0'
}

test('fill: values and signed terms', () => {
  assert.equal(fill('[[a]]x [[b|+]] = [[c]]', { a: 3, b: -4, c: 0.5 }), '3x - 4 = 0.5')
  assert.equal(fill('x [[b|+]]', { b: 7 }), 'x + 7')
  assert.equal(fill('det([[1,2],[3,4]]) [[nope]]', {}), 'det([[1,2],[3,4]]) [[nope]]')
})

test('instances are deterministic per seed, keep the id and drop template fields', () => {
  const a = instantiate(linear, 42)
  assert.deepEqual(a, instantiate(linear, 42))
  assert.equal(a.id, 'lin')
  for (const k of ['params', 'derived', 'where', 'check']) assert.equal(k in a, false)
  assert.deepEqual(leftovers(a), [])
  const { a: coef, x, b } = a.instance.values
  assert.equal(a.prompt.en, `Solve $${coef}x ${b < 0 ? '-' : '+'} ${Math.abs(b)} = 0$`)
  assert.equal(a.answer, String(x))
})

test('exclude and where are respected', () => {
  const ex = { ...linear, where: 'x > 2' }
  for (let seed = 0; seed < 200; seed++) {
    const { x } = drawParams(ex, seed)
    assert.ok(x > 2 && x !== 0)
  }
  assert.throws(() => drawParams({ ...linear, where: 'x > 100' }, 1), /no parameters satisfy/)
})

test('non-templates pass through untouched', () => {
  const plain = { id: 'p', answer: '2' }
  assert.equal(instantiate(plain, 3), plain)
})
