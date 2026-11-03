import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExerciseIds, getLesson, getLessonsNeeded, getSubject, getSubjects } from '@content/index.js'
import { endOfLocalDay } from '@shared/learning.js'
import { dayKey, planStudy, streak } from '@shared/planner.js'
import { useApp } from '@/AppContext.jsx'
import { relativeDay } from '@/lib/mastery.js'
import { remainingLessons, useStudyGoal } from '@/lib/studyPlan.js'
import ProgressBar from '@/components/ProgressBar.jsx'

const MINUTE_CHOICES = [15, 30, 45, 60, 90, 120]
const HEATMAP_WEEKS = 18
// Activity fetched for the streak (the heatmap shows only the last weeks).
const ACTIVITY_DAYS = 400

function GoalForm({ goal, onSave, onCancel }) {
  const { t } = useTranslation()
  const { loc } = useApp()
  const subjects = getSubjects().filter((s) => s.lessonObjects.length)
  const [subjectId, setSubjectId] = useState(goal?.subjectId || subjects.at(-1).id)
  const [minutes, setMinutes] = useState(goal?.minutes || 30)
  return (
    <section className="plan-panel">
      <h2>{t('planGoalTitle')}</h2>
      <div className="plan-form">
        <label>
          <span className="muted small">{t('planGoalSubject')}</span>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {loc(s.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">{t('planGoalMinutes')}</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {MINUTE_CHOICES.map((m) => (
              <option key={m} value={m}>
                {t('planMinutesPerDay', { count: m })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">{t('planGoalHelp')}</p>
      <div className="updates-actions">
        <button className="primary" onClick={() => onSave({ subjectId, minutes })}>
          {t('planGoalSave')}
        </button>
        {onCancel && (
          <button className="link" onClick={onCancel}>
            {t('planCancel')}
          </button>
        )}
      </div>
    </section>
  )
}

// GitHub-style grid of the last weeks: one cell per day, shaded by answers.
function ActivityHeatmap({ counts, lang }) {
  const { t } = useTranslation()
  // Noon, so stepping a day at a time never lands in a DST gap.
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - (HEATMAP_WEEKS * 7 - 1) - ((today.getDay() + 6) % 7))
  const cells = []
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d)
    const n = counts.get(key) || 0
    const level = n === 0 ? 0 : n < 5 ? 1 : n < 15 ? 2 : 3
    const label = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(d)
    cells.push(<span key={key} className={`heat heat-${level}`} title={t('planActivityDay', { date: label, count: n })} />)
  }
  return (
    <div className="heatmap" role="img" aria-label={t('planActivity')}>
      {cells}
    </div>
  )
}

// The cross-subject study plan: what's left for the goal, today's lessons and
// reviews, the coming days, and the learner's streak.
export default function PlanView({ onBack, onOpenLesson, onStartReview }) {
  const { t } = useTranslation()
  const { loc, lang, completed, learning } = useApp()
  const [goal, saveGoal] = useStudyGoal()
  const [editing, setEditing] = useState(false)
  const [reviewsDue, setReviewsDue] = useState(0)
  const [activity, setActivity] = useState(new Map())

  useEffect(() => {
    window.api.review
      ?.summary(endOfLocalDay(), getExerciseIds())
      .then((s) => setReviewsDue(s.due))
      .catch(() => {})
    const since = new Date()
    since.setDate(since.getDate() - ACTIVITY_DAYS)
    window.api.learning
      ?.activity(since.toISOString())
      .then((rows) => setActivity(new Map(rows.map((r) => [r.day, r.attempts]))))
      .catch(() => {})
  }, [learning])

  if (goal === undefined) return null

  const header = (
    <>
      <button className="link back" onClick={onBack}>
        {t('backToDashboard')}
      </button>
      <header className="glossary-header">
        <h1>{t('planPageTitle')}</h1>
        <p className="muted">{t('planPageSubtitle')}</p>
      </header>
    </>
  )

  if (!goal || editing) {
    return (
      <div className="page plan-view">
        {header}
        <GoalForm
          goal={goal}
          onSave={(g) => {
            saveGoal(g)
            setEditing(false)
          }}
          onCancel={goal ? () => setEditing(false) : null}
        />
      </div>
    )
  }

  const subject = getSubject(goal.subjectId)
  const allNeeded = getLessonsNeeded(subject.lessonObjects.at(-1).id)
  const remaining = remainingLessons(goal, completed)
  const plan = planStudy({ lessons: remaining, minutesPerDay: goal.minutes, reviewsDue })
  const today = plan.days[0]
  const upcoming = plan.days.slice(1).filter((d) => d.lessons.length).slice(0, 6)
  const done = allNeeded.length - remaining.length
  const days = streak(new Set(activity.keys()))
  const fmt = (d) => new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
  const fmtLong = (d) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)

  return (
    <div className="page plan-view">
      {header}

      <section className="plan-panel">
        <div className="plan-head">
          <h2>{t('planGoalSummary', { subject: loc(subject.name) })}</h2>
          <button className="link subtle" onClick={() => setEditing(true)}>
            {t('planChange')}
          </button>
        </div>
        <p className="muted small">{t('planMinutesPerDay', { count: goal.minutes })}</p>
        <ProgressBar
          percent={allNeeded.length ? Math.round((done / allNeeded.length) * 100) : 100}
          label={t('planLessonsDone', { done, total: allNeeded.length })}
        />
        {plan.finish ? (
          <p className="plan-finish">
            {t('planFinish', {
              date: fmtLong(plan.finish),
              when: relativeDay(plan.finish.toISOString(), lang),
              hours: Math.round(plan.totalMinutes / 60)
            })}
          </p>
        ) : (
          <p className="plan-finish">{t('planGoalDone')}</p>
        )}
      </section>

      <section className="plan-panel">
        <div className="plan-head">
          <h2>{t('planToday')}</h2>
          <span className="badge ok">{t('planStreak', { count: days })}</span>
        </div>
        {reviewsDue > 0 && (
          <p className="plan-line">
            {t('planReviews', { count: reviewsDue, minutes: today.reviewMinutes })}{' '}
            <button className="link" onClick={onStartReview}>
              {t('reviewStart')} →
            </button>
          </p>
        )}
        {today.lessons.length ? (
          <ul className="today-list">
            {today.lessons.map((id) => {
              const l = getLesson(id)
              return (
                <li key={id}>
                  <button className="link" onClick={() => onOpenLesson(id)}>
                    {loc(l.title)}
                  </button>{' '}
                  <span className="muted small">
                    {loc(getSubject(l.subjectId).name)} · {t('estMinutes', { count: l.estimatedMinutes })}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          plan.finish && <p className="muted small">{t('planTodayRest')}</p>
        )}

        {upcoming.length > 0 && (
          <>
            <h3 className="today-title">{t('planNext')}</h3>
            <ul className="plan-days">
              {upcoming.map((d) => (
                <li key={dayKey(d.date)}>
                  <span className="plan-day muted small">{fmt(d.date)}</span>
                  <span>{d.lessons.map((id) => loc(getLesson(id).title)).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="plan-panel">
        <h2 className="plan-section-title">{t('planActivity')}</h2>
        <ActivityHeatmap counts={activity} lang={lang} />
      </section>
    </div>
  )
}
