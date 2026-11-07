import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { applyMap, compile, det2, eigen2, evalMap, fmt, lerpMap } from '@shared/plot.js'
import { useApp } from '@/AppContext.jsx'
import MathText from '@/components/MathText.jsx'
import { Arrow, PLOT_THEMES, Slider, SliderRow, useSay, useSliders, useWidth } from '@/components/plotKit.jsx'

// The `vector2d` section: what a 2 × 2 matrix (or an affine map, matrix plus
// translation) does to the plane. The gray grid is the plane before; the blue
// grid, the unit square and the arrows T(e₁), T(e₂) are after. Optional:
// chosen vectors with their images (and orbit under repeated application),
// a shape, and the real eigenvectors as dashed lines. A slider moves from the
// identity to the map. The determinant and eigenvalues are computed, never
// written in the content (shared/plot.js).

const MAX = 460 // the square figure's largest side, in px
const ease = (s) => (s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2)

const tex2 = (m) => `\\begin{pmatrix} ${fmt(m[0][0])} & ${fmt(m[0][1])} \\\\ ${fmt(m[1][0])} & ${fmt(m[1][1])} \\end{pmatrix}`
const texCol = (t) => `\\begin{pmatrix} ${fmt(t[0])} \\\\ ${fmt(t[1])} \\end{pmatrix}`

