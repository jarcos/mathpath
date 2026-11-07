import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyMap,
  areaUnder,
  autoYRange,
  compile,
  det2,
  eigen2,
  evalMap,
  fmt,
  freeSymbols,
  graphProblems,
  lerpMap,
  sampleScopes,
  slopeAt,
  texOf,
  ticks,
  vector2dProblems
} from '../src/shared/plot.js'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)
const caption = { en: 'A caption.', es: 'Un pie.' }
const slider = (name, extra = {}) => ({ name, min: -2, max: 2, step: 0.1, value: 1, ...extra })

test('compile gives NaN where a function is not a real number', () => {
  assert.equal(compile('x^2').evaluate({ x: 3 }), 9)
  assert.equal(compile(2.5).evaluate(), 2.5)
  assert.ok(Number.isNaN(compile('log(x)').evaluate({ x: -1 })))
  assert.ok(Number.isNaN(compile('sqrt(x)').evaluate({ x: -4 })))
  assert.ok(Number.isNaN(compile('1/x').evaluate({ x: 0 })))
  assert.ok(Number.isNaN(compile('a*x').evaluate({ x: 1 })))
})

test('freeSymbols lists variables, not function names', () => {
  assert.deepEqual(freeSymbols('sin(b*x) + a*pi').sort(), ['a', 'b', 'pi', 'x'])
  assert.deepEqual(freeSymbols(3), [])
})

test('texOf writes a default legend label', () => {
  assert.equal(texOf('2*x + 1'), '2x+1')
  assert.equal(texOf('A*sin(B*x)'), 'A\\cdot\\sin\\left(B\\cdot x\\right)')
  assert.ok(!texOf('a*(x - h)^2 + k').includes('mathrm'))
  assert.equal(texOf('x^2 +'), 'x^2 +')
})

