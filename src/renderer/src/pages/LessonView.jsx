import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLesson, getSubject, getGlossary } from '@content/index.js'
import { getLessonSymbols } from '@shared/notation.js'
import { MASTERY_THRESHOLD, isMastered } from '@shared/learning.js'
import { useApp } from '@/AppContext.jsx'
import { lessonStats } from '@/lib/mastery.js'
import MasteryBadge from '@/components/MasteryBadge.jsx'
import MathText from '@/components/MathText.jsx'
import FunctionGraph from '@/components/FunctionGraph.jsx'
import Exercise from '@/components/Exercise.jsx'
import NotationBox from '@/components/NotationBox.jsx'
import CodeBlock from '@/components/CodeBlock.jsx'

function Section({ section, loc, t, openLesson }) {
  if (section.type === 'prereq') {
    const refs = (section.lessons || []).map((id) => getLesson(id)).filter(Boolean)
    return (
      <aside className="prereq">
        <span className="prereq-tag">{t('prereqTitle')}</span>
        {section.note && <p className="prereq-note"><MathText>{loc(section.note)}</MathText></p>}
        {refs.length > 0 && (
          <ul className="prereq-list">
            {refs.map((l) => (
              <li key={l.id}>
                <button className="link" onClick={() => openLesson && openLesson(l.id)}>
                  {loc(l.title)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    )
  }
  if (section.type === 'graph') {
    return (
      <figure className="lesson-graph">
        <FunctionGraph fn={section.fn} domain={section.domain} />
        {section.caption && (
          <figcaption className="muted small">
            <MathText>{loc(section.caption)}</MathText>
          </figcaption>
        )}
      </figure>
    )
  }
  if (section.type === 'example') {
    return (
      <aside className="example">
        <span className="example-tag">{section.title ? loc(section.title) : t('example')}</span>
        <MathText>{loc(section.content)}</MathText>
      </aside>
    )
  }
  if (section.type === 'code') {
    return <CodeBlock section={section} />
  }
  return (
    <p className="prose">
      <MathText>{loc(section.content)}</MathText>
    </p>
  )
}

// Thin top bar that tracks how far the learner has scrolled through the lesson.
function ReadingProgress() {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const el = document.getElementById('app-scroll')
    if (!el) return
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight
      setPct(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div className="reading-progress" aria-hidden="true">
      <div className="reading-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function LessonView({ lessonId, onBack, onOpenLesson }) {
  const { t } = useTranslation()
  const { loc, completed, setLessonCompleted, getSolvedForLesson, learning } = useApp()
  const lesson = getLesson(lessonId)
  const [solved, setSolved] = useState(() => new Set())
  const [autoCompleted, setAutoCompleted] = useState(false)
  const topRef = useRef(null)

  // Reset scroll + load persisted solved exercises whenever the lesson changes.
  useEffect(() => {
    const el = document.getElementById('app-scroll')
    if (el) el.scrollTo({ top: 0 })
    setAutoCompleted(false)
    let active = true
    if (lessonId && getSolvedForLesson) {
      Promise.resolve(getSolvedForLesson(lessonId))
        .then((ids) => {
          if (active) setSolved(new Set(ids || []))
        })
        .catch(() => {
          if (active) setSolved(new Set())
        })
    }
    return () => {
      active = false
    }
  }, [lessonId, getSolvedForLesson])

  if (!lesson) return null

  const subject = getSubject(lesson.subjectId)
  const siblings = subject ? subject.lessonObjects : [lesson]
  const idx = siblings.findIndex((l) => l.id === lesson.id)
  const prev = idx > 0 ? siblings[idx - 1] : null
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null

  const done = completed.has(lesson.id)
  const total = lesson.exercises.length
  const solvedCount = lesson.exercises.filter((ex) => solved.has(ex.id)).length
  const symbols = getLessonSymbols(lesson, getGlossary())
  const stats = lessonStats(lesson, learning, completed)
  const toMaster = Math.max(0, Math.ceil(MASTERY_THRESHOLD * total) - stats.clean)

  // Completes the lesson when this solve is the one that masters it. (The
  // learning state refreshes asynchronously, so this solve is counted here.)
  // A lesson already mastered and then unmarked by hand stays unmarked.
  const markSolved = (exId, { clean }) => {
    setSolved((prev) => new Set(prev).add(exId))
    const before = lesson.exercises.filter((ex) => learning.solved.get(ex.id)?.clean).length
    const after = before + (clean && !learning.solved.get(exId)?.clean ? 1 : 0)
    if (!done && !isMastered(before, total) && isMastered(after, total)) {
      setLessonCompleted(lesson.id, lesson.subjectId, true)
      setAutoCompleted(true)
    }
  }

  return (
    <div className="page lesson-view" ref={topRef}>
      <ReadingProgress />

      <button className="link back" onClick={onBack}>
        {t('backToSubject')}
      </button>

      <header className="lesson-header">
        <span className="muted small lesson-eyebrow">
          {subject ? loc(subject.name) : ''} · {t('lesson')} {lesson.order}
        </span>
        <h1>{loc(lesson.title)}</h1>
        <div className="lesson-meta-row muted small">
          <span>{t('estMinutes', { count: lesson.estimatedMinutes })}</span>
          {total > 0 && <span>{t('exercisesCount', { count: total })}</span>}
          <MasteryBadge level={stats.level} />
          {done && stats.level !== 'mastered' && <span className="badge ok">{t('completed')}</span>}
        </div>
      </header>

      <NotationBox symbols={symbols} />

      <article className="lesson-body">
        {lesson.sections.map((s, i) => (
          <Section key={i} section={s} loc={loc} t={t} openLesson={onOpenLesson} />
        ))}
      </article>

      {total > 0 && (
        <section className="exercises">
          <div className="exercises-head">
            <h2>{t('exercises')}</h2>
            <span className="badge soon exercises-tally">
              {t('exercisesSolved', { done: solvedCount, total })}
            </span>
          </div>
          {toMaster > 0 && <p className="muted small mastery-need">{t('masteryNeed', { count: toMaster })}</p>}
          {lesson.exercises.map((ex, i) => (
            <Exercise
              key={ex.id}
              exercise={ex}
              lessonId={lesson.id}
              index={i + 1}
              solved={solved.has(ex.id)}
              onSolved={markSolved}
            />
          ))}
        </section>
      )}

      {Array.isArray(lesson.references) && lesson.references.length > 0 && (
        <section className="references">
          <h2>{t('sources')}</h2>
          <ul>
            {lesson.references.map((r, i) => (
              <li key={i}>
                <span className="ref-source">{r.source}</span>
                {r.detail ? <span className="ref-detail"> — {loc(r.detail) || r.detail}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="lesson-complete">
        {autoCompleted && (
          <p className="feedback ok" role="status">
            {t('lessonAutoCompleted')}
          </p>
        )}
        <button
          className={done ? 'primary done' : 'primary'}
          onClick={() => setLessonCompleted(lesson.id, lesson.subjectId, !done)}
        >
          {done ? t('markedComplete') : t('markComplete')}
        </button>
      </div>

      <nav className="lesson-nav">
        {prev ? (
          <button className="lesson-nav-btn" onClick={() => onOpenLesson(prev.id)}>
            <span className="muted small">{t('prevLesson')}</span>
            <span className="lesson-nav-title">{loc(prev.title)}</span>
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button
            className="lesson-nav-btn next"
            onClick={() => onOpenLesson(next.id)}
          >
            <span className="muted small">{t('nextLesson')}</span>
            <span className="lesson-nav-title">{loc(next.title)}</span>
          </button>
        ) : (
          <button className="lesson-nav-btn next" onClick={onBack}>
            <span className="muted small">{t('subjectDone')}</span>
            <span className="lesson-nav-title">{t('backToSubject')}</span>
          </button>
        )}
      </nav>
    </div>
  )
}
