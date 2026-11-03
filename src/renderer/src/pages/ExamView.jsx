import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSubject } from '@content/index.js'
import { instantiate, randomSeed } from '@shared/params.js'
import { useApp } from '@/AppContext.jsx'
import Exercise from '@/components/Exercise.jsx'
import ProgressBar from '@/components/ProgressBar.jsx'

const EXAM_SIZE = 12
// Share of first answers right to pass.
export const EXAM_PASS = 0.8

// The last exam result of a subject, kept in the `exam:<subjectId>` setting.
export function examKey(subjectId) {
  return `exam:${subjectId}`
}

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Up to EXAM_SIZE lessons in random order, one auto-graded exercise each,
// preferring templates so the exam isn't a memory test.
function pickExam(subject) {
  return shuffle(subject.lessonObjects)
    .map((lesson) => {
      const pool = lesson.exercises.filter((e) => e.answerType !== 'code')
      const templates = pool.filter((e) => e.params)
      const from = templates.length ? templates : pool
      if (!from.length) return null
      return { lesson, exercise: instantiate(from[Math.floor(Math.random() * from.length)], randomSeed()) }
    })
    .filter(Boolean)
    .slice(0, EXAM_SIZE)
}

// End-of-subject exam: mixed questions from across the subject, no hints.
// Each first answer counts as a review of that exercise.
export default function ExamView({ subjectId, onBack, onOpenLesson }) {
  const { t } = useTranslation()
  const { loc } = useApp()
  const subject = getSubject(subjectId)
  const [round, setRound] = useState(0)
  const questions = useMemo(() => (subject ? pickExam(subject) : []), [subject, round])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState(null) // { ok } for the current question
  // Question index → { lessonId, ok }. Only the first verdict per question
  // counts, so a late result can't be recorded twice.
  const [results, setResults] = useState({})
  const indexRef = useRef(index)
  indexRef.current = index

  const verdicts = Object.values(results)
  const complete = questions.length > 0 && verdicts.length === questions.length
  const finished = complete && !answer
  const right = verdicts.filter((r) => r.ok).length

  // Saved as soon as every question is answered, even if the learner leaves
  // without pressing Finish.
  useEffect(() => {
    if (!complete) return
    window.api.settings
      .set(examKey(subjectId), JSON.stringify({ right, total: questions.length, date: new Date().toISOString() }))
      .catch(() => {})
  }, [complete, right, questions.length, subjectId])

  if (!subject) return null

  const record = (i, ok) =>
    setResults((r) => (i in r ? r : { ...r, [i]: { lessonId: questions[i].lesson.id, ok } }))
  const next = () => {
    setAnswer(null)
    setIndex((i) => i + 1)
  }
  const retry = () => {
    setRound((r) => r + 1)
    setIndex(0)
    setAnswer(null)
    setResults({})
  }

  if (finished) {
    const passed = right / questions.length >= EXAM_PASS
    const missed = verdicts.filter((r) => !r.ok).map((r) => subject.lessonObjects.find((l) => l.id === r.lessonId))
    return (
      <div className="page exam-view">
        <button className="link back" onClick={onBack}>
          {t('backToSubject')}
        </button>
        <header className="page-hero">
          <h1>{t('examTitle', { subject: loc(subject.name) })}</h1>
          <p className={`exam-score ${passed ? 'passed' : 'failed'}`}>
            {t('examScore', { right, total: questions.length, percent: Math.round((right / questions.length) * 100) })}
          </p>
          <p className="muted">{passed ? t('examPassed') : t('examFailed', { percent: EXAM_PASS * 100 })}</p>
        </header>
        {missed.length > 0 && (
          <section className="plan-panel">
            <h2 className="plan-section-title">{t('examReview')}</h2>
            <ul className="today-list">
              {missed.map((l) => (
                <li key={l.id}>
                  <button className="link" onClick={() => onOpenLesson(l.id)}>
                    {loc(l.title)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="review-actions placement-actions">
          <button className="primary" onClick={retry}>
            {t('examRetry')}
          </button>
        </div>
      </div>
    )
  }

  if (!questions.length) {
    return (
      <div className="page exam-view">
        <button className="link back" onClick={onBack}>
          {t('backToSubject')}
        </button>
        <p className="muted">{t('reviewNothing')}</p>
      </div>
    )
  }

  const { lesson, exercise } = questions[index]
  const at = index
  return (
    <div className="page exam-view">
      <button className="link back" onClick={onBack}>
        {t('backToSubject')}
      </button>
      <header className="review-header">
        <h1>{t('examTitle', { subject: loc(subject.name) })}</h1>
        <p className="muted small">{t('examIntro', { count: questions.length, percent: EXAM_PASS * 100 })}</p>
        <ProgressBar
          percent={Math.round((index / questions.length) * 100)}
          label={t('reviewProgress', { n: index + 1, total: questions.length })}
        />
        <p className="muted small review-source">{loc(lesson.title)}</p>
      </header>

      <Exercise
        key={`${round}-${index}`}
        exercise={exercise}
        lessonId={lesson.id}
        index={index + 1}
        mode="review"
        assist={false}
        onResult={(ok) => {
          record(at, ok)
          // A result arriving after "I don't know" moved on is ignored.
          if (indexRef.current === at) setAnswer({ ok })
        }}
      />

      <div className="review-actions">
        {answer ? (
          <button className="primary" onClick={next}>
            {index + 1 < questions.length ? t('reviewNext') : t('reviewFinish')}
          </button>
        ) : (
          <button
            className="link subtle"
            onClick={() => {
              record(at, false)
              next()
            }}
          >
            {t('placementDontKnow')}
          </button>
        )}
      </div>
    </div>
  )
}