test('ticks fall on 1, 2 or 5 × 10ⁿ steps', () => {
  assert.deepEqual(ticks(-3, 7), [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(ticks(0, 40), [0, 5, 10, 15, 20, 25, 30, 35, 40])
  assert.deepEqual(ticks(-1.4, 1.4).slice(0, 3), [-1.4, -1.2, -1])
})

test('autoYRange keeps y = 0 and ignores the tail of an asymptote', () => {
  const [lo, hi] = autoYRange([1, 2, 3, 4, NaN])
  assert.ok(lo < 0 && hi > 4)
  const ys = Array.from({ length: 100 }, (_, i) => (i === 99 ? 1e6 : i / 10))
  assert.ok(autoYRange(ys)[1] < 20)
})

test('slope and area match the calculus', () => {
  close(slopeAt(compile('a*x^2'), 3, { a: 1 }), 6)
  close(slopeAt(compile('sin(x)'), 0), 1)
  close(slopeAt(compile('exp(x)'), 1), Math.E)
  close(areaUnder(compile('x'), 0, 4), 8)
  close(areaUnder(compile('x^2'), 0, 3), 9)
  close(areaUnder(compile('x'), 4, 0), -8)
  close(areaUnder(compile('sin(x)'), 0, Math.PI), 2)
  assert.ok(Number.isNaN(areaUnder(compile('1/x'), -1, 1, {}, 400)))
})

test('fmt rounds to two decimals without -0', () => {
  assert.equal(fmt(2 / 3), '0.67')
  assert.equal(fmt(-0.0001), '0')
  assert.equal(fmt(4), '4')
  assert.equal(fmt(NaN), '—')
})

test('eigen2 finds real eigenpairs with A v = λ v', () => {
  for (const A of [[[2, 1], [1, 2]], [[1, 2], [2, 4]], [[3, 1], [0, 2]], [[0, 1], [1, 0]], [[2, 0], [0, 3]], [[0.5, 0.2], [0.5, 0.8]]]) {
    const e = eigen2(A)
    assert.equal(e.kind, 'real')
    e.values.forEach((l, i) => {
      const v = e.vectors[i]
      close(Math.hypot(...v), 1)
      const Av = applyMap(A, [0, 0], v)
      close(Av[0], l * v[0])
      close(Av[1], l * v[1])
    })
  }
  assert.deepEqual(eigen2([[2, 1], [1, 2]]).values, [3, 1])
  close(eigen2([[1, 2], [2, 4]]).values[1], 0)
})

test('eigen2 tells rotations, shears and multiples of I apart', () => {
  const rot = eigen2([[0, -1], [1, 0]])
  assert.equal(rot.kind, 'complex')
  close(rot.re, 0)
  close(rot.im, 1)
  const shear = eigen2([[1, 1], [0, 1]])
  assert.equal(shear.kind, 'repeated')
  assert.deepEqual(shear.values, [1])
  close(Math.abs(shear.vectors[0][0]), 1)
  assert.equal(eigen2([[2, 0], [0, 2]]).kind, 'scalar')
  // Close but distinct eigenvalues are still two lines.
  assert.equal(eigen2([[1, 0], [0, 1.00001]]).kind, 'real')
  // A rotation by 180° built from cos and sin is −I up to round-off.
  const half = eigen2([[Math.cos(Math.PI), -Math.sin(Math.PI)], [Math.sin(Math.PI), Math.cos(Math.PI)]])
  assert.equal(half.kind, 'scalar')
  close(half.values[0], -1)
})

test('maps: det, T(p) = A p + t, and the path from the identity', () => {
  assert.equal(det2([[1, 2], [3, 4]]), -2)
  assert.deepEqual(applyMap([[1, 2], [3, 4]], [1, -1], [1, 1]), [4, 6])
  const half = lerpMap([[3, 0], [0, 3]], [2, 4], 0.5)
  assert.deepEqual(half.m, [[2, 0], [0, 2]])
  assert.deepEqual(half.t, [1, 2])
  assert.deepEqual(lerpMap([[0, -1], [1, 0]], [0, 0], 0).m, [[1, 0], [0, 1]])
  const { m, t } = evalMap({ matrix: [['cos(a)', '-sin(a)'], ['sin(a)', 'cos(a)']], translate: ['b', 0] }, { a: Math.PI / 2, b: 3 })
  close(m[0][0], 0)
  close(m[1][0], 1)
  assert.deepEqual(t, [3, 0])
})

test('sampleScopes tries the ends, the start and values in between', () => {
  assert.equal(sampleScopes([]).length, 1)
  // −2, 1, 2 and the quarter points −1, 0 (1 again): 5 values each.
  assert.deepEqual(sampleScopes([slider('a')]).map((s) => s.a).sort((x, y) => x - y), [-2, -1, 0, 1, 2])
  assert.equal(sampleScopes([slider('a'), slider('b')]).length, 25)
  assert.equal(sampleScopes(['a', 'b', 'c', 'd'].map((n) => slider(n))).length, 81)
  assert.equal(sampleScopes(['a', 'b', 'c', 'd', 'f'].map((n) => slider(n))).length, 11)
})

test('a sound graph has no problems', () => {
  const g = {
    type: 'graph',
    fn: 'a*x^2',
    label: '$f$',
    curves: [{ fn: 'x^2', label: { en: 'reference', es: 'referencia' } }],
    domain: [-3, 3],
    yDomain: [-6, 9],
    points: [{ x: 1, label: 'P' }, { x: 'a', y: 0 }],
    tangent: { x: 'a' },
    area: { from: 0, to: 'a + 1' },
    sliders: [slider('a', { label: '$a$' })],
    caption
  }
  assert.deepEqual(graphProblems(g), [])
  assert.deepEqual(graphProblems({ type: 'graph', fn: 'log(x)', domain: [0.1, 8], caption }), [])
})

test('graph checks catch what would draw wrong', () => {
  const base = { type: 'graph', fn: 'x^2', domain: [-3, 3], caption }
  const has = (g, text) => assert.ok(graphProblems(g).some((p) => p.includes(text)), `${JSON.stringify(graphProblems(g))} lacks "${text}"`)
  has({ ...base, colour: 'red' }, 'unknown field "colour"')
  has({ ...base, caption: { en: 'only English' } }, 'caption needs EN + ES')
  has({ ...base, domain: [3, -3] }, 'domain')
  has({ ...base, fn: 'k*x', sliders: [slider('k')] }, 'needs a yDomain')
  has({ ...base, fn: 'b*x', yDomain: [-5, 5] }, 'reads "b"')
  has({ ...base, yDomain: [-5, 5], sliders: [slider('k')] }, 'slider "k" changes nothing')
  has({ ...base, fn: 'k*x', yDomain: [-5, 5], sliders: [slider('x')] }, '"x" is reserved')
  has({ ...base, fn: 'k*x', yDomain: [-5, 5], sliders: [slider('k', { value: 3 })] }, 'value must be within')
  has({ ...base, fn: 'k*x', yDomain: [-5, 5], sliders: [slider('k', { step: 0 })] }, 'step')
  has({ ...base, fn: 'sqrt(x - 10)' }, 'undefined over most of the domain')
  has({ ...base, fn: 'log(x - k)', yDomain: [-5, 5], sliders: [{ name: 'k', min: -2, max: 5, step: 1, value: 0 }] }, 'with k = 5')
  has({ ...base, curves: [{ fn: 'x' }] }, 'needs a label')
  has({ ...base, curves: [{ fn: 'x', label: 'a' }, { fn: '2x', label: 'b' }, { fn: '3x', label: 'c' }], label: 'f' }, 'at most 2 curves')
  has({ ...base, points: [{ x: 5 }] }, 'outside the domain')
  has({ ...base, yDomain: [0, 4], points: [{ x: 0, y: 9 }] }, 'off the plot')
  has({ ...base, fn: '1/x', tangent: { x: 0 } }, 'no slope')
  has({ ...base, fn: '1/x', area: { from: -1, to: 1 } }, "isn't defined all along")
  has({ ...base, fn: 'x^2 +' }, "doesn't parse")
  // Fine at the ends and the start, broken in between.
  has({ ...base, fn: 'x / (k - 0.5)', yDomain: [-5, 5], sliders: [{ name: 'k', min: 0, max: 1, step: 0.25, value: 1 }] }, 'with k = 0.5')
  has({ ...base, fn: 'k*x', yDomain: [-5, 5], sliders: [slider('k', { value: 0.55 })] }, 'value must be min plus a whole number of steps')
  has({ ...base, fn: 'k*x', yDomain: [-5, 5], sliders: [slider('k', { max: 1.95, step: 0.1 })] }, 'max must be min plus')
  has({ ...base, points: [3] }, 'graph point 1 must be an object')
  has({ ...base, points: [{ x: 1, colour: 'red' }] }, 'unknown field "colour"')
  has({ ...base, points: [{ x: 1, label: '$P$' }] }, 'no $')
  has({ ...base, tangent: { at: 1 } }, 'tangent must be { x }')
  has({ ...base, area: { from: 0 } }, 'area must be { from, to }')
  has({ ...base, sliders: [null], yDomain: [-5, 5] }, 'slider 1 must be an object')
})

test('a sound vector2d has no problems', () => {
  const v = {
    type: 'vector2d',
    matrix: [['cos(t)', '-sin(t)'], ['sin(t)', 'cos(t)']],
    sliders: [{ name: 't', min: 0, max: 6.28, step: 0.01, value: 0.52, label: '$\\theta$' }],
    vectors: [{ x: 1, y: 2, label: 'v', orbit: 4 }],
    shape: [[0, 0], [1, 0], [0, 1]],
    eigen: true,
    morph: false,
    caption
  }
  assert.deepEqual(vector2dProblems(v), [])
  assert.deepEqual(vector2dProblems({ type: 'vector2d', matrix: [[1, 1], [0, 1]], translate: [2, 1], caption }), [])
})

test('vector2d checks catch what would draw wrong', () => {
  const base = { type: 'vector2d', matrix: [[2, 1], [1, 2]], caption }
  const has = (v, text) => assert.ok(vector2dProblems(v).some((p) => p.includes(text)), `${JSON.stringify(vector2dProblems(v))} lacks "${text}"`)
  has({ ...base, matrix: [[1, 2, 3], [4, 5, 6]] }, '2 × 2')
  has({ ...base, translate: [1] }, 'translate')
  has({ ...base, extent: 50 }, 'extent')
  has({ ...base, eigen: 'yes' }, 'eigen must be true or false')
  has({ ...base, eigen: true, translate: [1, 0] }, 'eigen is for linear maps')
  has({ ...base, vectors: [{ x: 1, y: 1, orbit: 2.5 }] }, 'orbit')
  has({ ...base, shape: [[0, 0], [1, 0]] }, 'shape')
  has({ ...base, matrix: [['k', 0], [0, 1]] }, 'reads "k"')
  has({ ...base, vectors: ['v'] }, 'vector2d vector 1 must be an object')
  has({ ...base, vectors: [{ x: 1, y: 1, label: '$v$' }] }, 'no $')
  has({ ...base, vectors: [{ x: 1, y: 1, colour: 'red' }] }, 'unknown field "colour"')
  has({ ...base, sliders: [slider('k')] }, 'slider "k" changes nothing')
  has({ ...base, matrix: [['log(k)', 0], [0, 1]], sliders: [slider('k')] }, "isn't a real number")
  has({ ...base, caption: 'ok', grid: true }, 'unknown field "grid"')
})
