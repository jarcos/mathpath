import * as math from 'mathjs'

/**
 * Symbolic / numeric answer validation built on mathjs.
 *
 * The whole point is that a learner can type any *correct* form of an answer
 * and have it accepted:  "1/2", "0.5", "0.50", "2/4"  are all equal;
 * "(x+1)^2" and "x^2+2x+1" are the same function.
 *
 * Exercise answer types:
 *   - "number"      single numeric value (tolerance compare)
 *   - "expression"  algebraic expression, optionally in a variable
 *   - "set"         unordered list of values/expressions ("2, -3")
 *   - "text"        plain text: case, spaces and accents don't matter; a
 *                   simple plural and one slip in a word of 5+ letters pass
 *
 * Optional exercise fields:
 *   - requireForm     "factored" | "expanded" | "simplified" | "fraction": an
 *                     equal answer in another form isn't accepted (the
 *                     prompt's own expression is equal too). `given` is that
 *                     expression, so verify:content can check it is refused.
 *   - commonMistakes  [{ answer, feedback: {en, es} }]: typical wrong answers,
 *                     each with a message saying what went wrong.
 */

const TOL = 1e-9
// Shorter words are too close to other words to forgive a slip.
const TYPO_MIN = 5

function clean(str) {
  return String(str ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

// Names learners use that mathjs spells differently (ln, and the Spanish sen, tg…).
const ALIASES = { ln: 'log', sen: 'sin', tg: 'tan', arcsen: 'asin', arcsin: 'asin', arccos: 'acos', arctg: 'atan', arctan: 'atan' }

// "x(x+2)" parses as a call of a function named x; a learner means x·(x + 2).
function fixCalls(node) {
  return node.transform((n) => {
    if (!n.isFunctionNode || !n.fn.isSymbolNode) return n
    if (ALIASES[n.fn.name]) return new math.FunctionNode(new math.SymbolNode(ALIASES[n.fn.name]), n.args.map(fixCalls))
    if (typeof math[n.fn.name] === 'function' || n.args.length !== 1) return n
    return new math.OperatorNode('*', 'multiply', [n.fn, new math.ParenthesisNode(fixCalls(n.args[0]))], true)
  })
}

/** What mathjs reads in `str`, or null when it doesn't parse. */
function read(str) {
  try {
    return fixCalls(math.parse(str))
  } catch {
    return null
  }
}

function evalNumber(node) {
  try {
    const v = node.evaluate({})
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

function numbersEqual(a, b, tol = TOL) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b))
  return Math.abs(a - b) <= tol * scale
}

/** Collect the free variables in an expression (e.g. ['x']). */
function variablesOf(node) {
  const vars = new Set()
  node.traverse((n) => {
    if (n.isSymbolNode && !(n.name in math) && !['e', 'pi', 'i'].includes(n.name)) {
      vars.add(n.name)
    }
  })
  return [...vars]
}

function expressionsEqual(userStr, answerStr) {
  const userNode = read(userStr)
  const ansNode = read(answerStr)
  if (!userNode || !ansNode) return false

  // 1) Pure-numeric fast path.
  const un = evalNumber(userNode)
  const an = evalNumber(ansNode)
  if (un !== null && an !== null) return numbersEqual(un, an)

  // 2) Symbolic simplification of the difference.
  try {
    const diff = math.simplify(
      new math.OperatorNode('-', 'subtract', [new math.ParenthesisNode(userNode), new math.ParenthesisNode(ansNode)])
    )
    if (diff.toString() === '0') return true
    const dn = evalNumber(diff)
    if (dn !== null && numbersEqual(dn, 0)) return true
  } catch {
    /* fall through to sampling */
  }

  // 3) Numeric sampling: equal functions agree at many points.
  try {
    const vars = [...new Set([...variablesOf(userNode), ...variablesOf(ansNode)])]
    if (vars.length === 0) return false
    const uc = userNode.compile()
    const ac = ansNode.compile()
    const samples = [-3.7, -2.1, -0.9, 0.3, 1.2, 2.5, 3.8, 5.1]
    let checks = 0
    for (const s of samples) {
      const scope = {}
      vars.forEach((v, i) => (scope[v] = s + i * 0.61))
      let uv, av
      try {
        uv = uc.evaluate(scope)
        av = ac.evaluate(scope)
      } catch {
        continue // skip points outside the domain (e.g. log of negative)
      }
      // Outside the real domain of both (sqrt(x) and x^(1/2) at x < 0) the
      // point says nothing; real on one side only, they differ.
      if (typeof uv !== 'number' && typeof av !== 'number') continue
      if (typeof uv !== 'number' || typeof av !== 'number') return false
      if (!Number.isFinite(uv) || !Number.isFinite(av)) continue
      if (!numbersEqual(uv, av, 1e-6)) return false
      checks++
    }
    return checks >= 3
  } catch {
    return false
  }
}

const splitSet = (s) =>
  clean(s)
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)

