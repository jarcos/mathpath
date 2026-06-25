// Symbol detection shared by the renderer (per-lesson "Symbols in this lesson"
// box) and the verifier (coverage check). No dependencies so it runs in both
// the browser and Node.

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Recursively collect every string value inside a lesson object. Keeping the raw
// strings (single backslashes intact) is important so TeX commands like
// "\\sigma" are matched correctly — JSON.stringify would double the backslashes.
export function collectStrings(node, out = []) {
  if (node == null) return out
  if (typeof node === 'string') {
    out.push(node)
  } else if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out)
  } else if (typeof node === 'object') {
    for (const v of Object.values(node)) collectStrings(v, out)
  }
  return out
}

// Pre-compile matchers once per glossary. A TeX command only matches when it is
// not immediately followed by another letter, so "\in" does not fire inside
// "\int", "\infty" or "\sin".
export function buildMatchers(glossary) {
  return (glossary.symbols || []).map((sym) => {
    const regexes = (sym.tex || []).map((tok) => {
      const endsWithLetter = /[a-zA-Z]$/.test(tok)
      const boundary = endsWithLetter ? '(?![a-zA-Z])' : ''
      return new RegExp(escapeRegExp(tok) + boundary)
    })
    const uni = sym.uni || []
    return { sym, regexes, uni }
  })
}

function textHasSymbol(text, matcher) {
  for (const re of matcher.regexes) if (re.test(text)) return true
  for (const ch of matcher.uni) if (text.includes(ch)) return true
  return false
}

// Returns the glossary symbol objects that appear anywhere in the lesson,
// preserving glossary order. `matchers` is optional (built on the fly if absent).
export function getLessonSymbols(lesson, glossary, matchers) {
  const ms = matchers || buildMatchers(glossary)
  const strings = collectStrings(lesson)
  const haystack = strings.join('\n')
  const found = []
  for (const m of ms) {
    if (textHasSymbol(haystack, m)) found.push(m.sym)
  }
  return found
}
