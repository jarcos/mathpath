import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { checkAnswer, previewTex } from '@shared/validate.js'
import { gradeCases } from '@shared/pygrade.js'
import { useApp } from '@/AppContext.jsx'
import { isGuessable } from '@/lib/mastery.js'
import { runFunctionCases } from '@/lib/pyodide.js'
import { KEYS, isMac } from '@/lib/keys.js'
import MathText from './MathText.jsx'

// After this many wrong picks a multiple-choice exercise shows the answer and
// locks, so the learner can't click through every option. It stays locked if
// the lesson is reopened that day (`priorMisses`), and gets a review card so
// it comes back to be answered fresh.
const MCQ_TRIES = 2

/**
 * One exercise. In a lesson (`mode` 'lesson') its first solve creates a review
 * card; in a review session ('review') its first answer rates that card; in a
 * placement test ('placement') only a right first answer creates one. The
 * first answer is reported through `onResult(ok, { due })`. `assist={false}`
 * hides hints and solutions. `onAnother`, for template instances, offers a
 * fresh instance once this one is answered. `priorMisses`: wrong tries already
 * made today, for a guessable question reopened in a lesson.
 */
export default function Exercise({
  exercise,
  lessonId,
  index,
  solved = false,
  onSolved,
  mode = 'lesson',
  onResult,
  assist = true,
  onAnother,
  priorMisses = 0
}) {
  const { t } = useTranslation()
  const { loc, recordAttempt } = useApp()
  const type = exercise.answerType || 'expression'

  const [result, setResult] = useState(solved ? 'correct' : null) // 'correct' | 'incorrect' | null
  // Why the last checked answer is (not) right: checkAnswer's result.
  const [verdict, setVerdict] = useState(null)
  const [unreadable, setUnreadable] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  // How this attempt is going, for the review schedule and mastery. Refs, as
  // they are read when an answer is recorded, possibly after awaiting Python.
  const usedHint = useRef(false)
  const usedSolution = useRef(false)
  const missesRef = useRef(0)
  const [misses, setMisses] = useState(0) // the same count, for rendering
  const startedAt = useRef(null) // first keystroke / pick of this answer
  // Answers checked so far: a new verdict is a new node, so a screen reader
  // announces it even when its text is the same as the last one.
  const [checks, setChecks] = useState(0)
  const answered = useRef(false)
  const touch = () => {
    if (!startedAt.current) startedAt.current = Date.now()
  }

  // The lesson loads solved exercises and today's misses asynchronously, after
  // this has mounted.
  useEffect(() => {
    if (solved) setResult('correct')
  }, [solved])
  useEffect(() => {
    if (priorMisses > missesRef.current) {
      missesRef.current = priorMisses
      setMisses(priorMisses)
    }
  }, [priorMisses])

  // Standard text/number/expression/set, and how the answer reads as maths.
  const [answer, setAnswer] = useState('')
  const preview = useMemo(() => previewTex(answer, exercise), [answer, exercise])
  // MCQ
  const [picked, setPicked] = useState(null)
  const revealed = result === 'correct' || (type === 'mcq' && misses >= MCQ_TRIES)
  // Code: the starter follows the language until the learner edits it.
  const starter = loc(exercise.starter) || ''
  const [code, setCode] = useState(starter)
  const [codeEdited, setCodeEdited] = useState(false)
  const [codeState, setCodeState] = useState('idle') // idle | running
  const [codeFeedback, setCodeFeedback] = useState(null)
  // Aborts the run in flight; also when the learner leaves the lesson.
  const codeRunRef = useRef(null)
  useEffect(() => () => codeRunRef.current?.abort(), [])

  useEffect(() => {
    if (!codeEdited) setCode(starter)
  }, [starter, codeEdited])

  const finish = (ok, userAnswer) => {
    const first = !answered.current
    answered.current = true
    setResult(ok ? 'correct' : 'incorrect')
    setChecks((n) => n + 1)
    const scheduling = recordAttempt({
      exerciseId: exercise.id,
      lessonId,
      correct: ok,
      userAnswer: String(userAnswer),
      usedHint: usedHint.current,
      usedSolution: usedSolution.current,
      timeMs: startedAt.current ? Date.now() - startedAt.current : null,
      misses: missesRef.current,
      // Only the first answer of a review or a placement question counts;
      // retries are just recorded.
      schedule: mode === 'lesson' ? 'learn' : first ? (mode === 'review' ? 'review' : 'learn') : undefined,
      mode,
      // This wrong pick reveals a multiple-choice answer: it comes back in review.
      revealed: mode === 'lesson' && type === 'mcq' && !ok && missesRef.current + 1 >= MCQ_TRIES
    }).catch((e) => {
      console.error('recording the answer failed', e)
      return null
    })
    startedAt.current = null
    if (first && onResult) scheduling.then((due) => onResult(ok, { due }))
    // A guessable answer counts towards mastery only when right first time.
    const clean = !usedSolution.current && (!isGuessable(exercise) || missesRef.current === 0)
    if (ok && onSolved) onSolved(exercise.id, { clean })
    if (!ok) {
      missesRef.current += 1
      setMisses(missesRef.current)
      setShowSolution(false)
    }
  }

  const submitStandard = (e) => {
    e.preventDefault()
    const res = checkAnswer(answer, exercise)
    if (res.reason === 'empty') return
    // What can't be read as maths isn't an answer: nothing is recorded.
    setUnreadable(res.reason === 'unparsed')
    if (res.reason === 'unparsed') return
    setVerdict(res)
    finish(res.ok, answer)
  }

  // Why an answer isn't right, from checkAnswer's reason.
  const why = () => {
    switch (verdict?.reason) {
      case 'form':
        return t(`form_${verdict.form}`)
      case 'mistake':
        return <MathText>{loc(verdict.feedback)}</MathText>
      case 'partial':
        return t('setPartial', { right: verdict.right, total: verdict.total })
      case 'count':
        return t('setCount', { expected: verdict.expected, got: verdict.got })
      default:
        return t('incorrect')
    }
  }

  const submitMcq = () => {
    // The pick just marked wrong can't be sent again (a double click would
    // otherwise spend the last try); picking another option clears the verdict.
    if (picked == null || revealed || result === 'incorrect') return
    finish(!!exercise.choices[picked]?.correct, `choice ${picked}`)
  }

  const pickMcq = (i) => {
    touch()
    setPicked(i)
    // A new pick clears the verdict on the previous one.
    if (result === 'incorrect') setResult(null)
  }

  const submitCode = async () => {
    setCodeState('running')
    setCodeFeedback(null)
    const argsList = exercise.tests.map((tt) => tt.args || [])
    codeRunRef.current = new AbortController()
    const res = await runFunctionCases(code, exercise.funcName, argsList, exercise.lib || [], codeRunRef.current.signal)
    codeRunRef.current = null
    setCodeState('idle')
    // Not the learner's doing: nothing is recorded.
    if (res.reason === 'stopped') {
      setCodeFeedback({ error: t('codeStopped') })
      return
    }
    if (res.reason === 'unavailable') {
      setCodeFeedback({ error: `${t('codeUnavailable')}\n${res.error || ''}` })
      return
    }
    if (!res.ok) {
      const error =
        res.reason === 'timeout'
          ? t('codeTimeout')
          : res.error === 'missing_function'
            ? t('codeNoFunc', { fn: exercise.funcName })
            : res.error
      setCodeFeedback({ error })
      finish(false, code)
      return
    }
    const passes = gradeCases(res.results, exercise.tests)
    setCodeFeedback({ passes })
    finish(passes.every(Boolean), code)
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
            onChange={(e) => {
              touch()
              setAnswer(e.target.value)
              setUnreadable(false)
            }}
            placeholder={t('yourAnswer')}
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit">{t('check')}</button>
        </form>
      )}
      {preview && (
        <div className="answer-preview">
          <span className="muted small">{t('previewReads')}</span> <MathText tex={`\\displaystyle ${preview}`} />
        </div>
      )}

      {/* ---- multiple choice ---- */}
      {type === 'mcq' && (
        // Enter on the chosen option checks it.
        <div
          className="mcq"
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.target.type !== 'radio' || e.isComposing || e.repeat) return
            e.preventDefault()
            submitMcq()
          }}
        >
          <ul className="mcq-list">
            {exercise.choices.map((c, i) => {
              // Until the answer is revealed, only the checked pick is explained.
              const wrongPick = picked === i && (revealed || result === 'incorrect') && !c.correct
              const showWhy = revealed ? picked === i || c.correct : wrongPick
              return (
                <li
                  key={i}
                  className={`mcq-choice ${picked === i ? 'picked' : ''} ${
                    revealed && c.correct ? 'is-correct' : wrongPick ? 'is-wrong' : ''
                  }`}
                >
                  <label>
                    <input
                      type="radio"
                      name={exercise.id}
                      checked={picked === i}
                      disabled={revealed}
                      onChange={() => pickMcq(i)}
                    />
                    <span className="mcq-text"><MathText>{loc(c.text)}</MathText></span>
                  </label>
                  {showWhy && <p className="mcq-why muted small"><MathText>{loc(c.why)}</MathText></p>}
                </li>
              )
            })}
          </ul>
          {!revealed && (
            <button className="primary small" onClick={submitMcq} disabled={picked == null || result === 'incorrect'}>
              {t('check')}
            </button>
          )}
        </div>
      )}

      {/* ---- code exercise ---- */}
      {type === 'code' && (
        <div className="code-exercise">
          <textarea
            className="code-editor"
            value={code}
            spellCheck={false}
            onChange={(e) => {
              touch()
              setCode(e.target.value)
              setCodeEdited(true)
            }}
            // Cmd+Enter (Ctrl+Enter) runs and checks; Enter alone is a new line.
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.isComposing) return
              // Held down, it would run (and record an answer) again and again.
              if (e.repeat) {
                e.preventDefault()
                return
              }
              e.preventDefault()
              if (codeState !== 'running') submitCode()
            }}
            aria-keyshortcuts={isMac ? 'Meta+Enter' : 'Control+Enter'}
            rows={Math.max(4, code.split('\n').length + 1)}
          />
          <div className="code-exercise-actions">
            {codeState === 'running' ? (
              <>
                <button className="primary small" onClick={() => codeRunRef.current?.abort()}>
                  {t('codeStop')}
                </button>
                <span className="muted small">{t('codeRunning')}</span>
              </>
            ) : (
              <button className="primary small" onClick={submitCode} title={KEYS.run}>
                {t('codeRunCheck')}
              </button>
            )}
          </div>
          <div aria-live="polite">
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
        </div>
      )}

      {/* The verdict is announced to screen readers as it appears. */}
      <div className="exercise-verdict" aria-live="polite">
        {unreadable ? (
          <div className="feedback bad">{t('answerUnreadable')}</div>
        ) : (
          <>
            {result === 'correct' && (
              <div className="feedback ok" key={`ok-${checks}`}>
                {verdict?.spelling ? t('correctSpelling', { word: verdict.spelling }) : t('correct')}
              </div>
            )}
            {result === 'incorrect' && (
              <div className="feedback bad" key={`bad-${checks}`}>
                {type === 'mcq' && revealed ? t('mcqRevealed') : why()}
              </div>
            )}
          </>
        )}
        {result === null && type === 'mcq' && revealed && <div className="feedback bad">{t('mcqLocked')}</div>}
      </div>

      <div className="exercise-actions">
        {assist && exercise.hint && (
          <button
            className="link"
            onClick={() => {
              usedHint.current = true
              setShowHint((v) => !v)
            }}
          >
            {showHint ? t('hideHint') : t('showHint')}
          </button>
        )}
        {assist && (Array.isArray(exercise.solution) || (type === 'code' && exercise.solution)) && (
          <button
            className="link"
            onClick={() => {
              usedSolution.current = true
              setShowSolution((v) => !v)
            }}
          >
            {showSolution ? t('hideSolution') : t('showSolution')}
          </button>
        )}
        {onAnother && result && (
          <button className="link" onClick={onAnother}>
            {t('exerciseAnother')} ↻
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
