/**
 * Navigation (pure, shared by the renderer and the tests):
 *   - the back / forward history of views, each with its scroll position;
 *   - which saved view can be reopened when MathPath starts;
 *   - where the "Continue" card leads.
 *
 * A view is a plain object such as { name: 'lesson', lessonId, subjectId }.
 */

/** How many views back the history goes. */
export const HISTORY_LIMIT = 50

/** A history with a single view. */
export function startHistory(view) {
  return { entries: [{ view, scroll: 0 }], index: 0 }
}

export const currentView = (h) => h.entries[h.index].view

/** Remembers how far the current view is scrolled. */
export function withScroll(h, scroll) {
  const top = Number.isFinite(scroll) && scroll > 0 ? Math.round(scroll) : 0
  if (h.entries[h.index].scroll === top) return h
  const entries = h.entries.slice()
  entries[h.index] = { ...entries[h.index], scroll: top }
  return { ...h, entries }
}

const sameView = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Opens `view` after the current one, dropping the views ahead of it. Opening
 * the view already shown changes nothing.
 */
export function pushView(h, view) {
  if (sameView(currentView(h), view)) return h
  const entries = [...h.entries.slice(0, h.index + 1), { view, scroll: 0 }].slice(-HISTORY_LIMIT)
  return { entries, index: entries.length - 1 }
}

/** Shows `view` in place of the current one (same place in the history). */
export function replaceView(h, view) {
  const entries = h.entries.slice()
  entries[h.index] = { ...entries[h.index], view }
  return { ...h, entries }
}

export const canGo = (h, delta) => h.index + delta >= 0 && h.index + delta < h.entries.length

/** Moves back (-1) or forward (+1); unchanged at either end. */
export function goBy(h, delta) {
  return canGo(h, delta) ? { ...h, index: h.index + delta } : h
}

const DASHBOARD = { name: 'dashboard' }
const SIMPLE = ['dashboard', 'plan', 'map', 'glossary', 'settings', 'review']

/**
 * The view to open at start from the saved one, or the dashboard. Lessons and
 * subjects must still exist (`lessonSubject(id)` gives a lesson's subject id or
 * null, `isSubject(id)` says whether a subject can be opened). An exam or a
 * placement test is not restarted: its subject opens instead.
 */
export function restoreView(saved, { lessonSubject, isSubject }) {
  const v = saved && typeof saved === 'object' ? saved : null
  if (!v || typeof v.name !== 'string') return DASHBOARD
  if (SIMPLE.includes(v.name)) return { name: v.name }
  if (v.name === 'lesson') {
    const subjectId = typeof v.lessonId === 'string' ? lessonSubject(v.lessonId) : null
    return subjectId ? { name: 'lesson', lessonId: v.lessonId, subjectId } : DASHBOARD
  }
  if (['subject', 'exam', 'placement'].includes(v.name)) {
    return typeof v.subjectId === 'string' && isSubject(v.subjectId)
      ? { name: 'subject', subjectId: v.subjectId }
      : DASHBOARD
  }
  return DASHBOARD
}

/**
 * Where "Continue" leads, given the subjects (each with `status` and
 * `lessonObjects`), the completed lesson ids and the learner's recent lessons
 * (`recent`: lesson ids, the latest first). It is the latest lesson worked on
 * if it isn't completed yet, or the next one not completed in its subject
 * (from the start of the subject if all those after it are). With no recent
 * lesson left to do, it is the first lesson not completed of a subject already
 * started, else of the first subject not finished (`fresh`: nothing started).
 * Null when everything is completed.
 */
export function pickResume(subjects, completed, recent = []) {
  const available = subjects.filter((s) => s.status === 'available' && s.lessonObjects.length)
  const undone = (l) => !completed.has(l.id)
  for (const lessonId of recent) {
    const subject = available.find((s) => s.lessonObjects.some((l) => l.id === lessonId))
    if (!subject) continue
    const lessons = subject.lessonObjects
    const at = lessons.findIndex((l) => l.id === lessonId)
    const lesson = lessons.slice(at).find(undone) || lessons.find(undone)
    if (lesson) return { subject, lesson, fresh: false }
  }
  for (const subject of available) {
    const lesson = subject.lessonObjects.find(undone)
    if (lesson && subject.lessonObjects.some((l) => completed.has(l.id))) {
      return { subject, lesson, fresh: false }
    }
  }
  const subject = available.find((s) => s.lessonObjects.some(undone))
  return subject ? { subject, lesson: subject.lessonObjects.find(undone), fresh: true } : null
}
