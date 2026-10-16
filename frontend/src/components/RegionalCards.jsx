import { Globe2 } from 'lucide-react'
import { useRegional } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState, ProgressBar } from './ui'
import { fmtNum, fmtUsd, fmtPct, regionColor } from '../lib/format'

export default function RegionalCards() {
  const { data = [], isLoading } = useRegional()
  if (isLoading) return <Skeleton height={260} />

  return (
    <Card title="Regional performance" subtitle="Wallets, volume and risk by region" chip={`${data.length} region${data.length === 1 ? '' : 's'}`}>
      {data.length === 0 ? (
        <EmptyState icon={Globe2} title="No regional data yet" />
      ) : (
        <div className="grid-3">
          {data.map(r => {
            const color = regionColor(r.region)
            const activePct = (r.activation_rate || 0) * 100
            return (
              <div key={r.region} className="card" style={{ background: 'var(--surface-2)', padding: 18, boxShadow: 'none', borderTop: `3px solid ${color}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{r.region}</div>
                {[
                  ['Fintechs', fmtNum(r.fintechs)],
                  ['Wallets', fmtNum(r.total_wallets)],
                  ['Volume', fmtUsd(r.total_volume)],
                  ['Avg churn risk', fmtPct(r.avg_churn_prob)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
                    <span style={{ color: 'var(--muted)' }}>{k}</span>
                    <span className="tnum" style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>Active wallets</span>
                    <span className="tnum" style={{ fontWeight: 600 }}>{activePct.toFixed(1)}%</span>
                  </div>
                  <ProgressBar value={activePct} tone="accent" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
