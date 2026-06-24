import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { validateAnswer } from '@shared/validate.js'
import { useApp } from '@/AppContext.jsx'
import MathText from './MathText.jsx'

export default function Exercise({ exercise, lessonId, index }) {
  const { t } = useTranslation()
  const { loc, recordAttempt } = useApp()
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null) // 'correct' | 'incorrect' | null
  const [showHint, setShowHint] = useState(false)
  const [showSolution, setShowSolution] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    const ok = validateAnswer(answer, exercise)
    setResult(ok ? 'correct' : 'incorrect')
    recordAttempt({ exerciseId: exercise.id, lessonId, correct: ok, userAnswer: answer })
    if (!ok) setShowSolution(false)
  }

  return (
    <div className={`exercise ${result || ''}`}>
      <div className="exercise-head">
        <span className="exercise-num">{index}</span>
        <div className="exercise-prompt">
          <MathText>{loc(exercise.prompt)}</MathText>
        </div>
      </div>

      <form className="exercise-form" onSubmit={submit}>
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

      {result === 'correct' && <div className="feedback ok">{t('correct')}</div>}
      {result === 'incorrect' && <div className="feedback bad">{t('incorrect')}</div>}

      <div className="exercise-actions">
        {exercise.hint && (
          <button className="link" onClick={() => setShowHint((v) => !v)}>
            {showHint ? t('hideHint') : t('showHint')}
          </button>
        )}
        <button className="link" onClick={() => setShowSolution((v) => !v)}>
          {showSolution ? t('hideSolution') : t('showSolution')}
        </button>
      </div>

      {showHint && exercise.hint && (
        <div className="hint">
          <MathText>{loc(exercise.hint)}</MathText>
        </div>
      )}

      {showSolution && (
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
    </div>
  )
}
