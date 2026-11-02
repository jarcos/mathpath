import { join, extname } from 'path'
import http from 'node:http'
import { createReadStream } from 'node:fs'
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
import { initUpdater } from './updater.js'

const isDev = !app.isPackaged

app.setName('MathPath')

// In a packaged build the renderer is served from a localhost HTTP server rather
// than file://. This is required for the in-app Pyodide runtime, which loads its
// wasm + wheels with fetch() — blocked under file://, but perfectly fine over
// http(127.0.0.1). It also keeps everything offline (loopback only). Dev keeps
// using the electron-vite dev server.
let rendererBaseUrl = null

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
}

function startRendererServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath
      try {
        urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      } catch {
        urlPath = '/'
      }
      if (!urlPath || urlPath === '/') urlPath = '/index.html'
      const safe = urlPath.replace(/\.\.(\/|\\|$)/g, '')
      const filePath = join(root, safe)
      const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
      const stream = createReadStream(filePath)
      stream.on('open', () => {
        res.writeHead(200, { 'Content-Type': type })
        stream.pipe(res)
      })
      stream.on('error', () => {
        res.writeHead(404)
        res.end('Not found')
      })
    })
    server.on('error', reject)
    // Port 0 = OS picks a free port; bind to loopback only.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

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
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
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
  ipcMain.handle('progress:setLesson', (_e, lessonId, subjectId, completed) =>
    setLessonCompleted(lessonId, subjectId, completed)
  )

  ipcMain.handle('attempts:record', (_e, payload) => recordAttempt(payload))
  ipcMain.handle('attempts:solvedForLesson', (_e, lessonId) => getSolvedExercises(lessonId))

  ipcMain.handle('plan:get', (_e, subjectId) => getPlan(subjectId))
  ipcMain.handle('plan:start', (_e, subjectId, targetDays) => startPlan(subjectId, targetDays))
  ipcMain.handle('plan:reset', (_e, subjectId, targetDays) => resetPlan(subjectId, targetDays))
}

app.whenReady().then(async () => {
  if (!isDev) {
    rendererBaseUrl = await startRendererServer(join(import.meta.dirname, '../renderer'))
  }

  if (isDev && process.platform === 'darwin' && app.dock) {
    const img = nativeImage.createFromPath(join(import.meta.dirname, '../../build/icon.png'))
    if (!img.isEmpty()) app.dock.setIcon(img)
  }

  initDb()
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
