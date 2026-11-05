import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGlossary, getSubjects } from '@content/index.js'
import { buildIndex, fold, search, terms } from '@shared/search.js'
import { useApp } from '@/AppContext.jsx'
import MathText from './MathText.jsx'

// Built the first time the palette opens; the course doesn't change.
let index = null
const getIndex = () => (index ??= buildIndex(getSubjects(), getGlossary()))

/**
 * Cmd+K: lessons, symbols and pages of the app, found as you type. Arrows
 * move, Enter opens, Escape closes. `pages`: [{ id, label }] to go to.
 */
export default function SearchPalette({ pages, onClose, onOpenPage, onOpenLesson, onOpenSymbol }) {
  const { t } = useTranslation()
  const { lang, loc } = useApp()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const ids = useId()

  // Focus goes back where it was when the palette closes.
  useEffect(() => {
    const before = document.activeElement
    inputRef.current?.focus()
    return () => before?.focus?.({ preventScroll: true })
  }, [])

  const items = useMemo(() => {
    const ts = terms(query)
    const pageHits = pages
      .filter((p) => ts.every((term) => fold(p.label).includes(term)))
      .map((p) => ({ kind: 'page', key: `page-${p.id}`, ...p }))
    if (!ts.length) return pageHits
    const found = search(getIndex(), query, lang)
    return [
      ...pageHits.slice(0, 3),
      ...found.lessons.map((l) => ({ ...l, key: `lesson-${l.id}` })),
      ...found.symbols.map((s) => ({ ...s, key: `symbol-${s.id}` }))
    ]
  }, [query, lang, pages])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const open = (item) => {
    if (!item) return
    onClose()
    if (item.kind === 'page') onOpenPage(item.id)
    else if (item.kind === 'lesson') onOpenLesson(item.id)
    else onOpenSymbol(item.id)
  }

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = items.length
      if (n) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      open(items[active])
    } else if (e.key === 'Tab') {
      // The palette keeps the focus while it is open.
      e.preventDefault()
    }
  }

  const label = { page: t('searchPage'), lesson: t('lesson'), symbol: t('searchSymbol') }
  const optionId = (i) => `${ids}-opt-${i}`

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {/* Clicks inside keep the focus in the search box, where the keys work. */}
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('searchTitle')}
        onKeyDown={onKey}
        onMouseDown={(e) => e.target !== inputRef.current && e.preventDefault()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={items.length ? `${ids}-list` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={items.length ? optionId(active) : undefined}
          spellCheck={false}
          autoComplete="off"
        />
        {items.length > 0 ? (
          <ul className="palette-list" id={`${ids}-list`} role="listbox" ref={listRef} aria-label={t('searchTitle')}>
            {items.map((item, i) => (
              <li
                key={item.key}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={`palette-item ${i === active ? 'active' : ''}`}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => open(item)}
              >
                {item.kind === 'symbol' ? (
                  <span className="palette-sym">
                    <MathText tex={item.display} />
                  </span>
                ) : null}
                <span className="palette-main">
                  <span className="palette-title">{item.kind === 'symbol' ? loc(item.read) : item.kind === 'page' ? item.label : item.title}</span>
                  {item.kind === 'lesson' && <span className="muted small"> · {item.subject}</span>}
                  {item.kind === 'symbol' && <span className="muted small"> · {loc(item.meaning)}</span>}
                  {item.snippet && <span className="palette-snippet muted small">{item.snippet}</span>}
                </span>
                <span className="palette-kind muted small">{label[item.kind]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="palette-empty muted" role="status">
            {t('searchNothing')}
          </p>
        )}
        <p className="palette-help muted small" aria-hidden="true">
          {t('searchHelp')}
        </p>
      </div>
    </div>
  )
}
