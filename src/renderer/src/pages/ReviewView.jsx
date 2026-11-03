import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExercise, getExerciseIds, getLesson, getPrereqs, getSubject } from '@content/index.js'
import { endOfLocalDay, interleave } from '@shared/learning.js'
import { instantiate, randomSeed } from '@shared/params.js'
import { useApp } from '@/AppContext.jsx'
import { lessonStats, relativeDay } from '@/lib/mastery.js'
import Exercise from '@/components/Exercise.jsx'
import MasteryBadge from '@/components/MasteryBadge.jsx'
import ProgressBar from '@/components/ProgressBar.jsx'

// At most this many reviews per session; the rest wait for the next one.
const SESSION_SIZE = 20

// A review session: today's due exercises, one at a time, alternating lessons.
// The first answer to each rates its card (see Exercise, mode 'review').
export default function ReviewView({ onBack, onOpenLesson }) {
  const { t } = useTranslation()
  const { loc, lang, learning, completed } = useApp()
  const [items, setItems] = useState(null) // [{ exercise, lesson }]
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState(null) // { ok, due } for the current item
  const [results, setResults] = useState([]) // first-answer verdicts
  const [summary, setSummary] = useState(null) // what's left once the session ends

  useEffect(() => {
    let active = true
    window.api.review
      .due(endOfLocalDay(), SESSION_SIZE, getExerciseIds())
      .then((rows) => {
        // Templates come back as a fresh instance, so reviews aren't remembered answers.
        const found = rows
          .map((r) => getExercise(r.exercise_id))
          .filter(Boolean)
          .map((x) => ({ ...x, exercise: instantiate(x.exercise, randomSeed()) }))
        if (active) setItems(interleave(found, (x) => x.lesson.id))
      })
      .catch((e) => {
        console.error('review session failed', e)
        if (active) setItems([])
      })
    return () => {
      active = false
    }
  }, [])

  const finished = items && index >= items.length
  useEffect(() => {
    if (!finished) return
    window.api.review
      .summary(endOfLocalDay(), getExerciseIds())
      .then(setSummary)
      .catch(() => {})
  }, [finished])

  if (!items) return null

  const next = () => {
    setAnswer(null)
    setIndex((i) => i + 1)
  }

  if (items.length === 0 || finished) {
    const right = results.filter(Boolean).length
    return (
      <div className="page review-view">
        <button className="link back" onClick={onBack}>
          {t('backToDashboard')}
        </button>
        <header className="page-hero">
          <h1>{t('reviewTitle')}</h1>
          {results.length > 0 && <p className="muted">{t('reviewDone', { right, count: results.length })}</p>}
          {items.length === 0 && <p className="muted">{t('reviewNothing')}</p>}
          {summary?.due > 0 && <p className="muted">{t('reviewMoreToday', { count: summary.due })}</p>}
          {summary?.due === 0 && summary.nextDue && (
            <p className="muted">{t('reviewNextOn', { when: relativeDay(summary.nextDue, lang) })}</p>
          )}
        </header>
        <button className="primary" onClick={onBack}>
          {t('backToDashboard')}
        </button>
      </div>
    )
  }

  const { exercise, lesson } = items[index]
  const subject = getSubject(lesson.subjectId)
  // After a miss: the exercise's lesson, then the prerequisites not mastered yet.
  const levelOf = (l) => lessonStats(l, learning, completed).level
  const goOver = [
    lesson,
    ...getPrereqs(lesson.id)
      .map((id) => getLesson(id))
      .filter((l) => l && levelOf(l) !== 'mastered')
      .slice(0, 3)
  ]

  return (
    <div className="page review-view">
      <button className="link back" onClick={onBack}>
        {t('backToDashboard')}
      </button>

      <header className="review-header">
        <h1>{t('reviewTitle')}</h1>
        <ProgressBar
          percent={Math.round((index / items.length) * 100)}
          label={t('reviewProgress', { n: index + 1, total: items.length })}
        />
        <p className="muted small review-source">
          {subject ? loc(subject.name) : ''} ·{' '}
          <button className="link" onClick={() => onOpenLesson(lesson.subjectId, lesson.id)}>
            {loc(lesson.title)}
          </button>
        </p>
      </header>

      <Exercise
        key={`${exercise.id}-${index}`}
        exercise={exercise}
        lessonId={lesson.id}
        index={index + 1}
        mode="review"
        onResult={(ok, { due }) => {
          setAnswer({ ok, due })
          setResults((r) => [...r, ok])
        }}
      />

      {answer && !answer.ok && (
        <aside className="prereq review-help">
          <span className="prereq-tag">{t('reviewHelpTitle')}</span>
          <ul className="prereq-list">
            {goOver.map((l) => (
              <li key={l.id}>
                <button className="link" onClick={() => onOpenLesson(l.subjectId, l.id)}>
                  {loc(l.title)}
                </button>
                <MasteryBadge level={levelOf(l)} />
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div className="review-actions">
        {answer?.due && (
          <span className="muted small" role="status">
            {t('reviewScheduled', { when: relativeDay(answer.due, lang) })}
          </span>
        )}
        {answer ? (
          <button className="primary" onClick={(e) => e.detail < 2 && next()}>
            {index + 1 < items.length ? t('reviewNext') : t('reviewFinish')}
          </button>
        ) : (
          <button className="link subtle" onClick={(e) => e.detail < 2 && next()}>
            {t('reviewSkip')}
          </button>
        )}
      </div>
    </div>
  )
}
