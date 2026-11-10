import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { compile, fmt } from '@shared/plot.js'
import { boundaryAccuracy, evalPoints, evalPoly, linearFit, mseOf, pca2, polyFit } from '@shared/fit.js'
import { useApp } from '@/AppContext.jsx'
import MathText from '@/components/MathText.jsx'
import { Arrow, Axes, HoverBox, Legend, PAD, PLOT_THEMES, SliderRow, frame, useSay, useSliders, useWidth } from '@/components/plotKit.jsx'

// The `scatter` section: data points (one or two classes, plus held-out test
// points) with a least-squares line or polynomial, the principal axes, a
// learner's own line with its residuals, or a decision boundary. Every number
// in the readouts is computed (shared/fit.js).

const HEIGHT = 340

// The part of the box [x0,x1]×[y0,y1] where a·x + b·y + c has a sign (> 0 or < 0).
function halfPlane(a, b, c, [x0, x1], [y0, y1], sign) {
  let poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  const val = ([x, y]) => sign * (a * x + b * y + c)
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i]
    const Q = poly[(i + 1) % poly.length]
    const vp = val(P)
    const vq = val(Q)
    if (vp >= 0) out.push(P)
    if ((vp >= 0) !== (vq >= 0)) {
      const t = vp / (vp - vq)
      out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])])
    }
  }
  poly = out
  return poly
}

const lineTex = (slope, intercept) => {
  const b = fmt(intercept, 2)
  return `y = ${fmt(slope, 2)}x ${b.startsWith('-') ? '- ' + b.slice(1) : '+ ' + b}`
}

