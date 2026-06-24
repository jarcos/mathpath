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
 *   - "text"        plain text, case/space-insensitive exact match
 */

const TOL = 1e-9

function clean(str) {
  return String(str ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function tryEvalNumber(str) {
  try {
    const v = math.evaluate(str)
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
  // 1) Pure-numeric fast path.
  const un = tryEvalNumber(userStr)
  const an = tryEvalNumber(answerStr)
  if (un !== null && an !== null) return numbersEqual(un, an)

  let userNode, ansNode
  try {
    userNode = math.parse(userStr)
    ansNode = math.parse(answerStr)
  } catch {
    return false
  }

  // 2) Symbolic simplification of the difference.
  try {
    const diff = math.simplify(`(${userStr}) - (${answerStr})`)
    if (diff.toString() === '0') return true
    const dn = tryEvalNumber(diff.toString())
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

function setEqual(userStr, answerStr) {
  const split = (s) => clean(s).split(/[,;]/).map((x) => x.trim()).filter(Boolean)
  const u = split(userStr)
  const a = split(answerStr)
  if (u.length !== a.length) return false
  const remaining = [...a]
  for (const item of u) {
    const idx = remaining.findIndex((cand) => expressionsEqual(item, cand))
    if (idx === -1) return false
    remaining.splice(idx, 1)
  }
  return remaining.length === 0
}

function matchesOne(user, candidate, type) {
  switch (type) {
    case 'text':
      return user.toLowerCase().replace(/\s/g, '') ===
        clean(candidate).toLowerCase().replace(/\s/g, '')
    case 'set':
      return setEqual(user, candidate)
    case 'number':
    case 'expression':
    default:
      return expressionsEqual(user, candidate)
  }
}

/**
 * @returns {boolean} whether `userAnswer` is a correct form of the exercise
 * answer. Accepts the canonical `answer` and any `acceptedAlt` form — this is
 * what lets a Spanish learner type "sí" where the canonical answer is "yes",
 * or accept differently-written-but-equal answers.
 */
export function validateAnswer(userAnswer, exercise) {
  const type = exercise.answerType || 'expression'
  const user = clean(userAnswer)
  if (!user) return false
  const candidates = [exercise.answer, ...(exercise.acceptedAlt || [])]
  return candidates.some((c) => matchesOne(user, c, type))
}

/** Used by the build-time verifier to confirm two strings are equivalent. */
export function assertEquivalent(a, b) {
  return expressionsEqual(a, b)
}
