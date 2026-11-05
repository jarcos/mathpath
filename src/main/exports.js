// Saving the learner's notes (Markdown) and a page (PDF) to a file they pick.
// The renderer sends only the content and a suggested name; the main process
// shows its own save dialog, so a path never comes from the renderer.
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'

const MAX_MARKDOWN = 20 * 1024 * 1024
// The file picked for the next PDF (pdf:pick), until pdf:print uses it.
let pdfTarget = null

const pad = (n) => String(n).padStart(2, '0')
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * A file name from a suggested title: no folders or characters the systems
 * refuse, not empty, not too long.
 */
export function safeName(name, fallback) {
  const s = String(typeof name === 'string' ? name : '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  // At most 80 characters, never half of one (an emoji is two code units).
  return Array.from(s).slice(0, 80).join('').trim() || fallback
}

// Writes next to the target first, so a full disk never leaves half a file.
function writeAtomic(path, data) {
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, data)
    renameSync(tmp, path)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
}

async function pickTarget(e, defaultName, filters) {
  const win = BrowserWindow.fromWebContents(e.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: join(app.getPath('documents'), defaultName),
    filters
  })
  return canceled || !filePath ? null : filePath
}

export function registerExportIpc() {
  ipcMain.handle('notes:export', async (e, markdown) => {
    if (typeof markdown !== 'string' || markdown.length > MAX_MARKDOWN) return { error: 'invalid' }
    const path = await pickTarget(e, `MathPath-notes-${localDay()}.md`, [{ name: 'Markdown', extensions: ['md'] }])
    if (!path) return { canceled: true }
    try {
      writeAtomic(path, markdown)
      return { ok: true, file: basename(path) }
    } catch {
      return { error: 'save' }
    }
  })

  // A PDF in two steps, so the page is redrawn for paper only while it
  // prints, not while the learner picks a folder: pdf:pick keeps the chosen
  // file here, pdf:print writes the page shown (laid out by the renderer's
  // print styles) into it.
  ipcMain.handle('pdf:pick', async (e, name) => {
    pdfTarget = null
    const path = await pickTarget(e, `${safeName(name, 'MathPath')}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }])
    if (!path) return { canceled: true }
    pdfTarget = { path, sender: e.sender.id }
    return { ok: true }
  })
  ipcMain.handle('pdf:print', async (e) => {
    const target = pdfTarget
    pdfTarget = null
    if (!target || target.sender !== e.sender.id) return { error: 'save' }
    const { path } = target
    try {
      // Without backgrounds: white paper (with them, the margins take the
      // window's dark colour) and less ink.
      const pdf = await e.sender.printToPDF({
        printBackground: false,
        pageSize: 'A4',
        margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
        generateTaggedPDF: true,
        generateDocumentOutline: true
      })
      writeAtomic(path, pdf)
      return { ok: true, file: basename(path) }
    } catch {
      return { error: 'save' }
    }
  })
}
