import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGlossary, getSubject } from '@content/index.js'
import { buildMatchers, getLessonSymbols } from '@shared/notation.js'
import { displayFormulas } from '@shared/sheet.js'
import { useApp } from '@/AppContext.jsx'
import { useAllNotes } from '@/lib/notes.js'
import MathText from '@/components/MathText.jsx'

// A subject on a few pages: for each lesson, its display formulas, the
// notation it uses (from the glossary) and the learner's note. Made to be
// saved as a PDF and printed.
export default function SheetView({ subjectId, onBack }) {
  const { t } = useTranslation()
  const { loc, lang, savePdf } = useApp()
  const notes = useAllNotes()
  const [message, setMessage] = useState(null) // { ok, text }
  const subject = getSubject(subjectId)

  const lessons = useMemo(() => {
    if (!subject) return []
    const glossary = getGlossary()
    const matchers = buildMatchers(glossary)
    return subject.lessonObjects.map((lesson) => ({
      lesson,
      formulas: displayFormulas(lesson, lang),
      symbols: getLessonSymbols(lesson, glossary, matchers)
    }))
  }, [subject, lang])

  if (!subject || !notes) return null
  const title = t('sheetTitle', { subject: loc(subject.name) })

  const save = async () => {
    setMessage(null)
    const r = await savePdf(title.replace(':', ' -'))
    if (r?.ok) setMessage({ ok: true, text: t('pdfSaved', { file: r.file }) })
    else if (!r?.canceled) setMessage({ ok: false, text: t('pdfError') })
  }

  return (
    <div className="page sheet-view">
      <button className="link back" onClick={onBack}>
        {t('backToSubject')}
      </button>
      <header className="glossary-header">
        <h1>{title}</h1>
        <p className="muted">{t('sheetIntro')}</p>
        <div className="lesson-tools no-print">
          <button className="primary small" onClick={save}>
            {t('pdfSave')}
          </button>
          <span className={`small ${message?.ok ? 'muted' : 'bad'}`} aria-live="polite">
            {message?.text}
          </span>
        </div>
      </header>

      {lessons.map(({ lesson, formulas, symbols }) => {
        const note = notes.get(lesson.id)?.body?.trim()
        return (
          <section className="sheet-lesson" key={lesson.id}>
            <h2>
              {lesson.order}. {loc(lesson.title)}
            </h2>
            {formulas.length > 0 && (
              <div className="sheet-formulas" aria-label={t('sheetFormulas')}>
                {/* In display style but inline, so a long one breaks at = or + instead of running off the page. */}
                {formulas.map((tex) => (
                  <div className="sheet-formula" key={tex}>
                    <MathText tex={`\\displaystyle ${tex}`} />
                  </div>
                ))}
              </div>
            )}
            {symbols.length > 0 && (
              <ul className="sheet-symbols" aria-label={t('sheetSymbols')}>
                {symbols.map((s) => (
                  <li key={s.id}>
                    <span className="sheet-sym">
                      <MathText tex={s.display} />
                    </span>
                    <span>
                      <strong>{loc(s.read)}</strong> <span className="muted">— {loc(s.meaning)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {note && (
              <div className="sheet-note">
                <span className="sheet-note-tag">{t('sheetNote')}</span>
                <MathText>{note}</MathText>
              </div>
            )}
            {!formulas.length && !symbols.length && !note && <p className="muted small">{t('sheetNothing')}</p>}
          </section>
        )
      })}
    </div>
  )
}
