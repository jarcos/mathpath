import { useCallback, useEffect, useRef, useState } from 'react'

const SAVE_AFTER_MS = 600

/**
 * A lesson's note and bookmark. The note saves itself shortly after the
 * learner stops typing, and at once when the lesson changes or the window
 * closes. `status`: 'idle' | 'saving' | 'saved' | 'error'.
 */
export function useLessonNote(lessonId) {
  const [note, setNote] = useState({ body: '', bookmarked: false, loaded: false })
  const [status, setStatus] = useState('idle')
  const pending = useRef(null) // { lessonId, body } not saved yet
  const timer = useRef(0)
  const current = useRef(lessonId)
  current.current = lessonId

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const p = pending.current
    if (!p) return
    pending.current = null
    // The status is about the lesson shown (not one just left). Text that
    // could not be saved is kept, to try again with the next change.
    const report = (s) => p.lessonId === current.current && setStatus(s)
    const failed = () => {
      if (!pending.current) pending.current = p
      report('error')
    }
    Promise.resolve(window.api.notes?.save(p.lessonId, p.body))
      .then((ok) => (ok ? report('saved') : failed()))
      .catch(failed)
  }, [])

  useEffect(() => {
    let active = true
    setNote({ body: '', bookmarked: false, loaded: false })
    setStatus('idle')
    Promise.resolve(window.api.notes?.get(lessonId))
      .then((n) => active && setNote({ body: n?.body || '', bookmarked: !!n?.bookmarked, loaded: true }))
      .catch(() => active && setNote((n) => ({ ...n, loaded: true })))
    window.addEventListener('beforeunload', flush)
    return () => {
      active = false
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [lessonId, flush])

  const setBody = useCallback(
    (body) => {
      setNote((n) => ({ ...n, body }))
      pending.current = { lessonId, body }
      setStatus('saving')
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_AFTER_MS)
    },
    [lessonId, flush]
  )

  const toggleBookmark = useCallback(async () => {
    const on = !note.bookmarked
    setNote((n) => ({ ...n, bookmarked: on }))
    flush()
    try {
      if (!(await window.api.notes.bookmark(lessonId, on))) throw new Error('refused')
    } catch {
      // Undone, unless the learner has moved to another lesson meanwhile.
      if (current.current !== lessonId) return
      setNote((n) => ({ ...n, bookmarked: !on }))
      setStatus('error')
    }
  }, [lessonId, note.bookmarked, flush])

  return { ...note, status, setBody, toggleBookmark }
}

/** Every note and bookmark, as a Map lesson id → { body, bookmarked, updatedAt }; null while loading. */
export function useAllNotes() {
  const [notes, setNotes] = useState(null)
  useEffect(() => {
    let active = true
    Promise.resolve(window.api.notes?.list())
      .then((rows) => active && setNotes(new Map((rows || []).map((r) => [r.lessonId, r]))))
      .catch(() => active && setNotes(new Map()))
    return () => {
      active = false
    }
  }, [])
  return notes
}
