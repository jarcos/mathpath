import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSubjects } from '@content/index.js'
import { notesMarkdown } from '@shared/sheet.js'
import { useApp } from '@/AppContext.jsx'
import { useAllNotes } from '@/lib/notes.js'
import MathText from '@/components/MathText.jsx'

const formatDate = (iso, lang) =>
  iso ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : ''

// Every note and bookmark, by subject in course order, to read again, open
// the lesson, or take away as a Markdown file.
export default function NotesView({ onBack, onOpenLesson }) {
  const { t } = useTranslation()
  const { loc, lang } = useApp()
  const notes = useAllNotes()
  const [only, setOnly] = useState('all') // 'all' | 'bookmarked'
  const [message, setMessage] = useState(null) // { ok, text }

  const subjects = getSubjects()
  const shown = (id) => notes?.has(id) && (only === 'all' || notes.get(id).bookmarked)
  const groups = subjects
    .map((s) => ({ subject: s, lessons: s.lessonObjects.filter((l) => shown(l.id)) }))
    .filter((g) => g.lessons.length)

  const exportMarkdown = async () => {
    setMessage(null)
    const md = notesMarkdown(subjects, notes, lang, {
      title: t('notesMdTitle'),
      exported: t('notesMdExported', { date: formatDate(new Date().toISOString(), lang) }),
      bookmarked: t('notesMdBookmarked')
    })
    try {
      const r = await window.api.notes.export(md)
      if (r?.ok) setMessage({ ok: true, text: t('notesExported', { file: r.file }) })
      else if (!r?.canceled) setMessage({ ok: false, text: t('dataErrorSave') })
    } catch {
      setMessage({ ok: false, text: t('dataErrorSave') })
    }
  }

  return (
    <div className="page notes-view">
      <button className="link back" onClick={onBack}>
        {t('backToDashboard')}
      </button>
      <header className="glossary-header">
        <h1>{t('notesTitle')}</h1>
        <p className="muted">{t('notesSubtitle')}</p>
      </header>

      {notes && notes.size > 0 && (
        <div className="notes-toolbar">
          <div className="lang-toggle" role="radiogroup" aria-label={t('notesShow')}>
            {['all', 'bookmarked'].map((v) => (
              <button key={v} role="radio" aria-checked={only === v} className={only === v ? 'active' : ''} onClick={() => setOnly(v)}>
                {v === 'all' ? t('notesAll') : t('notesBookmarked')}
              </button>
            ))}
          </div>
          <button className="primary small" onClick={exportMarkdown}>
            {t('notesExport')}
          </button>
        </div>
      )}
      <p className={`small data-message ${message?.ok ? 'ok' : 'bad'}`} aria-live="polite">
        {message?.text}
      </p>

      {notes && groups.length === 0 && (
        <p className="muted">{only === 'bookmarked' && notes.size ? t('notesEmptyBookmarks') : t('notesEmpty')}</p>
      )}

      {groups.map(({ subject, lessons }) => (
        <section className="notes-group" key={subject.id}>
          <h2 className="track-title">{loc(subject.name)}</h2>
          {lessons.map((l) => {
            const n = notes.get(l.id)
            return (
              <article className="note-card" key={l.id}>
                <header className="note-card-head">
                  <h3>
                    {n.bookmarked && (
                      <span className="note-star" aria-label={t('bookmarkOn')} title={t('bookmarkOn')}>
                        ★{' '}
                      </span>
                    )}
                    {l.order}. {loc(l.title)}
                  </h3>
                  <span className="muted small">{t('notesUpdated', { date: formatDate(n.updatedAt, lang) })}</span>
                </header>
                {n.body.trim() && (
                  <div className="note-body">
                    <MathText>{n.body.trim()}</MathText>
                  </div>
                )}
                <button className="link" onClick={() => onOpenLesson(l.id)}>
                  {t('notesOpen')}
                </button>
              </article>
            )
          })}
        </section>
      ))}
    </div>
  )
}
