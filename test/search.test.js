import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex, fold, plainText, search, terms } from '../src/shared/search.js'

const lesson = (id, order, title, text, extra = {}) => ({
  id,
  order,
  title,
  sections: [{ type: 'prose', content: text }, ...(extra.sections || [])],
  exercises: extra.exercises || []
})
const subjects = [
  {
    id: 'calc',
    status: 'available',
    name: { en: 'Calculus', es: 'Cálculo' },
    lessonObjects: [
      lesson('c1', 1, { en: 'Limits', es: 'Límites' }, { en: 'A limit describes $f(x)$ near a point.', es: 'Un límite describe $f(x)$ cerca de un punto.' }),
      lesson('c2', 2, { en: 'The derivative', es: 'La derivada' }, { en: 'The **derivative** is a limit of slopes.', es: 'La **derivada** es un límite de pendientes.' }, {
        sections: [{ type: 'example', title: { en: 'Power rule', es: 'Regla de la potencia' }, content: { en: 'x', es: 'x' } }]
      }),
      lesson('c3', 3, { en: 'Integrals', es: 'Integrales' }, { en: 'Area under a curve.', es: 'Área bajo una curva.' }, {
        exercises: [{ prompt: { en: 'Find the antiderivative.', es: 'Halla la primitiva.' } }]
      })
    ]
  }
]
const glossary = {
  symbols: [
    { id: 'lambda', display: '\\lambda', tex: ['\\lambda'], uni: ['λ'], read: { en: 'lambda', es: 'lambda' }, meaning: { en: 'An eigenvalue.', es: 'Un valor propio.' } },
    { id: 'sum', display: '\\sum', tex: ['\\sum'], uni: ['∑'], read: { en: 'sum', es: 'sumatorio' }, meaning: { en: 'Adds terms.', es: 'Suma términos.' } }
  ]
}
const index = buildIndex(subjects, glossary)
const ids = (r) => r.lessons.map((l) => l.id)

test('folding and plain text: no accents, no case, no formulas or emphasis', () => {
  assert.equal(fold('Función ÁREA Ñu'), 'funcion area nu')
  assert.equal(plainText('The **slope** is $\\frac{a}{b}$, see $$x^2$$ *here*.'), 'The slope is , see here.')
  assert.deepEqual(terms('  Límite   de  '), ['limite', 'de'])
  assert.deepEqual(search(index, '   ', 'en'), { lessons: [], symbols: [] })
})

test('lessons: title first, then section titles, then text; every word must match', () => {
  assert.deepEqual(ids(search(index, 'limit', 'en')), ['c1', 'c2'])
  assert.deepEqual(ids(search(index, 'limite', 'es')), ['c1', 'c2'])
  assert.deepEqual(ids(search(index, 'power', 'en')), ['c2'])
  assert.deepEqual(ids(search(index, 'antiderivative', 'en')), ['c3'])
  assert.deepEqual(ids(search(index, 'limit slopes', 'en')), ['c2'])
  assert.deepEqual(ids(search(index, 'limit banana', 'en')), [])
  // Either language finds it, shown in the learner's.
  const r = search(index, 'derivada', 'en').lessons[0]
  assert.deepEqual([r.id, r.title, r.subject], ['c2', 'The derivative', 'Calculus'])
})

test('a whole word in a title ranks above the start of a longer one', () => {
  const two = [
    {
      id: 's',
      status: 'available',
      name: { en: 'S' },
      lessonObjects: [
        lesson('p', 1, { en: 'Derivatives, partial', es: 'Derivadas parciales' }, { en: '' }),
        lesson('d', 2, { en: 'The derivative', es: 'La derivada' }, { en: '' })
      ]
    }
  ]
  assert.deepEqual(ids(search(buildIndex(two, glossary), 'derivada', 'es')), ['d', 'p'])
})

test('a text match shows the words around it; a title match needs no excerpt', () => {
  const [c2] = search(index, 'slopes', 'en').lessons
  assert.match(c2.snippet, /limit of slopes/)
  assert.equal(search(index, 'integrals', 'en').lessons[0].snippet, '')
})

test('symbols: by form, name or meaning', () => {
  assert.equal(search(index, 'λ', 'en').symbols[0].id, 'lambda')
  assert.equal(search(index, '\\lambda', 'en').symbols[0].id, 'lambda')
  assert.equal(search(index, 'sumatorio', 'es').symbols[0].id, 'sum')
  assert.equal(search(index, 'eigenvalue', 'en').symbols[0].id, 'lambda')
  assert.deepEqual(search(index, 'lambda zzz', 'en').symbols, [])
})
