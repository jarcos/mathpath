import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExerciseIds, getSubjects } from '@content/index.js'
import { streak } from '@shared/planner.js'
import { accuracy, forecastDays, longestStreak, subjectStats, weakLessons } from '@shared/stats.js'
import { useApp } from '@/AppContext.jsx'
import ProgressBar from '@/components/ProgressBar.jsx'
import ActivityHeatmap from '@/components/ActivityHeatmap.jsx'

const ACTIVITY_DAYS = 400
const FORECAST_DAYS = 14

const pct = (share) => Math.round(share * 100)

function useDuration() {
  const { t } = useTranslation()
  return (ms) => {
    const m = Math.round((ms || 0) / 60000)
    if (!m && ms > 0) return t('statsUnderMinute')
    return m >= 60 ? t('statsHours', { h: Math.floor(m / 60), m: m % 60 }) : t('statsMinutes', { m })
  }
}

// One headline number.
function Tile({ label, value, sub }) {
  return (
    <div className="stat-tile">
      <span className="stat-label muted small">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  )
}

// Reviews due on each coming day: one bar per day, from the baseline. Hover
// (or the table under it, for screen readers) gives each day's number.
function Forecast({ days, lang }) {
  const { t } = useTranslation()
  const max = Math.max(1, ...days.map((d) => d.reviews))
  const date = (key, opts) => {
    const [y, m, d] = key.split('-').map(Number)
    return new Intl.DateTimeFormat(lang, opts).format(new Date(y, m - 1, d, 12))
  }
  const peak = days.reduce((best, d, i) => (d.reviews > days[best].reviews ? i : best), 0)
  if (!days.some((d) => d.reviews)) return <p className="muted">{t('statsForecastNone')}</p>
  return (
    <>
      <div className="forecast" aria-hidden="true">
        {days.map((d, i) => (
          <div className="forecast-col" key={d.day}>
            <span className="forecast-tip">{t('statsForecastTip', { date: date(d.day, { weekday: 'long', day: 'numeric', month: 'short' }), count: d.reviews })}</span>
            <div className="forecast-plot">
              {(i === 0 || i === peak) && d.reviews > 0 && <span className="forecast-value">{d.reviews}</span>}
              <div className="forecast-bar" style={{ height: `${(d.reviews / max) * 100}%` }} />
            </div>
            <span className="forecast-day muted">{i === 0 ? t('statsToday') : date(d.day, { day: 'numeric' })}</span>
          </div>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>{t('statsForecast')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('statsDay')}</th>
            <th scope="col">{t('statsReviews')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{date(d.day, { weekday: 'long', day: 'numeric', month: 'long' })}</td>
              <td>{d.reviews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

// How the learner's study is going: headline numbers, each subject, the
// lessons to go over, the reviews to come and the activity of the last weeks.
export default function StatsView({ onBack, onOpenLesson }) {
  const { t } = useTranslation()
  const { loc, lang, completed, learning } = useApp()
  const duration = useDuration()
  const [data, setData] = useState(null)

  useEffect(() => {
    let active = true
    const since = new Date()
    since.setDate(since.getDate() - ACTIVITY_DAYS)
    Promise.all([
      window.api.learning.totals(),
      window.api.learning.activity(since.toISOString()),
      window.api.review.forecast(FORECAST_DAYS, getExerciseIds())
    ])
      .then(([totals, activity, forecast]) => {
        if (!active) return
        setData({ totals, activity: new Map(activity.map((r) => [r.day, r.attempts])), forecast })
      })
      .catch(() => active && setData({ totals: [], activity: new Map(), forecast: [] }))
    return () => {
      active = false
    }
  }, [learning, completed])

  if (!data) return null
  const subjects = getSubjects()
  const solved = new Set(learning.solved.keys())
  const rows = subjectStats(subjects, data.totals, solved, completed)
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0)
  const all = { answers: sum('answers'), correct: sum('correct') }
  const right = accuracy(all)
  const activeDays = new Set(data.activity.keys())
  const weak = weakLessons(subjects, data.totals)
  const days = forecastDays(data.forecast, FORECAST_DAYS)

  return (
    <div className="page stats-view">
      <button className="link back" onClick={onBack}>
        {t('backToDashboard')}
      </button>
      <header className="glossary-header">
        <h1>{t('statsTitle')}</h1>
        <p className="muted">{t('statsSubtitle')}</p>
      </header>

      <div className="stat-tiles">
        <Tile label={t('statsLessons')} value={`${sum('done')} / ${sum('lessons')}`} />
        <Tile label={t('statsExercises')} value={`${sum('solved')} / ${sum('exercises')}`} />
        <Tile label={t('statsAnswers')} value={all.answers} sub={right === null ? null : t('statsRight', { pct: pct(right) })} />
        <Tile label={t('statsTime')} value={duration(sum('timeMs'))} />
        <Tile label={t('statsStreak')} value={t('statsDays', { count: streak(activeDays) })} />
        <Tile label={t('statsBest')} value={t('statsDays', { count: longestStreak(activeDays) })} />
      </div>

      <section className="plan-panel">
        <div className="plan-head">
          <h2>{t('statsBySubject')}</h2>
        </div>
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th scope="col">{t('statsColSubject')}</th>
                <th scope="col">{t('statsColLessons')}</th>
                <th scope="col" className="num">{t('statsColExercises')}</th>
                <th scope="col" className="num">{t('statsColRight')}</th>
                <th scope="col" className="num">{t('statsColTime')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const share = accuracy(r)
                return (
                  <tr key={r.subject.id}>
                    <th scope="row">{loc(r.subject.name)}</th>
                    <td className="stats-lessons">
                      <ProgressBar percent={Math.round((r.done / r.lessons) * 100)} />
                      <span className="muted small">
                        {r.done} / {r.lessons}
                      </span>
                    </td>
                    <td className="num">
                      {r.solved} / {r.exercises}
                    </td>
                    <td className="num">{share === null ? '—' : `${pct(share)} %`}</td>
                    <td className="num">{r.answers ? duration(r.timeMs) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="plan-panel">
        <div className="plan-head">
          <h2>{t('statsWeak')}</h2>
        </div>
        <p className="muted small">{t('statsWeakHelp')}</p>
        {weak.length === 0 ? (
          <p className="muted">{t('statsWeakNone')}</p>
        ) : (
          <ul className="weak-list">
            {weak.map((w) => (
              <li key={w.lesson.id}>
                <button className="link" onClick={() => onOpenLesson(w.lesson.id)}>
                  {loc(w.lesson.title)}
                </button>
                <span className="muted small">
                  {loc(w.subject.name)} · {t('statsWeakRow', { pct: pct(w.accuracy), count: w.answers })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="plan-panel">
        <div className="plan-head">
          <h2>{t('statsForecast')}</h2>
        </div>
        <Forecast days={days} lang={lang} />
      </section>

      <section className="plan-panel">
        <div className="plan-head">
          <h2>{t('planActivity')}</h2>
        </div>
        <ActivityHeatmap counts={data.activity} lang={lang} />
      </section>
    </div>
  )
}
