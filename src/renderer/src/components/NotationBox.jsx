import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '@/AppContext.jsx'
import MathText from './MathText.jsx'

// "Symbols in this lesson" — an auto-generated, collapsible legend so a learner
// always knows how to read every symbol on the page (e.g. λ → "lambda").
export default function NotationBox({ symbols }) {
  const { t } = useTranslation()
  const { loc } = useApp()
  const [open, setOpen] = useState(false)

  if (!symbols || symbols.length === 0) return null

  return (
    <section className={`notation-box ${open ? 'open' : ''}`}>
      <button
        className="notation-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="notation-toggle-label">
          {t('symbolsInLesson')} <span className="notation-count">{symbols.length}</span>
        </span>
        <span className="notation-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <ul className="notation-list">
          {symbols.map((s) => (
            <li key={s.id} className="notation-item">
              <span className="notation-sym">
                <MathText tex={s.display} />
              </span>
              <span className="notation-text">
                <span className="notation-read">{loc(s.read)}</span>
                <span className="notation-meaning muted small">{loc(s.meaning)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
