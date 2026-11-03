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
    setLesson: (lessonId, subjectId, completed) =>
      ipcRenderer.invoke('progress:setLesson', lessonId, subjectId, completed)
  },
  attempts: {
    record: (payload) => ipcRenderer.invoke('attempts:record', payload),
    solvedForLesson: (lessonId) => ipcRenderer.invoke('attempts:solvedForLesson', lessonId)
  },
  learning: {
    state: (until) => ipcRenderer.invoke('learning:state', until),
    activity: (since) => ipcRenderer.invoke('learning:activity', since)
  },
  review: {
    due: (until, limit, known) => ipcRenderer.invoke('review:due', until, limit, known),
    summary: (until, known) => ipcRenderer.invoke('review:summary', until, known)
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
