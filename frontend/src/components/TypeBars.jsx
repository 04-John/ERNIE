import { useTypeBreakdown } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState, ProgressBar } from './ui'
import { Layers } from 'lucide-react'

export default function TypeBars() {
  const { data = [], isLoading } = useTypeBreakdown()
  if (isLoading) return <Skeleton height={240} />

  const rows = [...data].sort((a, b) => b.avg_volume_k - a.avg_volume_k)
  const max = Math.max(...rows.map(d => d.avg_volume_k || 0), 1)

  return (
    <Card title="Volume by fintech type" subtitle="Average volume per fintech" chip="USD (k)">
      {rows.length === 0 ? (
        <EmptyState icon={Layers} title="No fintech types yet">
          Tag an address with a type in its Blockradar metadata to group fintechs here.
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {rows.map(d => (
            <div key={d.type}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{d.type} <span style={{ color: 'var(--muted)' }}>· {d.count}</span></span>
                <span className="tnum" style={{ color: 'var(--text-2)' }}>
                  ${d.avg_volume_k}k
                  {d.high_risk > 0 && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>{d.high_risk} high risk</span>}
                </span>
              </div>
              <ProgressBar value={(d.avg_volume_k / max) * 100} tone="accent" />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
