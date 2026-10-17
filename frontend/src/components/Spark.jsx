/** A small trend line. With fewer than two points (no history yet) it draws a flat dashed line instead. */
export default function Spark({ points, tone = 'var(--muted)', width = 80, height = 24 }) {
  if (!points || points.length < 2) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={`M0 ${height / 2} L${width} ${height / 2}`} fill="none" strokeWidth="1.4" strokeDasharray="3 3" style={{ stroke: 'var(--border-strong)' }} /></svg>
  }
  const lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1
  const pad = 2
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * width).toFixed(1)} ${(height - pad - ((v - lo) / span) * (height - pad * 2)).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: tone }} />
    </svg>
  )
}