export default function ScatterFit({ section }) {
  const { t } = useTranslation()
  const { theme } = useApp()
  const say = useSay()
  const COL = PLOT_THEMES[theme] || PLOT_THEMES.dark
  const clip = `clip-${useId().replace(/:/g, '')}`
  const [ref, width] = useWidth()
  const state = useSliders(section.sliders)
  const [hover, setHover] = useState(null)

  const scope = state.values
  const pts = evalPoints(section.points, scope)
  const pts2 = evalPoints(section.points2, scope)
  const test = evalPoints(section.test, scope)
  const xr = section.domain
  const yr = section.yDomain
  // Principal axes and boundaries are about angles, so those plots keep one
  // unit the same length on both axes (at most 420 px tall).
  const equal = section.fit === 'pca' || !!section.boundary
  let W = Math.max(280, width)
  let H = HEIGHT
  if (equal) {
    const ratio = (yr[1] - yr[0]) / (xr[1] - xr[0])
    const plotW = Math.min(W - PAD.l - PAD.r, 420 / ratio)
    W = plotW + PAD.l + PAD.r
    H = plotW * ratio + PAD.t + PAD.b
  }
  const f = frame(W, H, xr, yr)
  const P = ([x, y]) => [f.sx(x), f.sy(y)]
  const curvePts = (fn) => {
    const out = []
    for (let i = 0; i <= 300; i++) {
      const x = xr[0] + ((xr[1] - xr[0]) * i) / 300
      const y = fn(x)
      if (Number.isFinite(y)) out.push(`${f.sx(x).toFixed(1)},${f.sy(Math.max(yr[0] - (yr[1] - yr[0]), Math.min(yr[1] + (yr[1] - yr[0]), y))).toFixed(1)}`)
    }
    return out.join(' ')
  }

  const legend = [{ kind: 'dot', color: COL.series[0], label: say(section.legend?.points) || t('scatData') }]
  if (pts2.length) legend.push({ kind: 'square', color: COL.series[1], label: say(section.legend?.points2) || t('scatData2') })
  if (test.length) legend.push({ kind: 'ring', color: COL.ink, label: say(section.legend?.test) || t('scatTest') })
  const readouts = []
  const overlays = []

  if (section.fit === 'line') {
    const lf = linearFit(pts)
    overlays.push(<polyline key="fit" points={curvePts((x) => lf.slope * x + lf.intercept)} fill="none" stroke={COL.ink} strokeWidth="2" />)
    legend.push({ kind: 'line', color: COL.ink, label: t('scatLine') })
    readouts.push(
      <span key="fit">
        {t('scatLine')}: <MathText>{`$${lineTex(lf.slope, lf.intercept)}$, $r = ${fmt(lf.r, 3)}$, ${t('scatMse')} $= ${fmt(lf.mse, 3)}$`}</MathText>
        {test.length > 0 && <MathText>{`, ${t('scatTestMse')} $= ${fmt(mseOf((x) => lf.slope * x + lf.intercept, test), 3)}$`}</MathText>}
      </span>
    )
  }

  if (section.degree !== undefined) {
    const d = compile(section.degree).evaluate(scope)
    const c = Number.isInteger(d) ? polyFit(pts, d) : null
    if (c) {
      const fn = (x) => evalPoly(c, x)
      overlays.push(<polyline key="poly" points={curvePts(fn)} fill="none" stroke={COL.ink} strokeWidth="2" strokeLinejoin="round" />)
      legend.push({ kind: 'line', color: COL.ink, label: t('scatDegree', { d }) })
      readouts.push(
        <span key="poly">
          {t('scatDegree', { d })}: {t('scatTrainMse')} <MathText>{`$= ${fmt(mseOf(fn, pts), 3)}$`}</MathText>
          {test.length > 0 && (
            <>
              , {t('scatTestMse')} <MathText>{`$= ${fmt(mseOf(fn, test), 3)}$`}</MathText>
            </>
          )}
        </span>
      )
    }
  }

  if (section.guess) {
    const slope = compile(section.guess.slope).evaluate(scope)
    const intercept = compile(section.guess.intercept).evaluate(scope)
    const g = (x) => slope * x + intercept
    pts.forEach(([x, y], i) =>
      overlays.push(<line key={`r${i}`} x1={f.sx(x)} y1={f.sy(y)} x2={f.sx(x)} y2={f.sy(g(x))} stroke={COL.series[1]} strokeWidth="1.5" strokeDasharray="3 3" />)
    )
    overlays.push(<polyline key="guess" points={curvePts(g)} fill="none" stroke={COL.series[1]} strokeWidth="2.5" />)
    legend.push({ kind: 'line', color: COL.series[1], label: t('scatGuess') })
    readouts.push(
      <span key="guess">
        {t('scatGuess')}: <MathText>{`$${lineTex(slope, intercept)}$, ${t('scatMse')} $= ${fmt(mseOf(g, pts), 3)}$`}</MathText> ·{' '}
        {t('scatBest')}: <MathText>{`${t('scatMse')} $= ${fmt(linearFit(pts).mse, 3)}$`}</MathText>
      </span>
    )
  }

  let missed = []
  if (section.boundary) {
    const [a, b, c] = ['a', 'b', 'c'].map((k) => compile(section.boundary[k]).evaluate(scope))
    const tint = (sign, color) => (
      <polygon
        key={`h${sign}`}
        points={halfPlane(a, b, c, xr, yr, sign).map((q) => P(q).join(',')).join(' ')}
        fill={color}
        fillOpacity="0.1"
      />
    )
    overlays.unshift(tint(-1, COL.series[0]), tint(1, COL.series[1]))
    // The line itself, across the box.
    const ends = Math.abs(b) > Math.abs(a)
      ? [[xr[0], -(a * xr[0] + c) / b], [xr[1], -(a * xr[1] + c) / b]]
      : [[-(b * yr[0] + c) / a, yr[0]], [-(b * yr[1] + c) / a, yr[1]]]
    overlays.push(<line key="bd" x1={P(ends[0])[0]} y1={P(ends[0])[1]} x2={P(ends[1])[0]} y2={P(ends[1])[1]} stroke={COL.ink} strokeWidth="2" strokeDasharray="7 4" />)
    legend.push({ kind: 'dash', color: COL.ink, label: t('scatBoundary') })
    const acc = boundaryAccuracy(pts, pts2, { a, b, c })
    missed = [...pts.filter(([x, y]) => a * x + b * y + c >= 0), ...pts2.filter(([x, y]) => a * x + b * y + c <= 0)]
    readouts.push(
      <span key="acc">{t('scatAccuracy', { c: acc.correct, n: acc.total, pct: fmt((100 * acc.correct) / acc.total, 1) })}</span>
    )
  }

  if (section.fit === 'pca') {
    const pc = pca2(pts)
    const m = pc.mean
    pc.vectors.forEach((v, i) => {
      const len = 2 * Math.sqrt(Math.max(0, pc.values[i]))
      if (len > 1e-9) {
        overlays.push(<Arrow key={`pc${i}`} from={P(m)} to={P([m[0] + v[0] * len, m[1] + v[1] * len])} color={COL.series[i + 1]} width={3} />)
      }
    })
    if (section.project) {
      const v = pc.vectors[0]
      pts.forEach(([x, y], i) => {
        const tt = (x - m[0]) * v[0] + (y - m[1]) * v[1]
        const pr = [m[0] + tt * v[0], m[1] + tt * v[1]]
        overlays.push(
          <g key={`pj${i}`}>
            <line x1={P([x, y])[0]} y1={P([x, y])[1]} x2={P(pr)[0]} y2={P(pr)[1]} stroke={COL.axis} strokeDasharray="3 3" />
            <circle cx={P(pr)[0]} cy={P(pr)[1]} r="3" fill="none" stroke={COL.series[1]} strokeWidth="1.5" />
          </g>
        )
      })
    }
    legend.push({ kind: 'line', color: COL.series[1], label: t('scatPc', { i: 1 }) }, { kind: 'line', color: COL.series[2], label: t('scatPc', { i: 2 }) })
    readouts.push(
      <span key="pca">
        {[0, 1].map((i) => t('scatPcShare', { i: i + 1, pct: fmt(100 * pc.share[i], 1) })).join(' · ')}
      </span>
    )
  }

  const all = [
    ...pts.map((q) => ({ q, set: 'points' })),
    ...pts2.map((q) => ({ q, set: 'points2' })),
    ...test.map((q) => ({ q, set: 'test' }))
  ]
  const onMove = (e) => {
    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    const mx = ((e.clientX - box.left) / box.width) * W
    const my = ((e.clientY - box.top) / box.height) * H
    let best = null
    let bd = 14
    all.forEach((p, i) => {
      const [sx, sy] = P(p.q)
      const d = Math.hypot(sx - mx, sy - my)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    setHover(best)
  }

  return (
    <div className="function-graph" ref={ref}>
      <Legend COL={COL} items={legend} />
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className={equal ? 'fixed-aspect' : undefined}
        role="img"
        aria-label={t('scatAria', { n: all.length })}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={PAD.l} y={PAD.t} width={f.plotW} height={f.plotH} rx="6" />
          </clipPath>
        </defs>
        <Axes COL={COL} f={f} xr={xr} yr={yr} W={W} H={H} xLabel={section.axes && say(section.axes[0])} yLabel={section.axes && say(section.axes[1])} />
        <g clipPath={`url(#${clip})`}>
          {overlays}
          {pts.map((q, i) => (
            <circle key={`p${i}`} cx={P(q)[0]} cy={P(q)[1]} r="5" fill={COL.series[0]} stroke={COL.bg} strokeWidth="2" />
          ))}
          {pts2.map((q, i) => (
            <rect key={`s${i}`} x={P(q)[0] - 5} y={P(q)[1] - 5} width="10" height="10" fill={COL.series[1]} stroke={COL.bg} strokeWidth="2" />
          ))}
          {test.map((q, i) => (
            <circle key={`t${i}`} cx={P(q)[0]} cy={P(q)[1]} r="5" fill={COL.bg} stroke={COL.ink} strokeWidth="2" />
          ))}
          {missed.map((q, i) => (
            <circle key={`m${i}`} cx={P(q)[0]} cy={P(q)[1]} r="9" fill="none" stroke={COL.ink} strokeWidth="1.5" />
          ))}
        </g>
        {hover !== null && all[hover] && <HoverBox COL={COL} lines={[{ text: `(${fmt(all[hover].q[0])}, ${fmt(all[hover].q[1])})` }]} />}
        <rect x={PAD.l} y={PAD.t} width={f.plotW} height={f.plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      <SliderRow sliders={section.sliders} state={state} say={say} />
      {readouts.length > 0 && (
        <div className="plot-readouts" aria-live="polite">
          {readouts}
          {missed.length > 0 && <span className="muted small">{t('scatMissed')}</span>}
        </div>
      )}
    </div>
  )
}
