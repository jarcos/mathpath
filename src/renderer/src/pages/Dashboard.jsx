import { useTranslation } from 'react-i18next'
import { getSubjects } from '@content/index.js'
import { useApp } from '@/AppContext.jsx'
import ProgressBar from '@/components/ProgressBar.jsx'

export default function Dashboard({ onOpenSubject }) {
  const { t } = useTranslation()
  const { loc, completed } = useApp()
  const subjects = getSubjects()

  // Overall progress across every available lesson.
  const allLessons = subjects.flatMap((s) => s.lessonObjects)
  const doneAll = allLessons.filter((l) => completed.has(l.id)).length
  const overall = allLessons.length ? Math.round((doneAll / allLessons.length) * 100) : 0

  return (
    <div className="page dashboard">
      <header className="page-hero">
        <h1>{t('appName')}</h1>
        <p className="muted">{t('tagline')}</p>
        <div className="hero-progress">
          <ProgressBar percent={overall} label={t('overallProgress')} />
        </div>
      </header>

      <div className="subject-grid">
        {subjects.map((s) => {
          const total = s.lessonObjects.length
          const done = s.lessonObjects.filter((l) => completed.has(l.id)).length
          const pct = total ? Math.round((done / total) * 100) : 0
          const isAvailable = s.status === 'available' && total > 0
          return (
            <button
              key={s.id}
              className={`subject-card ${isAvailable ? '' : 'disabled'}`}
              disabled={!isAvailable}
              onClick={() => isAvailable && onOpenSubject(s.id)}
            >
              <div className="subject-icon">{s.icon}</div>
              <h3>{loc(s.name)}</h3>
              <p className="muted small">{loc(s.description)}</p>
              {isAvailable ? (
                <>
                  <ProgressBar percent={pct} />
                  <span className="badge ok">{t('lessonsCount', { count: total })}</span>
                </>
              ) : (
                <span className="badge soon">{t('comingSoon')}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
