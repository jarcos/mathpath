// Keyboard shortcuts: what counts as typing, and the back / forward keys.

export const isMac = /Mac/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent)

/** Focus is in a text field, where letters and arrows belong to the text. */
export function isTyping(el) {
  if (!el || el.nodeType !== 1) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName !== 'INPUT') return false
  return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file', 'image'].includes(el.type)
}

// The key's character, or its position when it gives none (a dead key): on a
// Spanish keyboard the keys where a US one has [ and ] give ` and +, and
// Cmd+` and Cmd++ mean something else.
const bracket = (e, char, code) => e.key === char || (e.key.length !== 1 && e.code === code)

/**
 * -1 (back), +1 (forward) or 0 for a keydown, as in a browser: Cmd+[ and Cmd+]
 * (or Cmd+← and Cmd+→ outside a text field) on a Mac, Alt+← and Alt+→
 * elsewhere. Held down, a key moves one step only.
 */
export function historyKey(e) {
  if (e.isComposing || e.shiftKey || e.repeat || typeof e.key !== 'string') return 0
  const typing = isTyping(e.target)
  if (isMac) {
    if (!e.metaKey || e.ctrlKey) return 0
    if (bracket(e, '[', 'BracketLeft')) return -1
    if (bracket(e, ']', 'BracketRight')) return 1
    if (typing || e.altKey) return 0
  } else if (!e.altKey || e.ctrlKey || e.metaKey || typing) {
    return 0
  }
  if (e.key === 'ArrowLeft') return -1
  if (e.key === 'ArrowRight') return 1
  return 0
}

/** A plain key press (no modifier), outside a text field. */
export const isPlainKey = (e) =>
  !e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing && !e.repeat && !isTyping(e.target)

/** How the shortcuts read on this computer. */
export const KEYS = isMac
  ? { back: '⌘ [', forward: '⌘ ]', run: '⌘ ↩' }
  : { back: 'Alt + ←', forward: 'Alt + →', run: 'Ctrl + Enter' }
