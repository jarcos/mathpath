import katex from 'katex'

// Renders a string that may mix prose, **bold**, `inline code`, inline math
// $...$ and display math $$...$$. Used for all lesson prose and prompts.

// Private-use sentinel characters that won't collide with real text/numbers.
const PH_OPEN = String.fromCharCode(0xe000)
const PH_CLOSE = String.fromCharCode(0xe001)

// *italic*: a star with no letter, digit or formula just outside it and text
// just inside, so products in prose (2*3, a*r^k, $a$*$b$) are left alone.
const ITALIC = new RegExp(
  `(^|[^*\\p{L}\\p{N}${PH_CLOSE}])\\*(?![\\s*])([^*\\n]+?)(?<![\\s*])\\*(?![*\\p{L}\\p{N}${PH_OPEN}])`,
  'gu'
)

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function toHtml(input) {
  if (!input) return ''
  const tokens = []
  const hold = (html) => {
    tokens.push(html)
    return PH_OPEN + (tokens.length - 1) + PH_CLOSE
  }
  // 1) Inline code is shown as typed: never maths, bold or italic.
  let s = input.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code class="inline-code">${escapeHtml(code)}</code>`))
  // 2) Pull math out into placeholders so bold (**...**) can span across math.
  s = s.replace(/(\$\$[^$]*\$\$|\$[^$]*\$)/g, (m) => {
    let html
    try {
      if (m.startsWith('$$')) html = katex.renderToString(m.slice(2, -2), { displayMode: true, throwOnError: false })
      else html = katex.renderToString(m.slice(1, -1), { displayMode: false, throwOnError: false })
    } catch {
      html = escapeHtml(m)
    }
    return hold(html)
  })
  // 3) Escape the prose, then apply **bold** and *italic* (either may wrap a
  // math placeholder).
  s = escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(ITALIC, '$1<em>$2</em>')
  // 4) Restore the code and the rendered math.
  return s.replace(new RegExp(PH_OPEN + '(\\d+)' + PH_CLOSE, 'g'), (_, i) => tokens[+i])
}

export default function MathText({ children, tex, display = false, className = '' }) {
  let html
  if (tex !== undefined) {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false })
  } else {
    html = toHtml(children)
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
