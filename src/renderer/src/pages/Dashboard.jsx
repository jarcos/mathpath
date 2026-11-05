import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExerciseIds, getLesson, getSubject, getSubjects } from '@content/index.js'
import { endOfLocalDay } from '@shared/learning.js'
import { pickResume } from '@shared/navigation.js'
import { useApp } from '@/AppContext.jsx'
import { relativeDay } from '@/lib/mastery.js'
import { remainingLessons, useStudyGoal, useTodayMinutes } from '@/lib/studyPlan.js'
import ProgressBar from '@/components/ProgressBar.jsx'

// The lessons worked on last (ids, latest first), refreshed after each answer;
// null until read.
function useRecentLessons() {
  const { completed, learning } = useApp()
  const [recent, setRecent] = useState(null)
  useEffect(() => {
    let active = true
    Promise.resolve(window.api.learning.recent?.())
      .then((ids) => active && setRecent(Array.isArray(ids) ? ids : []))
      .catch(() => active && setRecent([]))
    return () => {
      active = false
    }
  }, [completed, learning])
  return recent
}

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

export default function Dashboard({ onOpenSubject, onOpenLesson, onStartReview, onOpenPlan, onOpenPage }) {
  const { t } = useTranslation()
  const { loc, completed } = useApp()
  const [goal] = useStudyGoal()
  const studied = useTodayMinutes()
  const subjects = getSubjects()

  // Overall progress across every available lesson.
  const allLessons = subjects.flatMap((s) => s.lessonObjects)
  const doneAll = allLessons.filter((l) => completed.has(l.id)).length
  const overall = allLessons.length ? Math.round((doneAll / allLessons.length) * 100) : 0

  // Where one click takes the learner: back to the lesson worked on last (or
  // the next one), else on through the course. Shown once the recent lessons
  // are known, so the card doesn't change under the pointer.
  const recent = useRecentLessons()
  const resume = recent ? pickResume(subjects, completed, recent) : null

  // With a study goal, "continue" follows the plan instead.
  const planLeft = goal ? remainingLessons(goal, completed) : null
  const planNext = planLeft?.length ? getLesson(planLeft[0].id) : null
  const met = goal && studied !== null && studied >= goal.minutes

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
            <span className="resume-eyebrow">{t(met ? 'planNextCard' : 'planTodayCard')}</span>
            <span className="resume-title">{loc(planNext.title)}</span>
            <span className="muted small">
              {t('planTodaySub', {
                subject: loc(getSubject(goal.subjectId).name),
                count: planLeft.length
              })}
              {studied !== null && ' · '}
              {studied !== null &&
                (met
                  ? t('planTodayMet', { done: studied })
                  : t('planTodayProgress', { done: studied, total: goal.minutes }))}
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

      <nav className="dash-links small" aria-label={t('dashboard')}>
        <button className="link" onClick={() => onOpenPage('notes')}>
          {t('notesLink')}
        </button>
        <button className="link" onClick={() => onOpenPage('stats')}>
          {t('statsLink')}
        </button>
      </nav>

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
