import { Globe2 } from 'lucide-react'
import { useRegional } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState } from './ui'
import { fmtNum, fmtUsd, fmtPct, regionColor } from '../lib/format'

const COLS = 'minmax(0,1.4fr) 80px 90px 100px 110px minmax(160px,1.3fr)'
const riskTone = p => (p >= 0.6 ? 'var(--danger)' : p >= 0.3 ? 'var(--warn)' : 'var(--success)')

/** Regional performance as one aligned table. */
export default function RegionalCards() {
  const { data = [], isLoading } = useRegional()
  if (isLoading) return <Skeleton height={260} />

  return (
    <Card title="Regional performance" subtitle="Wallets, volume and risk by region" chip={`${data.length} region${data.length === 1 ? '' : 's'}`}>
      {data.length === 0 ? (
        <EmptyState icon={Globe2} title="No regional data yet" />
      ) : (
        <div className="gt-wrap">
          <div style={{ minWidth: 720 }}>
            <div className="gt-head" style={{ gridTemplateColumns: COLS, padding: '0 0 10px' }}>
              <span>Region</span><span className="gt-r">Fintechs</span><span className="gt-r">Wallets</span><span className="gt-r">Volume</span><span className="gt-r">Avg churn risk</span><span>Active wallets</span>
            </div>
            {data.map(r => {
              const active = (r.activation_rate || 0) * 100
              return (
                <div key={r.region} className="gt-row" style={{ gridTemplateColumns: COLS, padding: '13px 0', fontSize: 13.5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, flex: 'none', background: regionColor(r.region) }} />{r.region}
                  </span>
                  <span className="gt-r">{fmtNum(r.fintechs)}</span>
                  <span className="gt-r">{fmtNum(r.total_wallets)}</span>
                  <span className="gt-r">{fmtUsd(r.total_volume)}</span>
                  <span className="gt-r mono" style={{ fontSize: 12.5, fontWeight: 600, color: riskTone(r.avg_churn_prob) }}>{fmtPct(r.avg_churn_prob)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="bar" style={{ flex: 1 }}><i style={{ width: `${active}%` }} /></div>
                    <span className="mono" style={{ width: 46, textAlign: 'right', fontSize: 12 }}>{active.toFixed(1)}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
