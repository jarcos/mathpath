import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fmt, sliderDefaults, ticks } from '@shared/plot.js'
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

// ── Heat colors ─────────────────────────────────────────────────────────────
// Sequential (one hue, near the panel → strong) for values ≥ 0; diverging
// (red ← neutral gray → blue, centered on 0) when some are negative. Mixed in
// OKLab so equal steps look equal. Per theme, as the dataviz rules ask.
const HEAT = {
  light: { low: '#eef4fd', high: '#0d366b', neg: '#c2302f', mid: '#f0efec', pos: '#1c5cab', ink: '#1a2036' },
  dark: { low: '#252d4a', high: '#cde2fb', neg: '#e66767', mid: '#3a3f57', pos: '#3987e5', ink: '#e7e9f3' }
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
function oklab(hex) {
  const [r, g, b] = hexRgb(hex).map(toLin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function fromOklab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255).toString(16).padStart(2, '0')).join('')
}
const mix = (a, b, t) => {
  const p = oklab(a)
  const q = oklab(b)
  return fromOklab(p.map((v, i) => v + (q[i] - v) * t))
}
const luminance = (hex) => {
  const [r, g, b] = hexRgb(hex).map(toLin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/**
 * A color scale for a grid of numbers: value → { bg, fg } (fg is whichever of
 * black or white reads better on bg). `values` sets the range.
 */
export function heatScale(values, theme) {
  const H = HEAT[theme] || HEAT.dark
  const finiteVals = values.filter(Number.isFinite)
  const lo = Math.min(...finiteVals)
  const hi = Math.max(...finiteVals)
  const diverging = lo < 0
  const span = diverging ? Math.max(Math.abs(lo), Math.abs(hi)) || 1 : hi - lo || 1
  return (v) => {
    if (!Number.isFinite(v)) return { bg: H.mid, fg: H.ink }
    const bg = diverging ? (v < 0 ? mix(H.mid, H.neg, -v / span) : mix(H.mid, H.pos, v / span)) : mix(H.low, H.high, (v - lo) / span)
    const fg = contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#111827' : '#ffffff'
    return { bg, fg }
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

export const PAD = { l: 44, r: 14, t: 12, b: 28 }

/** Screen mapping for a plot box: x range [x0, x1], y range [y0, y1]. */
export function frame(W, H, [x0, x1], [y0, y1]) {
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  return {
    plotW,
    plotH,
    sx: (x) => PAD.l + ((x - x0) / (x1 - x0)) * plotW,
    sy: (y) => PAD.t + (1 - (y - y0) / (y1 - y0)) * plotH
  }
}

/** Background, grid, axes and tick labels of a plot box. */
export function Axes({ COL, f, xr, yr, xTicks, yTicks, xLabel, yLabel, W, H }) {
  const xt = xTicks ?? ticks(xr[0], xr[1])
  const yt = yTicks ?? ticks(yr[0], yr[1])
  return (
    <g>
      <rect x={PAD.l} y={PAD.t} width={f.plotW} height={f.plotH} fill={COL.bg} rx="6" />
      {xt.map((v) => (
        <line key={`gx${v}`} x1={f.sx(v)} y1={PAD.t} x2={f.sx(v)} y2={PAD.t + f.plotH} stroke={COL.grid} />
      ))}
      {yt.map((v) => (
        <line key={`gy${v}`} x1={PAD.l} y1={f.sy(v)} x2={PAD.l + f.plotW} y2={f.sy(v)} stroke={COL.grid} />
      ))}
      {yr[0] <= 0 && yr[1] >= 0 && <line x1={PAD.l} y1={f.sy(0)} x2={PAD.l + f.plotW} y2={f.sy(0)} stroke={COL.axis} strokeWidth="1.5" />}
      {xr[0] <= 0 && xr[1] >= 0 && <line x1={f.sx(0)} y1={PAD.t} x2={f.sx(0)} y2={PAD.t + f.plotH} stroke={COL.axis} strokeWidth="1.5" />}
      {xt.map((v) => (
        <text key={`tx${v}`} x={f.sx(v)} y={PAD.t + f.plotH + 16} fill={COL.text} fontSize="10" textAnchor="middle">
          {fmt(v)}
        </text>
      ))}
      {yt.map((v) => (
        <text key={`ty${v}`} x={PAD.l - 6} y={f.sy(v) + 3} fill={COL.text} fontSize="10" textAnchor="end">
          {fmt(v, 3)}
        </text>
      ))}
      {xLabel && (
        <text x={PAD.l + f.plotW} y={H - 2} fill={COL.text} fontSize="11" textAnchor="end">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text x={4} y={PAD.t + 10} fill={COL.text} fontSize="11">
          {yLabel}
        </text>
      )}
    </g>
  )
}

/** A hover box in the plot's top-left corner: lines of text, colored dots optional. */
export function HoverBox({ COL, lines }) {
  const w = Math.max(...lines.map((l) => l.text.length)) * 6.4 + 28
  return (
    <g pointerEvents="none">
      <rect x={PAD.l + 6} y={PAD.t + 6} width={w} height={8 + 16 * lines.length} rx="5" fill={COL.bg} stroke={COL.grid} />
      {lines.map((l, i) => (
        <g key={i}>
          {l.color && <circle cx={PAD.l + 15} cy={PAD.t + 17 + 16 * i} r="4" fill={l.color} />}
          <text x={PAD.l + (l.color ? 24 : 14)} y={PAD.t + 21 + 16 * i} fill={COL.ink} fontSize="11">
            {l.text}
          </text>
        </g>
      ))}
    </g>
  )
}

/** A short legend: [{ color, label, kind: 'line' | 'dash' | 'dot' | 'ring' | 'square' | 'bar' }]. */
export function Legend({ items, COL }) {
  return (
    <div className="plot-legend">
      {items.map((it, i) => (
        <span key={i} className="plot-key">
          <svg width="22" height="12" aria-hidden="true">
            {it.kind === 'dot' && <circle cx="11" cy="6" r="4.5" fill={it.color} />}
            {it.kind === 'ring' && <circle cx="11" cy="6" r="4" fill="none" stroke={it.color} strokeWidth="2" />}
            {it.kind === 'square' && <rect x="6.5" y="1.5" width="9" height="9" fill={it.color} />}
            {it.kind === 'bar' && <rect x="5" y="1" width="12" height="10" rx="2" fill={it.color} />}
            {(it.kind === 'line' || it.kind === 'dash' || !it.kind) && (
              <line x1="1" y1="6" x2="21" y2="6" stroke={it.color} strokeWidth="2.5" strokeDasharray={it.kind === 'dash' ? '5 3' : undefined} />
            )}
          </svg>
          <MathText>{it.label}</MathText>
        </span>
      ))}
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