/** How many of the user's items match the answer's (each answer item once). */
function setMatches(userStr, answerStr) {
  const u = splitSet(userStr)
  const remaining = splitSet(answerStr)
  let right = 0
  for (const item of u) {
    const idx = remaining.findIndex((cand) => expressionsEqual(item, cand))
    if (idx === -1) continue
    remaining.splice(idx, 1)
    right++
  }
  return { right, got: u.length, total: right + remaining.length }
}

function setEqual(userStr, answerStr) {
  const { right, got, total } = setMatches(userStr, answerStr)
  return right === total && got === total
}

// ---- text ----

// Case, spaces, accents and closing punctuation don't matter ("Sí." = "si").
const plain = (s) =>
  clean(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s/g, '')
    .replace(/^[¡¿]+|[.!?]+$/g, '')

// Not for words of one or two letters ("e" isn't the plural of "es").
const plural = (a, b) =>
  Math.min(a.length, b.length) >= 3 && (a + 's' === b || b + 's' === a || a + 'es' === b || b + 'es' === a)

// At most one letter added, dropped or changed, or two neighbours swapped.
function oneEditApart(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a]
  return long.slice(i + 1) === short.slice(i)
}

/** 'exact', 'close' (one slip, see TYPO_MIN; never in numbers) or false. */
function textMatch(user, candidate) {
  const u = plain(user)
  const c = plain(candidate)
  if (u === c || plural(u, c)) return 'exact'
  if (c.length >= TYPO_MIN && !/\d/.test(c) && oneEditApart(u, c)) return 'close'
  return false
}

function matchesOne(user, candidate, type) {
  switch (type) {
    case 'text':
      return !!textMatch(user, candidate)
    case 'set':
      return setEqual(user, candidate)
    case 'number':
    case 'expression':
    default:
      return expressionsEqual(user, candidate)
  }
}

// ---- forms (requireForm) ----
// Checked on the expression tree, without parentheses, against the shape of
// the exercise's own answer.

const unwrap = (node) => node.transform((n) => (n.isParenthesisNode ? unwrap(n.content) : n))
const isOp = (n, ...fns) => n.isOperatorNode && fns.includes(n.fn)
const isSum = (n) => isOp(n, 'add', 'subtract') && n.args.length === 2
const isNum = (n) => n.isConstantNode && typeof n.value === 'number'
// The value of a number written with or without a sign: 3, -3, +3.
const numValue = (n) =>
  isNum(n) ? n.value : isOp(n, 'unaryMinus', 'unaryPlus') && isNum(n.args[0]) ? (n.fn === 'unaryMinus' ? -1 : 1) * n.args[0].value : undefined
const isSigned = (n) => numValue(n) !== undefined
const isConstant = (n) => variablesOf(n).length === 0
const sign = (n) => (isOp(n, 'unaryMinus', 'unaryPlus') ? sign(n.args[0]) : n)
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a))
// p/q written as simply as it gets: integers, q ≠ ±1, no common factor.
const reduced = (p, q) => Number.isInteger(p) && Number.isInteger(q) && Math.abs(q) > 1 && gcd(p, q) === 1

/** The summands, with signs and brackets distributed: -(x - 4) + 2x → x, 4, 2x. */
const terms = (n) =>
  isSum(n) ? [...terms(n.args[0]), ...terms(n.args[1])] : isOp(n, 'unaryMinus', 'unaryPlus') ? terms(n.args[0]) : [n]

