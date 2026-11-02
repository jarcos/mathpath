import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Live updater state pushed from the main process. Defensive: a stale preload
// bridge without `window.api.updates` just yields null (nothing is rendered).
export function useUpdates() {
  const [state, setState] = useState(null)
  useEffect(() => {
    const api = window.api?.updates
    if (!api) return
    let alive = true
    api
      .getState()
      .then((s) => alive && setState(s))
      .catch(() => {})
    const off = api.onState((s) => setState(s))
    return () => {
      alive = false
      if (typeof off === 'function') off()
    }
  }, [])
  return state
}

function statusText(t, state) {
  switch (state?.status) {
    case 'checking':
      return t('updatesChecking')
    case 'up-to-date':
      return t('updatesUpToDate')
    case 'downloading':
      return t('updatesDownloading', { version: state.version, percent: state.percent })
    case 'downloaded':
      return t('updatesReady', { version: state.version })
    case 'error':
      return t('updatesError')
    case 'unsupported':
      return t('updatesUnsupported')
    default:
      return ''
  }
}

// Dashboard panel: current version, the opt-in setting and a manual check.
export function UpdatesPanel() {
  const { t } = useTranslation()
  const state = useUpdates()
  const [version, setVersion] = useState('')
  const [auto, setAuto] = useState(false)

  useEffect(() => {
    window.api?.app?.getVersion?.().then(setVersion).catch(() => {})
    window.api.settings
      .get('autoUpdate')
      .then((v) => setAuto(v === '1'))
      .catch(() => {})
  }, [])

  const api = window.api?.updates
  if (!api || !state) return null
  const unsupported = state.status === 'unsupported'
  const busy = ['checking', 'downloading', 'downloaded'].includes(state.status)

  const toggle = async (e) => {
    const on = e.target.checked
    setAuto(on)
    await window.api.settings.set('autoUpdate', on ? '1' : '0')
    if (on) api.check()
  }

  return (
    <section className="plan-panel updates-panel">
      <div className="plan-head">
        <h2>{t('updatesTitle')}</h2>
        {version && <span className="muted small">{t('updatesVersion', { version })}</span>}
      </div>
      <label className="updates-toggle">
        <input type="checkbox" checked={auto} onChange={toggle} disabled={unsupported} />
        <span>{t('updatesAuto')}</span>
      </label>
      <p className="muted small">{t('updatesPrivacy')}</p>
      <div className="updates-actions">
        <button className="primary small" onClick={() => api.check()} disabled={unsupported || busy}>
          {t('updatesCheck')}
        </button>
        <span className={`small updates-status ${state.status}`} title={state.error || ''}>
          {statusText(t, state)}
        </span>
      </div>
    </section>
  )
}

// Shown under the top bar on every page once an update has been downloaded.
export function UpdateBanner() {
  const { t } = useTranslation()
  const state = useUpdates()
  if (state?.status !== 'downloaded') return null
  return (
    <div className="update-banner" role="status">
      <span>{t('updatesReady', { version: state.version })}</span>
      <button className="primary small" onClick={() => window.api.updates.install()}>
        {t('updatesRestart')}
      </button>
    </div>
  )
}
