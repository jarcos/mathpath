import { useEffect, useRef, useState } from 'react'
import * as math from 'mathjs'
import { useApp } from '@/AppContext.jsx'

// Lightweight, dependency-free SVG plotter for y = f(x).
// Uses mathjs (already a project dependency) to evaluate the function, so it
// works fully offline and avoids native/d3 rendering issues.
const THEMES = {
  dark: { bg: '#1d2237', grid: '#2c3350', axis: '#9aa1c0', curve: '#6c8cff', text: '#9aa1c0' },
  light: { bg: '#ffffff', grid: '#e2e8f4', axis: '#64748b', curve: '#3a5bd9', text: '#5b6480' }
}

function niceStep(range) {
  // A "nice" tick step (1, 2, 5 × 10ⁿ) for the given span.
  const raw = range / 8
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  const step = n >= 5 ? 5 : n >= 2 ? 2 : 1
  return step * pow
}

export default function FunctionGraph({ fn, domain = [-5, 5], height = 320 }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(640)
  const { theme } = useApp()
  const COL = THEMES[theme] || THEMES.dark

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || 640)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [xMin, xMax] = domain
  const pad = { l: 38, r: 14, t: 12, b: 26 }
  const W = Math.max(280, width)
  const H = height
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b

  // Sample the function across the domain.
  let compiled = null
  let parseError = false
  try {
    compiled = math.compile(fn)
  } catch {
    parseError = true
  }

  const N = 480
  const pts = []
  if (compiled) {
    for (let i = 0; i <= N; i++) {
      const x = xMin + ((xMax - xMin) * i) / N
      let y = NaN
      try {
        const v = compiled.evaluate({ x })
        if (typeof v === 'number' && Number.isFinite(v)) y = v
      } catch {
        /* point outside domain */
      }
      pts.push({ x, y })
    }
  }

  // Choose a y-range from the 4th–96th percentile so asymptotes don't flatten
  // the interesting part of the curve.
  const ys = pts.map((p) => p.y).filter((y) => Number.isFinite(y)).sort((a, b) => a - b)
  let yMin = -5
  let yMax = 5
  if (ys.length > 1) {
    const lo = ys[Math.floor(ys.length * 0.04)]
    const hi = ys[Math.floor(ys.length * 0.96)]
    yMin = Math.min(lo, 0)
    yMax = Math.max(hi, 0)
    if (yMin === yMax) {
      yMin -= 1
      yMax += 1
    }
    const padY = (yMax - yMin) * 0.1
    yMin -= padY
    yMax += padY
  }

  const sx = (x) => pad.l + ((x - xMin) / (xMax - xMin)) * plotW
  const sy = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * plotH

  // Build the curve as multiple polyline segments, breaking at gaps/asymptotes.
  const segments = []
  let cur = []
  let prevSY = null
  for (const p of pts) {
    if (!Number.isFinite(p.y)) {
      if (cur.length) segments.push(cur)
      cur = []
      prevSY = null
      continue
    }
    const py = sy(p.y)
    // Break the line when it jumps more than the plot height (asymptote).
    if (prevSY !== null && Math.abs(py - prevSY) > plotH) {
      if (cur.length) segments.push(cur)
      cur = []
    }
    cur.push(`${sx(p.x).toFixed(1)},${Math.max(pad.t - 50, Math.min(pad.t + plotH + 50, py)).toFixed(1)}`)
    prevSY = py
  }
  if (cur.length) segments.push(cur)

  // Gridlines / ticks.
  const xStep = niceStep(xMax - xMin)
  const yStep = niceStep(yMax - yMin)
  const xticks = []
  for (let t = Math.ceil(xMin / xStep) * xStep; t <= xMax + 1e-9; t += xStep) xticks.push(t)
  const yticks = []
  for (let t = Math.ceil(yMin / yStep) * yStep; t <= yMax + 1e-9; t += yStep) yticks.push(t)

  const showXAxis = yMin <= 0 && yMax >= 0
  const showYAxis = xMin <= 0 && xMax >= 0
  const fmt = (n) => (Math.abs(n) < 1e-9 ? '0' : parseFloat(n.toFixed(2)).toString())

  return (
    <div className="function-graph" ref={ref}>
      {parseError ? (
        <div className="graph-error">Could not plot: {fn}</div>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Graph of ${fn}`}>
          <rect x={pad.l} y={pad.t} width={plotW} height={plotH} fill={COL.bg} rx="6" />
          {/* grid */}
          {xticks.map((t, i) => (
            <line key={`gx${i}`} x1={sx(t)} y1={pad.t} x2={sx(t)} y2={pad.t + plotH} stroke={COL.grid} strokeWidth="1" />
          ))}
          {yticks.map((t, i) => (
            <line key={`gy${i}`} x1={pad.l} y1={sy(t)} x2={pad.l + plotW} y2={sy(t)} stroke={COL.grid} strokeWidth="1" />
          ))}
          {/* axes */}
          {showXAxis && <line x1={pad.l} y1={sy(0)} x2={pad.l + plotW} y2={sy(0)} stroke={COL.axis} strokeWidth="1.5" />}
          {showYAxis && <line x1={sx(0)} y1={pad.t} x2={sx(0)} y2={pad.t + plotH} stroke={COL.axis} strokeWidth="1.5" />}
          {/* tick labels */}
          {xticks.map((t, i) => (
            <text key={`tx${i}`} x={sx(t)} y={pad.t + plotH + 16} fill={COL.text} fontSize="10" textAnchor="middle">{fmt(t)}</text>
          ))}
          {yticks.map((t, i) => (
            <text key={`ty${i}`} x={pad.l - 6} y={sy(t) + 3} fill={COL.text} fontSize="10" textAnchor="end">{fmt(t)}</text>
          ))}
          {/* curve */}
          {segments.map((seg, i) => (
            <polyline key={`s${i}`} points={seg.join(' ')} fill="none" stroke={COL.curve} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>
      )}
    </div>
  )
}
