import { useTranslation } from 'react-i18next'
import { getLesson } from '@content/index.js'
import { useApp } from '@/AppContext.jsx'
import MathText from '@/components/MathText.jsx'
import FunctionGraph from '@/components/FunctionGraph.jsx'
import Exercise from '@/components/Exercise.jsx'

function Section({ section, loc, t }) {
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
  return (
    <p className="prose">
      <MathText>{loc(section.content)}</MathText>
    </p>
  )
}

export default function LessonView({ lessonId, onBack }) {
  const { t } = useTranslation()
  const { loc, completed, setLessonCompleted } = useApp()
  const lesson = getLesson(lessonId)
  if (!lesson) return null
  const done = completed.has(lesson.id)

  return (
    <div className="page lesson-view">
      <button className="link back" onClick={onBack}>
        {t('backToSubject')}
      </button>

      <header className="lesson-header">
        <span className="muted small">
          {t('lesson')} {lesson.order}
        </span>
        <h1>{loc(lesson.title)}</h1>
      </header>

      <article className="lesson-body">
        {lesson.sections.map((s, i) => (
          <Section key={i} section={s} loc={loc} t={t} />
        ))}
      </article>

      <section className="exercises">
        <h2>{t('exercises')}</h2>
        {lesson.exercises.map((ex, i) => (
          <Exercise key={ex.id} exercise={ex} lessonId={lesson.id} index={i + 1} />
        ))}
      </section>

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
        <button
          className={done ? 'primary done' : 'primary'}
          onClick={() => setLessonCompleted(lesson.id, lesson.subjectId, !done)}
        >
          {done ? t('markedComplete') : t('markComplete')}
        </button>
      </div>
    </div>
  )
}