/** The factors of a product: 2x·(x + 1) → 2, x, x + 1. */
const product = (n) => (isOp(n, 'multiply') ? n.args.flatMap(product) : isOp(n, 'unaryMinus') ? product(n.args[0]) : [n])
const base = (f) => (isOp(f, 'pow') ? f.args[0] : f)
const bases = (fs) => fs.filter((f) => !isConstant(f)).map((f) => base(f).toString())

/** Something left to work out: 2 + 3, 3·2x, 6/4, x²·x³, (x³)², x⁵/x². */
function untidy(node) {
  let found = false
  node.traverse((m) => {
    if (found || !m.isOperatorNode || isOp(m, 'unaryMinus', 'unaryPlus')) return
    const [a, b] = m.args
    if (m.args.every(isSigned)) {
      found = !(m.fn === 'divide' && reduced(numValue(a), numValue(b)))
    } else if (m.fn === 'multiply') {
      const fs = product(m)
      const bs = bases(fs)
      found = fs.filter(isNum).length > 1 || new Set(bs).size < bs.length
    } else if (m.fn === 'pow') {
      found = isOp(a, 'pow')
    } else if (m.fn === 'divide') {
      const top = product(a)
      const bottom = product(b)
      const shared = new Set(bases(top))
      const p = top.find(isNum)?.value ?? 1
      const q = bottom.find(isNum)?.value
      found = bases(bottom).some((s) => shared.has(s)) || (q !== undefined && !reduced(p, q))
    }
  })
  return found
}

/** A bracket still to multiply out: 3(x + 2), (x + 2)², -(x - 4). */
function grouped(node) {
  let found = false
  node.traverse((m) => {
    if (found) return
    if (isOp(m, 'multiply')) found = product(m).some((f) => isSum(f) && !isConstant(f))
    else if (isOp(m, 'pow')) found = isSum(m.args[0])
    else if (isOp(m, 'unaryMinus')) found = isSum(m.args[0])
  })
  return found
}

/** Integer polynomial coefficients have no common factor (2x + 4 does: 2). */
function primitive(n) {
  try {
    const cs = math.rationalize(n, {}, true).coefficients.filter((c) => c !== 0)
    if (!cs.length || !cs.every(Number.isInteger)) return true
    return cs.reduce(gcd) === 1
  } catch {
    return true
  }
}

const factorsOf = (n) => {
  const f = sign(n)
  if (isOp(f, 'multiply')) return f.args.flatMap(factorsOf)
  if (isOp(f, 'pow') && isNum(f.args[1]) && Number.isInteger(f.args[1].value) && f.args[1].value > 0) {
    return Array(Math.min(f.args[1].value, 12)).fill(f.args[0]).flatMap(factorsOf)
  }
  return [f]
}

// A number written as simply as it gets: 8, -0.4, 2/5.
const plainNumber = (n) => isNum(sign(n)) || FORM_CHECKS.fraction(n)

const FORM_CHECKS = {
  // A number whose answer is a plain number must be one too (not 6/15 or 2^3).
  simplified: (n, c) =>
    isConstant(c) && plainNumber(c) ? plainNumber(n) : terms(n).length <= terms(c).length && !untidy(n),
  expanded: (n, c) => FORM_CHECKS.simplified(n, c) && !grouped(n),
  // A product with as many non-constant factors as the answer's, each with
  // no common factor left inside when the answer's have none.
  factored: (n, c) => {
    if (isSum(sign(n))) return false
    const live = (x) => factorsOf(x).filter((f) => !isConstant(f))
    if (live(n).length < live(c).length) return false
    const sums = (x) => live(x).filter(isSum)
    return !sums(c).every(primitive) || sums(n).every(primitive)
  },
  fraction: (n) => {
    const f = sign(n)
    if (isNum(f)) return Number.isInteger(f.value)
    return isOp(f, 'divide') && f.args.every(isSigned) && reduced(numValue(f.args[0]), numValue(f.args[1]))
  }
}
export const FORMS = Object.keys(FORM_CHECKS)

/** Whether `expr` is written in `form`, judged against the shape of `answer`. */
export function inForm(expr, form, answer) {
  const n = read(clean(expr).replace(/(\d),(\d)/g, '$1.$2'))
  const c = read(answer)
  if (!n || !c || !FORM_CHECKS[form]) return false
  return FORM_CHECKS[form](unwrap(n), unwrap(c))
}

