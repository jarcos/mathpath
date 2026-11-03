import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAnswer } from '../src/shared/validate.js'

const num = (answer, acceptedAlt) => ({ answerType: 'number', answer, acceptedAlt })

test('numbers: any equal form is accepted', () => {
  assert.equal(validateAnswer('0.5', num('1/2')), true)
  assert.equal(validateAnswer('2/4', num('1/2')), true)
  assert.equal(validateAnswer('0.6', num('1/2')), false)
  assert.equal(validateAnswer('', num('1/2')), false)
})

test('numbers: a decimal comma counts as a decimal point', () => {
  assert.equal(validateAnswer('22,5', num('22.5')), true)
  assert.equal(validateAnswer('-0,25', num('-1/4')), true)
  assert.equal(validateAnswer('22,6', num('22.5')), false)
})

test('expressions: equivalent forms are accepted', () => {
  const ex = { answerType: 'expression', answer: 'x^2 + 2*x + 1' }
  assert.equal(validateAnswer('(x+1)^2', ex), true)
  assert.equal(validateAnswer('x^2 + 1', ex), false)
})

test('sets: order does not matter, and commas still separate items', () => {
  const ex = { answerType: 'set', answer: '2, -3' }
  assert.equal(validateAnswer('-3, 2', ex), true)
  assert.equal(validateAnswer('2,-3', ex), true)
  assert.equal(validateAnswer('2, 3', ex), false)
})

test('text: case and spaces are ignored; alternatives cover other languages', () => {
  const ex = { answerType: 'text', answer: 'yes', acceptedAlt: ['sí', 'si'] }
  assert.equal(validateAnswer(' YES ', ex), true)
  assert.equal(validateAnswer('sí', ex), true)
  assert.equal(validateAnswer('no', ex), false)
})
