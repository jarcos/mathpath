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

/** The card for an exercise solved for the first time at `now`. */
export function learnCard(rating, now = new Date()) {
  return scheduler.next(createEmptyCard(now), now, rating).card
}

/**
 * The card after a review answered with `rating` at `now`. If the clock is
 * behind the last review (system clock changed, data from another machine),
 * the review counts as happening right after it instead of failing.
 */
export function reviewCard(stored, rating, now = new Date()) {
  const card = revive(stored)
  const at = card.last_review && now < card.last_review ? card.last_review : now
  return scheduler.next(card, at, rating).card
}

export function serializeCard(card) {
  return JSON.stringify(card)
}
