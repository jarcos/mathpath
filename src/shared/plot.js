/**
 * The interactive figures of a lesson, as pure maths (renderer, verify:content
 * and tests):
 *
 * - `graph`: y = f(x) with up to two more curves, marked points, a tangent, a
 *   shaded area and sliders for the parameters of every expression.
 * - `vector2d`: a 2 × 2 matrix, or an affine map (matrix + translation),
 *   acting on the plane: the grid, the unit square, chosen vectors (and their
 *   orbit under repeated application), a shape and the real eigenvectors.
 *
 * Every expression is a number or a mathjs string; a slider's `name` is a
 * variable of those strings. The readouts (slope, area, determinant,
 * eigenvalues) are computed here, never written by hand, so they can't be
 * wrong in the content.
 */
import * as math from 'mathjs'

// The graph's variable and the mathjs constants: no slider may take them.
const RESERVED = new Set(['x', 'e', 'E', 'pi', 'PI', 'tau', 'phi', 'i', 'Infinity', 'NaN', 'true', 'false', 'null', 'undefined'])
export const CONSTANTS = ['e', 'E', 'pi', 'PI', 'tau', 'phi']
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/

/** Curves a graph may draw: its own `fn` and two more, one color each. */
export const MAX_CURVES = 3
/** Samples per curve. */
export const SAMPLES = 480

export const finite = (v) => typeof v === 'number' && Number.isFinite(v)

/** A number or a mathjs expression, compiled once; evaluate() gives a real number or NaN. */
export function compile(src) {
  if (typeof src === 'number') return { src: String(src), evaluate: () => src }
  const code = math.compile(String(src))
  return {
    src: String(src),
    evaluate(scope = {}) {
      try {
        const v = code.evaluate(scope)
        return finite(v) ? v : NaN
      } catch {
        return NaN
      }
    }
  }
}

/** An expression as TeX (for a default legend label), or as written if it doesn't parse. */
export function texOf(src) {
  try {
    return math
      .parse(String(src))
      .toTex({ parenthesis: 'auto', implicit: 'hide' })
      .replace(/\\mathrm\{([A-Za-z])\}/g, '$1') // mathjs reads h, A, B… as units
      .replace(/(\d)\\cdot\s*(?=[A-Za-z{\\])/g, '$1') // 2x, not 2·x
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return String(src)
  }
}

/** The variables an expression reads (function names excluded). */
export function freeSymbols(src) {
  if (typeof src === 'number') return []
  const out = new Set()
  math.parse(String(src)).traverse((node, path) => {
    if (node.isSymbolNode && path !== 'fn') out.add(node.name)
  })
  return [...out]
}

/** Each slider at its starting value. */
export function sliderDefaults(sliders = []) {
  return Object.fromEntries(sliders.map((s) => [s.name, s.value]))
}

/** A slider's ends, its start and, with `inner`, three steps in between (on its grid). */
function sliderSamples(s, inner) {
  const vals = [s.min, s.value, s.max]
  if (inner) {
    for (const q of [0.25, 0.5, 0.75]) {
      const k = Math.round(((s.max - s.min) * q) / s.step)
      vals.push(Number((s.min + k * s.step).toPrecision(12)))
    }
  }
  return [...new Set(vals)]
}

/**
 * The slider settings a check should try. With up to three sliders, every
 * combination of each one's ends, start and three values in between; with
 * four, every combination of ends and start; with more, each slider at its
 * ends on its own.
 */
export function sampleScopes(sliders = []) {
  const base = sliderDefaults(sliders)
  if (sliders.length === 0) return [base]
  if (sliders.length <= 4) {
    let scopes = [{}]
    for (const s of sliders) {
      const vals = sliderSamples(s, sliders.length <= 3)
      scopes = scopes.flatMap((sc) => vals.map((v) => ({ ...sc, [s.name]: v })))
    }
    return scopes
  }
  const scopes = [base]
  for (const s of sliders) for (const v of [s.min, s.max]) scopes.push({ ...base, [s.name]: v })
  return scopes
}

/** A "nice" tick step (1, 2 or 5 × 10ⁿ) giving about eight ticks over the span. */
export function niceStep(span) {
  const raw = span / 8
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * pow
}

/** Tick positions from min to max. */
export function ticks(min, max) {
  const step = niceStep(max - min)
  const out = []
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + 1e-9; k++) out.push(Number((k * step).toPrecision(12)))
  return out
}

/** [x, y] samples of a curve over [x0, x1]; y is NaN where it isn't defined. */
export function sampleCurve(f, [x0, x1], scope = {}, n = SAMPLES) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    pts.push([x, f.evaluate({ ...scope, x })])
  }
  return pts
}

