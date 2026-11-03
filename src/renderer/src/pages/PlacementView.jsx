import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSubject } from '@content/index.js'
import { instantiate, randomSeed } from '@shared/params.js'
import { useApp } from '@/AppContext.jsx'
import Exercise from '@/components/Exercise.jsx'
import ProgressBar from '@/components/ProgressBar.jsx'

// The test stops after this many wrong answers in a row: past that point the
// learner is into material they haven't learned yet.
const STOP_AFTER = 2

// One auto-graded exercise per lesson (code exercises take too long here).
function pickQuestions(subject) {
  return subject.lessonObjects
    .map((lesson) => {
      const pool = lesson.exercises.filter((e) => e.answerType !== 'code')
      if (!pool.length) return null
      return { lesson, exercise: instantiate(pool[Math.floor(Math.random() * pool.length)], randomSeed()) }
    })
    .filter(Boolean)
}

// Placement test for a subject: one question per lesson, in order, without
// hints. Lessons answered correctly are marked complete, so the plan and the
// "continue" card start where the learner really is.
export default function PlacementView({ subjectId, onBack, onOpenLesson }) {
  const { t } = useTranslation()
  const { loc, completed, setLessonCompleted } = useApp()
  const subject = getSubject(subjectId)
  const questions = useMemo(() => (subject ? pickQuestions(subject) : []), [subject])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState(null) // { ok } for the current question
  const indexRef = useRef(index)
  indexRef.current = index
  const [known, setKnown] = useState([]) // lesson ids answered correctly
  const [streak, setStreak] = useState(0) // wrong answers in a row
  const [done, setDone] = useState(false)

  if (!subject) return null

  const finish = (knownIds) => {
    for (const id of knownIds) if (!completed.has(id)) setLessonCompleted(id, subjectId, true, 'placement')
    setDone(true)
  }

  const next = (ok) => {
    const knownIds = ok ? [...known, questions[index].lesson.id] : known
    const misses = ok ? 0 : streak + 1
    setKnown(knownIds)
    setStreak(misses)
    setAnswer(null)
    if (misses >= STOP_AFTER || index + 1 >= questions.length) finish(knownIds)
    else setIndex(index + 1)
  }

  if (done || questions.length === 0) {
    const start = subject.lessonObjects.find((l) => !completed.has(l.id) && !known.includes(l.id))
    return (
      <div className="page placement-view">
        <header className="page-hero">
          <h1>{t('placementTitle', { subject: loc(subject.name) })}</h1>
          <p className="muted">
            {known.length
              ? t('placementResult', { count: known.length, total: subject.lessonObjects.length })
              : t('placementNone')}
          </p>
          {start && <p className="muted">{t('placementStartAt', { lesson: loc(start.title) })}</p>}
        </header>
        <div className="review-actions placement-actions">
          <button className="link" onClick={onBack}>
            {t('backToSubject')}
          </button>
          {start && (
            <button className="primary" onClick={() => onOpenLesson(start.id)}>
              {t('placementStart')}
            </button>
          )}
        </div>
      </div>
    )
  }

  const { lesson, exercise } = questions[index]
  const at = index
  return (
    <div className="page placement-view">
      <button className="link back" onClick={onBack}>
        {t('backToSubject')}
      </button>
      <header className="review-header">
        <h1>{t('placementTitle', { subject: loc(subject.name) })}</h1>
        <p className="muted small">{t('placementIntro')}</p>
        <ProgressBar
          percent={Math.round((index / questions.length) * 100)}
          label={t('reviewProgress', { n: index + 1, total: questions.length })}
        />
        <p className="muted small review-source">{loc(lesson.title)}</p>
      </header>

      <Exercise
        key={exercise.id}
        exercise={exercise}
        lessonId={lesson.id}
        index={index + 1}
        mode="placement"
        assist={false}
        onResult={(ok) => {
          // A result arriving after "I don't know" moved on is ignored.
          if (indexRef.current === at) setAnswer({ ok })
        }}
      />

      <div className="review-actions">
        {answer ? (
          <button className="primary" onClick={() => next(answer.ok)}>
            {t('reviewNext')}
          </button>
        ) : (
          <button className="link subtle" onClick={() => next(false)}>
            {t('placementDontKnow')}
          </button>
        )}
      </div>
    </div>
  )
}
