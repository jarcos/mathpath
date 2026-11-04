import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from './AppContext.jsx'
import Dashboard from './pages/Dashboard.jsx'
import SubjectView from './pages/SubjectView.jsx'
import LessonView from './pages/LessonView.jsx'
import GlossaryView from './pages/GlossaryView.jsx'
import ReviewView from './pages/ReviewView.jsx'
import MapView from './pages/MapView.jsx'
import PlacementView from './pages/PlacementView.jsx'
import PlanView from './pages/PlanView.jsx'
import ExamView from './pages/ExamView.jsx'
import SettingsView from './pages/SettingsView.jsx'
import { getLesson } from '@content/index.js'
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
  const { dataVersion, reloadData } = useApp()
  // Minimal view router — no external routing dependency needed.
  const [view, setView] = useState({ name: 'dashboard' })
  // A lesson always opens within its own subject (prerequisites, the map and
  // the plan can link across subjects).
  const openLesson = (lessonId) =>
    setView({ name: 'lesson', lessonId, subjectId: getLesson(lessonId)?.subjectId })
  const home = () => setView({ name: 'dashboard' })
  const startReview = () => setView({ name: 'review' })

  return (
    <div className="app">
      <nav className="topbar">
        <button className="brand" onClick={home}>
          <span className="brand-mark">π</span> <span className="brand-name">{t('appName')}</span>
        </button>
        <div className="topbar-controls">
          <button className="nav-link" onClick={() => setView({ name: 'plan' })}>
            {t('navPlan')}
          </button>
          <button className="nav-link" onClick={() => setView({ name: 'map' })}>
            {t('navMap')}
          </button>
          <button className="nav-link" onClick={() => setView({ name: 'glossary' })}>
            {t('navGlossary')}
          </button>
          <button className="nav-link" onClick={() => setView({ name: 'settings' })}>
            {t('navSettings')}
          </button>
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </nav>
      <UpdateBanner />

      {/* Remounted when an import or a reset replaces the data. */}
      <main className="content" id="app-scroll" key={dataVersion}>
        {view.name === 'dashboard' && (
          <Dashboard
            onOpenSubject={(subjectId) => setView({ name: 'subject', subjectId })}
            onOpenLesson={(_subjectId, lessonId) => openLesson(lessonId)}
            onStartReview={startReview}
            onOpenPlan={() => setView({ name: 'plan' })}
          />
        )}
        {view.name === 'review' && (
          <ReviewView onBack={home} onOpenLesson={(_subjectId, lessonId) => openLesson(lessonId)} />
        )}
        {view.name === 'subject' && (
          <SubjectView
            subjectId={view.subjectId}
            onBack={home}
            onOpenLesson={openLesson}
            onOpenSubject={(subjectId) => setView({ name: 'subject', subjectId })}
            onPlacement={() => setView({ name: 'placement', subjectId: view.subjectId })}
            onExam={() => setView({ name: 'exam', subjectId: view.subjectId })}
          />
        )}
        {view.name === 'exam' && (
          <ExamView
            subjectId={view.subjectId}
            onBack={() => setView({ name: 'subject', subjectId: view.subjectId })}
            onOpenLesson={openLesson}
          />
        )}
        {view.name === 'placement' && (
          <PlacementView
            subjectId={view.subjectId}
            onBack={() => setView({ name: 'subject', subjectId: view.subjectId })}
            onOpenLesson={openLesson}
          />
        )}
        {view.name === 'lesson' && (
          <LessonView
            lessonId={view.lessonId}
            onBack={() => setView({ name: 'subject', subjectId: view.subjectId })}
            onOpenLesson={openLesson}
          />
        )}
        {view.name === 'map' && <MapView onBack={home} onOpenLesson={openLesson} />}
        {view.name === 'plan' && (
          <PlanView onBack={home} onOpenLesson={openLesson} onStartReview={startReview} />
        )}
        {view.name === 'glossary' && <GlossaryView onBack={home} />}
        {view.name === 'settings' && (
          <SettingsView
            onBack={home}
            onOpenPlan={() => setView({ name: 'plan' })}
            notice={view.notice}
            onReplaced={(notice) => {
              setView({ name: 'settings', notice })
              reloadData()
            }}
          />
        )}
      </main>
    </div>
  )
}
