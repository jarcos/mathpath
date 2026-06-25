import { join } from 'path'
import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import {
  initDb,
  getSetting,
  setSetting,
  getProgress,
  setLessonCompleted,
  recordAttempt,
  getSolvedExercises,
  getPlan,
  startPlan,
  resetPlan
} from './db.js'

const isDev = !app.isPackaged

// Show "MathPath" (not "Electron") and the brand icon. In a packaged build the
// name comes from productName and the icon from the bundle; in dev we set them
// at runtime. On macOS the menu-bar app name in dev still shows "Electron"
// (it's the unsigned Electron binary's bundle name) — that's fixed once packaged.
app.setName('MathPath')

function createWindow() {
  // Dev/runtime window icon (Linux/Windows + dev dock). Packaged macOS uses the
  // .icns from electron-builder; this path may not exist there, so only set it
  // in dev to avoid a missing-file warning.
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
  ipcMain.handle('attempts:solvedForLesson', (_e, lessonId) => getSolvedExercises(lessonId))

  ipcMain.handle('plan:get', (_e, subjectId) => getPlan(subjectId))
  ipcMain.handle('plan:start', (_e, subjectId, targetDays) => startPlan(subjectId, targetDays))
  ipcMain.handle('plan:reset', (_e, subjectId, targetDays) => resetPlan(subjectId, targetDays))
}

app.whenReady().then(() => {
  // Dev: replace Electron's default Dock icon with the brand icon (macOS).
  if (isDev && process.platform === 'darwin' && app.dock) {
    const img = nativeImage.createFromPath(join(import.meta.dirname, '../../build/icon.png'))
    if (!img.isEmpty()) app.dock.setIcon(img)
  }

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