// ---- checking ----

function wrong(user, exercise, type) {
  const mistake = (exercise.commonMistakes || []).find((m) => matchesOne(user, m.answer, type))
  if (mistake) return { ok: false, reason: 'mistake', feedback: mistake.feedback }
  if (type === 'set') {
    const candidates = [exercise.answer, ...(exercise.acceptedAlt || [])]
    const best = candidates.map((c) => setMatches(user, c)).sort((a, b) => b.right - a.right)[0]
    if (best.got !== best.total) return { ok: false, reason: 'count', expected: best.total, got: best.got }
    if (best.right > 0) return { ok: false, reason: 'partial', right: best.right, total: best.total }
  }
  return { ok: false, reason: 'wrong' }
}

/**
 * Checks an answer and says why it isn't right. `{ ok }` plus, when not ok, a
 * `reason`: 'empty', 'unparsed' (mathjs can't read it), 'form' (equal, but not
 * in `form`), 'mistake' (a common mistake, with its `feedback`), 'count' (a set
 * with the wrong number of items: `expected`, `got`), 'partial' (`right` of
 * `total` items) or 'wrong'. A text answer accepted despite a slip carries the
 * expected `spelling`.
 */
export function checkAnswer(userAnswer, exercise) {
  const type = exercise.answerType || 'expression'
  let user = clean(userAnswer)
  if (!user) return { ok: false, reason: 'empty' }
  // A decimal comma ("22,5", as written in Spanish) in a single number.
  if (type === 'number') user = user.replace(/(\d),(\d)/g, '$1.$2')
  const candidates = [exercise.answer, ...(exercise.acceptedAlt || [])]

  if (type === 'text') {
    let close = null
    for (const c of candidates) {
      const m = textMatch(user, c)
      if (m === 'exact') return { ok: true }
      if (m === 'close' && close === null) close = c
    }
    if (close === null) return wrong(user, exercise, type)
    // A known mistake one slip away from the answer (explotación for
    // exploración) is that mistake, not a slip.
    const mistake = (exercise.commonMistakes || []).find((m) => textMatch(user, m.answer) === 'exact')
    return mistake ? { ok: false, reason: 'mistake', feedback: mistake.feedback } : { ok: true, spelling: close }
  }

  const items = type === 'set' ? splitSet(user) : [user]
  if (items.some((s) => !read(s))) return { ok: false, reason: 'unparsed' }
  if (!candidates.some((c) => matchesOne(user, c, type))) return wrong(user, exercise, type)
  const form = exercise.requireForm
  if (form && !inForm(user, form, exercise.answer)) return { ok: false, reason: 'form', form }
  return { ok: true }
}

/**
 * @returns {boolean} whether `userAnswer` is a correct form of the exercise
 * answer. Accepts the canonical `answer` and any `acceptedAlt` form — this is
 * what lets a Spanish learner type "sí" where the canonical answer is "yes",
 * or accept differently-written-but-equal answers.
 */
export function validateAnswer(userAnswer, exercise) {
  return checkAnswer(userAnswer, exercise).ok
}

/**
 * The TeX of a number / expression / set answer as it will be read, to show
 * under the input while typing ("1/2x" reads as ½·x, with the product shown).
 * Null when there is nothing worth showing: empty, unreadable, plain numbers.
 */
export function previewTex(userAnswer, exercise) {
  const type = exercise.answerType || 'expression'
  if (!['number', 'expression', 'set'].includes(type)) return null
  let user = clean(userAnswer)
  if (type === 'number') user = user.replace(/(\d),(\d)/g, '$1.$2')
  const items = type === 'set' ? splitSet(user) : user ? [user] : []
  if (items.every((s) => /^-?\d+(\.\d+)?$/.test(s))) return null
  const nodes = items.map(read)
  if (nodes.some((n) => !n)) return null
  try {
    return nodes.map((n) => n.toTex({ parenthesis: 'keep', implicit: 'show' })).join(',\\ ')
  } catch {
    return null
  }
}

/** Used by the build-time verifier to confirm two strings are equivalent. */
export function assertEquivalent(a, b) {
  return expressionsEqual(a, b)
}
