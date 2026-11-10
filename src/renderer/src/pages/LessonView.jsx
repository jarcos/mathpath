import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLesson, getSubject, getGlossary } from '@content/index.js'
import { getLessonSymbols } from '@shared/notation.js'
import { MASTERY_THRESHOLD, isMastered } from '@shared/learning.js'
import { hashString, instantiate, randomSeed } from '@shared/params.js'
import { useApp } from '@/AppContext.jsx'
import { isPlainKey } from '@/lib/keys.js'
import { useLessonNote } from '@/lib/notes.js'
import { countsClean, isGuessable, lessonStats } from '@/lib/mastery.js'
import MasteryBadge from '@/components/MasteryBadge.jsx'
import MathText from '@/components/MathText.jsx'
import FunctionGraph from '@/components/FunctionGraph.jsx'
import VectorPlane from '@/components/VectorPlane.jsx'
import DistributionChart from '@/components/DistributionChart.jsx'
import ScatterFit from '@/components/ScatterFit.jsx'
import HeatGrid from '@/components/HeatGrid.jsx'
import Exercise from '@/components/Exercise.jsx'
import NotationBox from '@/components/NotationBox.jsx'
import CodeBlock from '@/components/CodeBlock.jsx'

// Each interactive figure type and the component that draws it.
const FIGURES = {
  graph: FunctionGraph,
  vector2d: VectorPlane,
  distribution: DistributionChart,
  scatter: ScatterFit,
  heatmap: HeatGrid
}

// "Before this lesson": the linked lessons, each with the learner's level, and
// a nudge when one of them was never practised or is due for review.
function PrereqBox({ section, loc, t, openLesson }) {
  const { learning, completed } = useApp()
  const refs = (section.lessons || [])
    .map((id) => getLesson(id))
    .filter(Boolean)
    .map((l) => ({ lesson: l, level: lessonStats(l, learning, completed).level }))
  const weak = refs.some((r) => r.level === 'new' || r.level === 'review')
  return (
    <aside className="prereq">
      <span className="prereq-tag">{t('prereqTitle')}</span>
      {section.note && <p className="prereq-note"><MathText>{loc(section.note)}</MathText></p>}
      {refs.length > 0 && (
        <ul className="prereq-list">
          {refs.map(({ lesson: l, level }) => (
            <li key={l.id}>
              <button className="link" onClick={() => openLesson && openLesson(l.id)}>
                {loc(l.title)}
              </button>
              <MasteryBadge level={level} />
            </li>
          ))}
        </ul>
      )}
      {weak && <p className="prereq-weak small">{t('prereqWeak')}</p>}
    </aside>
  )
}

