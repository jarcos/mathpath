/**
 * The `heatmap` section: a small grid of numbers and what a layer does to it.
 * - mode 'conv': slide a kernel over the input (no padding, stride 1, as in
 *   CNNs: a cross-correlation); several named kernels can be switched.
 * - mode 'pool': max or average pooling, window = stride = `size`.
 * - mode 'attention': scaled dot-product attention weights,
 *   softmax(q·k / (√d · temperature)) per query, optionally causal.
 * Every output is computed here; the learner picks an output cell to see its
 * arithmetic.
 */
import {
  CONSTANTS,
  compile,
  exprProblems,
  finite,
  isObj,
  localized,
  plainLabel,
  sampleScopes,
  sliderProblems,
  unknownKeys
} from './plot.js'

export const MAX_SIDE = 10
export const MAX_TOKENS = 8
export const MAX_DIM = 4

/** Output (i, j) = Σ input[i+u][j+v] · kernel[u][v]. */
export function convolve(input, kernel) {
  const kh = kernel.length
  const kw = kernel[0].length
  const out = []
  for (let i = 0; i + kh <= input.length; i++) {
    const row = []
    for (let j = 0; j + kw <= input[0].length; j++) {
      let s = 0
      for (let u = 0; u < kh; u++) for (let v = 0; v < kw; v++) s += input[i + u][j + v] * kernel[u][v]
      row.push(s)
    }
    out.push(row)
  }
  return out
}

/** The window under output (i, j): a list of [row, col] of the input. */
export function windowOf(i, j, h, w, stride = 1) {
  const cells = []
  for (let u = 0; u < h; u++) for (let v = 0; v < w; v++) cells.push([i * stride + u, j * stride + v])
  return cells
}

/** Max or average over size × size blocks, stride = size. */
export function pool(input, size, kind = 'max') {
  const out = []
  for (let i = 0; i + size <= input.length; i += size) {
    const row = []
    for (let j = 0; j + size <= input[0].length; j += size) {
      const vals = windowOf(i / size, j / size, size, size, size).map(([r, c]) => input[r][c])
      row.push(kind === 'max' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0) / vals.length)
    }
    out.push(row)
  }
  return out
}

export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)

/** softmax of a row; -Infinity entries (masked) get weight 0. */
export function softmax(row) {
  const m = Math.max(...row.filter((v) => v !== -Infinity))
  const e = row.map((v) => (v === -Infinity ? 0 : Math.exp(v - m)))
  const sum = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / sum)
}

/** Scaled scores and attention weights; causal hides later tokens. */
export function attention(q, k, temperature = 1, causal = false) {
  const d = q[0].length
  const scores = q.map((qi, i) => k.map((kj, j) => (causal && j > i ? -Infinity : dot(qi, kj) / (Math.sqrt(d) * temperature))))
  return { scores, weights: scores.map(softmax) }
}

// ── Checks for verify:content ───────────────────────────────────────────────

const KEYS = new Set(['type', 'mode', 'input', 'kernels', 'size', 'tokens', 'q', 'k', 'temperature', 'causal', 'sliders', 'caption'])
const KERNEL_KEYS = new Set(['label', 'kernel'])

const matrix = (m, maxSide) =>
  Array.isArray(m) &&
  m.length >= 1 &&
  m.length <= maxSide &&
  m.every((r) => Array.isArray(r) && r.length === m[0].length && r.length >= 1 && r.length <= maxSide && r.every(finite))

