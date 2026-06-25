import { contextBridge, ipcRenderer } from 'electron'

// The single, controlled bridge between the sandboxed renderer and the main
// process. The renderer can ONLY do what is whitelisted here.
const api = {
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
  plan: {
    get: (subjectId) => ipcRenderer.invoke('plan:get', subjectId),
    start: (subjectId, targetDays) => ipcRenderer.invoke('plan:start', subjectId, targetDays),
    reset: (subjectId, targetDays) => ipcRenderer.invoke('plan:reset', subjectId, targetDays)
  }
}

contextBridge.exposeInMainWorld('api', api)
