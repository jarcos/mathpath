/**
 * Search over the bundled course (pure, shared by the renderer and the tests):
 * lessons by title, section titles and text, in both languages, and symbols
 * of the glossary by name, meaning and form. Accents and case don't matter.
 */

const MARKS = /\p{M}/gu

/** Lower case without accents, for matching ("Función" → "funcion"). */
export const fold = (s) => String(s ?? '').normalize('NFD').replace(MARKS, '').toLowerCase()

/** Lesson prose as plain text: no formulas, no emphasis marks. */
export function plainText(s) {
  return String(s ?? '')
    .replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g, ' ')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const LANGS = ['en', 'es']
const at = (obj, lang) => (obj && typeof obj === 'object' ? obj[lang] || obj.en || '' : String(obj || ''))

// The text of a lesson in one language: what a learner may look for.
function lessonText(lesson, lang) {
  const parts = []
  for (const s of lesson.sections || []) {
    if (s.content) parts.push(at(s.content, lang))
    if (s.note) parts.push(at(s.note, lang))
  }
  for (const e of lesson.exercises || []) parts.push(at(e.prompt, lang))
  return plainText(parts.join(' \n '))
}

/**
 * The index: one entry per lesson (in course order) and per symbol. Each
 * keeps the shown text per language and its folded copy for matching.
 */
export function buildIndex(subjects, glossary) {
  const lessons = []
  for (const subject of subjects) {
    for (const lesson of subject.lessonObjects || []) {
      const entry = { kind: 'lesson', id: lesson.id, subjectId: subject.id, order: lessons.length, lang: {} }
      for (const lang of LANGS) {
        const title = plainText(at(lesson.title, lang))
        const heads = (lesson.sections || []).filter((s) => s.title).map((s) => plainText(at(s.title, lang)))
        const text = lessonText(lesson, lang)
        entry.lang[lang] = {
          title,
          text,
          subject: at(subject.name, lang),
          f: { title: fold(title), heads: fold(heads.join(' · ')), text: fold(text), subject: fold(at(subject.name, lang)) }
        }
      }
      lessons.push(entry)
    }
  }
  const symbols = (glossary?.symbols || []).map((s) => ({
    kind: 'symbol',
    id: s.id,
    display: s.display,
    read: s.read,
    meaning: s.meaning,
    f: {
      read: LANGS.map((l) => fold(at(s.read, l))),
      meaning: fold(LANGS.map((l) => at(s.meaning, l)).join(' ')),
      forms: [...(s.uni || []), ...(s.tex || [])].map((x) => fold(x))
    }
  }))
  return { lessons, symbols }
}

/** The words of a query, folded; empty when there is nothing to look for. */
export const terms = (query) => fold(query).split(/\s+/).filter(Boolean)

const isWordChar = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c)
// How a term is found in a folded text: 2 as a whole word, 1 at the start of
// a word, 0 inside one (or -1 not at all).
function wordMatch(text, term) {
  let best = -1
  for (let i = text.indexOf(term); i >= 0 && best < 2; i = text.indexOf(term, i + 1)) {
    const start = !isWordChar(text[i - 1])
    best = Math.max(best, start ? (isWordChar(text[i + term.length]) ? 1 : 2) : 0)
  }
  return best
}
const startsWord = (text, term) => wordMatch(text, term) >= 1

// A few words of text around the first term found, as shown to the learner.
function snippet(text, folded, ts, width = 70) {
  const i = Math.min(...ts.map((t) => folded.indexOf(t)).filter((n) => n >= 0))
  if (!Number.isFinite(i) || folded.length !== text.length) return ''
  const from = Math.max(0, text.lastIndexOf(' ', Math.max(0, i - 40)) + 1)
  const to = Math.min(text.length, i + width)
  return `${from > 0 ? '… ' : ''}${text.slice(from, to).trim()}${to < text.length ? ' …' : ''}`
}

function scoreLesson(entry, ts, lang) {
  let best = null
  for (const l of [lang, ...LANGS.filter((x) => x !== lang)]) {
    const f = entry.lang[l].f
    let score = 0
    let inText = false
    for (const t of ts) {
      const inTitle = wordMatch(f.title, t)
      if (inTitle >= 0) score += [8, 12, 14][inTitle]
      else if (f.heads.includes(t)) score += 4
      else if (f.subject.includes(t)) score += 2
      else if (f.text.includes(t)) {
        score += 1
        inText = true
      } else {
        score = 0
        break
      }
    }
    if (!score) continue
    // The title starts with all that was typed, as whole words.
    const q = ts.join(' ')
    if (f.title.startsWith(q) && !isWordChar(f.title[q.length])) score += 3
    if (l === lang) score += 0.5
    if (!best || score > best.score) {
      const shown = entry.lang[lang]
      best = {
        kind: 'lesson',
        id: entry.id,
        subjectId: entry.subjectId,
        title: shown.title,
        subject: shown.subject,
        snippet: inText ? snippet(entry.lang[l].text, f.text, ts) : '',
        score,
        order: entry.order
      }
    }
  }
  return best
}

function scoreSymbol(s, ts) {
  const q = ts.join(' ')
  let score = 0
  if (s.f.forms.includes(q)) score += 30
  if (s.f.read.includes(q)) score += 20
  for (const t of ts) {
    if (s.f.forms.some((x) => x === t)) score += 10
    else if (s.f.read.some((r) => r.includes(t))) score += s.f.read.some((r) => startsWord(r, t)) ? 6 : 4
    else if (s.f.meaning.includes(t)) score += 1
    else return null
  }
  return { kind: 'symbol', id: s.id, display: s.display, read: s.read, meaning: s.meaning, score }
}

/**
 * The best lessons and symbols for a query, in the learner's language:
 * every word must be found. Lessons by score, then in course order.
 */
export function search(index, query, lang = 'en', { lessons = 8, symbols = 5 } = {}) {
  const ts = terms(query)
  if (!ts.length) return { lessons: [], symbols: [] }
  const ls = index.lessons
    .map((e) => scoreLesson(e, ts, lang))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, lessons)
  const ss = index.symbols
    .map((s) => scoreSymbol(s, ts))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, symbols)
  return { lessons: ls, symbols: ss }
}