function Section({ section, loc, t, openLesson }) {
  if (section.type === 'prereq') {
    return <PrereqBox section={section} loc={loc} t={t} openLesson={openLesson} />
  }
  const Figure = Object.hasOwn(FIGURES, section.type) ? FIGURES[section.type] : null
  if (Figure) {
    return (
      <figure className="lesson-graph">
        <Figure section={section} />
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

// The learner's note on the lesson: saved as they type. On paper (PDF), the
// text itself instead of the box.
function NotePanel({ note, t }) {
  const id = `note-${useId()}`
  const statusText = { saving: t('noteSaving'), saved: t('noteSaved'), error: t('noteError') }[note.status] || ''
  return (
    <section className={`note-panel ${note.body.trim() ? '' : 'empty'}`}>
      <div className="plan-head">
        <h2>
          <label htmlFor={id}>{t('noteTitle')}</label>
        </h2>
        <span className={`muted small note-status ${note.status === 'error' ? 'bad' : ''}`} aria-live="polite">
          {statusText}
        </span>
      </div>
      <textarea
        id={id}
        className="note-input"
        value={note.body}
        disabled={!note.loaded}
        onChange={(e) => note.setBody(e.target.value)}
        placeholder={t('notePlaceholder')}
        rows={Math.min(14, Math.max(4, note.body.split('\n').length + 1))}
      />
      <p className="muted small no-print">{t('noteHelp')}</p>
      {note.body.trim() && (
        <div className="note-print print-only">
          <MathText>{note.body}</MathText>
        </div>
      )}
    </section>
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
  const { loc, completed, setLessonCompleted, getSolvedForLesson, learning, savePdf } = useApp()
  const lesson = getLesson(lessonId)
  const note = useLessonNote(lessonId)
  const [pdfMessage, setPdfMessage] = useState(null) // { ok, text }
  useEffect(() => setPdfMessage(null), [lessonId])
  const [solved, setSolved] = useState(() => new Set())
  const [missesToday, setMissesToday] = useState({}) // exercise id → wrong tries today, never solved
  const [autoCompleted, setAutoCompleted] = useState(false)
  // Template exercises: a seed per visit, and how many fresh instances asked for.
  const sessionSeed = useMemo(() => randomSeed(), [lessonId])
  const [variants, setVariants] = useState({})
  const topRef = useRef(null)

  // Load persisted solved exercises whenever the lesson changes (App sets the
  // scroll: the top, or where the lesson was left when going back to it).
  useEffect(() => {
    setAutoCompleted(false)
    setVariants({})
    setMissesToday({})
    let active = true
    window.api.attempts
      ?.missesToday?.(lessonId)
      .then((m) => active && setMissesToday(m || {}))
      .catch(() => {})
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

  const subject = lesson ? getSubject(lesson.subjectId) : null
  const siblings = subject ? subject.lessonObjects : lesson ? [lesson] : []
  const idx = lesson ? siblings.findIndex((l) => l.id === lesson.id) : -1
  const prev = idx > 0 ? siblings[idx - 1] : null
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null
  // What the "next" button does: the next lesson, or back to the subject.
  const goNext = next ? () => onOpenLesson(next.id) : onBack

  // N, outside a text field: the next lesson.
  const goNextRef = useRef(goNext)
  goNextRef.current = goNext
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || !isPlainKey(e) || e.key.toLowerCase() !== 'n') return
      e.preventDefault()
      goNextRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!lesson) return null

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
    const counts = (ex) => countsClean(ex, learning.solved.get(ex.id))
    const before = lesson.exercises.filter(counts).length
    const after = before + (clean && !counts(lesson.exercises.find((ex) => ex.id === exId)) ? 1 : 0)
    if (!done && !isMastered(before, total) && isMastered(after, total)) {
      setLessonCompleted(lesson.id, lesson.subjectId, true, 'mastery')
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
        <div className="lesson-tools no-print">
          <button className="link" aria-pressed={note.bookmarked} onClick={note.toggleBookmark} disabled={!note.loaded}>
            {note.bookmarked ? `★ ${t('bookmarkOn')}` : `☆ ${t('bookmarkAdd')}`}
          </button>
          <button
            className="link"
            onClick={async () => {
              setPdfMessage(null)
              const r = await savePdf(`${subject ? loc(subject.name) : 'MathPath'} - ${lesson.order}. ${loc(lesson.title)}`)
              if (r?.ok) setPdfMessage({ ok: true, text: t('pdfSaved', { file: r.file }) })
              else if (!r?.canceled) setPdfMessage({ ok: false, text: t('pdfError') })
            }}
          >
            {t('pdfSave')}
          </button>
          <span className={`small ${pdfMessage?.ok ? 'muted' : 'bad'}`} aria-live="polite">
            {pdfMessage?.text}
          </span>
        </div>
      </header>

      <NotationBox symbols={symbols} />

      <article className="lesson-body">
        {lesson.sections.map((s, i) => (
          // Keyed by lesson too: going to the next lesson must not reuse a
          // figure (and its slider values) that sat at the same position.
          <Section key={`${lesson.id}-${i}`} section={s} loc={loc} t={t} openLesson={onOpenLesson} />
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
          {lesson.exercises.map((ex, i) => {
            // Templates get a fresh instance per visit, and on request.
            const variant = variants[ex.id] || 0
            const instanceAt = (v) => instantiate(ex, (sessionSeed ^ hashString(ex.id)) + v * 7919)
            const instance = instanceAt(variant)
            // The next variant with different numbers from this one.
            const another = () => {
              const now = JSON.stringify(instance.instance.values)
              let v = variant + 1
              while (v < variant + 20 && JSON.stringify(instanceAt(v).instance.values) === now) v++
              setVariants((all) => ({ ...all, [ex.id]: v }))
            }
            return (
              <Exercise
                key={`${ex.id}-${variant}`}
                exercise={instance}
                lessonId={lesson.id}
                index={i + 1}
                // A template's progress is shared by its instances, but a
                // fresh instance is shown unanswered.
                solved={!ex.params && solved.has(ex.id)}
                // A guessable question failed today stays failed (and a
                // multiple-choice one locked) when the lesson is reopened.
                priorMisses={isGuessable(ex) ? missesToday[ex.id] || 0 : 0}
                onSolved={markSolved}
                onAnother={ex.params ? another : undefined}
              />
            )
          })}
        </section>
      )}

      <NotePanel note={note} t={t} />

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
        <div aria-live="polite">
          {autoCompleted && <p className="feedback ok">{t('lessonAutoCompleted')}</p>}
        </div>
        <button
          className={done ? 'primary done' : 'primary'}
          onClick={() => setLessonCompleted(lesson.id, lesson.subjectId, !done, 'manual')}
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
        <button className="lesson-nav-btn next" onClick={goNext} title={t('nextKeyHint')} aria-keyshortcuts="N">
          <span className="muted small">{next ? t('nextLesson') : t('subjectDone')}</span>
          <span className="lesson-nav-title">{next ? loc(next.title) : t('backToSubject')}</span>
        </button>
      </nav>
    </div>
  )
}
