/**
 * The `scatter` section: data points (coordinates may read sliders), with
 * optionally a second class, held-out test points, and one of:
 * - fit 'line': the least-squares line, r and the MSE;
 * - degree: a least-squares polynomial, with training and test MSE;
 * - fit 'pca': the principal axes and the share of variance on each;
 * plus a learner's own line (`guess`, with its MSE) or a decision boundary
 * a·x + b·y + c = 0 between the two classes (with its accuracy). Every
 * number shown is computed here.
 */
import {
  CONSTANTS,
  compile,
  eigen2,
  exprProblems,
  finite,
  isObj,
  isRange,
  localized,
  sampleScopes,
  sliderProblems,
  unknownKeys
} from './plot.js'

export const MAX_DEGREE = 9
export const MAX_POINTS = 40

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length

/** Least-squares line y = slope·x + intercept, with r and the MSE. */
export function linearFit(pts) {
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  const mx = avg(xs)
  const my = avg(ys)
  let sxx = 0
  let sxy = 0
  let syy = 0
  pts.forEach(([x, y]) => {
    sxx += (x - mx) ** 2
    sxy += (x - mx) * (y - my)
    syy += (y - my) ** 2
  })
  const slope = sxx > 0 ? sxy / sxx : NaN
  const intercept = my - slope * mx
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN
  return { slope, intercept, r, mse: mseOf((x) => slope * x + intercept, pts) }
}

/** Mean squared error of a prediction function on points. */
export const mseOf = (f, pts) => avg(pts.map(([x, y]) => (y - f(x)) ** 2))

/** c₀ + c₁x + … + c_d x^d. */
export const evalPoly = (c, x) => c.reduceRight((acc, ci) => acc * x + ci, 0)

/**
 * Least-squares polynomial of a degree, by Householder QR on the Vandermonde
 * matrix (stable where the normal equations aren't, up to degree 9).
 * Returns the coefficients (lowest first), or null when there is no unique
 * fit (fewer distinct x than degree + 1).
 */
export function polyFit(pts, degree) {
  const n = pts.length
  const m = degree + 1
  if (n < m) return null
  const A = pts.map(([x]) => {
    const row = [1]
    for (let j = 1; j < m; j++) row.push(row[j - 1] * x)
    return row
  })
  const b = pts.map((q) => q[1])
  const scale = Math.max(1, ...pts.map(([x]) => Math.abs(x) ** degree))
  for (let k = 0; k < m; k++) {
    let norm = 0
    for (let i = k; i < n; i++) norm += A[i][k] ** 2
    norm = Math.sqrt(norm)
    if (norm < 1e-10 * scale) return null
    const alpha = A[k][k] > 0 ? -norm : norm
    const v = new Array(n).fill(0)
    v[k] = A[k][k] - alpha
    for (let i = k + 1; i < n; i++) v[i] = A[i][k]
    const vv = v.reduce((s, t) => s + t * t, 0)
    if (vv === 0) continue
    const reflect = (get, set) => {
      let dot = 0
      for (let i = k; i < n; i++) dot += v[i] * get(i)
      const f = (2 * dot) / vv
      for (let i = k; i < n; i++) set(i, get(i) - f * v[i])
    }
    for (let j = k; j < m; j++) reflect((i) => A[i][j], (i, val) => (A[i][j] = val))
    reflect((i) => b[i], (i, val) => (b[i] = val))
  }
  const c = new Array(m).fill(0)
  for (let i = m - 1; i >= 0; i--) {
    let sum = b[i]
    for (let j = i + 1; j < m; j++) sum -= A[i][j] * c[j]
    c[i] = sum / A[i][i]
  }
  return c.every(Number.isFinite) ? c : null
}

