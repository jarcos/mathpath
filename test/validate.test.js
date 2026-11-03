import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkAnswer, inForm, previewTex, validateAnswer } from '../src/shared/validate.js'

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

test('expressions: a product written like a call, x(x + 2), is a product', () => {
  const ex = { answerType: 'expression', answer: '2*x*(x+2)' }
  assert.equal(validateAnswer('2x(x+2)', ex), true)
  assert.equal(validateAnswer('x (2x+4)', ex), true)
  assert.equal(validateAnswer('sqrt(x)', { answerType: 'expression', answer: 'x^(1/2)' }), true)
})

test('expressions: ln and the Spanish sen, tg are the functions they name', () => {
  assert.equal(validateAnswer('ln(x)', { answerType: 'expression', answer: 'log(x)' }), true)
  assert.equal(validateAnswer('sen(x)^2 + cos(x)^2', { answerType: 'expression', answer: '1' }), true)
  assert.equal(validateAnswer('sen(pi/2) + tg(0)', { answerType: 'number', answer: '1' }), true)
})

test('checkAnswer: what cannot be read is told apart from a wrong answer', () => {
  const ex = { answerType: 'expression', answer: 'x^2' }
  assert.deepEqual(checkAnswer('', ex), { ok: false, reason: 'empty' })
  assert.deepEqual(checkAnswer('(x+', ex), { ok: false, reason: 'unparsed' })
  assert.deepEqual(checkAnswer('x^3', ex), { ok: false, reason: 'wrong' })
})

test('sets: a wrong count and a partly right answer are told apart', () => {
  const ex = { answerType: 'set', answer: '2, -3' }
  assert.deepEqual(checkAnswer('2, 3', ex), { ok: false, reason: 'partial', right: 1, total: 2 })
  assert.deepEqual(checkAnswer('2', ex), { ok: false, reason: 'count', expected: 2, got: 1 })
  assert.deepEqual(checkAnswer('5, 6', ex), { ok: false, reason: 'wrong' })
  assert.deepEqual(checkAnswer('2, (', ex), { ok: false, reason: 'unparsed' })
})

test('common mistakes come back with their message', () => {
  const feedback = { en: 'The cross term is missing.', es: 'Falta el doble producto.' }
  const ex = { answerType: 'expression', answer: 'x^2 + 4*x + 4', commonMistakes: [{ answer: 'x^2 + 4', feedback }] }
  assert.deepEqual(checkAnswer('4 + x^2', ex), { ok: false, reason: 'mistake', feedback })
  assert.deepEqual(checkAnswer('x^2 + 2x + 4', ex), { ok: false, reason: 'wrong' })
})

test('forms: an equal answer in another form is refused, with the form', () => {
  const factor = { answerType: 'expression', answer: '2*x*(x+2)', requireForm: 'factored' }
  assert.equal(validateAnswer('2x(x+2)', factor), true)
  assert.equal(validateAnswer('-2x(-x-2)', factor), true)
  assert.deepEqual(checkAnswer('2x^2 + 4x', factor), { ok: false, reason: 'form', form: 'factored' })
  assert.equal(validateAnswer('x(2x+4)', factor), false) // a common factor 2 is left inside
  assert.equal(validateAnswer('2(x^2+2x)', factor), false)

  const expand = { answerType: 'expression', answer: 'x^2 + 4*x + 4', requireForm: 'expanded' }
  assert.equal(validateAnswer('4 + 4x + x^2', expand), true)
  for (const u of ['(x+2)^2', '(x+2)(x+2)', 'x^2+2x+2x+4', 'x^2+2*2x+4']) assert.equal(validateAnswer(u, expand), false, u)

  const simplify = (answer) => ({ answerType: 'expression', answer, requireForm: 'simplified' })
  assert.equal(validateAnswer('-2 + 4x', simplify('4*x - 2')), true)
  assert.equal(validateAnswer('2(2x-1)', simplify('4*x - 2')), true)
  for (const [u, a] of [['3x-2+x', '4*x - 2'], ['x^2*x^3', 'x^5'], ['x^(2+3)', 'x^5'], ['(x^3)^2', 'x^6'], ['x^5/x^2', 'x^3'], ['(2x)(3x^2)', '6*x^3'], ['(x^2-1)-(x^2-x)', 'x - 1']]) {
    assert.equal(validateAnswer(u, simplify(a)), false, u)
  }
})

