// The curriculum as a graph of lesson prerequisites, shared by the app (map,
// placement, planner) and verify:content. A lesson needs:
//   - the previous lesson of its subject,
//   - the lessons its "Before this lesson" box (prereq section) links to,
//   - for a subject's first lesson, the last lesson of every subject in its
//     `requires` (subjects.json).
// Prerequisites always come earlier in the curriculum order (subjects in
// subjects.json order, lessons by `order`), which verify:content enforces, so
// sorting by that order is a valid study order and the graph has no cycles.

/**
 * @param subjects [{ id, requires?, lessons: [{ id, sections }] }], each
 *   subject's lessons already sorted by `order`, subjects in curriculum order
 * @returns {{ prereqs: Map<string, string[]>, rank: Map<string, number> }}
 */
export function buildCurriculum(subjects) {
  const prereqs = new Map()
  const rank = new Map()
  const lastOf = new Map(subjects.map((s) => [s.id, s.lessons.at(-1)?.id]))
  for (const s of subjects) {
    s.lessons.forEach((l, i) => {
      rank.set(l.id, rank.size)
      const need = new Set()
      if (i > 0) need.add(s.lessons[i - 1].id)
      else for (const r of s.requires || []) if (lastOf.get(r)) need.add(lastOf.get(r))
      for (const sec of l.sections || []) {
        if (sec.type === 'prereq') for (const id of sec.lessons || []) need.add(id)
      }
      need.delete(l.id)
      prereqs.set(l.id, [...need])
    })
  }
  return { prereqs, rank }
}

/** Problems with the graph: unknown lessons/subjects, prerequisites that come later. */
export function checkCurriculum(subjects, { prereqs, rank }) {
  const problems = []
  const subjectIds = new Set(subjects.map((s) => s.id))
  for (const s of subjects) {
    for (const r of s.requires || []) {
      if (!subjectIds.has(r)) problems.push(`${s.id}: requires unknown subject "${r}"`)
    }
  }
  for (const [id, needs] of prereqs) {
    for (const p of needs) {
      if (!rank.has(p)) problems.push(`${id}: prerequisite "${p}" is not a lesson in the curriculum`)
      else if (rank.get(p) > rank.get(id)) problems.push(`${id}: prerequisite "${p}" comes later in the curriculum`)
    }
  }
  return problems
}

/** Every lesson needed to reach `target` (itself included), in study order. */
export function lessonsNeeded({ prereqs, rank }, target) {
  const need = new Set()
  const stack = [target]
  while (stack.length) {
    const id = stack.pop()
    if (need.has(id) || !rank.has(id)) continue
    need.add(id)
    stack.push(...(prereqs.get(id) || []))
  }
  return [...need].sort((a, b) => rank.get(a) - rank.get(b))
}

/** Lessons that list `lessonId` as a direct prerequisite. */
export function dependentsOf({ prereqs }, lessonId) {
  const out = []
  for (const [id, needs] of prereqs) if (needs.includes(lessonId)) out.push(id)
  return out
}
