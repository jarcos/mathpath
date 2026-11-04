import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { BackupError, checkBackup, exportProgress, importProgress, progressCounts, resetProgress } from './db.js'

// Exporting, importing and resetting the learner's progress. File paths never
// come from the renderer: the main process asks for them with its own dialogs
// and keeps a picked backup until the learner confirms the import.

// Before an import or a reset, the current progress is saved in the backups
// folder of the user-data folder; the newest KEEP of those copies are kept.
const KEEP = 10
const MAX_BYTES = 200 * 1024 * 1024
const FILTERS = [{ name: 'MathPath backup', extensions: ['json'] }]

let pending = null // the backup picked for import, waiting for confirmation
let lastCopy = null
let lastStamp = 0

const pad = (n, w = 2) => String(n).padStart(w, '0')
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const stamp = (d) =>
  `${localDay(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`

const dbFile = () => join(app.getPath('userData'), 'mathpath.db')
// Written next to its place and then renamed, so a failed write (a full disk)
// never leaves half a file, nor half-overwrites an earlier backup.
function writeBackup(path) {
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(exportProgress(app.getVersion())), 'utf8')
    renameSync(tmp, path)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
}

function safetyCopy(reason) {
  const dir = join(app.getPath('userData'), 'backups')
  mkdirSync(dir, { recursive: true })
  // Each copy gets a later time than the one before, to the millisecond, so
  // names never clash and sort in the order the copies were made.
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  const path = join(dir, `mathpath-${stamp(new Date(lastStamp))}-before-${reason}.json`)
  writeBackup(path)
  const old = readdirSync(dir)
    .filter((f) => /^mathpath-[\d-]+-before-(import|reset)\.json$/.test(f))
    .sort()
    .reverse()
    .slice(KEEP)
  for (const f of old) rmSync(join(dir, f), { force: true })
  lastCopy = path
  return basename(path)
}

const failure = (e) => {
  if (e instanceof BackupError) return { error: e.code }
  console.error('progress backup failed', e)
  return { error: 'failed' }
}

export function registerBackupIpc() {
  ipcMain.handle('data:summary', () => ({ ...progressCounts(), file: dbFile() }))

  // what: 'data' (the database file) or 'copy' (the last automatic copy)
  ipcMain.handle('data:reveal', (_e, what) => {
    shell.showItemInFolder(what === 'copy' && lastCopy ? lastCopy : dbFile())
  })

  ipcMain.handle('data:export', async (e) => {
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      defaultPath: join(app.getPath('documents'), `MathPath-progress-${localDay(new Date())}.json`),
      filters: FILTERS
    })
    if (canceled || !filePath) return { canceled: true }
    try {
      writeBackup(filePath)
      return { ok: true, file: basename(filePath) }
    } catch (err) {
      return failure(err)
    }
  })

  ipcMain.handle('data:pickImport', async (e) => {
    pending = null
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      properties: ['openFile'],
      filters: FILTERS
    })
    if (canceled || !filePaths?.length) return { canceled: true }
    try {
      if (statSync(filePaths[0]).size > MAX_BYTES) throw new BackupError('invalid')
      let data
      try {
        data = JSON.parse(readFileSync(filePaths[0], 'utf8'))
      } catch {
        throw new BackupError('invalid')
      }
      const backup = checkBackup(data)
      pending = data
      return { ok: true, file: basename(filePaths[0]), backup, current: progressCounts() }
    } catch (err) {
      return failure(err)
    }
  })

  ipcMain.handle('data:cancelImport', () => {
    pending = null
  })

  ipcMain.handle('data:applyImport', () => {
    const data = pending
    pending = null
    if (!data) return { error: 'invalid' }
    try {
      const copy = safetyCopy('import')
      importProgress(data)
      return { ok: true, copy }
    } catch (err) {
      return failure(err)
    }
  })

  ipcMain.handle('data:reset', () => {
    try {
      const copy = safetyCopy('reset')
      resetProgress()
      return { ok: true, copy }
    } catch (err) {
      return failure(err)
    }
  })
}
