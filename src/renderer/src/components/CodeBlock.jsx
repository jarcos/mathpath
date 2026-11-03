import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '@/AppContext.jsx'
import { runCode } from '@/lib/pyodide.js'

const KEYWORDS =
  'def|return|import|from|as|if|elif|else|for|while|in|not|and|or|None|True|False|class|with|lambda|pass|break|continue|is|global|yield|try|except|finally|raise|assert|del|print'

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Tiny, dependency-free Python highlighter. Strings & comments first so keywords
// inside them aren't recolored.
function highlight(code) {
  const re = new RegExp(
    '(#[^\\n]*)' + // comment
      '|("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')' + // string
      '|\\b(\\d+\\.?\\d*)\\b' + // number
      '|\\b(' + KEYWORDS + ')\\b', // keyword
    'g'
  )
  return escapeHtml(code).replace(re, (m, c, s, n, k) => {
    if (c) return `<span class="tok-comment">${c}</span>`
    if (s) return `<span class="tok-string">${s}</span>`
    if (n) return `<span class="tok-number">${n}</span>`
    if (k) return `<span class="tok-keyword">${k}</span>`
    return m
  })
}

export default function CodeBlock({ section }) {
  const { t } = useTranslation()
  const { loc } = useApp()
  const code = loc(section.code) || ''
  const runnable = section.runnable === true
  const [state, setState] = useState('idle') // idle | running | done
  const [output, setOutput] = useState('')
  const [ok, setOk] = useState(true)
  // Aborts the run in flight; also when the learner leaves the lesson.
  const runRef = useRef(null)
  useEffect(() => () => runRef.current?.abort(), [])

  const run = async () => {
    setState('running')
    runRef.current = new AbortController()
    const res = await runCode(code, section.lib || [], runRef.current.signal)
    runRef.current = null
    setOk(res.ok)
    const notice = { timeout: 'codeTimeout', stopped: 'codeStopped', unavailable: 'codeUnavailable' }[res.reason]
    setOutput(notice ? [t(notice), res.output].filter(Boolean).join('\n') : res.output || '')
    setState('done')
  }

  return (
    <figure className="code-block">
      <div className="code-head">
        <span className="code-lang">Python{section.lib?.length ? ` · ${section.lib.join(', ')}` : ''}</span>
        {runnable ? (
          <span className="code-run-actions">
            {state === 'running' && <span className="muted small">{t('codeRunning')}</span>}
            {state === 'running' ? (
              <button className="code-run" onClick={() => runRef.current?.abort()}>
                {t('codeStop')}
              </button>
            ) : (
              <button className="code-run" onClick={run}>
                {t('codeRun')}
              </button>
            )}
          </span>
        ) : (
          <span className="code-static-tag">{t('codeReference')}</span>
        )}
      </div>

      <pre className="code-pre">
        <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
      </pre>

      {section.caption && (
        <figcaption className="muted small code-caption">{loc(section.caption)}</figcaption>
      )}

      {runnable && section.expectedOutput != null && state !== 'done' && (
        <div className="code-output expected">
          <span className="code-output-label">{t('codeExpected')}</span>
          <pre>{section.expectedOutput}</pre>
        </div>
      )}

      {state === 'done' && (
        <div className={`code-output ${ok ? '' : 'err'}`}>
          <span className="code-output-label">{ok ? t('codeOutput') : t('codeError')}</span>
          <pre>{output || '(no output)'}</pre>
        </div>
      )}
    </figure>
  )
}
