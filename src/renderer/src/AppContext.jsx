import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getPrereqs } from '@content/index.js'
import { endOfLocalDay } from '@shared/learning.js'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

// solved: exercise id → { lessonId, clean, firstTry }; due: ids whose review is due today.
const EMPTY_LEARNING = { solved: new Map(), due: new Set() }

export function AppProvider({ children }) {
  const { i18n } = useTranslation()
  const [lang, setLangState] = useState('en')
  const [theme, setThemeState] = useState('dark')
  const [completed, setCompleted] = useState(() => new Set())
  const [learning, setLearning] = useState(EMPTY_LEARNING)
  const [ready, setReady] = useState(false)

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

  // Load persisted language + progress from the local database on startup.
  useEffect(() => {
    ;(async () => {
      try {
        const saved = await window.api.settings.get('language')
        const l = saved === 'es' ? 'es' : 'en'
        setLangState(l)
        i18n.changeLanguage(l)
        const savedTheme = await window.api.settings.get('theme')
        const th = savedTheme === 'light' ? 'light' : 'dark'
        setThemeState(th)
        document.documentElement.setAttribute('data-theme', th)
        const rows = await window.api.progress.getAll()
        setCompleted(new Set(rows.filter((r) => r.completed).map((r) => r.lesson_id)))
        await refreshLearning()
      } catch (e) {
        console.error('init failed', e)
      } finally {
        setReady(true)
      }
    })()
  }, [i18n, refreshLearning])

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