/** Problems with a `heatmap` section, as text; [] when it is sound. */
export function heatmapProblems(s) {
  const p = unknownKeys(s, KEYS, 'heatmap')
  const sliders = s.sliders || []
  p.push(...sliderProblems(sliders))
  if (!localized(s.caption)) p.push('heatmap: caption needs EN + ES')
  if (!['conv', 'pool', 'attention'].includes(s.mode)) return [...p, "heatmap: mode is 'conv', 'pool' or 'attention'"]
  const want = { conv: ['input', 'kernels'], pool: ['input', 'size'], attention: ['tokens', 'q', 'k'] }[s.mode]
  const allowed = new Set(['type', 'mode', 'sliders', 'caption', ...want, ...(s.mode === 'attention' ? ['temperature', 'causal'] : [])])
  for (const k of Object.keys(s)) if (KEYS.has(k) && !allowed.has(k)) p.push(`heatmap: ${k} isn't used in mode '${s.mode}'`)
  for (const k of want) if (s[k] === undefined) p.push(`heatmap: mode '${s.mode}' needs ${k}`)
  if (p.length) return p

  if (s.mode !== 'attention' && !matrix(s.input, MAX_SIDE)) p.push(`heatmap: input must be a rectangular grid of numbers, at most ${MAX_SIDE} × ${MAX_SIDE}`)
  if (s.mode === 'conv') {
    if (!Array.isArray(s.kernels) || s.kernels.length < 1 || s.kernels.length > 4) p.push('heatmap: kernels must list 1 to 4 kernels')
    else {
      s.kernels.forEach((kn, i) => {
        if (!isObj(kn)) return p.push(`heatmap: kernel ${i + 1} must be { label, kernel }`)
        p.push(...unknownKeys(kn, KERNEL_KEYS, `heatmap kernel ${i + 1}`))
        if (!localized(kn.label)) p.push(`heatmap: kernel ${i + 1} label needs EN + ES (or one plain string)`)
        if (!matrix(kn.kernel, 5)) p.push(`heatmap: kernel ${i + 1} must be a grid of numbers, at most 5 × 5`)
        else if (matrix(s.input, MAX_SIDE) && (kn.kernel.length > s.input.length || kn.kernel[0].length > s.input[0].length)) {
          p.push(`heatmap: kernel ${i + 1} is larger than the input`)
        }
      })
    }
  }
  if (s.mode === 'pool') {
    if (![2, 3].includes(s.size)) p.push('heatmap: size is 2 or 3')
    else if (matrix(s.input, MAX_SIDE) && (s.input.length % s.size || s.input[0].length % s.size)) p.push('heatmap: the input sides must be multiples of size')
  }
  if (s.mode === 'attention') {
    const n = Array.isArray(s.tokens) ? s.tokens.length : 0
    if (n < 2 || n > MAX_TOKENS || !s.tokens.every((t) => localized(t) && plainLabel(t))) p.push(`heatmap: tokens must be 2 to ${MAX_TOKENS} plain labels`)
    for (const k of ['q', 'k']) {
      if (!matrix(s[k], MAX_TOKENS) || s[k].length !== n || s[k][0].length > MAX_DIM) p.push(`heatmap: ${k} needs one row per token, at most ${MAX_DIM} numbers each`)
    }
    if (matrix(s.q, MAX_TOKENS) && matrix(s.k, MAX_TOKENS) && s.q[0].length !== s.k[0].length) p.push('heatmap: q and k rows need the same length')
    if (s.causal !== undefined && typeof s.causal !== 'boolean') p.push('heatmap: causal must be true or false')
  }
  if (p.length) return p

  const names = sliders.map((sl) => sl.name)
  const exprs = s.temperature !== undefined ? [{ where: 'heatmap temperature', src: s.temperature }] : []
  const used = exprProblems(exprs, new Set([...names, ...CONSTANTS]), p)
  for (const n of names) if (!used.has(n)) p.push(`heatmap: slider "${n}" changes nothing`)
  if (p.length) return p
  if (s.temperature !== undefined) {
    for (const sc of sampleScopes(sliders)) {
      const t = compile(s.temperature).evaluate(sc)
      if (!(t > 0)) p.push(`heatmap: temperature must be positive${names.length ? ` (with ${names.map((n) => `${n} = ${sc[n]}`).join(', ')})` : ''}`)
    }
  }
  return [...new Set(p)]
}
