import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { areaUnder, autoYRange, compile, fmt, sampleCurve, slopeAt, texOf, ticks } from '@shared/plot.js'
import { useApp } from '@/AppContext.jsx'
import MathText from '@/components/MathText.jsx'
import { PLOT_THEMES, SliderRow, useSay, useSliders, useWidth } from '@/components/plotKit.jsx'

// The `graph` section: y = f(x) as SVG, evaluated with mathjs (offline, no
// plotting library). Optional: two more curves with a legend, marked points,
// the tangent at a point, the area under the curve, and sliders for the
// parameters of every expression. Hovering shows each curve's value. The
// maths (and the checks verify:content runs on it) is in shared/plot.js.

const PAD = { l: 40, r: 14, t: 12, b: 26 }
const HEIGHT = 320

// "=" when the rounded number is exact (up to the numerics), "≈" otherwise.
const rel = (v) => (Math.abs(Number(fmt(v)) - v) < 1e-7 * Math.max(1, Math.abs(v)) ? '=' : '\\approx')

// Hover: a vertical line and each curve's value at that x. Its own state, so
// moving the mouse redraws this layer only, not the sampled curves.
function HoverLayer({ curves, scope, domain: [xMin, xMax], W, plotW, plotH, sx, sy, COL, clip }) {
  const [hx, setHx] = useState(null)
  const onMove = (e) => {
    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const x = xMin + ((px - PAD.l) / plotW) * (xMax - xMin)
    setHx(x >= xMin && x <= xMax ? x : null)
  }
  const ys = hx === null ? [] : curves.map((c) => c.f.evaluate({ ...scope, x: hx }))
  const color = (i) => COL.series[i % COL.series.length]
  return (
    <g>
      {hx !== null && (
        <g pointerEvents="none">
          <g clipPath={`url(#${clip})`}>
            <line x1={sx(hx)} y1={PAD.t} x2={sx(hx)} y2={PAD.t + plotH} stroke={COL.axis} strokeWidth="1" strokeDasharray="3 3" />
            {ys.map((y, i) =>
              Number.isFinite(y) ? <circle key={i} cx={sx(hx)} cy={sy(y)} r="4" fill={color(i)} stroke={COL.bg} strokeWidth="2" /> : null
            )}
          </g>
          <rect x={PAD.l + 6} y={PAD.t + 6} width={70 + 62 * ys.length} height="22" rx="5" fill={COL.bg} stroke={COL.grid} />
          <text x={PAD.l + 14} y={PAD.t + 21} fill={COL.ink} fontSize="11">
            x = {fmt(hx)}
          </text>
          {ys.map((y, i) => (
            <g key={i}>
              <circle cx={PAD.l + 80 + 62 * i} cy={PAD.t + 17} r="4" fill={color(i)} />
              <text x={PAD.l + 88 + 62 * i} y={PAD.t + 21} fill={COL.ink} fontSize="11">
                {fmt(y)}
              </text>
            </g>
          ))}
        </g>
      )}
      <rect
        x={PAD.l}
        y={PAD.t}
        width={plotW}
        height={plotH}
        fill="transparent"
        onPointerMove={onMove}
        onPointerLeave={() => setHx(null)}
      />
    </g>
  )
}

