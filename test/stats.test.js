import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accuracy, forecastDays, longestStreak, subjectStats, weakLessons } from '../src/shared/stats.js'
import { displayFormulas, notesMarkdown } from '../src/shared/sheet.js'

const ex = (id) => ({ id })
const subjects = [
  {
    id: 'a',
    status: 'available',
    name: { en: 'Algebra', es: 'Álgebra' },
    lessonObjects: [
      { id: 'a1', order: 1, title: { en: 'One', es: 'Uno' }, exercises: [ex('a1e1'), ex('a1e2')] },
      { id: 'a2', order: 2, title: { en: 'Two', es: 'Dos' }, exercises: [ex('a2e1')] }
    ]
  },
  { id: 'b', status: 'available', name: { en: 'B' }, lessonObjects: [{ id: 'b1', order: 1, title: { en: 'B1' }, exercises: [] }] },
  { id: 'soon', status: 'coming', name: { en: 'Soon' }, lessonObjects: [] }
]
const totals = [
  { lesson_id: 'a1', answers: 10, correct: 4, time_ms: 60000 },
  { lesson_id: 'a2', answers: 5, correct: 5, time_ms: 30000 },
  { lesson_id: 'b1', answers: 3, correct: 0, time_ms: 0 },
  { lesson_id: 'gone', answers: 9, correct: 9, time_ms: 1 }
]

test('per subject: lessons, exercises solved, answers, right ones and time', () => {
  const rows = subjectStats(subjects, totals, new Set(['a1e1', 'a2e1', 'x']), new Set(['a2']))
  assert.equal(rows.length, 2)
  const [a, b] = rows
  assert.deepEqual(
    [a.lessons, a.done, a.exercises, a.solved, a.answers, a.correct, a.timeMs],
    [2, 1, 3, 2, 15, 9, 90000]
  )
  assert.equal(accuracy(a), 0.6)
  assert.equal(accuracy({ answers: 0, correct: 0 }), null)
  assert.deepEqual([b.answers, b.correct], [3, 0])
})

test('weak lessons: practised enough and mostly wrong, the weakest first', () => {
  assert.deepEqual(
    weakLessons(subjects, totals).map((w) => [w.lesson.id, w.accuracy]),
    [['a1', 0.4]]
  )
  assert.deepEqual(
    weakLessons(subjects, totals, { min: 3 }).map((w) => w.lesson.id),
    ['b1', 'a1']
  )
})

test('longest streak: the longest run of days in a row, across months', () => {
  assert.equal(longestStreak(new Set()), 0)
  assert.equal(longestStreak(new Set(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-03'])), 3)
  assert.equal(longestStreak(new Set(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'])), 4)
})

test('forecast: one row per coming day, with the reviews due', () => {
  const today = new Date(2026, 10, 5, 9)
  const days = forecastDays([{ day: '2026-11-05', reviews: 3 }, { day: '2026-11-07', reviews: 2 }], 4, today)
  assert.deepEqual(days, [
    { day: '2026-11-05', reviews: 3 },
    { day: '2026-11-06', reviews: 0 },
    { day: '2026-11-07', reviews: 2 },
    { day: '2026-11-08', reviews: 0 }
  ])
})

test('display formulas: from text and examples, in order, once each', () => {
  const lesson = {
    sections: [
      { type: 'prose', content: { en: 'So $$a^2+b^2=c^2$$ and $x$ and $$ e^{i\\pi} $$.', es: 'Así $$a^2+b^2=c^2$$.' } },
      { type: 'example', content: { en: 'Again $$a^2+b^2=c^2$$' } },
      { type: 'code', content: { en: '$$ignored$$' } }
    ]
  }
  assert.deepEqual(displayFormulas(lesson, 'en'), ['a^2+b^2=c^2', 'e^{i\\pi}'])
  assert.deepEqual(displayFormulas(lesson, 'es'), ['a^2+b^2=c^2'])
  assert.deepEqual(displayFormulas({}, 'en'), [])
})

test('notes as Markdown: subjects in course order, bookmarks marked', () => {
  const notes = new Map([
    ['a2', { body: 'Two is *prime*.\n\n$2 = 1 + 1$', bookmarked: true }],
    ['a1', { body: 'First.', bookmarked: false }],
    ['b1', { body: '', bookmarked: true }]
  ])
  const md = notesMarkdown(subjects, notes, 'es', { title: 'Mis notas', exported: 'Exportadas el 5/11/2026', bookmarked: 'Marcada' })
  assert.equal(
    md,
    [
      '# Mis notas',
      '',
      '_Exportadas el 5/11/2026_',
      '',
      '## Álgebra',
      '',
      '### 1. Uno',
      '',
      'First.',
      '',
      '### 2. Dos ★',
      '',
      'Two is *prime*.',
      '',
      '$2 = 1 + 1$',
      '',
      '## B',
      '',
      '### 1. B1 ★',
      '',
      '_Marcada_',
      ''
    ].join('\n')
  )
})
