import { useCallback, useEffect, useRef, useState } from 'react'
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
import NotesView from './pages/NotesView.jsx'
import StatsView from './pages/StatsView.jsx'
import SheetView from './pages/SheetView.jsx'
import SearchPalette from './components/SearchPalette.jsx'
import { getLesson, getSubject } from '@content/index.js'
import {
  canGo,
  currentView,
  goBy,
  pushView,
  replaceView,
  restoreView,
  startHistory,
  withScroll
} from '@shared/navigation.js'
import { KEYS, historyKey, isMac, isSearchKey } from './lib/keys.js'
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
  const { savedTheme: theme, setTheme } = useApp()
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

const scroller = () => document.getElementById('app-scroll')

// Scrolls the page to `top`, trying again for a moment while it is still too
// short (some pages load their content after they mount), and once more when
// the fonts are in (they change the layout). Anything the learner does to
// scroll stops it. `settling.current` is true until it stops; the function
// returned stops it too.
function scrollPage(top, settling) {
  const el = scroller()
  if (!el) return () => {}
  settling.current = true
  let frames = 0
  let raf = 0
  let done = false
  let timer = 0
  const events = ['wheel', 'touchstart', 'keydown', 'mousedown']
  const stop = () => {
    done = true
    settling.current = false
    cancelAnimationFrame(raf)
    clearTimeout(timer)
    for (const ev of events) el.removeEventListener(ev, stop)
  }
  let fontsIn = !document.fonts || document.fonts.status === 'loaded'
  // Done once there with the fonts in; given up after about a second.
  const step = () => {
    if (done) return
    el.scrollTop = top
    const there = Math.abs(el.scrollTop - top) <= 1
    if (there ? fontsIn : ++frames > 60) stop()
    else if (!there) raf = requestAnimationFrame(step)
  }
  for (const ev of events) el.addEventListener(ev, stop, { passive: true })
  timer = setTimeout(stop, 2000)
  step()
  document.fonts?.ready.then(() => {
    fontsIn = true
    requestAnimationFrame(step)
  })
  return stop
}

// After a navigation, focus goes to the new page's title, so a screen reader
// reads it and the keyboard scrolls the page (not the button just pressed).
function focusPage() {
  const el = scroller()
  const target = el?.querySelector('h1') || el
  if (!target) return
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
}

const canOpenSubject = (id) => {
  const s = getSubject(id)
  return !!s && s.status === 'available' && s.lessonObjects.length > 0
}

// The history at start: the view open when MathPath was closed, if it can
// still be opened, at the same scroll.
function firstHistory(saved) {
  const view = restoreView(saved?.view, {
    lessonSubject: (id) => getLesson(id)?.subjectId ?? null,
    isSubject: canOpenSubject
  })
  const h = startHistory(view)
  return view.name === saved?.view?.name ? withScroll(h, Number(saved.scroll)) : h
}

