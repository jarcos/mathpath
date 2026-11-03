import { join } from 'path'
import { app, shell, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import {
  initDb,
  getSetting,
  setSetting,
  getProgress,
  setLessonCompleted,
  recordAttempt,
  getSolvedExercises,
  getLearningState,
  getActivity,
  getTodayStudy,
  getDueReviews,
  getReviewSummary,
  getPlan,
  startPlan,
  resetPlan
} from './db.js'
import { initUpdater } from './updater.js'
import { startRendererServer } from './rendererServer.js'

const isDev = !app.isPackaged

app.setName('MathPath')

// Packaged builds serve the renderer from a loopback HTTP server (see
// rendererServer.js); dev keeps using the electron-vite dev server.
let rendererBaseUrl = null

function createWindow() {
  const devIcon = join(import.meta.dirname, '../../build/icon.png')

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'MathPath',
    backgroundColor: '#0f1220',
    ...(isDev ? { icon: devIcon } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Only https links ever leave the app, and they open in the system browser.
  const openOutside = (url) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url)
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === new URL(win.webContents.getURL()).origin) return
    event.preventDefault()
    openOutside(url)
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadURL(rendererBaseUrl)
  }
}

function registerIpc() {
  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('settings:get', (_e, key) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key, value) => setSetting(key, value))

  ipcMain.handle('progress:get', () => getProgress())
  ipcMain.handle('progress:setLesson', (_e, lessonId, subjectId, completed, source) =>
    setLessonCompleted(lessonId, subjectId, completed, source)
  )

  ipcMain.handle('attempts:record', (_e, payload) => recordAttempt(payload))
  ipcMain.handle('attempts:solvedForLesson', (_e, lessonId) => getSolvedExercises(lessonId))

  ipcMain.handle('learning:state', (_e, until) => getLearningState(until))
  ipcMain.handle('learning:activity', (_e, since) => getActivity(since))
  ipcMain.handle('learning:today', () => getTodayStudy())
  ipcMain.handle('review:due', (_e, until, limit, known) => getDueReviews(until, limit, known))
  ipcMain.handle('review:summary', (_e, until, known) => getReviewSummary(until, known))

  ipcMain.handle('plan:get', (_e, subjectId) => getPlan(subjectId))
  ipcMain.handle('plan:start', (_e, subjectId, targetDays) => startPlan(subjectId, targetDays))
  ipcMain.handle('plan:reset', (_e, subjectId, targetDays) => resetPlan(subjectId, targetDays))
}

// One instance at a time: a second one would share (and could migrate) the
// same database. Opening MathPath again focuses the existing window.
const isPrimary = app.requestSingleInstanceLock()
if (!isPrimary) app.quit()
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.whenReady().then(async () => {
  if (!isPrimary) return
  if (!isDev) {
    rendererBaseUrl = await startRendererServer(join(import.meta.dirname, '../renderer'))
  }

  if (isDev && process.platform === 'darwin' && app.dock) {
    const img = nativeImage.createFromPath(join(import.meta.dirname, '../../build/icon.png'))
    if (!img.isEmpty()) app.dock.setIcon(img)
  }

  try {
    initDb(join(app.getPath('userData'), 'mathpath.db'))
  } catch (e) {
    dialog.showErrorBox(
      'MathPath could not open your progress',
      `${e?.message || e}\n\nNothing was deleted. Your data is in:\n${app.getPath('userData')}`
    )
    app.quit()
    return
  }
  registerIpc()
  createWindow()
  initUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