export default function FunctionGraph({ section }) {
  const { t } = useTranslation()
  const { theme } = useApp()
  const say = useSay()
  const COL = PLOT_THEMES[theme] || PLOT_THEMES.dark
  const clip = `clip-${useId().replace(/:/g, '')}`
  const [ref, width] = useWidth()
  const state = useSliders(section.sliders)

  const fig = useMemo(() => {
    try {
      return {
        curves: [{ fn: section.fn, label: section.label }, ...(section.curves || [])].map((c) => ({ ...c, f: compile(c.fn) })),
        points: (section.points || []).map((p) => ({
          label: p.label,
          x: compile(p.x),
          y: p.y === undefined ? null : compile(p.y)
        })),
        tangent: section.tangent ? compile(section.tangent.x) : null,
        area: section.area ? [compile(section.area.from), compile(section.area.to)] : null
      }
    } catch {
      return null
    }
  }, [section])

  if (!fig) {
    return (
      <div className="function-graph">
        <div className="graph-error">{t('graphError', { fn: section.fn })}</div>
      </div>
    )
  }

  const scope = state.values
  const [xMin, xMax] = section.domain || [-5, 5]
  const W = Math.max(280, width)
  const H = HEIGHT
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  const samples = fig.curves.map((c) => sampleCurve(c.f, [xMin, xMax], scope))
  const [yMin, yMax] = section.yDomain || autoYRange(samples.flat().map(([, y]) => y))
  const sx = (x) => PAD.l + ((x - xMin) / (xMax - xMin)) * plotW
  const sy = (y) => PAD.t + (1 - (y - yMin) / (yMax - yMin)) * plotH
  const main = fig.curves[0].f

  // Each curve as polylines, broken where it isn't defined or jumps more than
  // the plot's height (an asymptote).
  const paths = samples.map((pts) => {
    const segs = []
    let cur = []
    let prev = null
    for (const [x, y] of pts) {
      if (!Number.isFinite(y)) {
        if (cur.length) segs.push(cur)
        cur = []
        prev = null
        continue
      }
      const py = sy(y)
      if (prev !== null && Math.abs(py - prev) > plotH) {
        if (cur.length) segs.push(cur)
        cur = []
      }
      cur.push(`${sx(x).toFixed(1)},${Math.max(PAD.t - 50, Math.min(PAD.t + plotH + 50, py)).toFixed(1)}`)
      prev = py
    }
    if (cur.length) segs.push(cur)
    return segs
  })

  // The shaded area between the main curve and the x-axis.
  let areaPath = null
  let areaValue = null
  let areaEnds = null
  if (fig.area) {
    const a = fig.area[0].evaluate(scope)
    const b = fig.area[1].evaluate(scope)
    if (Number.isFinite(a) && Number.isFinite(b)) {
      areaEnds = [a, b]
      areaValue = areaUnder(main, a, b, scope)
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      const n = 160
      const pts = [`${sx(lo).toFixed(1)},${sy(0).toFixed(1)}`]
      for (let i = 0; i <= n; i++) {
        const x = lo + ((hi - lo) * i) / n
        const y = main.evaluate({ ...scope, x })
        if (Number.isFinite(y)) pts.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`)
      }
      pts.push(`${sx(hi).toFixed(1)},${sy(0).toFixed(1)}`)
      areaPath = pts.join(' ')
    }
  }

  // The tangent to the main curve.
  let tangent = null
  if (fig.tangent) {
    const x = fig.tangent.evaluate(scope)
    const y = main.evaluate({ ...scope, x })
    const m = slopeAt(main, x, scope)
    if ([x, y, m].every(Number.isFinite)) tangent = { x, y, m }
  }

  const points = fig.points
    .map((p) => {
      const x = p.x.evaluate(scope)
      const y = p.y ? p.y.evaluate(scope) : main.evaluate({ ...scope, x })
      return { x, y, label: p.label ? say(p.label) : null }
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))

  const xticks = ticks(xMin, xMax)
  const yticks = ticks(yMin, yMax)
  const showXAxis = yMin <= 0 && yMax >= 0
  const showYAxis = xMin <= 0 && xMax >= 0
  const tick = (n) => fmt(n)

  const legend = fig.curves.length > 1 || tangent
  const color = (i) => COL.series[i % COL.series.length]

  return (
    <div className="function-graph" ref={ref}>
      {legend && (
        <div className="plot-legend">
          {fig.curves.map((c, i) => (
            <span key={i} className="plot-key">
              <svg width="22" height="10" aria-hidden="true">
                <line x1="1" y1="5" x2="21" y2="5" stroke={color(i)} strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <MathText>{c.label ? say(c.label) : `$y = ${texOf(c.fn)}$`}</MathText>
            </span>
          ))}
          {tangent && (
            <span className="plot-key">
              <svg width="22" height="10" aria-hidden="true">
                <line x1="1" y1="5" x2="21" y2="5" stroke={COL.ink} strokeWidth="2" strokeDasharray="5 3" />
              </svg>
              {t('graphTangent')}
            </span>
          )}
        </div>
      )}
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('graphAria', { fn: section.fn })}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} rx="6" />
          </clipPath>
        </defs>
        <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill={COL.bg} rx="6" />
        {xticks.map((v) => (
          <line key={`gx${v}`} x1={sx(v)} y1={PAD.t} x2={sx(v)} y2={PAD.t + plotH} stroke={COL.grid} strokeWidth="1" />
        ))}
        {yticks.map((v) => (
          <line key={`gy${v}`} x1={PAD.l} y1={sy(v)} x2={PAD.l + plotW} y2={sy(v)} stroke={COL.grid} strokeWidth="1" />
        ))}
        {showXAxis && <line x1={PAD.l} y1={sy(0)} x2={PAD.l + plotW} y2={sy(0)} stroke={COL.axis} strokeWidth="1.5" />}
        {showYAxis && <line x1={sx(0)} y1={PAD.t} x2={sx(0)} y2={PAD.t + plotH} stroke={COL.axis} strokeWidth="1.5" />}
        {xticks.map((v) => (
          <text key={`tx${v}`} x={sx(v)} y={PAD.t + plotH + 16} fill={COL.text} fontSize="10" textAnchor="middle">
            {tick(v)}
          </text>
        ))}
        {yticks.map((v) => (
          <text key={`ty${v}`} x={PAD.l - 6} y={sy(v) + 3} fill={COL.text} fontSize="10" textAnchor="end">
            {tick(v)}
          </text>
        ))}
        <g clipPath={`url(#${clip})`}>
          {areaPath && <polygon points={areaPath} fill={color(0)} fillOpacity="0.22" stroke="none" />}
          {paths.map((segs, i) =>
            segs.map((seg, k) => (
              <polyline
                key={`c${i}-${k}`}
                points={seg.join(' ')}
                fill="none"
                stroke={color(i)}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))
          )}
          {tangent && (
            <line
              x1={sx(xMin)}
              y1={sy(tangent.y + tangent.m * (xMin - tangent.x))}
              x2={sx(xMax)}
              y2={sy(tangent.y + tangent.m * (xMax - tangent.x))}
              stroke={COL.ink}
              strokeWidth="2"
              strokeDasharray="6 4"
            />
          )}
          {[...points, ...(tangent ? [{ x: tangent.x, y: tangent.y, label: null }] : [])].map((p, i) => (
            <g key={`p${i}`}>
              <circle cx={sx(p.x)} cy={sy(p.y)} r="4.5" fill={COL.ink} stroke={COL.bg} strokeWidth="2" />
              {p.label && (
                <text
                  x={sx(p.x) + 8}
                  y={sy(p.y) - 8}
                  fill={COL.ink}
                  fontSize="12"
                  fontWeight="600"
                  stroke={COL.bg}
                  strokeWidth="4"
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </g>
        <HoverLayer
          curves={fig.curves}
          scope={scope}
          domain={[xMin, xMax]}
          W={W}
          plotW={plotW}
          plotH={plotH}
          sx={sx}
          sy={sy}
          COL={COL}
          clip={clip}
        />
      </svg>
      <SliderRow sliders={section.sliders} state={state} say={say} />
      {(tangent || areaValue !== null) && (
        <div className="plot-readouts" aria-live="polite">
          {tangent && (
            <span>
              {t('graphSlope')}: <MathText>{`$f'(${fmt(tangent.x)}) ${rel(tangent.m)} ${fmt(tangent.m)}$`}</MathText>
            </span>
          )}
          {areaValue !== null && areaEnds && (
            <span>
              {t('graphArea')}:{' '}
              <MathText>{`$\\int_{${fmt(areaEnds[0])}}^{${fmt(areaEnds[1])}} f(x)\\,dx ${rel(areaValue)} ${fmt(areaValue)}$`}</MathText>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
