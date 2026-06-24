import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from './AppContext.jsx'
import Dashboard from './pages/Dashboard.jsx'
import SubjectView from './pages/SubjectView.jsx'
import LessonView from './pages/LessonView.jsx'

function LanguageToggle() {
  const { lang, setLang } = useApp()
  return (
    <div className="lang-toggle">
      <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
        EN
      </button>
      <button className={lang === 'es' ? 'active' : ''} onClick={() => setLang('es')}>
        ES
      </button>
    </div>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useApp()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(next)}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle color theme"
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}

export default function App() {
  const { t } = useTranslation()
  // Minimal view router — no external routing dependency needed.
  const [view, setView] = useState({ name: 'dashboard' })

  return (
    <div className="app">
      <nav className="topbar">
        <button className="brand" onClick={() => setView({ name: 'dashboard' })}>
          <span className="brand-mark">π</span> {t('appName')}
        </button>
        <div className="topbar-controls">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </nav>

      <main className="content">
        {view.name === 'dashboard' && (
          <Dashboard onOpenSubject={(subjectId) => setView({ name: 'subject', subjectId })} />
        )}
        {view.name === 'subject' && (
          <SubjectView
            subjectId={view.subjectId}
            onBack={() => setView({ name: 'dashboard' })}
            onOpenLesson={(lessonId) =>
              setView({ name: 'lesson', lessonId, subjectId: view.subjectId })
            }
          />
        )}
        {view.name === 'lesson' && (
          <LessonView
            lessonId={view.lessonId}
            onBack={() => setView({ name: 'subject', subjectId: view.subjectId })}
          />
        )}
      </main>
    </div>
  )
}
