import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs'

// Spaced-repetition scheduling (FSRS) for solved exercises. Cards are stored
// as JSON in the review_cards table; this module only computes new states.
//
// Reviews happen in daily sessions, so intervals are whole days (no
// minute-level learning steps). Fuzz spreads out cards learned together.
const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: false }))

// Implicit repetition (as in Math Academy's FIRe): a clean review of a lesson
// partly counts for the lessons it builds on. Their cards due within the
// window move this share of the way to where a Good review now would put them,
// but never past the point where recall (whose stability an implicit
// repetition doesn't raise) is predicted to drop below IMPLICIT_MIN_RETENTION.
export const IMPLICIT_WEIGHT = 0.5
export const IMPLICIT_WINDOW_DAYS = 7
export const IMPLICIT_MIN_RETENTION = 0.85
const floor = fsrs(
  generatorParameters({ enable_fuzz: false, enable_short_term: false, request_retention: IMPLICIT_MIN_RETENTION })
)
const DAY = 86400000

function revive(json) {
  const c = typeof json === 'string' ? JSON.parse(json) : json
  return { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined }
}

// ts-fsrs counts the days since the last review by UTC calendar date, so a
// review just after local midnight could count as "the same day". Each date
// goes in shifted by its local UTC offset (local date = UTC date) and the
// result comes back unshifted.
const toLocal = (d) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000) : d)
function next(card, now, rating) {
  const offset = -now.getTimezoneOffset() * 60000
  const local = { ...card, due: toLocal(card.due), last_review: toLocal(card.last_review) }
  const out = scheduler.next(local, toLocal(now), rating).card
  return {
    ...out,
    due: new Date(out.due.getTime() - offset),
    last_review: out.last_review ? new Date(out.last_review.getTime() - offset) : out.last_review
  }
}

/** The card for an exercise first solved (or first failed) at `now`. */
export function learnCard(rating, now = new Date()) {
  return next(createEmptyCard(now), now, rating)
}

// A review never goes back in time: if the clock is behind the last review
// (system clock changed, data from another machine), it counts as right after.
const reviewTime = (card, now) => (card.last_review && now < card.last_review ? card.last_review : now)

/** The card after a review answered with `rating` at `now`. */
export function reviewCard(stored, rating, now = new Date()) {
  const card = revive(stored)
  return next(card, reviewTime(card, now), rating)
}

/**
 * The card after an implicit repetition at `now`: only its due date moves,
 * `weight` of the way towards a Good review's and no further than the
 * retention floor allows; never earlier. Its memory state (stability, reps,
 * last review) is unchanged. Null when it wouldn't move later, or when the
 * card is already due: that one is left for its own review, as it may well
 * be forgotten.
 */
export function implicitReview(stored, now = new Date(), weight = IMPLICIT_WEIGHT) {
  const card = revive(stored)
  if (card.due <= now || !card.last_review) return null
  const good = next(card, reviewTime(card, now), Rating.Good).due
  const limit = card.last_review.getTime() + floor.next_interval(card.stability, 0) * DAY
  const due = Math.min(card.due.getTime() + weight * (good.getTime() - card.due.getTime()), limit)
  return due > card.due.getTime() ? { ...card, due: new Date(due) } : null
}

export function serializeCard(card) {
  return JSON.stringify(card)
}

const isDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))

/** Whether stored JSON is a card this module can schedule (e.g. one read from a backup). */
export function isStoredCard(json) {
  let c
  try {
    c = JSON.parse(json)
  } catch {
    return false
  }
  return (
    c !== null &&
    typeof c === 'object' &&
    isDate(c.due) &&
    (c.last_review == null || isDate(c.last_review)) &&
    ['stability', 'difficulty', 'reps', 'lapses', 'state'].every((k) => Number.isFinite(c[k]))
  )
}
