/**
 * What the learner can take away (pure, shared by the renderer and the
 * tests): a lesson's display formulas for the subject sheet, and all the
 * notes as one Markdown file.
 */

const at = (obj, lang) => (obj && typeof obj === 'object' ? obj[lang] || obj.en || '' : String(obj || ''))

/** The display formulas ($$…$$) of a lesson's text, in order, without repeats. */
export function displayFormulas(lesson, lang = 'en') {
  const out = []
  for (const s of lesson.sections || []) {
    if (s.type !== 'prose' && s.type !== 'example') continue
    for (const m of at(s.content, lang).matchAll(/\$\$([\s\S]+?)\$\$/g)) {
      const tex = m[1].trim()
      if (tex && !out.includes(tex)) out.push(tex)
    }
  }
  return out
}

/**
 * The notes as Markdown: a title, then each subject (in course order) with its
 * lessons that have a note or a bookmark (★). `subjects` have `lessonObjects`;
 * `notes` maps a lesson id to { body, bookmarked }; `text` gives the
 * translated `title`, `exported` (with the date already in it) and `bookmarked`.
 */
export function notesMarkdown(subjects, notes, lang, text) {
  const lines = [`# ${text.title}`, '', `_${text.exported}_`, '']
  for (const subject of subjects) {
    const lessons = (subject.lessonObjects || []).filter((l) => notes.has(l.id))
    if (!lessons.length) continue
    lines.push(`## ${at(subject.name, lang)}`, '')
    for (const lesson of lessons) {
      const n = notes.get(lesson.id)
      lines.push(`### ${lesson.order}. ${at(lesson.title, lang)}${n.bookmarked ? ` ★` : ''}`, '')
      if (n.body.trim()) lines.push(n.body.trim(), '')
      else lines.push(`_${text.bookmarked}_`, '')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}
