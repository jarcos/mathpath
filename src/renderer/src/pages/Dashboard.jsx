import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExerciseIds, getLesson, getSubject, getSubjects } from '@content/index.js'
import { endOfLocalDay } from '@shared/learning.js'
import { useApp } from '@/AppContext.jsx'
import { relativeDay } from '@/lib/mastery.js'
import { remainingLessons, useStudyGoal } from '@/lib/studyPlan.js'
import ProgressBar from '@/components/ProgressBar.jsx'
import { UpdatesPanel } from '@/components/Updates.jsx'

// Today's spaced-repetition reviews. Hidden until the learner has solved
// something, since there is nothing to review before that.
function ReviewCard({ onStart }) {
  const { t } = useTranslation()
  const { lang, learning } = useApp()
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let active = true
    window.api.review
      ?.summary(endOfLocalDay(), getExerciseIds())
      .then((s) => active && setSummary(s))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [learning])

  if (!summary || summary.total === 0) return null
  if (summary.due === 0) {
    return (
      <p className="muted small review-later">
        {summary.nextDue
          ? t('reviewNextOn', { when: relativeDay(summary.nextDue, lang) })
          : t('reviewNothing')}
      </p>
    )
  }
  return (
    <button className="resume-card review-card" onClick={onStart}>
      <div className="resume-text">
        <span className="resume-eyebrow">{t('reviewTitle')}</span>
        <span className="resume-title">{t('reviewDue', { count: summary.due })}</span>
        <span className="muted small">{t('reviewWhy')}</span>
      </div>
      <span className="resume-cta">{t('reviewStart')} →</span>
    </button>
  )
}

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

export default function Dashboard({ onOpenSubject, onOpenLesson, onStartReview, onOpenPlan }) {
  const { t } = useTranslation()
  const { loc, completed } = useApp()
  const [goal] = useStudyGoal()
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

  // With a study goal, "continue" follows the plan instead.
  const planLeft = goal ? remainingLessons(goal, completed) : null
  const planNext = planLeft?.length ? getLesson(planLeft[0].id) : null

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

      <ReviewCard onStart={onStartReview} />

      {planNext && (
        <button className="resume-card" onClick={() => onOpenLesson(planNext.subjectId, planNext.id)}>
          <div className="resume-text">
            <span className="resume-eyebrow">{t('planTodayCard')}</span>
            <span className="resume-title">{loc(planNext.title)}</span>
            <span className="muted small">
              {t('planTodaySub', {
                subject: loc(getSubject(goal.subjectId).name),
                count: planLeft.length
              })}
            </span>
          </div>
          <span className="resume-cta">{t('continue')} →</span>
        </button>
      )}
      {goal && !planNext && <p className="muted small review-later">{t('planGoalDone')}</p>}
      {goal === null && (
        <p className="muted small review-later">
          {t('planCreatePrompt')}{' '}
          <button className="link" onClick={onOpenPlan}>
            {t('planCreate')} →
          </button>
        </p>
      )}

      {goal === null && resume && (
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

      <UpdatesPanel />
    </div>
  )
}
