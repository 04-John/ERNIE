import { ShieldCheck } from 'lucide-react'
import { useChurnScores } from '../hooks/useAnalytics'
import { useFintechDrawer } from '../lib/drawer'
import { Card, Skeleton, EmptyState } from './ui'
import { fmtPct } from '../lib/format'

const tierClass = risk => `tier-${String(risk || 'unknown').toLowerCase()}`

/** The few fintechs most likely to churn. Unscored ones (no transactions) are excluded. Fills its column so it lines up with its neighbour. */
export default function TopRiskList({ count = 5 }) {
  const { data, isLoading } = useChurnScores({ limit: 50 })
  const { openFintech } = useFintechDrawer()
  if (isLoading) return <Skeleton height={300} />

  const top = (data?.data || []).filter(f => f.churn_risk !== 'Unknown').slice(0, count)

  return (
    <Card title="Most at risk" subtitle="Highest churn probability" chip={`Top ${count}`} className="type-card">
      {top.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nothing to flag yet">
          Risk is scored once a fintech has transaction history.
        </EmptyState>
      ) : (
        <div className="type-list" style={{ gap: 10 }}>
          {top.map((f, i) => (
            <button key={f.fintech_id} className={`risk-item ${tierClass(f.churn_risk)}`} onClick={() => openFintech(f.fintech_id)}>
              <span className="mono" style={{ width: 20, fontSize: 12, color: 'var(--muted)' }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fintech_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{[f.region, f.type].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--tone)' }}>{fmtPct(f.churn_probability)}</div>
                <span className="sbadge">{f.churn_risk}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
