import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fmt, sliderDefaults } from '@shared/plot.js'
import { useApp } from '@/AppContext.jsx'
import MathText from '@/components/MathText.jsx'

// What the interactive figures (FunctionGraph, VectorPlane) share: colors,
// the slider state, the slider row and the width of their box.

// The three series colors are validated (dataviz validator, all pairs, CVD
// and contrast) against each theme's panel: blue, orange, aqua. `ink` is for
// marks that aren't a series (points, the tangent, vectors).
export const PLOT_THEMES = {
  dark: {
    bg: '#1d2237',
    grid: '#2c3350',
    axis: '#9aa1c0',
    text: '#9aa1c0',
    ink: '#e7e9f3',
    series: ['#6584f5', '#d95926', '#199e70']
  },
  light: {
    bg: '#ffffff',
    grid: '#e2e8f4',
    axis: '#64748b',
    text: '#5b6480',
    ink: '#1a2036',
    series: ['#3a5bd9', '#e2612c', '#13946a']
  }
}

/**
 * A figure's text: a label is one plain string for both languages ("v",
 * "$a$") or {en, es}. loc() alone would turn a plain string into "".
 */
export function useSay() {
  const { loc } = useApp()
  return (v) => (typeof v === 'string' ? v : v ? loc(v) : '')
}

/** The width of an element, kept up to date. */
export function useWidth(fallback = 640) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || fallback)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fallback])
  return [ref, width]
}

/** The sliders' values, and a reset to where they started. */
export function useSliders(sliders = []) {
  const [values, setValues] = useState(() => sliderDefaults(sliders))
  const set = (name, v) => setValues((old) => ({ ...old, [name]: v }))
  const start = sliderDefaults(sliders)
  const changed = sliders.some((s) => values[s.name] !== start[s.name])
  return { values, set, reset: () => setValues(start), changed }
}

/** One labelled range input with its value. */
export function Slider({ label, min, max, step, value, onChange, shown }) {
  return (
    <label className="plot-slider">
      <span className="plot-slider-label">
        <MathText>{label}</MathText>
      </span>
      <input
        type="range"
        className="no-print"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="plot-slider-value">{shown ?? fmt(value, 3)}</span>
    </label>
  )
}

/** The content's sliders, then any extra controls and a reset button. */
export function SliderRow({ sliders = [], state, say, children }) {
  const { t } = useTranslation()
  if (!sliders.length && !children) return null
  return (
    <div className="plot-controls">
      {sliders.map((s) => (
        <Slider
          key={s.name}
          label={s.label ? say(s.label) : `$${s.name}$`}
          min={s.min}
          max={s.max}
          step={s.step}
          value={state.values[s.name]}
          onChange={(v) => state.set(s.name, v)}
        />
      ))}
      {children}
      {state.changed && (
        <button type="button" className="link subtle no-print plot-reset" onClick={state.reset}>
          {t('plotReset')}
        </button>
      )}
    </div>
  )
}

/** An arrow from a to b (screen coordinates), its head drawn as a triangle. */
export function Arrow({ from, to, color, width = 2.5, dashed = false, head = 9 }) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len = Math.hypot(dx, dy)
  if (len < 0.5) return <circle cx={to[0]} cy={to[1]} r={3} fill={color} />
  const ux = dx / len
  const uy = dy / len
  const h = Math.min(head, len * 0.6)
  const base = [to[0] - ux * h, to[1] - uy * h]
  const wing = h * 0.5
  const pts = [to, [base[0] - uy * wing, base[1] + ux * wing], [base[0] + uy * wing, base[1] - ux * wing]]
  return (
    <g>
      <line
        x1={from[0]}
        y1={from[1]}
        x2={base[0]}
        y2={base[1]}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dashed ? '5 4' : undefined}
      />
      <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={color} />
    </g>
  )
}
