import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { compile, fmt, ticks } from '@shared/plot.js'
import { evalParams, isDiscrete, moments, normalCdf, normalPdf, pmf, shadeProbability, shaded } from '@shared/dist.js'
import { useApp } from '@/AppContext.jsx'
import MathText from '@/components/MathText.jsx'
import { Axes, HoverBox, Legend, PAD, PLOT_THEMES, SliderRow, frame, useSay, useSliders, useWidth } from '@/components/plotKit.jsx'

// The `distribution` section: a normal curve, or binomial / Poisson bars, with
// sliders for the parameters, a shaded event and (for the discrete ones) the
// normal curve with the same mean and variance. Mean, variance and the shaded
// probability are computed (shared/dist.js).

const HEIGHT = 300
const near = (v) => Math.abs(Number(fmt(v, 4)) - v) < 1e-9 * Math.max(1, Math.abs(v))

// P(…) for the shaded event, in TeX.
function eventTex(from, to, outside, discrete) {
  const f = fmt(from, 3)
  const t = fmt(to, 3)
  if (outside) return `P(X \\le ${f}) + P(X \\ge ${t})`
  if (from === -Infinity) return `P(X \\le ${t})`
  if (to === Infinity) return `P(X \\ge ${f})`
  if (discrete && from === to) return `P(X = ${f})`
  return `P(${f} \\le X \\le ${t})`
}

