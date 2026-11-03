import { useCallback, useEffect, useState } from 'react'
import { getLessonsNeeded, getLesson, getSubject } from '@content/index.js'

// A stored goal, or null if missing, broken, or about a subject that is no
// longer shipped (or has no lessons). Bad minutes fall back to 30.
function parseGoal(value) {
  let g = null
  try {
    g = value ? JSON.parse(value) : null
  } catch {
    return null
  }
  if (!g || !getSubject(g.subjectId)?.lessonObjects.length) return null
  const minutes = Number(g.minutes)
  return { subjectId: g.subjectId, minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 30 }
}

// The learner's study goal — finish a subject, at N minutes a day — kept in
// the `studyGoal` setting as JSON.
export function useStudyGoal() {
  const [goal, setGoal] = useState(undefined) // undefined while loading, null if none
  useEffect(() => {
    let active = true
    window.api.settings
      .get('studyGoal')
      .then((v) => {
        if (active) setGoal(parseGoal(v))
      })
      .catch(() => active && setGoal(null))
    return () => {
      active = false
    }
  }, [])
  const saveGoal = useCallback((g) => {
    setGoal(g)
    window.api.settings.set('studyGoal', g ? JSON.stringify(g) : '')
  }, [])
  return [goal, saveGoal]
}

/** The lessons still to study for a goal, in study order, as planner input. */
export function remainingLessons(goal, completed) {
  const subject = getSubject(goal.subjectId)
  const target = subject?.lessonObjects.at(-1)
  if (!target) return []
  return getLessonsNeeded(target.id)
    .filter((id) => !completed.has(id))
    .map((id) => ({ id, minutes: getLesson(id).estimatedMinutes }))
}
