// Loads all shipped lesson content at build time so the app runs fully offline.
import subjectsData from './subjects.json'
import glossaryData from './glossary.json'

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
const exerciseIndex = {}
for (const s of subjects) {
  for (const l of s.lessonObjects) {
    lessonIndex[l.id] = l
    for (const e of l.exercises || []) exerciseIndex[e.id] = { exercise: e, lesson: l }
  }
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

// { exercise, lesson } for an exercise id, or null if it is no longer shipped.
export function getExercise(exerciseId) {
  return exerciseIndex[exerciseId] || null
}

// Every exercise id the app ships (review queries ignore cards for others).
const exerciseIds = Object.keys(exerciseIndex)
export function getExerciseIds() {
  return exerciseIds
}

export function getGlossary() {
  return glossaryData
}
