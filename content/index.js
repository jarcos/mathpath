// Loads all shipped lesson content at build time so the app runs fully offline.
import subjectsData from './subjects.json'

// Eagerly import every lesson JSON in this folder tree.
const lessonModules = import.meta.glob('./**/lesson-*.json', { eager: true })

// Normalize glob keys ("./algebra/lesson-01-...json") to the relative paths
// used inside subjects.json ("algebra/lesson-01-...json").
const lessonsByPath = {}
for (const [key, mod] of Object.entries(lessonModules)) {
  lessonsByPath[key.replace(/^\.\//, '')] = mod.default || mod
}

const subjects = subjectsData.subjects.map((s) => ({
  ...s,
  lessonObjects: (s.lessons || [])
    .map((p) => lessonsByPath[p])
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
}))

const lessonIndex = {}
for (const s of subjects) {
  for (const l of s.lessonObjects) lessonIndex[l.id] = l
}

export function getSubjects() {
  return subjects
}

export function getSubject(subjectId) {
  return subjects.find((s) => s.id === subjectId) || null
}

export function getLesson(lessonId) {
  return lessonIndex[lessonId] || null
}
