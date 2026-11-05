import { useTranslation } from 'react-i18next'
import { dayKey } from '@shared/planner.js'

const HEATMAP_WEEKS = 18

// GitHub-style grid of the last weeks: one cell per day, shaded by answers.
export default function ActivityHeatmap({ counts, lang }) {
  const { t } = useTranslation()
  // Noon, so stepping a day at a time never lands in a DST gap.
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - (HEATMAP_WEEKS * 7 - 1) - ((today.getDay() + 6) % 7))
  const cells = []
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d)
    const n = counts.get(key) || 0
    const level = n === 0 ? 0 : n < 5 ? 1 : n < 15 ? 2 : 3
    const label = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(d)
    cells.push(<span key={key} className={`heat heat-${level}`} title={t('planActivityDay', { date: label, count: n })} />)
  }
  return (
    <div className="heatmap" role="img" aria-label={t('planActivity')}>
      {cells}
    </div>
  )
}
