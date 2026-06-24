import { join } from 'path'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import {
  initDb,
  getSetting,
  setSetting,
  getProgress,
  setLessonCompleted,
  recordAttempt,
  getPlan,
  startPlan,
  resetPlan
} from './db.js'

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'MathPath',
    backgroundColor: '#0f1220',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      // Secure defaults: renderer has no direct Node access.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Open external links in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

function registerIpc() {
  ipcMain.handle('settings:get', (_e, key) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key, value) => setSetting(key, value))

  ipcMain.handle('progress:get', () => getProgress())
  ipcMain.handle('progress:setLesson', (_e, lessonId, subjectId, completed) =>
    setLessonCompleted(lessonId, subjectId, completed)
  )

  ipcMain.handle('attempts:record', (_e, payload) => recordAttempt(payload))

  ipcMain.handle('plan:get', (_e, subjectId) => getPlan(subjectId))
  ipcMain.handle('plan:start', (_e, subjectId, targetDays) => startPlan(subjectId, targetDays))
  ipcMain.handle('plan:reset', (_e, subjectId, targetDays) => resetPlan(subjectId, targetDays))
}

app.whenReady().then(() => {
  initDb()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