/** Principal components of 2-D points: the mean, unit axes (largest first), variances and shares. */
export function pca2(pts) {
  const mx = avg(pts.map((q) => q[0]))
  const my = avg(pts.map((q) => q[1]))
  let a = 0
  let b = 0
  let d = 0
  pts.forEach(([x, y]) => {
    a += (x - mx) ** 2
    b += (x - mx) * (y - my)
    d += (y - my) ** 2
  })
  const n = pts.length - 1
  const cov = [[a / n, b / n], [b / n, d / n]]
  const e = eigen2(cov)
  let values
  let vectors
  if (e.kind === 'real') {
    values = e.values
    vectors = e.vectors
  } else {
    // Equal variances in every direction (or one point): any axes will do.
    values = [e.values[0] ?? 0, e.values[0] ?? 0]
    vectors = [[1, 0], [0, 1]]
  }
  const total = values[0] + values[1]
  return { mean: [mx, my], cov, values, vectors, share: values.map((v) => (total > 0 ? v / total : NaN)) }
}

/** How many points fall on their class's side of a·x + b·y + c = 0 (class 2 where it is > 0). */
export function boundaryAccuracy(points, points2, { a, b, c }) {
  const side = ([x, y]) => a * x + b * y + c
  const correct = points.filter((q) => side(q) < 0).length + points2.filter((q) => side(q) > 0).length
  return { correct, total: points.length + points2.length }
}

/** The section's points for one slider setting. */
export function evalPoints(list = [], scope = {}) {
  return list.map((q) => q.map((v) => compile(v).evaluate(scope)))
}

// ── Checks for verify:content ───────────────────────────────────────────────

const KEYS = new Set(['type', 'points', 'points2', 'test', 'legend', 'fit', 'degree', 'guess', 'boundary', 'project', 'domain', 'yDomain', 'sliders', 'axes', 'caption'])
const LEGEND_KEYS = new Set(['points', 'points2', 'test'])

const pointList = (v) => Array.isArray(v) && v.every((q) => Array.isArray(q) && q.length === 2)

