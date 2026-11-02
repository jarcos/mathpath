import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import { getSetting } from './db.js'

// Opt-in updates from the GitHub Releases of the public repo — the only network
// access MathPath has. It runs at startup when the "autoUpdate" setting is on,
// or when the learner presses "Check for updates". Only the packaged, signed app
// can update itself; in dev the state stays "unsupported".
const { autoUpdater } = electronUpdater

let state = {
  status: app.isPackaged ? 'idle' : 'unsupported',
  version: null,
  percent: 0,
  error: null
}

function setState(patch) {
  state = { ...state, ...patch }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('updates:state', state)
}

async function check() {
  if (!app.isPackaged) return state
  if (['checking', 'downloading', 'downloaded'].includes(state.status)) return state
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    setState({ status: 'error', error: String(e?.message || e) })
  }
  return state
}

export function initUpdater() {
  ipcMain.handle('updates:getState', () => state)
  ipcMain.handle('updates:check', () => check())
  ipcMain.handle('updates:install', () => {
    if (state.status === 'downloaded') autoUpdater.quitAndInstall()
  })

  if (!app.isPackaged) return

  // Download in the background once found; it installs on "Restart now" or
  // the next time the app quits.
  autoUpdater.autoDownload = true
  autoUpdater.on('checking-for-update', () => setState({ status: 'checking', error: null }))
  autoUpdater.on('update-available', (info) =>
    setState({ status: 'downloading', version: info.version, percent: 0 })
  )
  autoUpdater.on('update-not-available', () => setState({ status: 'up-to-date' }))
  autoUpdater.on('download-progress', (p) =>
    setState({ status: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    setState({ status: 'downloaded', version: info.version, percent: 100 })
  )
  autoUpdater.on('error', (e) => setState({ status: 'error', error: String(e?.message || e) }))

  if (getSetting('autoUpdate') === '1') check()
}
