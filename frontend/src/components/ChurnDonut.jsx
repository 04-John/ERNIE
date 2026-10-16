import { useDistribution } from '../hooks/useAnalytics'
import { Card, Skeleton } from './ui'

const SEGMENTS = [
  { key: 'High',   label: 'High risk',   color: 'var(--danger)' },
  { key: 'Medium', label: 'Medium risk', color: 'var(--warn)' },
  { key: 'Low',    label: 'Low risk',    color: 'var(--success)' },
  { key: 'Unknown', label: 'Not enough data', color: 'var(--border-strong)' },
]

export default function ChurnDonut() {
  const { data: dist, isLoading } = useDistribution()
  if (isLoading) return <Skeleton height={240} />

  const total = SEGMENTS.reduce((n, s) => n + (dist?.[s.key] || 0), 0)
  const R = 54, SW = 14, C = 2 * Math.PI * R
  const arcs = SEGMENTS.reduce((acc, s) => {
    const value = dist?.[s.key] || 0
    const dash = total ? (value / total) * C : 0
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0
    return [...acc, { ...s, value, dash, offset }]
  }, [])

  return (
    <Card title="Churn risk" subtitle="Fintechs by risk tier" chip={`${total} fintech${total === 1 ? '' : 's'}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 150, height: 150, flexShrink: 0 }}>
          <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`${total} fintechs scored`}>
            <circle cx="75" cy="75" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={SW} />
            {arcs.map(a => a.dash > 0 && (
              <circle key={a.key} cx="75" cy="75" r={R} fill="none" stroke={a.color} strokeWidth={SW}
                strokeLinecap="butt"
                strokeDasharray={`${a.dash} ${C - a.dash}`}
                strokeDashoffset={C / 4 - a.offset}
                style={{ transition: 'stroke-dasharray .6s ease' }} />
            ))}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <div>
              <div className="tnum" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>{total}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginTop: 4 }}>Fintechs</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 160, display: 'grid', gap: 14 }}>
          {arcs.map(a => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color }} />
              <span style={{ fontSize: 14, color: 'var(--text-2)', flex: 1 }}>{a.label}</span>
              <span className="tnum" style={{ fontSize: 18, fontWeight: 700 }}>{a.value}</span>
            </div>
          ))}
          {total === 0 && <span className="hint">Fintechs are scored once they have transaction history.</span>}
        </div>
      </div>
    </Card>
  )
}
