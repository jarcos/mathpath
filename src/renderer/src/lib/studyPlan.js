import { useCallback, useEffect, useState } from 'react'
import { getExerciseIds, getLessonsNeeded, getLesson, getSubject } from '@content/index.js'
import { REVIEW_MINUTES } from '@shared/planner.js'
import { useApp } from '@/AppContext.jsx'

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

/**
 * Minutes studied today: lessons completed today (not by a placement test) at
 * their estimated time, plus answered reviews. Re-read whenever progress or
 * the learning state changes (which also happens when the window regains focus).
 * Null until first read.
 */
export function useTodayMinutes() {
  const { completed, learning } = useApp()
  const [minutes, setMinutes] = useState(null)
  useEffect(() => {
    let active = true
    window.api.learning
      ?.today(getExerciseIds())
      .then(({ lessons, reviews }) => {
        if (!active) return
        const lessonMinutes = lessons.reduce((sum, id) => sum + (getLesson(id)?.estimatedMinutes || 0), 0)
        setMinutes(lessonMinutes + reviews * REVIEW_MINUTES)
      })
      .catch(() => active && setMinutes(0))
    return () => {
      active = false
    }
  }, [completed, learning])
  return minutes
}