test('forms: numbers', () => {
  const simplest = { answerType: 'number', answer: '2/5', requireForm: 'simplified' }
  for (const u of ['2/5', '0.4', '0,4']) assert.equal(validateAnswer(u, simplest), true, u)
  for (const u of ['6/15', '2/3*3/5']) assert.equal(validateAnswer(u, simplest), false, u)
  assert.equal(validateAnswer('2^3', { answerType: 'number', answer: '8', requireForm: 'simplified' }), false)

  const fraction = { answerType: 'number', answer: '1/4', requireForm: 'fraction' }
  assert.equal(validateAnswer('1/4', fraction), true)
  for (const u of ['0.25', '25/100', '2/8']) assert.equal(validateAnswer(u, fraction), false, u)
  assert.equal(inForm('-3/4', 'fraction', '-3/4'), true)
  assert.equal(validateAnswer('+1/4', fraction), true)
})

test('text: accents, closing punctuation and a simple plural do not matter', () => {
  const ex = { answerType: 'text', answer: 'yes', acceptedAlt: ['sí'] }
  for (const u of ['si', 'SÍ.', '¡Sí!']) assert.equal(validateAnswer(u, ex), true, u)
  const word = { answerType: 'text', answer: 'eigenvectors' }
  assert.equal(validateAnswer('Eigenvector', word), true)
  // Not for one- or two-letter words.
  assert.equal(validateAnswer('e', { answerType: 'text', answer: 'is', acceptedAlt: ['es'] }), false)
  assert.equal(validateAnswer('nos', { answerType: 'text', answer: 'no' }), false)
})

test('text: one slip is forgiven in words of 5+ letters, never in numbers', () => {
  const ex = { answerType: 'text', answer: 'overfitting', acceptedAlt: ['sobreajuste'] }
  assert.deepEqual(checkAnswer('overfiting', ex), { ok: true, spelling: 'overfitting' })
  assert.deepEqual(checkAnswer('ovrefitting', ex), { ok: true, spelling: 'overfitting' })
  assert.deepEqual(checkAnswer('sobreajute', ex), { ok: true, spelling: 'sobreajuste' })
  assert.equal(validateAnswer('underfitting', ex), false)
  assert.equal(validateAnswer('overfitt1ngg', ex), false)
  assert.equal(validateAnswer('bais', { answerType: 'text', answer: 'bias' }), false) // too short
  assert.equal(validateAnswer('1025', { answerType: 'text', answer: '1024' }), false)
})

test('text: a known mistake one slip away is that mistake, not a slip', () => {
  const feedback = { en: 'That is exploiting.', es: 'Eso es explotar.' }
  const ex = { answerType: 'text', answer: 'exploration', acceptedAlt: ['exploración'], commonMistakes: [{ answer: 'explotación', feedback }] }
  assert.deepEqual(checkAnswer('explotacion', ex), { ok: false, reason: 'mistake', feedback })
  assert.deepEqual(checkAnswer('exploracion', ex), { ok: true })
  assert.deepEqual(checkAnswer('exploracon', ex), { ok: true, spelling: 'exploración' })
})

test('preview: shows how an answer is read', () => {
  const ex = { answerType: 'expression', answer: 'x/2' }
  assert.equal(previewTex('1/2x', ex), '\\frac{1}{2}\\cdot x')
  assert.match(previewTex('x(x+2)', ex), /cdot/)
  assert.equal(previewTex('(x+', ex), null)
  assert.equal(previewTex('5', ex), null)
  assert.equal(previewTex('2,5', { answerType: 'number', answer: '2.5' }), null)
  assert.equal(previewTex('2, -3', { answerType: 'set', answer: '2, -3' }), null)
  assert.equal(previewTex('sí', { answerType: 'text', answer: 'yes' }), null)
})
