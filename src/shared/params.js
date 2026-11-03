import * as math from 'mathjs'

// Parameterized exercises. An exercise with `params` is a template: each
// instance draws its parameters, works out `derived` values with mathjs,
// retries until `where` holds, and fills every string of the exercise:
//   [[name]]    the value                       e.g. 3, -2, 0.5
//   [[name|+]]  a signed term                   e.g. "+ 3", "- 2"
// Template fields:
//   params   { name: { int: [lo, hi], exclude?: [...] } | { choices: [...] } }
//   derived  { name: "mathjs expression of earlier names" }
//   where    "mathjs condition"                     (optional)
//   check / equivalentTo                            (verify:content only)
// Shared by the app and verify:content, which checks dozens of instances.

const PLACEHOLDER = /\[\[([A-Za-z]\w*)(\|\+)?\]\]/g
const TEMPLATE_KEYS = ['params', 'derived', 'where', 'check', 'equivalentTo']

/** A seeded PRNG (mulberry32): same seed, same instance. */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31)
}

function draw(spec, rand) {
  if (spec.choices) return spec.choices[Math.floor(rand() * spec.choices.length)]
  const [lo, hi] = spec.int
  for (let i = 0; i < 1000; i++) {
    const v = lo + Math.floor(rand() * (hi - lo + 1))
    if (!(spec.exclude || []).includes(v)) return v
  }
  throw new Error(`no value in [${lo}, ${hi}] outside ${JSON.stringify(spec.exclude)}`)
}

/** The parameter (and derived) values of one instance. */
export function drawParams(exercise, seed) {
  const rand = rng(seed)
  for (let tries = 0; tries < 1000; tries++) {
    const scope = {}
    for (const [k, spec] of Object.entries(exercise.params)) scope[k] = draw(spec, rand)
    for (const [k, expr] of Object.entries(exercise.derived || {})) scope[k] = Number(math.evaluate(expr, { ...scope }))
    if (!exercise.where || math.evaluate(exercise.where, { ...scope })) return scope
  }
  throw new Error(`${exercise.id}: no parameters satisfy "${exercise.where}"`)
}

// Plain decimal notation (never 1e+5), without float noise.
function format(v) {
  if (typeof v !== 'number') return String(v)
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)))
}

/** Fills the placeholders of one string; unknown names are left as they are. */
export function fill(str, scope) {
  return str.replace(PLACEHOLDER, (m, name, signed) => {
    if (!Object.hasOwn(scope, name)) return m
    const v = scope[name]
    if (signed) return v < 0 ? `- ${format(-v)}` : `+ ${format(v)}`
    return format(v)
  })
}

function fillDeep(value, scope) {
  if (typeof value === 'string') return fill(value, scope)
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, scope))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, scope)]))
  }
  return value
}

/**
 * A concrete exercise for `seed` (the exercise itself if it isn't a
 * template). It keeps the template's id, so progress and reviews are shared
 * by all its instances; `instance` records the values used.
 */
export function instantiate(exercise, seed) {
  if (!exercise.params) return exercise
  const values = drawParams(exercise, seed)
  const rest = Object.fromEntries(Object.entries(exercise).filter(([k]) => !TEMPLATE_KEYS.includes(k)))
  return { ...fillDeep(rest, values), id: exercise.id, instance: { seed, values } }
}

/** Placeholders still present anywhere in a value (an instance should have none). */
export function leftovers(value) {
  const found = []
  const walk = (v) => {
    if (typeof v === 'string') for (const m of v.matchAll(PLACEHOLDER)) found.push(m[0])
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(value)
  return found
}

/** A stable number for a string, to derive per-exercise seeds. */
export function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
