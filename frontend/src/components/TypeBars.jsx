import { useTypeBreakdown } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState } from './ui'
import { Layers } from 'lucide-react'

/** Average volume per fintech type. `columns` lays the bars out in two columns (Overview); otherwise a single stretching list (Analytics). */
export default function TypeBars({ columns = false, title = 'Volume by fintech type', subtitle = 'Average volume per fintech', chip = 'USD (k)' }) {
  const { data = [], isLoading } = useTypeBreakdown()
  if (isLoading) return <Skeleton height={240} />

  const rows = [...data].sort((a, b) => b.avg_volume_k - a.avg_volume_k)
  const max = Math.max(...rows.map(d => d.avg_volume_k || 0), 1)

  return (
    <Card title={title} subtitle={subtitle} chip={chip} className="type-card">
      {rows.length === 0 ? (
        <EmptyState icon={Layers} title="No fintech types yet">
          Tag an address with a type in its Blockradar metadata to group fintechs here.
        </EmptyState>
      ) : (
        <div className={columns ? 'type-grid' : 'type-list'}>
          {rows.map(d => (
            <div key={d.type}>
              <div className="type-row">
                <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{d.type} <span style={{ color: 'var(--muted)' }}>· {d.count}</span></span>
                <span className="tnum" style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                  ${d.avg_volume_k}k
                  {d.high_risk > 0 && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>{d.high_risk} high risk</span>}
                </span>
              </div>
              <div className="bar"><i style={{ width: `${(d.avg_volume_k / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