/**
 * A y-range for curves without a fixed one: the 4th–96th percentile of the
 * samples, so an asymptote doesn't flatten the rest, always showing y = 0.
 */
export function autoYRange(ys) {
  const s = ys.filter(finite).sort((a, b) => a - b)
  if (s.length < 2) return [-5, 5]
  let lo = Math.min(s[Math.floor(s.length * 0.04)], 0)
  let hi = Math.max(s[Math.floor(s.length * 0.96)], 0)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const pad = (hi - lo) * 0.1
  return [lo - pad, hi + pad]
}

/** f'(x) by a central difference. */
export function slopeAt(f, x, scope = {}) {
  const h = 1e-5 * Math.max(1, Math.abs(x))
  return (f.evaluate({ ...scope, x: x + h }) - f.evaluate({ ...scope, x: x - h })) / (2 * h)
}

/** The signed area ∫ f from a to b (Simpson's rule); NaN if f isn't defined all along. */
export function areaUnder(f, a, b, scope = {}, n = 400) {
  if (a === b) return 0
  const h = (b - a) / n
  let s = 0
  for (let i = 0; i <= n; i++) {
    const y = f.evaluate({ ...scope, x: a + i * h })
    if (!finite(y)) return NaN
    s += y * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2)
  }
  return (s * h) / 3
}

/** A short number for a readout: up to two decimals, no "-0". */
export function fmt(n, digits = 2) {
  if (!finite(n)) return '—'
  const r = Number(n.toFixed(digits))
  return Object.is(r, -0) || r === 0 ? '0' : String(r)
}

// ── Linear maps of the plane ────────────────────────────────────────────────

export const det2 = ([[a, b], [c, d]]) => a * d - b * c

/** T(p) = A p + t. */
export const applyMap = ([[a, b], [c, d]], [t0, t1], [x, y]) => [a * x + b * y + t0, c * x + d * y + t1]

/** Part of the way from the identity (s = 0) to the map (s = 1). */
export function lerpMap(m, t, s) {
  const id = [[1, 0], [0, 1]]
  return {
    m: m.map((row, i) => row.map((v, j) => (1 - s) * id[i][j] + s * v)),
    t: t.map((v) => s * v)
  }
}

// A unit vector spanning the kernel of A − λI: orthogonal to its larger row.
function eigvec([[a, b], [c, d]], l) {
  const r1 = [a - l, b]
  const r2 = [c, d - l]
  const r = Math.hypot(...r1) >= Math.hypot(...r2) ? r1 : r2
  const n = Math.hypot(r[0], r[1])
  return n ? [-r[1] / n, r[0] / n] : [1, 0]
}

/**
 * The real eigenvalues of a 2 × 2 matrix and a unit eigenvector for each:
 * kind 'real' (two), 'repeated' (one line), 'scalar' (A = λI, every vector)
 * or 'complex' (none, with the real and imaginary parts).
 */
export function eigen2(m) {
  const [[a, b], [c, d]] = m
  const tr = a + d
  const disc = tr * tr - 4 * det2(m)
  // Round-off only: entries are compared to 1e-9 of their size, and the
  // discriminant (a square of entries) to 1e-12 of its size, so a gap of
  // 1e-5 between eigenvalues still counts as two.
  const scale = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d))
  const tol = 1e-9 * scale
  const discTol = 1e-12 * scale * scale
  if (Math.abs(b) <= tol && Math.abs(c) <= tol && Math.abs(a - d) <= tol) {
    return { kind: 'scalar', values: [(a + d) / 2], vectors: [] }
  }
  if (disc < -discTol) return { kind: 'complex', values: [], vectors: [], re: tr / 2, im: Math.sqrt(-disc) / 2 }
  if (disc <= discTol) {
    const l = tr / 2
    return { kind: 'repeated', values: [l], vectors: [eigvec(m, l)] }
  }
  const r = Math.sqrt(disc)
  const ls = [(tr + r) / 2, (tr - r) / 2]
  return { kind: 'real', values: ls, vectors: ls.map((l) => eigvec(m, l)) }
}

/** The section's matrix and translation for one slider setting. */
export function evalMap(section, scope = {}) {
  const ev = (src) => compile(src).evaluate(scope)
  return {
    m: section.matrix.map((row) => row.map(ev)),
    t: (section.translate || [0, 0]).map(ev)
  }
}

// ── Checks for verify:content ───────────────────────────────────────────────

