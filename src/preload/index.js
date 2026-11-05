import { contextBridge, ipcRenderer } from 'electron'

// The single, controlled bridge between the sandboxed renderer and the main
// process. The renderer can ONLY do what is whitelisted here.
const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion')
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value)
  },
  progress: {
    getAll: () => ipcRenderer.invoke('progress:get'),
    // source: 'manual' | 'mastery' | 'placement'
    setLesson: (lessonId, subjectId, completed, source) =>
      ipcRenderer.invoke('progress:setLesson', lessonId, subjectId, completed, source)
  },
  attempts: {
    record: (payload) => ipcRenderer.invoke('attempts:record', payload),
    solvedForLesson: (lessonId) => ipcRenderer.invoke('attempts:solvedForLesson', lessonId),
    missesToday: (lessonId) => ipcRenderer.invoke('attempts:missesToday', lessonId)
  },
  learning: {
    state: (until) => ipcRenderer.invoke('learning:state', until),
    activity: (since) => ipcRenderer.invoke('learning:activity', since),
    // The lessons worked on last, latest first (for "Continue").
    recent: () => ipcRenderer.invoke('learning:recent'),
    // Per lesson: answers, right ones and time spent answering.
    totals: () => ipcRenderer.invoke('learning:totals'),
    today: (known) => ipcRenderer.invoke('learning:today', known)
  },
  review: {
    due: (until, limit, known) => ipcRenderer.invoke('review:due', until, limit, known),
    summary: (until, known) => ipcRenderer.invoke('review:summary', until, known),
    forecast: (days, known) => ipcRenderer.invoke('review:forecast', days, known)
  },
  // The learner's note and bookmark per lesson.
  notes: {
    get: (lessonId) => ipcRenderer.invoke('notes:get', lessonId),
    list: () => ipcRenderer.invoke('notes:list'),
    save: (lessonId, body) => ipcRenderer.invoke('notes:save', lessonId, body),
    bookmark: (lessonId, on) => ipcRenderer.invoke('notes:bookmark', lessonId, on),
    // Saves the given Markdown where the learner picks (main's own dialog).
    export: (markdown) => ipcRenderer.invoke('notes:export', markdown)
  },
  // Saves the page shown as a PDF: first the learner picks where (main's own
  // dialog), then the page is printed into that file.
  pdf: {
    pick: (name) => ipcRenderer.invoke('pdf:pick', name),
    print: () => ipcRenderer.invoke('pdf:print')
  },
  view: {
    setZoom: (factor) => ipcRenderer.invoke('view:setZoom', factor)
  },
  // Backups: the main process picks every file with its own dialogs.
  data: {
    summary: () => ipcRenderer.invoke('data:summary'),
    reveal: (what) => ipcRenderer.invoke('data:reveal', what),
    export: () => ipcRenderer.invoke('data:export'),
    pickImport: () => ipcRenderer.invoke('data:pickImport'),
    cancelImport: () => ipcRenderer.invoke('data:cancelImport'),
    applyImport: () => ipcRenderer.invoke('data:applyImport'),
    reset: () => ipcRenderer.invoke('data:reset')
  },
  plan: {
    get: (subjectId) => ipcRenderer.invoke('plan:get', subjectId),
    start: (subjectId, targetDays) => ipcRenderer.invoke('plan:start', subjectId, targetDays),
    reset: (subjectId, targetDays) => ipcRenderer.invoke('plan:reset', subjectId, targetDays)
  },
  updates: {
    getState: () => ipcRenderer.invoke('updates:getState'),
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    // Subscribes to state pushes from the main process; returns an unsubscribe.
    onState: (cb) => {
      const listener = (_e, state) => cb(state)
      ipcRenderer.on('updates:state', listener)
      return () => ipcRenderer.removeListener('updates:state', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
