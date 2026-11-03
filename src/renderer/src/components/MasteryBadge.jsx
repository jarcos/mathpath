import { useTranslation } from 'react-i18next'

const TONE = { practiced: 'soon', mastered: 'ok', review: 'warn' }

// A lesson's mastery level as a small pill; nothing for lessons not started.
export default function MasteryBadge({ level }) {
  const { t } = useTranslation()
  if (!TONE[level]) return null
  return <span className={`badge ${TONE[level]} mastery-badge`}>{t('level_' + level)}</span>
}
