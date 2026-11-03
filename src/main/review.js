import { createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs'

// Spaced-repetition scheduling (FSRS) for solved exercises. Cards are stored
// as JSON in the review_cards table; this module only computes new states.
//
// Reviews happen in daily sessions, so intervals are whole days (no
// minute-level learning steps). Fuzz spreads out cards learned together.
const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: false }))

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

/** The card for an exercise solved for the first time at `now`. */
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

export function serializeCard(card) {
  return JSON.stringify(card)
}
