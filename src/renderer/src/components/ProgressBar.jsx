export default function ProgressBar({ percent = 0, label }) {
  const p = Math.max(0, Math.min(100, percent))
  return (
    <div className="progress">
      {label && (
        <div className="progress-label">
          <span>{label}</span>
          <span>{p}%</span>
        </div>
      )}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}
