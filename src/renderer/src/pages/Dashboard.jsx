import { useTranslation } from 'react-i18next'
import { getSubjects } from '@content/index.js'
import { useApp } from '@/AppContext.jsx'
import ProgressBar from '@/components/ProgressBar.jsx'

function SubjectCard({ s, loc, t, completed, onOpenSubject }) {
  const total = s.lessonObjects.length
  const done = s.lessonObjects.filter((l) => completed.has(l.id)).length
  const pct = total ? Math.round((done / total) * 100) : 0
  const isAvailable = s.status === 'available' && total > 0
  return (
    <button
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
          <span className="badge ok">{t('lessonsProgress', { done, total })}</span>
        </>
      ) : (
        <span className="badge soon">{t('comingSoon')}</span>
      )}
    </button>
  )
}

export default function Dashboard({ onOpenSubject, onOpenLesson }) {
  const { t } = useTranslation()
  const { loc, completed } = useApp()
  const subjects = getSubjects()

  // Overall progress across every available lesson.
  const allLessons = subjects.flatMap((s) => s.lessonObjects)
  const doneAll = allLessons.filter((l) => completed.has(l.id)).length
  const overall = allLessons.length ? Math.round((doneAll / allLessons.length) * 100) : 0

  // Work out where to send the learner with one click. Prefer a subject already
  // in progress; otherwise start at the very first lesson.
  const available = subjects.filter((s) => s.status === 'available' && s.lessonObjects.length)
  let resume = null
  for (const s of available) {
    const firstUndone = s.lessonObjects.find((l) => !completed.has(l.id))
    const someDone = s.lessonObjects.some((l) => completed.has(l.id))
    if (firstUndone && someDone) {
      resume = { subject: s, lesson: firstUndone, fresh: false }
      break
    }
  }
  if (!resume) {
    const firstUnfinished = available.find((s) =>
      s.lessonObjects.some((l) => !completed.has(l.id))
    )
    if (firstUnfinished) {
      resume = {
        subject: firstUnfinished,
        lesson: firstUnfinished.lessonObjects.find((l) => !completed.has(l.id)),
        fresh: true
      }
    }
  }

  const tracks = [
    { id: 'math', label: t('trackMath') },
    { id: 'ai', label: t('trackAi') }
  ]

  return (
    <div className="page dashboard">
      <header className="page-hero">
        <h1>{t('appName')}</h1>
        <p className="muted">{t('tagline')}</p>
        <div className="hero-progress">
          <ProgressBar percent={overall} label={t('overallProgress')} />
        </div>
      </header>

      {resume && (
        <button
          className="resume-card"
          onClick={() => onOpenLesson(resume.subject.id, resume.lesson.id)}
        >
          <div className="resume-text">
            <span className="resume-eyebrow">
              {resume.fresh ? t('startLearning') : t('continueLearning')}
            </span>
            <span className="resume-title">{loc(resume.lesson.title)}</span>
            <span className="muted small">{loc(resume.subject.name)}</span>
          </div>
          <span className="resume-cta">{t('continue')} →</span>
        </button>
      )}

      {tracks.map((track) => {
        const items = subjects.filter((s) => (s.track || 'math') === track.id)
        if (!items.length) return null
        return (
          <section className="subject-track" key={track.id}>
            <h2 className="track-title">{track.label}</h2>
            <div className="subject-grid">
              {items.map((s) => (
                <SubjectCard
                  key={s.id}
                  s={s}
                  loc={loc}
                  t={t}
                  completed={completed}
                  onOpenSubject={onOpenSubject}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
