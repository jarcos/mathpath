import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getDependents, getLesson, getPrereqs, getSubject, getSubjects } from '@content/index.js'
import { useApp } from '@/AppContext.jsx'
import { lessonStats } from '@/lib/mastery.js'
import MasteryBadge from '@/components/MasteryBadge.jsx'

// Layout of the map: one row per subject, one dot per lesson.
const LEFT = 250 // room for subject names
const TOP = 26
const COL = 30
const ROW = 40
const R = 9
const LEVELS = ['new', 'practiced', 'mastered', 'review']

const shorten = (s, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// The whole curriculum at a glance: where the learner stands in every lesson,
// and, for the selected lesson, what it builds on and what builds on it.
export default function MapView({ onBack, onOpenLesson }) {
  const { t } = useTranslation()
  const { loc, learning, completed } = useApp()
  const [selected, setSelected] = useState(null)

  const subjects = getSubjects().filter((s) => s.lessonObjects.length)
  const pos = new Map()
  subjects.forEach((s, row) =>
    s.lessonObjects.forEach((l, i) => pos.set(l.id, { x: LEFT + i * COL + R, y: TOP + row * ROW }))
  )
  const width = LEFT + Math.max(...subjects.map((s) => s.lessonObjects.length)) * COL + 6
  const height = TOP + (subjects.length - 1) * ROW + R + 8

  const prereqs = selected ? getPrereqs(selected) : []
  const dependents = selected ? getDependents(selected) : []
  const edges = [...prereqs.map((p) => [p, selected]), ...dependents.map((d) => [selected, d])]
  const edgePath = ([a, b]) => {
    const p = pos.get(a)
    const q = pos.get(b)
    if (p.y === q.y) return `M ${p.x} ${p.y} Q ${(p.x + q.x) / 2} ${p.y - 22} ${q.x} ${q.y}`
    const my = (p.y + q.y) / 2
    return `M ${p.x} ${p.y} C ${p.x} ${my}, ${q.x} ${my}, ${q.x} ${q.y}`
  }

  const lesson = selected && getLesson(selected)
  const levelOf = (l) => lessonStats(l, learning, completed).level
  const LessonLink = ({ id }) => {
    const l = getLesson(id)
    return (
      <li>
        <button className="link" onClick={() => setSelected(id)}>
          {loc(l.title)}
        </button>
        <MasteryBadge level={levelOf(l)} />
      </li>
    )
  }

  return (
    <div className="page map-view">
      <button className="link back" onClick={onBack}>
        {t('backToDashboard')}
      </button>
      <header className="glossary-header">
        <h1>{t('mapTitle')}</h1>
        <p className="muted">{t('mapSubtitle')}</p>
      </header>

      <ul className="map-legend muted small">
        {LEVELS.map((lv) => (
          <li key={lv}>
            <span className={`map-key level-${lv}`} /> {t('level_' + lv)}
          </li>
        ))}
      </ul>

      <div className="map-scroll">
        <svg className="map" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={t('mapTitle')}>
          {subjects.map((s, row) => (
            <text key={s.id} className="map-subject" x={LEFT - 16} y={TOP + row * ROW + 4} textAnchor="end">
              {shorten(loc(s.name))}
            </text>
          ))}
          {edges.map((e) => (
            <path key={e.join('>')} className="map-edge" d={edgePath(e)} />
          ))}
          {subjects.flatMap((s) =>
            s.lessonObjects.map((l) => {
              const { x, y } = pos.get(l.id)
              const cls = [
                'map-dot',
                `level-${levelOf(l)}`,
                l.id === selected ? 'selected' : '',
                prereqs.includes(l.id) ? 'is-prereq' : '',
                dependents.includes(l.id) ? 'is-dependent' : ''
              ].join(' ')
              const pick = () => setSelected(l.id === selected ? null : l.id)
              return (
                <g
                  key={l.id}
                  className={cls}
                  role="button"
                  tabIndex={0}
                  aria-label={loc(l.title)}
                  aria-pressed={l.id === selected}
                  onClick={pick}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick())}
                >
                  <circle cx={x} cy={y} r={R} />
                  <title>{loc(l.title)}</title>
                </g>
              )
            })
          )}
        </svg>
      </div>

      {lesson ? (
        <section className="plan-panel map-panel" aria-live="polite">
          <div className="plan-head">
            <h2>{loc(lesson.title)}</h2>
            <MasteryBadge level={levelOf(lesson)} />
          </div>
          <p className="muted small">
            {loc(getSubject(lesson.subjectId)?.name)} · {t('lesson')} {lesson.order} ·{' '}
            {t('estMinutes', { count: lesson.estimatedMinutes })}
          </p>
          <div className="map-relations">
            <div>
              <h3 className="today-title">{t('mapBuildsOn')}</h3>
              {prereqs.length ? <ul className="prereq-list">{prereqs.map((id) => <LessonLink key={id} id={id} />)}</ul> : <p className="muted small">{t('mapNothing')}</p>}
            </div>
            <div>
              <h3 className="today-title">{t('mapLeadsTo')}</h3>
              {dependents.length ? <ul className="prereq-list">{dependents.map((id) => <LessonLink key={id} id={id} />)}</ul> : <p className="muted small">{t('mapNothing')}</p>}
            </div>
          </div>
          <button className="primary" onClick={() => onOpenLesson(lesson.id)}>
            {t('mapOpen')}
          </button>
        </section>
      ) : (
        <p className="muted small">{t('mapHint')}</p>
      )}
    </div>
  )
}
