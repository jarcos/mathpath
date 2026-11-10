import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  binomialPmf,
  distributionProblems,
  moments,
  normalCdf,
  pmf,
  poissonPmf,
  shadeProbability
} from '../src/shared/dist.js'
import { boundaryAccuracy, evalPoly, linearFit, mseOf, pca2, polyFit, scatterProblems } from '../src/shared/fit.js'
import { attention, convolve, heatmapProblems, pool, softmax } from '../src/shared/grid.js'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`)
const caption = { en: 'A caption.', es: 'Un pie.' }
const sum = (a) => a.reduce((s, v) => s + v, 0)

// ── distributions ───────────────────────────────────────────────────────────

test('binomial and Poisson probabilities', () => {
  const b = binomialPmf(10, 0.5)
  close(sum(b), 1)
  close(b[5], 252 / 1024)
  close(binomialPmf(3, 0.5)[3], 0.125) // p^n
  assert.deepEqual(binomialPmf(4, 0), [1, 0, 0, 0, 0])
  assert.deepEqual(binomialPmf(4, 1), [0, 0, 0, 0, 1])
  close(sum(binomialPmf(200, 0.3)), 1)
  close(poissonPmf(2, 0)[0], Math.exp(-2))
  close(sum(poissonPmf(4, 60)), 1)
  assert.equal(pmf('binomial', { n: 3, p: 0.5 }, 5).length, 6)
  assert.deepEqual(moments('binomial', { n: 10, p: 0.5 }), { mean: 5, variance: 2.5 })
  assert.deepEqual(moments('poisson', { rate: 4 }), { mean: 4, variance: 4 })
})

test('normal probabilities and the shaded event', () => {
  close(normalCdf(1.96, 0, 1), 0.9750021, 1e-6)
  const std = { mean: 0, sd: 1 }
  close(shadeProbability('normal', std, -1, 1), 0.6826895, 1e-6)
  close(shadeProbability('normal', std, -2, 2), 0.9544997, 1e-6)
  close(shadeProbability('normal', std, -2, 2, true), 0.0455003, 1e-6) // two-sided p-value at z = 2
  close(shadeProbability('normal', { mean: 10, sd: 2 }, 8, 12), 0.6826895, 1e-6)
  close(shadeProbability('normal', std, -Infinity, 0), 0.5)
  close(shadeProbability('binomial', { n: 3, p: 0.5 }, -Infinity, 2), 0.875)
  close(shadeProbability('binomial', { n: 3, p: 0.5 }, 0, 3, true), 0.25) // X ≤ 0 or X ≥ 3
  close(shadeProbability('poisson', { rate: 2 }, 0, 0), Math.exp(-2))
  close(shadeProbability('poisson', { rate: 2 }, 1, Infinity), 1 - Math.exp(-2))
})

test('distribution checks', () => {
  const ok = { type: 'distribution', family: 'binomial', params: { n: 'n', p: 0.3 }, domain: [0, 60], approx: true, sliders: [{ name: 'n', min: 1, max: 100, step: 1, value: 10 }], caption }
  assert.deepEqual(distributionProblems(ok), [])
  assert.deepEqual(distributionProblems({ type: 'distribution', family: 'normal', params: { mean: 0, sd: 1 }, domain: [-4, 4], shade: { from: -2, to: 2, outside: true }, caption }), [])
  const has = (s, text) => assert.ok(distributionProblems(s).some((x) => x.includes(text)), `${JSON.stringify(distributionProblems(s))} lacks "${text}"`)
  has({ ...ok, family: 'gamma' }, 'family must be')
  has({ ...ok, params: { n: 'n' } }, 'params.p is missing')
  has({ ...ok, params: { n: 'n', p: 0.3, q: 1 } }, 'unknown field "q"')
  has({ ...ok, params: { n: 'n / 2', p: 0.3 } }, 'whole n')
  has({ ...ok, params: { n: 'n', p: 'n / 10' } }, 'p in [0, 1]')
  has({ ...ok, domain: [-1, 10] }, 'whole numbers from 0')
  has({ ...ok, family: 'normal', params: { mean: 0, sd: 'n - 5' }, domain: [-4, 4], approx: undefined }, 'sd > 0')
  has({ ...ok, family: 'normal', params: { mean: 0, sd: 1 }, domain: [-4, 4] }, 'approx')
  has({ ...ok, shade: { from: 1, outside: true } }, 'needs both from and to')
  has({ ...ok, shade: { at: 1 } }, 'unknown field "at"')
  has({ ...ok, shade: {} }, 'shade needs from, to or both')
  has({ ...ok, family: 'normal', params: { mean: 0, sd: 1 }, domain: [-4, 4], approx: undefined, sliders: [], shade: { from: 2, to: 1, outside: true } }, 'needs from < to')
  has({ ...ok, family: 'poisson', params: { rate: 'n' }, approx: undefined, domain: [0, 20] }, 'shows only')
  has({ ...ok, family: 'normal', params: { mean: 0, sd: 0.5 }, domain: [-4, 4], approx: undefined, sliders: [], yMax: 0.5 }, 'above yMax')
  has({ ...ok, sliders: [{ name: 'm', min: 1, max: 5, step: 1, value: 2 }] }, 'reads "n"')
})

// ── scatter ─────────────────────────────────────────────────────────────────

test('least squares, polynomials, PCA and boundaries', () => {
  const line = linearFit([[0, 0], [1, 2], [2, 4]])
  close(line.slope, 2)
  close(line.intercept, 0)
  close(line.r, 1)
  close(line.mse, 0)
  close(linearFit([[1, 2], [2, 4], [3, 5], [4, 8]]).r, 9.5 / Math.sqrt(93.75))
  // A cubic is recovered exactly; ten points pin down a degree-9 polynomial.
  const cubic = [-1, -0.5, 0, 0.5, 1, 1.5].map((x) => [x, 2 - x + 3 * x ** 3])
  polyFit(cubic, 3).forEach((c, i) => close(c, [2, -1, 0, 3][i], 1e-9))
  const ten = Array.from({ length: 10 }, (_, i) => [-1 + (2 * i) / 9, Math.sin(3 * i)])
  close(mseOf((x) => evalPoly(polyFit(ten, 9), x), ten), 0, 1e-9)
  assert.equal(polyFit([[1, 1], [1, 2], [1, 3]], 1), null)
  const p = pca2([[1, 1], [2, 2], [3, 3], [4, 4]])
  close(p.share[0], 1)
  close(Math.abs(p.vectors[0][0]), Math.SQRT1_2)
  assert.deepEqual(boundaryAccuracy([[0, 0], [1, 0]], [[3, 3], [0.5, 0.2]], { a: 1, b: 1, c: -2 }), { correct: 3, total: 4 })
})

test('scatter checks', () => {
  const ok = {
    type: 'scatter',
    points: [[1, 2], [2, 4], [3, 5], [4, 'y4']],
    fit: 'line',
    domain: [0, 5],
    yDomain: [-5, 12],
    sliders: [{ name: 'y4', min: -4, max: 10, step: 0.5, value: 8 }],
    caption
  }
  assert.deepEqual(scatterProblems(ok), [])
  const has = (s, text) => assert.ok(scatterProblems(s).some((x) => x.includes(text)), `${JSON.stringify(scatterProblems(s))} lacks "${text}"`)
  has({ ...ok, yDomain: [0, 12] }, 'off the plot')
  has({ ...ok, fit: 'curve' }, "fit is 'line' or 'pca'")
  has({ ...ok, points2: [[1, 1]] }, 'needs a boundary')
  has({ ...ok, points: [[1, 2], [2, 4], [3, 5], [4, 8]], fit: undefined, degree: 'd', sliders: [{ name: 'd', min: 0, max: 5, step: 1, value: 1 }] }, 'degree must be a whole number in [0, 3]')
  has({ ...ok, test: [[1, 1]], fit: undefined }, 'test points need')
  has({ ...ok, guess: { slope: 1 } }, 'guess must be { slope, intercept }')
  has({ ...ok, points: [[1, 'z'], [2, 3]] }, 'reads "z"')
  has({ ...ok, points: [[1, 1], [1, 2], [1, 3]], sliders: [] }, 'two different x')
  has({ ...ok, project: true }, "project is true, with fit 'pca'")
  has({ ...ok, points: [[0, 0], [1, 1], [1.000001, 0], [2, 2]], fit: undefined, degree: 3, sliders: [] }, 'nearly singular')
})

// ── heatmaps ────────────────────────────────────────────────────────────────

test('convolution, pooling and attention', () => {
  const img = [[10, 10, 10], [10, 50, 10], [10, 10, 10]]
  const laplacian = [[0, -1, 0], [-1, 4, -1], [0, -1, 0]]
  assert.deepEqual(convolve(img, laplacian), [[160]])
  const box = Array.from({ length: 3 }, () => [1 / 9, 1 / 9, 1 / 9])
  close(convolve([[9, 9, 9, 9], [9, 9, 9, 9], [9, 9, 9, 9]], box)[0][1], 9)
  const x = [[1, 3, 2, 4], [5, 6, 1, 2], [7, 8, 0, 1], [3, 2, 4, 0]]
  assert.deepEqual(pool(x, 2, 'max'), [[6, 4], [8, 4]])
  assert.deepEqual(pool(x, 2, 'avg'), [[3.75, 2.25], [5, 1.25]])
  softmax([1, 2, 3]).forEach((v, i) => close(v, [0.0900306, 0.2447285, 0.6652410][i], 1e-6))
  const { weights } = attention([[1, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]], 1, true)
  assert.deepEqual(weights[0], [1, 0, 0])
  weights.forEach((row) => close(sum(row), 1))
  close(attention([[1, 2]], [[3, 4]]).scores[0][0], 11 / Math.SQRT2)
})

test('heatmap checks', () => {
  const conv = { type: 'heatmap', mode: 'conv', input: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], kernels: [{ label: { en: 'Blur', es: 'Desenfoque' }, kernel: [[1, 1], [1, 1]] }], caption }
  assert.deepEqual(heatmapProblems(conv), [])
  const att = { type: 'heatmap', mode: 'attention', tokens: ['a', 'b'], q: [[1, 0], [0, 1]], k: [[1, 0], [0, 1]], temperature: 't', sliders: [{ name: 't', min: 0.5, max: 2, step: 0.5, value: 1 }], caption }
  assert.deepEqual(heatmapProblems(att), [])
  const has = (s, text) => assert.ok(heatmapProblems(s).some((x) => x.includes(text)), `${JSON.stringify(heatmapProblems(s))} lacks "${text}"`)
  has({ ...conv, mode: 'blur' }, 'mode is')
  has({ ...conv, kernels: [{ label: 'k', kernel: [[1, 1, 1, 1]] }] }, 'larger than the input')
  has({ ...conv, input: [[1, 2], [3]] }, 'rectangular grid')
  has({ ...conv, size: 2 }, "size isn't used in mode 'conv'")
  has({ type: 'heatmap', mode: 'pool', input: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], size: 2, caption }, 'multiples of size')
  has({ ...att, tokens: ['a', '$b$'] }, 'plain labels')
  has({ ...att, q: [[1, 0]] }, 'one row per token')
  has({ ...att, sliders: [{ name: 't', min: -1, max: 1, step: 0.5, value: 1 }] }, 'temperature must be positive')
})
