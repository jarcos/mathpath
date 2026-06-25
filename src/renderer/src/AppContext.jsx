import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const { i18n } = useTranslation()
  const [lang, setLangState] = useState('en')
  const [theme, setThemeState] = useState('dark')
  const [completed, setCompleted] = useState(() => new Set())
  const [ready, setReady] = useState(false)

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
      } catch (e) {
        console.error('init failed', e)
      } finally {
        setReady(true)
      }
    })()
  }, [i18n])

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

  const setLessonCompleted = useCallback(async (lessonId, subjectId, value) => {
    await window.api.progress.setLesson(lessonId, subjectId, value)
    setCompleted((prev) => {
      const next = new Set(prev)
      if (value) next.add(lessonId)
      else next.delete(lessonId)
      return next
    })
  }, [])

  const recordAttempt = useCallback((payload) => window.api.attempts.record(payload), [])

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
