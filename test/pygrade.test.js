// The code-exercise grader's JS side: grading per-test results, naming a known
// mistake, and printing values the way Python does. (The Python side runs in
// verify-pyodide.mjs, on every code exercise.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callRepr, casesGlobals, gradeCases, matchMistake, pyRepr, valuesClose } from '../src/shared/pygrade.js'

const tests = [
  { args: [[1, 2]], expected: [0.25, 0.75] },
  { args: [[0, 0]], expected: [0.5, 0.5] },
  { args: [[1000, 1000]], expected: [0.5, 0.5], tol: 1e-6 }
]
const ok = (value) => ({ value })
const err = (type, line = 3) => ({ error: { type, message: `${type}: boom`, line } })

test('gradeCases: a value within tolerance passes, an error or a missing case fails', () => {
  assert.deepEqual(gradeCases([ok([0.25, 0.75]), ok([0.5, 0.5000001]), ok([0.5, 0.5000001])], tests), [true, false, true])
  assert.deepEqual(gradeCases([err('OverflowError'), ok([0.5, 0.5])], tests), [false, true, false])
  // A bare value isn't a case: results always come wrapped.
  assert.deepEqual(gradeCases([[0.25, 0.75]], tests.slice(0, 1)), [false])
})

test('valuesClose: numbers within tolerance, same shape, booleans exactly', () => {
  assert.ok(valuesClose([1, [2, 3]], [1, [2, 3 + 1e-12]]))
  assert.ok(!valuesClose([1, 2], [1, 2, 3]))
  assert.ok(!valuesClose(1, true))
  assert.ok(valuesClose({ a: 1 }, { a: 1 }))
  assert.ok(!valuesClose({ $repr: '{1, 2}' }, [1, 2]))
  // Pyodide hands over integers past 2^53 as BigInt.
  assert.ok(valuesClose(2432902008176640000n, 2432902008176640000))
})

test('matchMistake: the mistake with the same values and the same kinds of error', () => {
  const unstable = [ok([0.25, 0.75]), ok([0.5, 0.5]), err('OverflowError', 2)]
  const unnormalized = [ok([2.7, 7.4]), ok([1, 1]), err('OverflowError', 2)]
  const mistakes = [unnormalized, unstable]
  // The learner's code overflows on the third test, like mistake 2 (on another line).
  assert.equal(matchMistake([ok([0.25, 0.75]), ok([0.5, 0.5]), err('OverflowError', 5)], mistakes, tests), 1)
  // A different kind of error is a different mistake.
  assert.equal(matchMistake([ok([0.25, 0.75]), ok([0.5, 0.5]), err('ZeroDivisionError')], mistakes, tests), -1)
  // A right answer is never a mistake, even if a mistake gives the same results.
  const right = [ok([0.25, 0.75]), ok([0.5, 0.5]), ok([0.5, 0.5])]
  assert.equal(matchMistake(right, [right], tests), -1)
  // A mistake that didn't load (null) or ran on other tests matches nothing.
  assert.equal(matchMistake(unstable, [null, unstable.slice(0, 2)], tests), -1)
})

test('pyRepr and callRepr print values the way Python does', () => {
  assert.equal(pyRepr([1, 0.5, -2]), '[1, 0.5, -2]')
  assert.equal(pyRepr(0.1 + 0.2), '0.3')
  assert.equal(pyRepr(1 / 3), '0.333333333333')
  assert.equal(pyRepr([true, false, null]), '[True, False, None]')
  assert.equal(pyRepr('ab'), "'ab'")
  assert.equal(pyRepr("it's"), '"it\'s"')
  assert.equal(pyRepr(`it's "x"`), `'it\\'s "x"'`)
  assert.equal(pyRepr({ a: [1] }), "{'a': [1]}")
  assert.equal(pyRepr({ $repr: '{1, 2}' }), '{1, 2}')
  assert.equal(pyRepr([NaN, Infinity, -Infinity]), '[nan, inf, -inf]')
  assert.equal(callRepr('softmax', [[1, 2]]), 'softmax([1, 2])')
  assert.equal(callRepr('f', []), 'f()')
  const long = callRepr('f', [Array.from({ length: 500 }, (_, i) => i)])
  assert.equal(long.length, 400)
  assert.ok(long.endsWith('…'))
})

test('casesGlobals: the tests’ args and the mistakes’ code', () => {
  const ex = { tests: [{ args: [1, 2] }, { expected: 0 }], mistakes: [{ code: 'def f(): pass' }] }
  assert.deepEqual(casesGlobals(ex), { _mp_inputs: [[1, 2], []], _mp_mistakes: ['def f(): pass'] })
  assert.deepEqual(casesGlobals({ tests: [] })._mp_mistakes, [])
})