export default function VectorPlane({ section }) {
  const { t } = useTranslation()
  const { theme } = useApp()
  const say = useSay()
  const COL = PLOT_THEMES[theme] || PLOT_THEMES.dark
  const clip = `clip-${useId().replace(/:/g, '')}`
  const [ref, width] = useWidth(MAX)
  const state = useSliders(section.sliders)
  const morphs = section.morph !== false
  const [s, setS] = useState(1)
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const play = () => {
    cancelAnimationFrame(raf.current)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setS(1)
      return
    }
    const t0 = performance.now()
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1400)
      setS(Number(ease(k).toFixed(3)))
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    setS(0)
    raf.current = requestAnimationFrame(step)
  }

  const full = useMemo(() => {
    try {
      return evalMap(section, state.values)
    } catch {
      return null
    }
  }, [section, state.values])

  if (!full || ![...full.m.flat(), ...full.t].every(Number.isFinite)) {
    return <div className="graph-error">{t('graphError', { fn: JSON.stringify(section.matrix) })}</div>
  }

  const { m, t: tr } = morphs ? lerpMap(full.m, full.t, s) : full
  const affine = (section.translate || []).length > 0
  const E = section.extent || 4
  const S = Math.max(240, Math.min(MAX, width))
  const k = S / 2 / E
  const px = ([x, y]) => [S / 2 + x * k, S / 2 - y * k]
  const T = (p) => applyMap(m, tr, p)

  // The grid before (gray) and after (blue). The blue one is the image of the
  // lines x = i and y = i for |i| ≤ K, with K large enough that it covers the
  // view: the view's corners pulled back through T (capped for tiny scales).
  const det = det2(m)
  const ints = []
  for (let i = Math.ceil(-E); i <= Math.floor(E); i++) ints.push(i)
  let K = Math.ceil(E * 3)
  if (Math.abs(det) > 1e-9) {
    const inv = [[m[1][1] / det, -m[0][1] / det], [-m[1][0] / det, m[0][0] / det]]
    const reach = Math.max(
      ...[[E, E], [E, -E], [-E, E], [-E, -E]].flatMap(([x, y]) => applyMap(inv, [0, 0], [x - tr[0], y - tr[1]]).map(Math.abs))
    )
    K = Math.min(40, Math.max(E, Math.ceil(reach) + 1))
  }
  const far = []
  for (let i = -K; i <= K; i++) far.push(i)

  const eig = section.eigen && !affine ? eigen2(m) : null
  // Vector coordinates may read the sliders too.
  const vecPts = (section.vectors || [])
    .map((v) => ({ ...v, p: [compile(v.x).evaluate(state.values), compile(v.y).evaluate(state.values)] }))
    .filter((v) => v.p.every(Number.isFinite))

  const origin = T([0, 0])
  const e1 = T([1, 0])
  const e2 = T([0, 1])
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]].map((q) => px(T(q)))
  // Labels sit on lines and arrows: a ring of the background keeps them legible.
  const halo = { stroke: COL.bg, strokeWidth: 4, strokeLinejoin: 'round', paintOrder: 'stroke' }
  const label = (at, from, text, color) => {
    // Just past the tip, away from where the arrow comes from.
    const dx = at[0] - from[0]
    const dy = at[1] - from[1]
    const n = Math.hypot(dx, dy) || 1
    const x = at[0] + (dx / n) * 12
    const y = at[1] + (dy / n) * 12 + 4
    return (
      <text x={x} y={y} fill={color} fontSize="13" fontWeight="600" textAnchor={dx < -2 ? 'end' : dx > 2 ? 'start' : 'middle'} {...halo}>
        {text}
      </text>
    )
  }

  const detText =
    Math.abs(det) < 1e-9
      ? t('vecDetZero')
      : t('vecDetArea', { k: fmt(Math.abs(det)) }) + (det < 0 ? ` ${t('vecDetFlip')}` : '')

  let eigText = null
  if (eig) {
    if (eig.kind === 'complex') eigText = t('vecEigenComplex')
    else if (eig.kind === 'scalar') eigText = `$\\lambda = ${fmt(eig.values[0])}$: ${t('vecEigenScalar')}`
    else if (eig.kind === 'repeated') eigText = `$\\lambda = ${fmt(eig.values[0])}$ (${t('vecEigenOne')})`
    else eigText = `$\\lambda_1 = ${fmt(eig.values[0])}$, $\\lambda_2 = ${fmt(eig.values[1])}$ (${t('vecEigenLines')})`
  }

  return (
    <div className="vector-plane" ref={ref}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={t('vecAria')} className="vector-plane-svg">
        <defs>
          <clipPath id={clip}>
            <rect x="0" y="0" width={S} height={S} rx="8" />
          </clipPath>
        </defs>
        <rect x="0" y="0" width={S} height={S} rx="8" fill={COL.bg} />
        <g clipPath={`url(#${clip})`}>
          {ints.map((i) => (
            <g key={`g${i}`} stroke={COL.axis} strokeWidth={i === 0 ? 1.5 : 1} strokeOpacity={i === 0 ? 0.6 : 0.25}>
              <line x1={px([i, -E])[0]} y1="0" x2={px([i, E])[0]} y2={S} />
              <line x1="0" y1={px([-E, i])[1]} x2={S} y2={px([E, i])[1]} />
            </g>
          ))}
          {far.map((i) => {
            const a = [px(T([i, -K])), px(T([i, K]))]
            const b = [px(T([-K, i])), px(T([K, i]))]
            const w = i === 0 ? 2 : 1
            const o = i === 0 ? 0.95 : 0.5
            return (
              <g key={`t${i}`} stroke={COL.series[0]} strokeWidth={w} strokeOpacity={o}>
                <line x1={a[0][0]} y1={a[0][1]} x2={a[1][0]} y2={a[1][1]} />
                <line x1={b[0][0]} y1={b[0][1]} x2={b[1][0]} y2={b[1][1]} />
              </g>
            )
          })}
          {section.square !== false && (
            <polygon
              points={square.map((q) => q.join(',')).join(' ')}
              fill={COL.series[0]}
              fillOpacity="0.2"
              stroke={COL.series[0]}
              strokeWidth="1.5"
            />
          )}
          {section.shape && (
            <>
              <polygon
                points={section.shape.map((q) => px(q).join(',')).join(' ')}
                fill="none"
                stroke={COL.axis}
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <polygon
                points={section.shape.map((q) => px(T(q)).join(',')).join(' ')}
                fill={COL.ink}
                fillOpacity="0.12"
                stroke={COL.ink}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </>
          )}
          {eig &&
            eig.vectors.map((v, i) => {
              const a = px([-v[0] * E * 3, -v[1] * E * 3])
              const b = px([v[0] * E * 3, v[1] * E * 3])
              // Beside the line, not on it: 14 px along the normal that points up.
              // On screen the line runs along (v₀, −v₁); (v₁, v₀) is normal to it.
              const at = px([v[0] * E * 0.72, v[1] * E * 0.72])
              let n = [v[1], v[0]]
              if (n[1] > 0 || (n[1] === 0 && n[0] < 0)) n = [-n[0], -n[1]]
              const tag = [at[0] + n[0] * 14, at[1] + n[1] * 14 + 4]
              return (
                <g key={`e${i}`}>
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={COL.ink} strokeWidth="1.5" strokeDasharray="7 5" strokeOpacity="0.8" />
                  <text x={tag[0]} y={tag[1]} fill={COL.ink} fontSize="12" textAnchor="middle" {...halo}>
                    λ = {fmt(eig.values[i])}
                  </text>
                </g>
              )
            })}
          {vecPts.map((v, i) => {
            const orbit = []
            if (v.orbit) {
              let q = v.p
              for (let j = 0; j <= v.orbit; j++) {
                orbit.push(q)
                q = T(q)
              }
            }
            const img = T(v.p)
            const name = v.label ? say(v.label) : null
            return (
              <g key={`v${i}`}>
                {orbit.length > 0 && (
                  <>
                    <polyline points={orbit.map((q) => px(q).join(',')).join(' ')} fill="none" stroke={COL.axis} strokeWidth="1" />
                    {orbit.map((q, j) => (
                      <circle key={j} cx={px(q)[0]} cy={px(q)[1]} r="3.5" fill={COL.ink} stroke={COL.bg} strokeWidth="1.5" />
                    ))}
                  </>
                )}
                <Arrow from={px([0, 0])} to={px(v.p)} color={COL.axis} width={2} dashed />
                {name && label(px(v.p), px([0, 0]), name, COL.text)}
                <Arrow from={px(origin)} to={px(img)} color={COL.ink} width={2.5} />
                {name && label(px(img), px(origin), `T(${name})`, COL.ink)}
              </g>
            )
          })}
          <Arrow from={px(origin)} to={px(e1)} color={COL.series[1]} width={3} />
          <Arrow from={px(origin)} to={px(e2)} color={COL.series[2]} width={3} />
          {label(px(e1), px(origin), 'T(e₁)', COL.series[1])}
          {label(px(e2), px(origin), 'T(e₂)', COL.series[2])}
        </g>
      </svg>
      <div className="vector-plane-side">
        <div className="plot-legend">
          <span className="plot-key">
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="21" y2="5" stroke={COL.axis} strokeWidth="2" strokeOpacity="0.6" />
            </svg>
            {t('vecBefore')}
          </span>
          <span className="plot-key">
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="21" y2="5" stroke={COL.series[0]} strokeWidth="2.5" />
            </svg>
            {t('vecAfter')}
          </span>
        </div>
        <SliderRow sliders={section.sliders} state={state} say={say}>
          {morphs && (
            <div className="plot-morph">
              <Slider
                label={t('vecApply')}
                min={0}
                max={1}
                step={0.01}
                value={s}
                onChange={(v) => {
                  cancelAnimationFrame(raf.current) // a drag stops Play
                  setS(v)
                }}
                shown={`${Math.round(s * 100)} %`}
              />
              <button type="button" className="link no-print" onClick={play}>
                {t('vecPlay')}
              </button>
            </div>
          )}
        </SliderRow>
        {/* Not aria-live: during Play these change on every frame. */}
        <div className="plot-readouts">
          {affine && <MathText>{'$T(\\mathbf v) = A\\mathbf v + \\mathbf b$'}</MathText>}
          <MathText>{affine ? `$A = ${tex2(m)},\\quad \\mathbf b = ${texCol(tr)}$` : `$A = ${tex2(m)}$`}</MathText>
          <span>
            <MathText>{`$\\det A = ${fmt(det)}$`}</MathText>: {detText}
          </span>
          {eigText && (
            <span>
              {t('vecEigen')}: <MathText>{eigText}</MathText>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