/** Problems with a `scatter` section, as text; [] when it is sound. */
export function scatterProblems(s) {
  const p = unknownKeys(s, KEYS, 'scatter')
  const sliders = s.sliders || []
  p.push(...sliderProblems(sliders))
  if (!localized(s.caption)) p.push('scatter: caption needs EN + ES')
  if (!pointList(s.points) || s.points.length < 2) p.push('scatter: points must be at least 2 [x, y] pairs')
  for (const k of ['points2', 'test']) if (s[k] !== undefined && (!pointList(s[k]) || s[k].length < 1)) p.push(`scatter: ${k} must be [x, y] pairs`)
  const count = (s.points?.length || 0) + (s.points2?.length || 0) + (s.test?.length || 0)
  if (count > MAX_POINTS) p.push(`scatter: at most ${MAX_POINTS} points in all`)
  if (!isRange(s.domain) || !isRange(s.yDomain)) p.push('scatter: domain and yDomain must be [min, max] with min < max')
  if (s.fit !== undefined && !['line', 'pca'].includes(s.fit)) p.push("scatter: fit is 'line' or 'pca'")
  if (s.fit !== undefined && s.degree !== undefined) p.push('scatter: use fit or degree, not both')
  if (s.test && s.fit !== 'line' && s.degree === undefined) p.push('scatter: test points need a fit line or a degree to score')
  if (s.points2 && !s.boundary) p.push('scatter: a second class needs a boundary')
  if (s.boundary && !s.points2) p.push('scatter: a boundary needs points2 (the second class)')
  if (s.guess && s.boundary) p.push('scatter: use guess or boundary, not both')
  if (s.project !== undefined && (s.project !== true || s.fit !== 'pca')) p.push("scatter: project is true, with fit 'pca'")
  if (s.fit === 'pca' && (s.points?.length || 0) < 3) p.push('scatter: pca needs at least 3 points')
  if (s.guess !== undefined && !(isObj(s.guess) && unknownKeys(s.guess, new Set(['slope', 'intercept']), '').length === 0 && 'slope' in s.guess && 'intercept' in s.guess)) {
    p.push('scatter: guess must be { slope, intercept }')
  }
  if (s.boundary !== undefined && !(isObj(s.boundary) && unknownKeys(s.boundary, new Set(['a', 'b', 'c']), '').length === 0 && ['a', 'b', 'c'].every((k) => k in s.boundary))) {
    p.push('scatter: boundary must be { a, b, c }')
  }
  if (s.legend !== undefined) {
    if (!isObj(s.legend)) p.push('scatter: legend must be an object')
    else {
      p.push(...unknownKeys(s.legend, LEGEND_KEYS, 'scatter legend'))
      for (const [k, v] of Object.entries(s.legend)) if (!localized(v)) p.push(`scatter: legend.${k} needs EN + ES (or one plain string)`)
    }
  }
  if (s.axes !== undefined && !(Array.isArray(s.axes) && s.axes.length === 2 && s.axes.every(localized))) p.push('scatter: axes must be two labels [x, y]')
  if (p.length) return p

  const names = sliders.map((sl) => sl.name)
  const params = new Set([...names, ...CONSTANTS])
  const exprs = []
  for (const k of ['points', 'points2', 'test']) (s[k] || []).forEach((q, i) => exprs.push({ where: `scatter ${k}[${i + 1}] x`, src: q[0] }, { where: `scatter ${k}[${i + 1}] y`, src: q[1] }))
  if (s.degree !== undefined) exprs.push({ where: 'scatter degree', src: s.degree })
  if (s.guess) exprs.push({ where: 'scatter guess slope', src: s.guess.slope }, { where: 'scatter guess intercept', src: s.guess.intercept })
  if (s.boundary) for (const k of ['a', 'b', 'c']) exprs.push({ where: `scatter boundary ${k}`, src: s.boundary[k] })
  const used = exprProblems(exprs, params, p)
  for (const n of names) if (!used.has(n)) p.push(`scatter: slider "${n}" changes nothing`)
  if (p.length) return p

  const [x0, x1] = s.domain
  const [y0, y1] = s.yDomain
  for (const sc of sampleScopes(sliders)) {
    const at = names.length ? ` (with ${names.map((n) => `${n} = ${sc[n]}`).join(', ')})` : ''
    const all = ['points', 'points2', 'test'].flatMap((k) => evalPoints(s[k], sc))
    if (!all.every((q) => q.every(finite))) {
      p.push(`scatter: a point isn't a number${at}`)
      continue
    }
    if (!all.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) p.push(`scatter: a point is off the plot${at}`)
    const pts = evalPoints(s.points, sc)
    if (s.fit === 'line' && !finite(linearFit(pts).slope)) p.push(`scatter: the points need two different x for a line${at}`)
    if (s.degree !== undefined) {
      const d = compile(s.degree).evaluate(sc)
      if (!Number.isInteger(d) || d < 0 || d > Math.min(MAX_DEGREE, pts.length - 1)) p.push(`scatter: degree must be a whole number in [0, ${Math.min(MAX_DEGREE, pts.length - 1)}]${at}`)
      else {
        const c = polyFit(pts, d)
        if (!c) p.push(`scatter: no unique polynomial of degree ${d} through these points${at}`)
        else if (c.some((v) => Math.abs(v) > 1e6)) p.push(`scatter: the degree-${d} fit is nearly singular (x values too close together)${at}`)
      }
    }
    if (s.guess && ![s.guess.slope, s.guess.intercept].every((v) => finite(compile(v).evaluate(sc)))) p.push(`scatter: guess isn't a number${at}`)
    if (s.boundary) {
      const [a, b, c] = ['a', 'b', 'c'].map((k) => compile(s.boundary[k]).evaluate(sc))
      if (![a, b, c].every(finite) || (a === 0 && b === 0)) p.push(`scatter: the boundary needs numbers a, b (not both 0) and c${at}`)
    }
  }
  return [...new Set(p)]
}