export default function App() {
  const { t } = useTranslation()
  const { dataVersion, reloadData, savedView } = useApp()
  // Minimal view router with back / forward — no routing dependency needed.
  const [history, setHistory] = useState(() => firstHistory(savedView))
  const view = currentView(history)
  const entry = history.entries[history.index]
  const [searching, setSearching] = useState(false)
  const searchingRef = useRef(false)
  searchingRef.current = searching
  const moved = useRef(false) // the view changed: focus the new page
  const settling = useRef(false) // its scroll is still being set

  // Every way of changing the view remembers how far the one left was scrolled.
  // Opening the view already shown, or going past either end, changes nothing.
  const move = useCallback((step) => {
    const top = scroller()?.scrollTop ?? 0
    setHistory((h) => {
      if (step(h) === h) return h
      moved.current = true
      return step(withScroll(h, top))
    })
  }, [])
  const navigate = useCallback((next) => move((h) => pushView(h, next)), [move])
  const go = useCallback((delta) => move((h) => goBy(h, delta)), [move])
  // After an import or a reset: the same page, with new data, from the top.
  const replace = useCallback((next) => setHistory((h) => withScroll(replaceView(h, next), 0)), [])

  // A view opens at its scroll: the top for a new one, where it was left when
  // going back or forward, or when MathPath is reopened.
  useEffect(() => {
    // The glossary opened on a symbol scrolls to it itself.
    const stop = entry.view.focusId ? () => {} : scrollPage(entry.scroll, settling)
    if (moved.current) {
      moved.current = false
      focusPage()
    }
    return stop
  }, [entry])

  // Saved for the next start: the view and its scroll, shortly after a change
  // and when the window closes. While the scroll is still being set, the one
  // it is going to (the page may not be tall enough yet).
  const entryRef = useRef(entry)
  entryRef.current = entry
  useEffect(() => {
    const el = scroller()
    if (!el) return undefined
    let timer = 0
    const write = () => {
      clearTimeout(timer)
      const { view: v, scroll } = entryRef.current
      const top = settling.current ? scroll : Math.round(el.scrollTop)
      window.api.settings.set('lastView', JSON.stringify({ view: v, scroll: top })).catch(() => {})
    }
    const save = () => {
      clearTimeout(timer)
      timer = setTimeout(write, 400)
    }
    save()
    el.addEventListener('scroll', save, { passive: true })
    window.addEventListener('beforeunload', write)
    return () => {
      clearTimeout(timer)
      el.removeEventListener('scroll', save)
      window.removeEventListener('beforeunload', write)
    }
  }, [entry, dataVersion])

  // Back and forward: the keys of a browser and the mouse's side buttons.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return
      if (isSearchKey(e)) {
        e.preventDefault()
        setSearching((open) => !open)
        return
      }
      // While searching, the keys belong to the search.
      if (searchingRef.current) return
      const delta = historyKey(e)
      if (!delta) return
      e.preventDefault()
      go(delta)
    }
    const onMouse = (e) => {
      if ((e.button !== 3 && e.button !== 4) || searchingRef.current) return
      e.preventDefault()
      go(e.button === 3 ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [go])

  // A lesson always opens within its own subject (prerequisites, the map and
  // the plan can link across subjects).
  const openLesson = (lessonId) =>
    navigate({ name: 'lesson', lessonId, subjectId: getLesson(lessonId)?.subjectId })
  const home = () => navigate({ name: 'dashboard' })
  const startReview = () => navigate({ name: 'review' })
  // While searching, the page behind can't be reached (screen readers included).
  const behind = searching ? { inert: '' } : {}
  const pages = [
    { id: 'dashboard', label: t('dashboard') },
    { id: 'review', label: t('reviewTitle') },
    { id: 'plan', label: t('navPlan') },
    { id: 'map', label: t('navMap') },
    { id: 'glossary', label: t('navGlossary') },
    { id: 'notes', label: t('notesTitle') },
    { id: 'stats', label: t('statsTitle') },
    { id: 'settings', label: t('navSettings') }
  ]

  return (
    <div className="app">
      <nav className="topbar" {...behind}>
        <div className="topbar-start">
          <button className="brand" onClick={home}>
            <span className="brand-mark">π</span> <span className="brand-name">{t('appName')}</span>
          </button>
          <button
            className="theme-toggle history-btn"
            onClick={() => go(-1)}
            disabled={!canGo(history, -1)}
            title={`${t('navBack')} (${KEYS.back})`}
            aria-label={t('navBack')}
          >
            ←
          </button>
          <button
            className="theme-toggle history-btn"
            onClick={() => go(1)}
            disabled={!canGo(history, 1)}
            title={`${t('navForward')} (${KEYS.forward})`}
            aria-label={t('navForward')}
          >
            →
          </button>
        </div>
        <div className="topbar-controls">
          <button className="nav-link" onClick={() => navigate({ name: 'plan' })}>
            {t('navPlan')}
          </button>
          <button className="nav-link" onClick={() => navigate({ name: 'map' })}>
            {t('navMap')}
          </button>
          <button className="nav-link" onClick={() => navigate({ name: 'glossary' })}>
            {t('navGlossary')}
          </button>
          <button className="nav-link" onClick={() => navigate({ name: 'settings' })}>
            {t('navSettings')}
          </button>
          <button
            className="theme-toggle search-btn"
            onClick={() => setSearching(true)}
            title={`${t('searchButton')} (${KEYS.search})`}
            aria-label={t('searchButton')}
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </nav>
      <UpdateBanner />
      {searching && (
        <SearchPalette
          pages={pages}
          onClose={() => setSearching(false)}
          onOpenPage={(name) => navigate({ name })}
          onOpenLesson={openLesson}
          onOpenSymbol={(focusId) => navigate({ name: 'glossary', focusId })}
        />
      )}

      {/* Remounted when an import or a reset replaces the data. */}
      <main className="content" id="app-scroll" key={dataVersion} {...behind}>
        {view.name === 'dashboard' && (
          <Dashboard
            onOpenSubject={(subjectId) => navigate({ name: 'subject', subjectId })}
            onOpenLesson={(_subjectId, lessonId) => openLesson(lessonId)}
            onStartReview={startReview}
            onOpenPlan={() => navigate({ name: 'plan' })}
            onOpenPage={(name) => navigate({ name })}
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
            onOpenSubject={(subjectId) => navigate({ name: 'subject', subjectId })}
            onPlacement={() => navigate({ name: 'placement', subjectId: view.subjectId })}
            onExam={() => navigate({ name: 'exam', subjectId: view.subjectId })}
            onSheet={() => navigate({ name: 'sheet', subjectId: view.subjectId })}
          />
        )}
        {view.name === 'exam' && (
          <ExamView
            subjectId={view.subjectId}
            onBack={() => navigate({ name: 'subject', subjectId: view.subjectId })}
            onOpenLesson={openLesson}
          />
        )}
        {view.name === 'placement' && (
          <PlacementView
            subjectId={view.subjectId}
            onBack={() => navigate({ name: 'subject', subjectId: view.subjectId })}
            onOpenLesson={openLesson}
          />
        )}
        {view.name === 'lesson' && (
          <LessonView
            lessonId={view.lessonId}
            onBack={() => navigate({ name: 'subject', subjectId: view.subjectId })}
            onOpenLesson={openLesson}
          />
        )}
        {view.name === 'map' && <MapView onBack={home} onOpenLesson={openLesson} />}
        {view.name === 'plan' && (
          <PlanView
            onBack={home}
            onOpenLesson={openLesson}
            onStartReview={startReview}
            onOpenStats={() => navigate({ name: 'stats' })}
          />
        )}
        {view.name === 'glossary' && <GlossaryView onBack={home} focusId={view.focusId} />}
        {view.name === 'notes' && <NotesView onBack={home} onOpenLesson={openLesson} />}
        {view.name === 'stats' && <StatsView onBack={home} onOpenLesson={openLesson} />}
        {view.name === 'sheet' && (
          <SheetView subjectId={view.subjectId} onBack={() => navigate({ name: 'subject', subjectId: view.subjectId })} />
        )}
        {view.name === 'settings' && (
          <SettingsView
            onBack={home}
            onOpenPlan={() => navigate({ name: 'plan' })}
            notice={view.notice}
            onReplaced={(notice) => {
              replace({ name: 'settings', notice })
              reloadData()
            }}
          />
        )}
      </main>
    </div>
  )
}
