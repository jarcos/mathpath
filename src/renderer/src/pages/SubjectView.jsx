import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSubject } from '@content/index.js'
import { useApp } from '@/AppContext.jsx'
import { computePlan } from '@/lib/plan.js'
import { lessonStats } from '@/lib/mastery.js'
import MasteryBadge from '@/components/MasteryBadge.jsx'
import ProgressBar from '@/components/ProgressBar.jsx'
import { EXAM_PASS, examKey } from '@/pages/ExamView.jsx'

// The last exam result ({ right, total, date }) of a subject, or null.
function useLastExam(subjectId) {
  const [last, setLast] = useState(null)
  useEffect(() => {
    let active = true
    window.api.settings
      .get(examKey(subjectId))
      .then((v) => {
        let parsed = null
        try {
          parsed = v ? JSON.parse(v) : null
        } catch {
          /* ignore a broken setting */
        }
        const valid = parsed?.total > 0 && !Number.isNaN(new Date(parsed.date).getTime())
        if (active) setLast(valid ? parsed : null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [subjectId])
  return last
}

export default function SubjectView({ subjectId, onOpenLesson, onBack, onOpenSubject, onPlacement, onExam }) {
  const { t } = useTranslation()
  const { loc, lang, completed, learning } = useApp()
  const subject = getSubject(subjectId)
  const lastExam = useLastExam(subjectId)
  const [planRow, setPlanRow] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    window.api.plan.get(subjectId).then((row) => {
      if (active) {
        setPlanRow(row || null)
        setLoaded(true)
      }
    })
    return () => {
      active = false
    }
  }, [subjectId])

  if (!subject) return null

  const plan = computePlan(subject.lessonObjects, completed, planRow)

  const startPlan = async () => {
    const row = await window.api.plan.start(subjectId, subject.targetDays)
    setPlanRow(row)
  }
  const resetPlan = async () => {
    const row = await window.api.plan.reset(subjectId, subject.targetDays)
    setPlanRow(row)
  }

  const statusLabel = plan.finished
    ? t('finished')
    : plan.started
      ? plan.onTrack
        ? t('onTrack')
        : t('behind')
      : t('notStarted')

  return (
    <div className="page subject-view">
      <button className="link back" onClick={onBack}>
        {t('backToDashboard')}
      </button>

      <header className="subject-header">
        <div className="subject-icon big">{subject.icon}</div>
        <div>
          <h1>{loc(subject.name)}</h1>
          <p className="muted">{loc(subject.description)}</p>
          {(subject.requires || []).length > 0 && (
            <p className="muted small subject-requires">
              {t('subjectRequires')}{' '}
              {subject.requires.map((id, i) => {
                const req = getSubject(id)
                const done = req.lessonObjects.filter((l) => completed.has(l.id)).length
                return (
                  <span key={id}>
                    {i > 0 && ' · '}
                    <button className="link" onClick={() => onOpenSubject(id)}>
                      {loc(req.name)}
                    </button>{' '}
                    ({Math.round((done / req.lessonObjects.length) * 100)} %)
                  </span>
                )
              })}
            </p>
          )}
        </div>
      </header>

      <ProgressBar percent={plan.percent} label={t('overallProgress')} />

      {!plan.finished && (
        <p className="placement-offer small">
          {t('placementOffer')}{' '}
          <button className="link" onClick={onPlacement}>
            {t('placementCta')} →
          </button>
        </p>
      )}
      <p className="placement-offer small">
        {t('examOffer')}{' '}
        <button className="link" onClick={onExam}>
          {t('examCta')} →
        </button>
        {lastExam && (
          <span className={`exam-last ${lastExam.right / lastExam.total >= EXAM_PASS ? 'passed' : ''}`}>
            {' '}
            {t('examLast', {
              right: lastExam.right,
              total: lastExam.total,
              date: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(lastExam.date))
            })}
          </span>
        )}
      </p>

      <section className="plan-panel">
        <div className="plan-head">
          <h2>{t('planTitle')}</h2>
          <span
            className={`badge ${plan.finished ? 'ok' : plan.started ? (plan.onTrack ? 'ok' : 'warn') : 'soon'}`}
          >
            {statusLabel}
          </span>
        </div>

        {!plan.started ? (
          <button className="primary" onClick={startPlan}>
            {t('startPlan')}
          </button>
        ) : (
          <>
            {!plan.finished && (
              <p className="muted small">{t('daysLeft', { count: plan.daysLeft })}</p>
            )}
            <h3 className="today-title">{t('todaysLessons')}</h3>
            {plan.todayLessons.length === 0 ? (
              <p className="muted small">{t('nothingToday')}</p>
            ) : (
              <ul className="today-list">
                {plan.todayLessons.map((l) => (
                  <li key={l.id}>
                    <button className="link" onClick={() => onOpenLesson(l.id)}>
                      {loc(l.title)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {loaded && (
              <button className="link subtle" onClick={resetPlan}>
                {t('resetPlan')}
              </button>
            )}
          </>
        )}
      </section>

      <ol className="lesson-list">
        {subject.lessonObjects.map((l, i) => {
          const done = completed.has(l.id)
          const today = plan.todayLessons.some((x) => x.id === l.id)
          return (
            <li key={l.id} className={`lesson-row ${done ? 'done' : ''} ${today ? 'today' : ''}`}>
              <span className={`check ${done ? 'checked' : ''}`}>{done ? '✓' : i + 1}</span>
              <div className="lesson-meta">
                <span className="lesson-title">{loc(l.title)}</span>
                <span className="lesson-sub muted small">
                  {t('estMinutes', { count: l.estimatedMinutes })}
                  <MasteryBadge level={lessonStats(l, learning, completed).level} />
                </span>
              </div>
              <button className="primary small" onClick={() => onOpenLesson(l.id)}>
                {done ? t('open') : t('continue')}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
