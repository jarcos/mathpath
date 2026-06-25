import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGlossary } from '@content/index.js'
import { useApp } from '@/AppContext.jsx'
import MathText from '@/components/MathText.jsx'

const CATEGORY_ORDER = ['greek', 'operator', 'relation', 'set', 'logic', 'accent', 'function']

export default function GlossaryView({ onBack }) {
  const { t } = useTranslation()
  const { loc, lang } = useApp()
  const [query, setQuery] = useState('')
  const glossary = getGlossary()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const syms = glossary.symbols || []
    if (!q) return syms
    return syms.filter((s) => {
      const hay = [s.read?.en, s.read?.es, s.meaning?.en, s.meaning?.es, ...(s.uni || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [glossary, query])

  const groups = useMemo(() => {
    const byCat = {}
    for (const s of filtered) (byCat[s.category] = byCat[s.category] || []).push(s)
    return CATEGORY_ORDER.filter((c) => byCat[c]).map((c) => ({ cat: c, items: byCat[c] }))
  }, [filtered])

  return (
    <div className="page glossary-view">
      <button className="link back" onClick={onBack}>
        {t('backToDashboard')}
      </button>

      <header className="glossary-header">
        <h1>{t('glossaryTitle')}</h1>
        <p className="muted">{t('glossarySubtitle')}</p>
      </header>

      <input
        className="glossary-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('glossarySearch')}
        aria-label={t('glossarySearch')}
      />

      {groups.length === 0 ? (
        <p className="muted">{t('glossaryEmpty')}</p>
      ) : (
        groups.map(({ cat, items }) => (
          <section className="glossary-group" key={cat}>
            <h2 className="track-title">{t('cat_' + cat)}</h2>
            <ul className="notation-list glossary-list">
              {items.map((s) => (
                <li key={s.id} className="notation-item">
                  <span className="notation-sym">
                    <MathText tex={s.display} />
                  </span>
                  <span className="notation-text">
                    <span className="notation-read">
                      {loc(s.read)}
                      {s.uni && s.uni.length > 0 && lang !== 'en' && (
                        <span className="muted small"> · {s.uni[0]}</span>
                      )}
                    </span>
                    <span className="notation-meaning muted small">{loc(s.meaning)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
