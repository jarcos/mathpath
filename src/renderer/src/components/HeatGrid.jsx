import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { compile, fmt } from '@shared/plot.js'
import { attention, convolve, dot, pool, windowOf } from '@shared/grid.js'
import { useApp } from '@/AppContext.jsx'
import MathText from '@/components/MathText.jsx'
import { SliderRow, heatScale, useSay, useSliders } from '@/components/plotKit.jsx'

// The `heatmap` section: a small grid of numbers and what a layer does to it
// (convolution with one of a few kernels, max / average pooling, or the
// attention weights of a few tokens). The learner picks an output cell, with
// the mouse or the arrow keys, and sees its arithmetic (shared/grid.js).

// A kernel weight as TeX: simple fractions (1/9, −1/4…) as fractions.
function texNum(v) {
  if (Number.isInteger(v)) return String(v)
  for (let d = 2; d <= 16; d++) {
    const n = v * d
    if (Math.abs(n - Math.round(n)) < 1e-9) return `${n < 0 ? '-' : ''}\\tfrac{${Math.abs(Math.round(n))}}{${d}}`
  }
  return fmt(v, 3)
}
const paren = (s) => (s.startsWith('-') ? `(${s})` : s)

// One grid of numbers. With onPick, its cells are buttons (arrow keys move).
function Grid({ title, values, scale, digits = 2, mark, picked, onPick, rows, cols, masked, label }) {
  const h = values.length
  const w = values[0].length
  const onKey = (e) => {
    if (!onPick || !picked) return
    const [i, j] = picked
    const next = {
      ArrowUp: [i - 1, j],
      ArrowDown: [i + 1, j],
      ArrowLeft: [i, j - 1],
      ArrowRight: [i, j + 1],
      Home: [i, 0],
      End: [i, w - 1]
    }[e.key]
    if (!next) return
    e.preventDefault()
    const [a, b] = [Math.max(0, Math.min(h - 1, next[0])), Math.max(0, Math.min(w - 1, next[1]))]
    onPick([a, b])
    // React clears e.currentTarget once the handler returns: keep the grid.
    const grid = e.currentTarget
    requestAnimationFrame(() => grid.querySelector(`[data-cell="${a}-${b}"]`)?.focus())
  }
  return (
    <div className="heat-block">
      <div className="heat-title muted small">{title}</div>
      <div
        className="heat-grid"
        role={onPick ? 'grid' : 'table'}
        aria-label={label || title}
        style={{ gridTemplateColumns: `${rows ? 'auto ' : ''}repeat(${w}, minmax(2.4em, 1fr))` }}
        onKeyDown={onKey}
      >
        {cols && (
          <div className="heat-row" role="row">
            {rows && <span role="columnheader" />}
            {cols.map((c, j) => (
              <span key={`c${j}`} role="columnheader" className="heat-head small">
                {c}
              </span>
            ))}
          </div>
        )}
        {values.map((row, i) => (
          <div key={i} className="heat-row" role="row">
            {rows && (
              <span role="rowheader" className="heat-head small heat-rowhead">
                {rows[i]}
              </span>
            )}
            {row.map((v, j) => {
              const off = masked?.(i, j)
              const { bg, fg } = off ? { bg: 'transparent', fg: 'inherit' } : scale(v)
              const isPicked = picked && picked[0] === i && picked[1] === j
              const cls = `heat-cell${mark?.(i, j) ? ' marked' : ''}${isPicked ? ' picked' : ''}${off ? ' masked' : ''}`
              const text = off ? '—' : fmt(v, digits)
              const name = `${rows ? rows[i] : i + 1}, ${cols ? cols[j] : j + 1}: ${text}`
              return onPick ? (
                <button
                  key={j}
                  type="button"
                  role="gridcell"
                  data-cell={`${i}-${j}`}
                  className={cls}
                  style={off ? undefined : { background: bg, color: fg }}
                  tabIndex={isPicked ? 0 : -1}
                  aria-selected={isPicked}
                  aria-label={name}
                  onClick={() => onPick([i, j])}
                >
                  {text}
                </button>
              ) : (
                <span key={j} role="cell" className={cls} style={off ? undefined : { background: bg, color: fg }} aria-label={name}>
                  {text}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// The output cell with the largest |value|: a telling place to start.
function argmaxAbs(m, skip) {
  let best = [0, 0]
  let bv = -Infinity
  m.forEach((row, i) =>
    row.forEach((v, j) => {
      if (skip?.(i, j)) return
      if (Math.abs(v) > bv) {
        bv = Math.abs(v)
        best = [i, j]
      }
    })
  )
  return best
}

function Choice({ options, value, onChange, label }) {
  return (
    <div className="heat-choice" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} className={value === i ? 'on' : ''} onClick={() => onChange(i)}>
          <MathText>{o}</MathText>
        </button>
      ))}
    </div>
  )
}

export default function HeatGrid({ section }) {
  const { t } = useTranslation()
  const { theme } = useApp()
  const say = useSay()
  const state = useSliders(section.sliders)
  const [kernelIdx, setKernelIdx] = useState(0)
  const [poolIdx, setPoolIdx] = useState(0)
  const [picked, setPicked] = useState(null)

  const mode = section.mode
  const temperature = section.temperature === undefined ? 1 : compile(section.temperature).evaluate(state.values)

  const result = useMemo(() => {
    if (mode === 'conv') return convolve(section.input, section.kernels[kernelIdx].kernel)
    if (mode === 'pool') return pool(section.input, section.size, poolIdx === 0 ? 'max' : 'avg')
    return attention(section.q, section.k, temperature, !!section.causal)
  }, [mode, section, kernelIdx, poolIdx, temperature])

  if (mode === 'attention') {
    const tokens = section.tokens.map(say)
    const masked = (i, j) => !!section.causal && j > i
    const { weights, scores } = result
    const pick = picked || argmaxAbs(weights, masked)
    const i = pick[0]
    const d = section.q[0].length
    const scale = heatScale([0, 1], theme)
    const visible = weights[i].map((_, j) => j).filter((j) => !masked(i, j))
    const tempTex = section.temperature === undefined ? '' : `\\,T`
    return (
      <div className="heat-figure">
        <Grid
          title={t('heatWeights')}
          values={weights}
          scale={scale}
          digits={2}
          rows={tokens}
          cols={tokens}
          masked={masked}
          picked={pick}
          onPick={setPicked}
          label={t('heatWeights')}
        />
        <SliderRow sliders={section.sliders} state={state} say={say} />
        <div className="plot-readouts">
          <span>
            {t('heatRow', { token: tokens[i] })}{' '}
            <MathText>{`$s_j = \\dfrac{q_{${i + 1}}\\cdot k_j}{\\sqrt{${d}}${tempTex}}$`}</MathText>:{' '}
            <MathText>
              {'$' + visible.map((j) => `${fmt(dot(section.q[i], section.k[j]), 2)}/(${fmt(Math.sqrt(d), 3)}${section.temperature === undefined ? '' : `\\cdot ${fmt(temperature, 2)}`}) = ${fmt(scores[i][j], 3)}`).join(',\\; ') + '$'}
            </MathText>
          </span>
          <span>
            {t('heatSoftmax')}: <MathText>{'$' + visible.map((j) => `${fmt(weights[i][j], 3)}`).join(',\\; ') + '$'}</MathText>{' '}
            ({t('heatSumOne')})
            {section.causal && i < tokens.length - 1 && <span className="muted"> · {t('heatMasked')}</span>}
          </span>
        </div>
      </div>
    )
  }

  const input = section.input
  const out = result
  const pick = picked && picked[0] < out.length && picked[1] < out[0].length ? picked : argmaxAbs(out)
  const [pi, pj] = pick
  const kernel = mode === 'conv' ? section.kernels[kernelIdx].kernel : null
  const kh = kernel ? kernel.length : section.size
  const kw = kernel ? kernel[0].length : section.size
  const win = new Set(windowOf(pi, pj, kh, kw, mode === 'pool' ? section.size : 1).map(([r, c]) => `${r}-${c}`))
  const inScale = heatScale(input.flat(), theme)
  const outScale = heatScale(out.flat(), theme)

  let sumTex
  if (mode === 'conv') {
    const terms = []
    windowOf(pi, pj, kh, kw).forEach(([r, c], n) => {
      const kv = kernel[Math.floor(n / kw)][n % kw]
      if (kv !== 0) terms.push(`${paren(fmt(input[r][c], 2))}\\cdot ${paren(texNum(kv))}`)
    })
    sumTex = `$${terms.join(' + ')} = ${fmt(out[pi][pj], 3)}$`
  } else {
    const vals = windowOf(pi, pj, kh, kw, section.size).map(([r, c]) => fmt(input[r][c], 2))
    sumTex = poolIdx === 0 ? `$\\max(${vals.join(', ')}) = ${fmt(out[pi][pj], 3)}$` : `$\\tfrac{${vals.join(' + ')}}{${vals.length}} = ${fmt(out[pi][pj], 3)}$`
  }

  return (
    <div className="heat-figure">
      {mode === 'conv' && section.kernels.length > 1 && (
        <Choice options={section.kernels.map((k) => say(k.label))} value={kernelIdx} onChange={setKernelIdx} label={t('heatKernel')} />
      )}
      {mode === 'pool' && <Choice options={[t('heatMax'), t('heatAvg')]} value={poolIdx} onChange={setPoolIdx} label={t('heatPool')} />}
      <div className="heat-row-of-grids">
        <Grid title={t('heatInput')} values={input} scale={inScale} mark={(r, c) => win.has(`${r}-${c}`)} />
        {kernel && <Grid title={`${t('heatKernel')}: ${say(section.kernels[kernelIdx].label).replace(/\$/g, '')}`} values={kernel} scale={heatScale(kernel.flat(), theme)} digits={2} />}
        <Grid title={t('heatOutput')} values={out} scale={outScale} picked={pick} onPick={setPicked} />
      </div>
      <div className="plot-readouts">
        <span className="muted small no-print">{t('heatPick')}</span>
        <span>
          {t('heatCell', { r: pi + 1, c: pj + 1 })}: <MathText>{sumTex}</MathText>
          {mode === 'conv' && kernel.flat().some((v) => v === 0) && <span className="muted small"> ({t('heatZeros')})</span>}
        </span>
      </div>
    </div>
  )
}