const GRAPH_KEYS = new Set(['type', 'fn', 'label', 'domain', 'yDomain', 'curves', 'points', 'tangent', 'area', 'sliders', 'caption'])
const VECTOR_KEYS = new Set(['type', 'matrix', 'translate', 'sliders', 'vectors', 'shape', 'extent', 'eigen', 'square', 'morph', 'caption'])
const SLIDER_KEYS = new Set(['name', 'min', 'max', 'step', 'value', 'label'])
const CURVE_KEYS = new Set(['fn', 'label'])
const POINT_KEYS = new Set(['x', 'y', 'label'])
const VEC_KEYS = new Set(['x', 'y', 'label', 'orbit'])

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Each item of a list field must be an object with only the known fields.
export function itemProblems(list, keys, what) {
  if (list === undefined) return []
  if (!Array.isArray(list)) return [`${what}s must be an array`]
  return list.flatMap((item, i) =>
    isObj(item) ? unknownKeys(item, keys, `${what} ${i + 1}`) : [`${what} ${i + 1} must be an object`]
  )
}

// Point and vector labels are drawn as plain SVG text: no TeX.
export const plainLabel = (v) => typeof v === 'string' ? !v.includes('$') : !v || (!String(v.en).includes('$') && !String(v.es).includes('$'))

// On the slider's grid min + k·step (as the range input snaps to it).
const onGrid = (v, s) => Math.abs((v - s.min) / s.step - Math.round((v - s.min) / s.step)) < 1e-6

export const localized = (v) =>
  (typeof v === 'string' && v.trim() !== '') ||
  (v && typeof v === 'object' && typeof v.en === 'string' && v.en.trim() !== '' && typeof v.es === 'string' && v.es.trim() !== '')

export const isExpr = (v) => finite(v) || (typeof v === 'string' && v.trim() !== '')
export const isRange = (r) => Array.isArray(r) && r.length === 2 && finite(r[0]) && finite(r[1]) && r[0] < r[1]

export function unknownKeys(obj, keys, what) {
  return Object.keys(obj).filter((k) => !keys.has(k)).map((k) => `${what}: unknown field "${k}"`)
}

export function sliderProblems(sliders) {
  if (!Array.isArray(sliders)) return ['sliders must be an array']
  const p = []
  const seen = new Set()
  sliders.forEach((s, i) => {
    const w = `slider ${i + 1}`
    if (!isObj(s)) {
      p.push(`${w} must be an object`)
      return
    }
    p.push(...unknownKeys(s, SLIDER_KEYS, w))
    if (typeof s.name !== 'string' || !NAME.test(s.name)) p.push(`${w}: name must be a variable name`)
    else if (RESERVED.has(s.name)) p.push(`${w}: "${s.name}" is reserved`)
    else if (seen.has(s.name)) p.push(`${w}: "${s.name}" is used twice`)
    seen.add(s.name)
    if (!finite(s.min) || !finite(s.max) || s.min >= s.max) p.push(`${w}: needs numbers min < max`)
    else {
      if (!finite(s.step) || s.step <= 0 || s.step > s.max - s.min) p.push(`${w}: step must be in (0, max − min]`)
      else if ((s.max - s.min) / s.step > 2000) p.push(`${w}: more than 2000 steps`)
      else if (!onGrid(s.max, s)) p.push(`${w}: max must be min plus a whole number of steps`)
      if (!finite(s.value) || s.value < s.min || s.value > s.max) p.push(`${w}: value must be within [min, max]`)
      else if (finite(s.step) && s.step > 0 && !onGrid(s.value, s)) p.push(`${w}: value must be min plus a whole number of steps`)
    }
    if (s.label !== undefined && !localized(s.label)) p.push(`${w}: label needs EN + ES (or one plain string)`)
  })
  return p
}

// Parse each expression and check it only reads the allowed names; returns
// the slider names it uses.
export function exprProblems(exprs, allowed, p) {
  const used = new Set()
  for (const { where, src } of exprs) {
    if (!isExpr(src)) {
      p.push(`${where}: needs a number or an expression`)
      continue
    }
    let syms
    try {
      syms = freeSymbols(src)
    } catch (e) {
      p.push(`${where}: "${src}" doesn't parse: ${e.message}`)
      continue
    }
    for (const s of syms) {
      if (!allowed.has(s)) p.push(`${where}: "${src}" reads "${s}", which is no slider here`)
      used.add(s)
    }
  }
  return used
}

