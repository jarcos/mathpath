/**
 * The `distribution` section: a normal, binomial or Poisson distribution whose
 * parameters may read sliders, with an optional shaded event and, for the
 * discrete ones, the normal curve with the same mean and variance. Its
 * readouts (mean, variance, the shaded probability) are computed here.
 */
import * as math from 'mathjs'
import {
  CONSTANTS,
  compile,
  exprProblems,
  finite,
  isObj,
  isRange,
  localized,
  sampleScopes,
  sliderProblems,
  unknownKeys
} from './plot.js'

/** Each family's parameters, in the order they're written. */
export const FAMILIES = { normal: ['mean', 'sd'], binomial: ['n', 'p'], poisson: ['rate'] }
export const MAX_N = 200
export const MAX_RATE = 100
export const isDiscrete = (family) => family !== 'normal'

export const normalPdf = (x, mean, sd) => Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI))
export const normalCdf = (x, mean, sd) =>
  x === Infinity ? 1 : x === -Infinity ? 0 : 0.5 * (1 + math.erf((x - mean) / (sd * Math.SQRT2)))

/** P(X = k) for k = 0…n. */
export function binomialPmf(n, p) {
  const out = new Array(n + 1).fill(0)
  if (p <= 0) out[0] = 1
  else if (p >= 1) out[n] = 1
  else {
    // In logs, so (1 − p)ⁿ doesn't underflow for large n.
    let log = n * Math.log1p(-p)
    out[0] = Math.exp(log)
    for (let k = 0; k < n; k++) {
      log += Math.log((n - k) / (k + 1)) + Math.log(p) - Math.log1p(-p)
      out[k + 1] = Math.exp(log)
    }
  }
  return out
}

/** P(X = k) for k = 0…kmax. */
export function poissonPmf(rate, kmax) {
  const out = []
  let log = -rate
  for (let k = 0; k <= kmax; k++) {
    out.push(Math.exp(log))
    log += Math.log(rate) - Math.log(k + 1)
  }
  return out
}

/** The parameters for one slider setting. */
export function evalParams(section, scope = {}) {
  const out = {}
  for (const key of FAMILIES[section.family] || []) out[key] = compile(section.params[key]).evaluate(scope)
  return out
}

/** Mean and variance. */
export function moments(family, q) {
  if (family === 'normal') return { mean: q.mean, variance: q.sd * q.sd }
  if (family === 'binomial') return { mean: q.n * q.p, variance: q.n * q.p * (1 - q.p) }
  return { mean: q.rate, variance: q.rate }
}

/** P(X = k) at each whole k from 0 to kmax (discrete families). */
export function pmf(family, q, kmax) {
  if (family === 'binomial') return binomialPmf(q.n, q.p).slice(0, kmax + 1).concat(new Array(Math.max(0, kmax - q.n)).fill(0))
  return poissonPmf(q.rate, kmax)
}

/**
 * The probability of the shaded event: from ≤ X ≤ to (either end may be
 * open), or, with `outside`, X ≤ from or X ≥ to. Discrete families count the
 * whole numbers in the range, over the whole support.
 */
export function shadeProbability(family, q, from = -Infinity, to = Infinity, outside = false) {
  let inside
  const clamp = (v) => Math.min(1, Math.max(0, v))
  if (family === 'normal') {
    inside = from > to ? 0 : normalCdf(to, q.mean, q.sd) - normalCdf(from, q.mean, q.sd)
    if (outside) return clamp(normalCdf(from, q.mean, q.sd) + (1 - normalCdf(to, q.mean, q.sd)))
    return clamp(inside)
  }
  const top = family === 'binomial' ? q.n : Math.max(Math.ceil(q.rate + 40 * Math.sqrt(q.rate) + 40), 60)
  const probs = pmf(family, q, top)
  let sum = 0
  for (let k = 0; k <= top; k++) {
    const hit = outside ? k <= from || k >= to : k >= from && k <= to
    if (hit) sum += probs[k]
  }
  return Math.min(1, sum)
}

/** Whether k is in the shaded event (discrete bars). */
export const shaded = (k, from = -Infinity, to = Infinity, outside = false) => (outside ? k <= from || k >= to : k >= from && k <= to)

// ── Checks for verify:content ───────────────────────────────────────────────

const KEYS = new Set(['type', 'family', 'params', 'sliders', 'domain', 'yMax', 'shade', 'approx', 'caption'])
const SHADE_KEYS = new Set(['from', 'to', 'outside'])

function paramProblem(family, q) {
  if (family === 'normal') return q.sd > 0 && finite(q.mean) ? null : 'needs a finite mean and sd > 0'
  if (family === 'binomial') {
    if (!Number.isInteger(q.n) || q.n < 1 || q.n > MAX_N) return `needs a whole n in [1, ${MAX_N}]`
    return q.p >= 0 && q.p <= 1 ? null : 'needs p in [0, 1]'
  }
  return q.rate > 0 && q.rate <= MAX_RATE ? null : `needs a rate in (0, ${MAX_RATE}]`
}