export default function DistributionChart({ section }) {
  const { t } = useTranslation()
  const { theme } = useApp()
  const say = useSay()
  const COL = PLOT_THEMES[theme] || PLOT_THEMES.dark
  const clip = `clip-${useId().replace(/:/g, '')}`
  const [ref, width] = useWidth()
  const state = useSliders(section.sliders)
  const [hover, setHover] = useState(null)

  let q
  try {
    q = evalParams(section, state.values)
  } catch {
    q = null
  }
  if (!q || !Object.values(q).every(Number.isFinite)) {
    return <div className="graph-error">{t('graphError', { fn: section.family })}</div>
  }

  const discrete = isDiscrete(section.family)
  const { mean, variance } = moments(section.family, q)
  const sd = Math.sqrt(variance)
  const [d0, d1] = section.domain
  const xr = discrete ? [d0 - 0.6, d1 + 0.6] : [d0, d1]
  const ks = []
  for (let k = Math.ceil(d0); k <= d1; k++) ks.push(k)
  const probs = discrete ? pmf(section.family, q, d1) : null
  const curve = []
  if (!discrete || (section.approx && sd > 0)) {
    const [c0, c1] = xr
    const m = discrete ? mean : q.mean
    const s = discrete ? sd : q.sd
    for (let i = 0; i <= 400; i++) {
      const x = c0 + ((c1 - c0) * i) / 400
      curve.push([x, normalPdf(x, m, s)])
    }
  }
  const top = Math.max(...(discrete ? ks.map((k) => probs[k]) : []), ...curve.map((c) => c[1]), 1e-9)
  const yr = [0, section.yMax ?? top * 1.15]

  const shade = section.shade
  const from = shade?.from === undefined ? -Infinity : compile(shade.from).evaluate(state.values)
  const to = shade?.to === undefined ? Infinity : compile(shade.to).evaluate(state.values)
  const outside = !!shade?.outside
  const prob = shade ? shadeProbability(section.family, q, from, to, outside) : null

  const W = Math.max(280, width)
  const H = HEIGHT
  const f = frame(W, H, xr, yr)
  const xTicks = discrete ? ticks(xr[0], xr[1]).filter((v) => Number.isInteger(v) && v >= d0 && v <= d1) : undefined
  const pts = (list) => list.map(([x, y]) => `${f.sx(x).toFixed(1)},${f.sy(Math.min(y, yr[1] * 1.05)).toFixed(1)}`).join(' ')

  // The shaded parts of a continuous curve, as polygons.
  const areas = []
  if (shade && !discrete) {
    const parts = outside ? [[xr[0], from], [to, xr[1]]] : [[Math.max(from, xr[0]), Math.min(to, xr[1])]]
    for (const [a, b] of parts) {
      if (!(b > a)) continue
      const seg = curve.filter(([x]) => x >= a && x <= b)
      areas.push([[a, 0], [a, normalPdf(a, q.mean, q.sd)], ...seg, [b, normalPdf(b, q.mean, q.sd)], [b, 0]])
    }
  }

  // A 2 px gap between bars while they are wide enough to afford it.
  const unit = f.sx(1) - f.sx(0)
  const barW = unit >= 4 ? Math.min(unit - 2, 40) : unit * 0.7
  const name = section.family === 'binomial' ? `B(${fmt(q.n)}, ${fmt(q.p)})` : section.family === 'poisson' ? `\\text{Poisson}(${fmt(q.rate)})` : `N(${fmt(q.mean)}, ${fmt(q.sd)}^2)`

  const onMove = (e) => {
    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const x = xr[0] + ((px - PAD.l) / f.plotW) * (xr[1] - xr[0])
    if (discrete) {
      const k = Math.round(x)
      setHover(k >= d0 && k <= d1 ? k : null)
    } else setHover(x >= xr[0] && x <= xr[1] ? x : null)
  }
  let hoverLines = null
  if (hover !== null) {
    hoverLines = discrete
      ? [
          { text: `P(X = ${hover}) = ${fmt(probs[hover], 4)}` },
          { text: `P(X ≤ ${hover}) = ${fmt(shadeProbability(section.family, q, -Infinity, hover), 4)}` }
        ]
      : [{ text: `x = ${fmt(hover)}` }, { text: `P(X ≤ x) = ${fmt(normalCdf(hover, q.mean, q.sd), 4)}` }]
  }

  return (
    <div className="function-graph" ref={ref}>
      {discrete && section.approx && (
        <Legend
          COL={COL}
          items={[
            { kind: 'bar', color: COL.series[0], label: `$${name}$` },
            { kind: 'line', color: COL.series[1], label: t('distApprox') }
          ]}
        />
      )}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('distAria', { name: name.replace(/\\text\{|\}|\\/g, '') })}>
        <defs>
          <clipPath id={clip}>
            <rect x={PAD.l} y={PAD.t} width={f.plotW} height={f.plotH} rx="6" />
          </clipPath>
        </defs>
        <Axes COL={COL} f={f} xr={xr} yr={yr} xTicks={xTicks} W={W} H={H} />
        <g clipPath={`url(#${clip})`}>
          {discrete &&
            ks.map((k) => {
              const on = !shade || shaded(k, from, to, outside)
              const y = probs[k]
              return (
                <rect
                  key={k}
                  x={f.sx(k) - barW / 2}
                  y={f.sy(Math.min(y, yr[1]))}
                  width={barW}
                  height={Math.max(0, f.sy(0) - f.sy(Math.min(y, yr[1])))}
                  rx={Math.min(3, barW / 3)}
                  fill={COL.series[0]}
                  fillOpacity={on ? 1 : 0.3}
                  stroke={hover === k ? COL.ink : 'none'}
                  strokeWidth="1.5"
                />
              )
            })}
          {areas.map((poly, i) => (
            <polygon key={i} points={pts(poly)} fill={COL.series[0]} fillOpacity="0.28" />
          ))}
          {curve.length > 0 && (
            <polyline
              points={pts(curve)}
              fill="none"
              stroke={discrete ? COL.series[1] : COL.series[0]}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          )}
          {hover !== null && !discrete && (
            <line x1={f.sx(hover)} y1={PAD.t} x2={f.sx(hover)} y2={PAD.t + f.plotH} stroke={COL.axis} strokeDasharray="3 3" />
          )}
        </g>
        {hoverLines && <HoverBox COL={COL} lines={hoverLines} />}
        <rect x={PAD.l} y={PAD.t} width={f.plotW} height={f.plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      <SliderRow sliders={section.sliders} state={state} say={say} />
      <div className="plot-readouts" aria-live="polite">
        <span>
          <MathText>{`$${name}$`}</MathText>: {t('distMean')} <MathText>{`$\\mu = ${fmt(mean, 3)}$`}</MathText>, {t('distVariance')}{' '}
          <MathText>{`$\\sigma^2 = ${fmt(variance, 3)}$`}</MathText>, {t('distSd')} <MathText>{`$\\sigma ${near(sd) ? '=' : '\\approx'} ${fmt(sd, 3)}$`}</MathText>
        </span>
        {prob !== null && (
          <span>
            {t('distShaded')}: <MathText>{`$${eventTex(from, to, outside, discrete)} ${near(prob) ? '=' : '\\approx'} ${fmt(prob, 4)}$`}</MathText>
          </span>
        )}
      </div>
    </div>
  )
}
