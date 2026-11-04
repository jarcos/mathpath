import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getPrereqs } from '@content/index.js'
import { endOfLocalDay } from '@shared/learning.js'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

// solved: exercise id → { lessonId, clean, firstTry }; due: ids whose review is due today.
const EMPTY_LEARNING = { solved: new Map(), due: new Set() }

// The saved text size, within the range the main process accepts.
const zoomOf = (value) => {
  const z = Number(value)
  return z >= 0.75 && z <= 1.5 ? z : 1
}

export function AppProvider({ children }) {
  const { i18n } = useTranslation()
  const [lang, setLangState] = useState('en')
  const [theme, setThemeState] = useState('dark')
  const [zoom, setZoomState] = useState(1)
  const [completed, setCompleted] = useState(() => new Set())
  const [learning, setLearning] = useState(EMPTY_LEARNING)
  const [ready, setReady] = useState(false)
  // Bumped when all the data is replaced (import, reset), to remount the pages.
  const [dataVersion, setDataVersion] = useState(0)

  const refreshLearning = useCallback(async () => {
    try {
      const s = await window.api.learning.state(endOfLocalDay())
      setLearning({
        solved: new Map(
          s.solved.map((r) => [r.exercise_id, { lessonId: r.lesson_id, clean: r.clean, firstTry: r.firstTry }])
        ),
        due: new Set(s.due.map((r) => r.exercise_id))
      })
    } catch (e) {
      console.error('learning state failed', e)
    }
  }, [])

  // Reads the settings and progress from the local database (the main process
  // applies the saved zoom itself when it opens the window).
  const load = useCallback(async () => {
    const saved = await window.api.settings.get('language')
    const l = saved === 'es' ? 'es' : 'en'
    setLangState(l)
    i18n.changeLanguage(l)
    const savedTheme = await window.api.settings.get('theme')
    const th = savedTheme === 'light' ? 'light' : 'dark'
    setThemeState(th)
    document.documentElement.setAttribute('data-theme', th)
    setZoomState(zoomOf(await window.api.settings.get('zoom')))
    const rows = await window.api.progress.getAll()
    setCompleted(new Set(rows.filter((r) => r.completed).map((r) => r.lesson_id)))
    await refreshLearning()
  }, [i18n, refreshLearning])

  useEffect(() => {
    load()
      .catch((e) => console.error('init failed', e))
      .finally(() => setReady(true))
  }, [load])

  // After an import or a reset: read everything again and remount the pages.
  const reloadData = useCallback(async () => {
    try {
      await load()
      await window.api.view?.setZoom(zoomOf(await window.api.settings.get('zoom')))
    } catch (e) {
      console.error('reload failed', e)
    }
    setDataVersion((v) => v + 1)
  }, [load])

  // What is due depends on the day: refresh when the learner comes back.
  useEffect(() => {
    window.addEventListener('focus', refreshLearning)
    return () => window.removeEventListener('focus', refreshLearning)
  }, [refreshLearning])

  const setLang = useCallback(
    (l) => {
      setLangState(l)
      i18n.changeLanguage(l)
      window.api.settings.set('language', l)
    },
    [i18n]
  )

  const setTheme = useCallback((t) => {
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)
    window.api.settings.set('theme', t)
  }, [])

  const setZoom = useCallback((z) => {
    setZoomState(z)
    window.api.view?.setZoom(z)
  }, [])

  // Picks the field matching the current language from a {en, es} object.
  const loc = useCallback((obj) => (obj ? obj[lang] ?? obj.en ?? '' : ''), [lang])

  // source: 'manual' | 'mastery' | 'placement' (placement doesn't count as study time today)
  const setLessonCompleted = useCallback(async (lessonId, subjectId, value, source = 'manual') => {
    await window.api.progress.setLesson(lessonId, subjectId, value, source)
    setCompleted((prev) => {
      const next = new Set(prev)
      if (value) next.add(lessonId)
      else next.delete(lessonId)
      return next
    })
  }, [])

  // Resolves with the exercise's next review date (ISO) or null.
  const recordAttempt = useCallback(
    async (payload) => {
      // A review that goes well also counts, in part, for the lessons it builds on.
      const buildsOn = payload.schedule === 'review' ? getPrereqs(payload.lessonId) : undefined
      const due = await window.api.attempts.record({ ...payload, buildsOn })
      refreshLearning()
      return due
    },
    [refreshLearning]
  )

  // Defensive: tolerate an older/stale preload bridge that predates this API so
  // opening a lesson never hard-crashes the view. Always resolves to an array.
  const getSolvedForLesson = useCallback(async (lessonId) => {
    try {
      const fn = window.api?.attempts?.solvedForLesson
      if (typeof fn !== 'function') return []
      return (await fn(lessonId)) || []
    } catch (e) {
      console.error('getSolvedForLesson failed', e)
      return []
    }
  }, [])

  const value = {
    lang,
    setLang,
    theme,
    setTheme,
    zoom,
    setZoom,
    dataVersion,
    reloadData,
    loc,
    completed,
    setLessonCompleted,
    learning,
    refreshLearning,
    recordAttempt,
    getSolvedForLesson,
    ready
  }
  return (
    <AppContext.Provider value={value}>
      {ready ? children : <div className="app-loading" aria-busy="true">MathPath…</div>}
    </AppContext.Provider>
  )
}
