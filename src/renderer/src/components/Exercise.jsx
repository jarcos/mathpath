import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { validateAnswer } from '@shared/validate.js'
import { useApp } from '@/AppContext.jsx'
import { runFunctionCases, valuesClose } from '@/lib/pyodide.js'
import MathText from './MathText.jsx'

export default function Exercise({ exercise, lessonId, index, solved = false, onSolved }) {
  const { t } = useTranslation()
  const { loc, recordAttempt } = useApp()
  const type = exercise.answerType || 'expression'

  const [result, setResult] = useState(solved ? 'correct' : null) // 'correct' | 'incorrect' | null
  const [showHint, setShowHint] = useState(false)
  const [showSolution, setShowSolution] = useState(false)

  // Standard text/number/expression/set
  const [answer, setAnswer] = useState('')
  // MCQ
  const [picked, setPicked] = useState(null)
  // Code
  const [code, setCode] = useState(loc(exercise.starter) || '')
  const [codeState, setCodeState] = useState('idle') // idle | running
  const [codeFeedback, setCodeFeedback] = useState(null)

  const finish = (ok, userAnswer) => {
    setResult(ok ? 'correct' : 'incorrect')
    recordAttempt({ exerciseId: exercise.id, lessonId, correct: ok, userAnswer: String(userAnswer) })
    if (ok && onSolved) onSolved(exercise.id)
    if (!ok) setShowSolution(false)
  }

  const submitStandard = (e) => {
    e.preventDefault()
    finish(validateAnswer(answer, exercise), answer)
  }

  const submitMcq = () => {
    if (picked == null) return
    finish(!!exercise.choices[picked]?.correct, `choice ${picked}`)
  }

  const submitCode = async () => {
    setCodeState('running')
    setCodeFeedback(null)
    const argsList = exercise.tests.map((tt) => tt.args || [])
    const res = await runFunctionCases(code, exercise.funcName, argsList, exercise.lib || [])
    if (!res.ok) {
      setCodeState('idle')
      setCodeFeedback({ error: res.error === 'missing_function' ? t('codeNoFunc', { fn: exercise.funcName }) : res.error })
      finish(false, code)
      return
    }
    const passes = exercise.tests.map((tt, i) => valuesClose(res.results[i], tt.expected, tt.tol ?? 1e-9))
    const allPass = passes.every(Boolean)
    setCodeState('idle')
    setCodeFeedback({ passes })
    finish(allPass, code)
  }

  const numSolved = result === 'correct'

  return (
    <div className={`exercise ${result || ''}`}>
      <div className="exercise-head">
        <span className={`exercise-num ${numSolved ? 'solved' : ''}`}>
          {numSolved ? '✓' : index}
        </span>
        <div className="exercise-prompt">
          <MathText>{loc(exercise.prompt)}</MathText>
        </div>
      </div>

      {/* ---- standard input ---- */}
      {type !== 'mcq' && type !== 'code' && (
        <form className="exercise-form" onSubmit={submitStandard}>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={t('yourAnswer')}
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit">{t('check')}</button>
        </form>
      )}

      {/* ---- multiple choice ---- */}
      {type === 'mcq' && (
        <div className="mcq">
          <ul className="mcq-list">
            {exercise.choices.map((c, i) => {
              const showWhy = result && (picked === i || c.correct)
              return (
                <li
                  key={i}
                  className={`mcq-choice ${picked === i ? 'picked' : ''} ${
                    result ? (c.correct ? 'is-correct' : picked === i ? 'is-wrong' : '') : ''
                  }`}
                >
                  <label>
                    <input
                      type="radio"
                      name={exercise.id}
                      checked={picked === i}
                      onChange={() => setPicked(i)}
                    />
                    <span className="mcq-text"><MathText>{loc(c.text)}</MathText></span>
                  </label>
                  {showWhy && <p className="mcq-why muted small"><MathText>{loc(c.why)}</MathText></p>}
                </li>
              )
            })}
          </ul>
          <button className="primary small" onClick={submitMcq} disabled={picked == null}>
            {t('check')}
          </button>
        </div>
      )}

      {/* ---- code exercise ---- */}
      {type === 'code' && (
        <div className="code-exercise">
          <textarea
            className="code-editor"
            value={code}
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            rows={Math.max(4, code.split('\n').length + 1)}
          />
          <div className="code-exercise-actions">
            <button className="primary small" onClick={submitCode} disabled={codeState === 'running'}>
              {codeState === 'running' ? t('codeRunning') : t('codeRunCheck')}
            </button>
          </div>
          {codeFeedback?.error && <div className="feedback bad">{codeFeedback.error}</div>}
          {codeFeedback?.passes && (
            <ul className="code-tests">
              {codeFeedback.passes.map((p, i) => (
                <li key={i} className={p ? 'pass' : 'fail'}>
                  {p ? '✓' : '✗'} {t('codeTest', { n: i + 1 })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result === 'correct' && <div className="feedback ok">{t('correct')}</div>}
      {result === 'incorrect' && <div className="feedback bad">{t('incorrect')}</div>}

      <div className="exercise-actions">
        {exercise.hint && (
          <button className="link" onClick={() => setShowHint((v) => !v)}>
            {showHint ? t('hideHint') : t('showHint')}
          </button>
        )}
        {(Array.isArray(exercise.solution) || (type === 'code' && exercise.solution)) && (
          <button className="link" onClick={() => setShowSolution((v) => !v)}>
            {showSolution ? t('hideSolution') : t('showSolution')}
          </button>
        )}
      </div>

      {showHint && exercise.hint && (
        <div className="hint">
          <MathText>{loc(exercise.hint)}</MathText>
        </div>
      )}

      {showSolution && Array.isArray(exercise.solution) && (
        <ol className="solution">
          {exercise.solution.map((step, i) => (
            <li key={i}>
              {step.tex && (
                <div className="solution-tex">
                  <MathText tex={step.tex} display />
                </div>
              )}
              <div className="solution-text">{loc(step)}</div>
            </li>
          ))}
        </ol>
      )}

      {showSolution && type === 'code' && typeof exercise.solution === 'string' && (
        <pre className="code-pre solution-code"><code>{exercise.solution}</code></pre>
      )}
    </div>
  )
}