/** Problems with a `graph` section, as text; [] when it is sound. */
export function graphProblems(s) {
  const p = unknownKeys(s, GRAPH_KEYS, 'graph')
  const sliders = s.sliders || []
  p.push(...sliderProblems(sliders))
  if (!localized(s.caption)) p.push('graph: caption needs EN + ES')
  if (!isRange(s.domain)) p.push('graph: domain must be [min, max] with min < max')
  if (s.yDomain !== undefined && !isRange(s.yDomain)) p.push('graph: yDomain must be [min, max] with min < max')
  if (sliders.length && s.yDomain === undefined) p.push('graph: a graph with sliders needs a yDomain, so the axes stay still')
  p.push(...itemProblems(s.curves, CURVE_KEYS, 'graph curve'), ...itemProblems(s.points, POINT_KEYS, 'graph point'))
  if (s.tangent !== undefined && !(isObj(s.tangent) && unknownKeys(s.tangent, new Set(['x']), '').length === 0 && 'x' in s.tangent)) {
    p.push('graph: tangent must be { x }')
  }
  if (s.area !== undefined && !(isObj(s.area) && unknownKeys(s.area, new Set(['from', 'to']), '').length === 0 && 'from' in s.area && 'to' in s.area)) {
    p.push('graph: area must be { from, to }')
  }
  if (p.length) return p
  const curves = s.curves || []
  if (!Array.isArray(curves)) p.push('graph: curves must be an array')
  else if (curves.length > MAX_CURVES - 1) p.push(`graph: at most ${MAX_CURVES - 1} curves besides fn`)
  if (curves.length) {
    if (!localized(s.label)) p.push('graph: with more curves, fn needs a label for the legend')
    curves.forEach((c, i) => {
      if (!localized(c.label)) p.push(`graph: curve ${i + 1} needs a label for the legend`)
    })
  } else if (s.label !== undefined && !localized(s.label)) p.push('graph: label needs EN + ES (or one plain string)')
  const points = s.points || []
  points.forEach((pt, i) => {
    if (pt.label !== undefined && !localized(pt.label)) p.push(`graph: point ${i + 1} label needs EN + ES (or one plain string)`)
    else if (!plainLabel(pt.label)) p.push(`graph: point ${i + 1} label is drawn as plain text: no $…$`)
  })
  if (p.length) return p

  const names = sliders.map((sl) => sl.name)
  const params = new Set([...names, ...CONSTANTS])
  const withX = new Set([...params, 'x'])
  const used = new Set()
  const add = (set) => set.forEach((n) => used.add(n))
  add(exprProblems([{ where: 'graph fn', src: s.fn }, ...curves.map((c, i) => ({ where: `graph curve ${i + 1}`, src: c.fn }))], withX, p))
  const numeric = []
  points.forEach((pt, i) => {
    numeric.push({ where: `graph point ${i + 1} x`, src: pt.x })
    if (pt.y !== undefined) numeric.push({ where: `graph point ${i + 1} y`, src: pt.y })
  })
  if (s.tangent) numeric.push({ where: 'graph tangent x', src: s.tangent.x })
  if (s.area) numeric.push({ where: 'graph area from', src: s.area.from }, { where: 'graph area to', src: s.area.to })
  add(exprProblems(numeric, params, p))
  for (const n of names) if (!used.has(n)) p.push(`graph: slider "${n}" changes nothing`)
  if (p.length) return p

  const fns = [s.fn, ...curves.map((c) => c.fn)].map(compile)
  const [x0, x1] = s.domain
  const inX = (x) => finite(x) && x >= x0 - 1e-9 && x <= x1 + 1e-9
  const yr = s.yDomain
  const scopes = sampleScopes(sliders)
  const at = (sc) => (names.length ? ` (with ${names.map((n) => `${n} = ${sc[n]}`).join(', ')})` : '')
  scopes.forEach((sc, k) => {
    fns.forEach((f, i) => {
      const ys = sampleCurve(f, s.domain, sc).map(([, y]) => y)
      const ok = ys.filter(finite)
      const what = i === 0 ? 'fn' : `curve ${i}`
      if (ok.length < ys.length / 4) p.push(`graph ${what} "${f.src}" is undefined over most of the domain${at(sc)}`)
      else if (yr && k === 0 && !ok.some((y) => y >= yr[0] && y <= yr[1])) p.push(`graph ${what} "${f.src}" never enters yDomain`)
    })
    points.forEach((pt, i) => {
      const x = compile(pt.x).evaluate(sc)
      const y = pt.y === undefined ? fns[0].evaluate({ ...sc, x }) : compile(pt.y).evaluate(sc)
      if (!inX(x)) p.push(`graph point ${i + 1}: x is outside the domain${at(sc)}`)
      else if (!finite(y)) p.push(`graph point ${i + 1}: y isn't a number${at(sc)}`)
      else if (yr && k === 0 && (y < yr[0] || y > yr[1])) p.push(`graph point ${i + 1}: off the plot at the start`)
    })
    if (s.tangent) {
      const x = compile(s.tangent.x).evaluate(sc)
      if (!inX(x)) p.push(`graph tangent: x is outside the domain${at(sc)}`)
      else if (!finite(fns[0].evaluate({ ...sc, x })) || !finite(slopeAt(fns[0], x, sc))) p.push(`graph tangent: fn has no slope there${at(sc)}`)
    }
    if (s.area) {
      const a = compile(s.area.from).evaluate(sc)
      const b = compile(s.area.to).evaluate(sc)
      if (!inX(a) || !inX(b)) p.push(`graph area: from/to outside the domain${at(sc)}`)
      else if (!finite(areaUnder(fns[0], a, b, sc))) p.push(`graph area: fn isn't defined all along [from, to]${at(sc)}`)
    }
  })
  return [...new Set(p)]
}

