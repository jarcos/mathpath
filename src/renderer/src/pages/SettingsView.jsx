import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSubject } from '@content/index.js'
import { useApp } from '@/AppContext.jsx'
import { useStudyGoal } from '@/lib/studyPlan.js'
import { UpdatesPanel } from '@/components/Updates.jsx'

const ZOOMS = [0.9, 1, 1.1, 1.25, 1.4]

// One setting with mutually exclusive choices, as a row of buttons.
function Choice({ label, value, options, onChange }) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="lang-toggle" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Appearance() {
  const { t } = useTranslation()
  const { lang, setLang, theme, setTheme, zoom, setZoom } = useApp()
  return (
    <section className="plan-panel">
      <h2 className="plan-section-title">{t('settingsLook')}</h2>
      <Choice
        label={t('settingsLanguage')}
        value={lang}
        options={[
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Español' }
        ]}
        onChange={setLang}
      />
      <Choice
        label={t('settingsTheme')}
        value={theme}
        options={[
          { value: 'dark', label: t('settingsThemeDark') },
          { value: 'light', label: t('settingsThemeLight') }
        ]}
        onChange={setTheme}
      />
      <Choice
        label={t('settingsZoom')}
        value={zoom}
        options={ZOOMS.map((z) => ({ value: z, label: `${Math.round(z * 100)} %` }))}
        onChange={setZoom}
      />
    </section>
  )
}

function StudyGoal({ onOpenPlan }) {
  const { t } = useTranslation()
  const { loc } = useApp()
  const [goal] = useStudyGoal()
  if (goal === undefined) return null
  return (
    <section className="plan-panel">
      <div className="plan-head">
        <h2>{t('settingsGoal')}</h2>
        <button className="link subtle" onClick={onOpenPlan}>
          {goal ? t('planChange') : t('planCreate')} →
        </button>
      </div>
      <p className="muted small">
        {goal
          ? `${t('planGoalSummary', { subject: loc(getSubject(goal.subjectId).name) })} · ${t('planMinutesPerDay', { count: goal.minutes })}`
          : t('settingsGoalNone')}
      </p>
    </section>
  )
}

// Export, import and reset. Importing and resetting replace all the data, so
// both ask first, and the main process saves a copy before either.
function YourProgress({ notice, onReplaced }) {
  const { t } = useTranslation()
  const { lang } = useApp()
  const [summary, setSummary] = useState(null)
  const [confirm, setConfirm] = useState(null) // { kind: 'import', file, backup, current } | { kind: 'reset' }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { ok, text }
  const [showNotice, setShowNotice] = useState(true) // hidden once another action starts

  useEffect(() => {
    window.api.data
      ?.summary()
      .then(setSummary)
      .catch(() => {})
  }, [])

  const api = window.api.data
  if (!api || !summary) return null

  const n = (x) => x.toLocaleString(lang)
  const counts = (c) => t('dataCounts', { lessons: n(c.lessons), answers: n(c.answers), reviews: n(c.reviews) })
  const failed = (code, fallback = 'dataErrorFailed') =>
    setMessage({ ok: false, text: t({ invalid: 'dataErrorInvalid', newer: 'dataErrorNewer' }[code] || fallback) })
  const run = async (fn) => {
    setBusy(true)
    setMessage(null)
    setShowNotice(false)
    try {
      await fn()
    } catch {
      failed('failed')
    } finally {
      setBusy(false)
    }
  }

  const exportNow = () =>
    run(async () => {
      const r = await api.export()
      if (r.ok) setMessage({ ok: true, text: t('dataExported', { file: r.file }) })
      else if (r.error) failed(r.error, 'dataErrorSave')
    })
  const pickImport = () =>
    run(async () => {
      const r = await api.pickImport()
      if (r.ok) setConfirm({ kind: 'import', ...r })
      else if (r.error) failed(r.error)
    })
  const apply = () =>
    run(async () => {
      const r = confirm.kind === 'import' ? await api.applyImport() : await api.reset()
      if (r.ok) {
        onReplaced({ kind: confirm.kind, copy: r.copy })
      } else {
        setConfirm(null)
        failed(r.error)
      }
    })
  const cancel = () => {
    if (confirm.kind === 'import') api.cancelImport()
    setConfirm(null)
  }
  const when = (iso) =>
    Number.isNaN(Date.parse(iso))
      ? ''
      : new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))

  return (
    <section className="plan-panel">
      <h2 className="plan-section-title">{t('dataTitle')}</h2>
      <p className="muted small">{t('dataIntro')}</p>
      <p className="small">{counts(summary)}</p>
      <p className="muted small data-file">
        <code>{summary.file}</code>{' '}
        <button className="link" onClick={() => api.reveal('data')}>
          {t('dataReveal')}
        </button>
      </p>

      <div aria-live="polite">
        {notice && showNotice && (
          <p className="data-message ok">
            {t(notice.kind === 'import' ? 'dataImported' : 'dataResetDone', { file: notice.copy })}{' '}
            <button className="link" onClick={() => api.reveal('copy')}>
              {t('dataReveal')}
            </button>
          </p>
        )}
        {message && <p className={`data-message ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}
      </div>

      {confirm ? (
        <div className="data-confirm">
          {confirm.kind === 'import' ? (
            <>
              <p className="small">
                <strong>{confirm.file}</strong>
                {confirm.backup.exportedAt && ` · ${t('dataBackupFrom', { date: when(confirm.backup.exportedAt) })}`}
                {confirm.backup.appVersion && ` · MathPath ${confirm.backup.appVersion}`}
              </p>
              <p className="small">
                {t('dataInBackup')}: {counts(confirm.backup)}
                <br />
                {t('dataNow')}: {counts(confirm.current)}
              </p>
              <p className="small">{t('dataImportWarning')}</p>
            </>
          ) : (
            <p className="small">{t('dataResetWarning')}</p>
          )}
          <div className="updates-actions">
            <button className="primary small danger" onClick={apply} disabled={busy}>
              {t(confirm.kind === 'import' ? 'dataImportConfirm' : 'dataResetConfirm')}
            </button>
            <button className="link" onClick={cancel} disabled={busy}>
              {t('planCancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="updates-actions">
          <button className="primary small" onClick={exportNow} disabled={busy}>
            {t('dataExport')}
          </button>
          <button className="link" onClick={pickImport} disabled={busy}>
            {t('dataImport')}
          </button>
          <button
            className="link danger"
            onClick={() => {
              setMessage(null)
              setShowNotice(false)
              setConfirm({ kind: 'reset' })
            }}
            disabled={busy}
          >
            {t('dataResetButton')}
          </button>
        </div>
      )}
    </section>
  )
}

// Settings: appearance, the study goal, updates, and backing up the progress.
export default function SettingsView({ onBack, onOpenPlan, notice, onReplaced }) {
  const { t } = useTranslation()
  return (
    <div className="page settings-view">
      <button className="link back" onClick={onBack}>
        {t('backToDashboard')}
      </button>
      <header className="glossary-header">
        <h1>{t('settingsTitle')}</h1>
        <p className="muted">{t('settingsSubtitle')}</p>
      </header>
      <Appearance />
      <StudyGoal onOpenPlan={onOpenPlan} />
      <YourProgress notice={notice} onReplaced={onReplaced} />
      <UpdatesPanel />
    </div>
  )
}