/** Problems with a `distribution` section, as text; [] when it is sound. */
export function distributionProblems(s) {
  const p = unknownKeys(s, KEYS, 'distribution')
  const sliders = s.sliders || []
  p.push(...sliderProblems(sliders))
  if (!localized(s.caption)) p.push('distribution: caption needs EN + ES')
  const keys = FAMILIES[s.family]
  if (!keys) return [...p, `distribution: family must be one of ${Object.keys(FAMILIES).join(', ')}`]
  if (!isObj(s.params)) return [...p, `distribution: params must be { ${keys.join(', ')} }`]
  p.push(...unknownKeys(s.params, new Set(keys), 'distribution params'))
  for (const k of keys) if (!(k in s.params)) p.push(`distribution: params.${k} is missing`)
  if (!isRange(s.domain)) p.push('distribution: domain must be [min, max] with min < max')
  else if (isDiscrete(s.family) && !(Number.isInteger(s.domain[0]) && Number.isInteger(s.domain[1]) && s.domain[0] >= 0 && s.domain[1] - s.domain[0] <= 120)) {
    p.push('distribution: a discrete domain is whole numbers from 0 up, at most 120 bars')
  }
  if (s.yMax !== undefined && !(finite(s.yMax) && s.yMax > 0)) p.push('distribution: yMax must be a positive number')
  if (s.approx !== undefined && (typeof s.approx !== 'boolean' || !isDiscrete(s.family))) p.push('distribution: approx (the normal curve) is true or false, for binomial and poisson')
  if (s.shade !== undefined) {
    if (!isObj(s.shade)) p.push('distribution: shade must be { from?, to?, outside? }')
    else {
      p.push(...unknownKeys(s.shade, SHADE_KEYS, 'distribution shade'))
      if (s.shade.outside !== undefined && typeof s.shade.outside !== 'boolean') p.push('distribution: shade.outside must be true or false')
      if (s.shade.outside && (s.shade.from === undefined || s.shade.to === undefined)) p.push('distribution: shade outside needs both from and to')
      if (s.shade.from === undefined && s.shade.to === undefined) p.push('distribution: shade needs from, to or both')
    }
  }
  if (p.length) return p

  const names = sliders.map((sl) => sl.name)
  const params = new Set([...names, ...CONSTANTS])
  const exprs = keys.map((k) => ({ where: `distribution params.${k}`, src: s.params[k] }))
  if (s.shade) for (const k of ['from', 'to']) if (s.shade[k] !== undefined) exprs.push({ where: `distribution shade.${k}`, src: s.shade[k] })
  const used = exprProblems(exprs, params, p)
  for (const n of names) if (!used.has(n)) p.push(`distribution: slider "${n}" changes nothing`)
  if (p.length) return p

  for (const sc of sampleScopes(sliders)) {
    const at = names.length ? ` (with ${names.map((n) => `${n} = ${sc[n]}`).join(', ')})` : ''
    const q = evalParams(s, sc)
    const bad = paramProblem(s.family, q)
    if (bad) {
      p.push(`distribution ${s.family} ${bad}${at}`)
      continue
    }
    // The plot shows nearly all the probability, and a fixed height clears the peak.
    const [d0, d1] = s.domain
    const shown = shadeProbability(s.family, q, d0, d1)
    if (shown < 0.99) p.push(`distribution: the domain shows only ${(100 * shown).toFixed(1)} % of the probability${at}`)
    if (s.yMax !== undefined) {
      const { mean, variance } = moments(s.family, q)
      const peak = isDiscrete(s.family) ? Math.max(...pmf(s.family, q, d1).slice(Math.ceil(d0))) : normalPdf(mean, mean, Math.sqrt(variance))
      if (peak > s.yMax) p.push(`distribution: the peak ${peak.toFixed(3)} is above yMax${at}`)
    }
    if (s.shade) {
      const from = s.shade.from === undefined ? -Infinity : compile(s.shade.from).evaluate(sc)
      const to = s.shade.to === undefined ? Infinity : compile(s.shade.to).evaluate(sc)
      if (Number.isNaN(from) || Number.isNaN(to)) p.push(`distribution: shade ends aren't numbers${at}`)
      else if (s.shade.outside && !(from < to)) p.push(`distribution: shade outside needs from < to${at}`)
      else {
        const prob = shadeProbability(s.family, q, from, to, s.shade.outside)
        if (!(prob >= 0 && prob <= 1)) p.push(`distribution: the shaded probability isn't in [0, 1]${at}`)
      }
    }
  }
  return [...new Set(p)]
}
