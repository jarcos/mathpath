import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from './AppContext.jsx'
import Dashboard from './pages/Dashboard.jsx'
import SubjectView from './pages/SubjectView.jsx'
import LessonView from './pages/LessonView.jsx'
import GlossaryView from './pages/GlossaryView.jsx'
import ReviewView from './pages/ReviewView.jsx'
import { UpdateBanner } from './components/Updates.jsx'

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
  const { t } = useTranslation()
  const { theme, setTheme } = useApp()
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = theme === 'dark' ? t('themeToLight') : t('themeToDark')
  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(next)}
      title={label}
      aria-label={label}
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
          <button className="nav-link" onClick={() => setView({ name: 'glossary' })}>
            {t('navGlossary')}
          </button>
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </nav>
      <UpdateBanner />

      <main className="content" id="app-scroll">
        {view.name === 'dashboard' && (
          <Dashboard
            onOpenSubject={(subjectId) => setView({ name: 'subject', subjectId })}
            onOpenLesson={(subjectId, lessonId) =>
              setView({ name: 'lesson', lessonId, subjectId })
            }
            onStartReview={() => setView({ name: 'review' })}
          />
        )}
        {view.name === 'review' && (
          <ReviewView
            onBack={() => setView({ name: 'dashboard' })}
            onOpenLesson={(subjectId, lessonId) =>
              setView({ name: 'lesson', lessonId, subjectId })
            }
          />
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
            onOpenLesson={(lessonId) =>
              setView({ name: 'lesson', lessonId, subjectId: view.subjectId })
            }
          />
        )}
        {view.name === 'glossary' && (
          <GlossaryView onBack={() => setView({ name: 'dashboard' })} />
        )}
      </main>
    </div>
  )
}
