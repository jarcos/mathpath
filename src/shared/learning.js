// Learning rules shared by the main process (review scheduling) and the UI
// (mastery levels, review sessions). Pure functions, covered by test/.

// FSRS ratings, numbered as in ts-fsrs. Easy is never given automatically.
export const RATING = { again: 1, hard: 2, good: 3 }

// A lesson is mastered once this share of its exercises is solved without
// opening the worked solution (hints are fine).
export const MASTERY_THRESHOLD = 0.8

/**
 * How well an exercise went, as an FSRS rating. In a lesson it rates the
 * first solve; in a review session, the first answer.
 *   wrong, or right after reading the solution  → again
 *   right after a hint or after wrong tries     → hard
 *   right first time, unaided                   → good
 */
export function ratingFor({ correct, usedHint = false, usedSolution = false, misses = 0 }) {
  if (!correct || usedSolution) return RATING.again
  if (usedHint || misses > 0) return RATING.hard
  return RATING.good
}

const YES_NO = /^(yes|no|true|false|sí|si|verdadero|falso)$/i

/** An answer that can be guessed: multiple choice, or a yes/no text answer. */
export function isGuessable(exercise) {
  if (exercise.answerType === 'mcq') return true
  return exercise.answerType === 'text' && YES_NO.test(String(exercise.answer).trim())
}

/**
 * Whether a solve (an entry of the learning state's `solved`) counts towards
 * mastery: no solution opened, and a guessable answer also right first time.
 */
export function countsClean(exercise, solve) {
  return !!solve && (isGuessable(exercise) ? solve.firstTry : solve.clean)
}

export function isMastered(clean, total) {
  return total > 0 && clean / total >= MASTERY_THRESHOLD
}

/**
 * Where a lesson stands for the learner:
 *   'review'    some of its exercises are due for review
 *   'mastered'  enough exercises solved without the solution (or, for a
 *               lesson without exercises, marked complete)
 *   'practiced' started: something solved, or marked complete by hand
 *   'new'       nothing yet
 */
export function masteryLevel({ total, solved, clean, due, completed }) {
  if (due > 0) return 'review'
  if (total > 0 ? isMastered(clean, total) : completed) return 'mastered'
  if (solved > 0 || completed) return 'practiced'
  return 'new'
}

/**
 * Round-robin over groups (keyOf), keeping each group's order, so a review
 * session alternates topics instead of drilling one lesson in a row.
 */
export function interleave(items, keyOf) {
  const groups = new Map()
  for (const item of items) {
    const k = keyOf(item)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(item)
  }
  const queues = [...groups.values()]
  const out = []
  while (out.length < items.length) {
    for (const q of queues) if (q.length) out.push(q.shift())
  }
  return out
}

/** Reviews count as due until the end of the learner's local day. */
export function endOfLocalDay(now = new Date()) {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}