/** Problems with a `vector2d` section, as text; [] when it is sound. */
export function vector2dProblems(s) {
  const p = unknownKeys(s, VECTOR_KEYS, 'vector2d')
  const sliders = s.sliders || []
  p.push(...sliderProblems(sliders))
  if (!localized(s.caption)) p.push('vector2d: caption needs EN + ES')
  const m = s.matrix
  if (!Array.isArray(m) || m.length !== 2 || !m.every((r) => Array.isArray(r) && r.length === 2)) p.push('vector2d: matrix must be 2 × 2')
  if (s.translate !== undefined && (!Array.isArray(s.translate) || s.translate.length !== 2)) p.push('vector2d: translate must have 2 entries')
  if (s.extent !== undefined && (!Number.isInteger(s.extent) || s.extent < 2 || s.extent > 12)) p.push('vector2d: extent must be a whole number in [2, 12]')
  for (const k of ['eigen', 'square', 'morph']) if (s[k] !== undefined && typeof s[k] !== 'boolean') p.push(`vector2d: ${k} must be true or false`)
  if (s.eigen && s.translate) p.push('vector2d: eigen is for linear maps; drop translate or eigen')
  const itemIssues = itemProblems(s.vectors, VEC_KEYS, 'vector2d vector')
  if (itemIssues.length) return [...p, ...itemIssues]
  const vectors = s.vectors || []
  vectors.forEach((v, i) => {
    if (v.label !== undefined && !localized(v.label)) p.push(`vector2d: vector ${i + 1} label needs EN + ES (or one plain string)`)
    else if (!plainLabel(v.label)) p.push(`vector2d: vector ${i + 1} label is drawn as plain text: no $…$`)
    if (v.orbit !== undefined && (!Number.isInteger(v.orbit) || v.orbit < 1 || v.orbit > 30)) p.push(`vector2d: vector ${i + 1} orbit must be a whole number in [1, 30]`)
  })
  if (s.shape !== undefined && (!Array.isArray(s.shape) || s.shape.length < 3 || !s.shape.every((q) => Array.isArray(q) && q.length === 2 && q.every(finite)))) {
    p.push('vector2d: shape must be at least 3 [x, y] number pairs')
  }
  if (p.length) return p

  const names = sliders.map((sl) => sl.name)
  const params = new Set([...names, ...CONSTANTS])
  const exprs = []
  m.forEach((row, i) => row.forEach((src, j) => exprs.push({ where: `vector2d matrix[${i + 1}][${j + 1}]`, src })))
  ;(s.translate || []).forEach((src, i) => exprs.push({ where: `vector2d translate[${i + 1}]`, src }))
  vectors.forEach((v, i) => exprs.push({ where: `vector2d vector ${i + 1} x`, src: v.x }, { where: `vector2d vector ${i + 1} y`, src: v.y }))
  const used = exprProblems(exprs, params, p)
  for (const n of names) if (!used.has(n)) p.push(`vector2d: slider "${n}" changes nothing`)
  if (p.length) return p

  for (const sc of sampleScopes(sliders)) {
    const at = names.length ? ` (with ${names.map((n) => `${n} = ${sc[n]}`).join(', ')})` : ''
    const { m: A, t } = evalMap(s, sc)
    if (![...A.flat(), ...t].every(finite)) p.push(`vector2d: the map isn't a real number everywhere${at}`)
    vectors.forEach((v, i) => {
      if (!finite(compile(v.x).evaluate(sc)) || !finite(compile(v.y).evaluate(sc))) p.push(`vector2d vector ${i + 1} isn't a real number${at}`)
    })
  }
  return [...new Set(p)]
}
