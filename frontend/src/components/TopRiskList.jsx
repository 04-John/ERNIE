import { ShieldCheck } from 'lucide-react'
import { useChurnScores } from '../hooks/useAnalytics'
import { Card, Badge, Skeleton, EmptyState } from './ui'
import { fmtPct, RISK_TONE } from '../lib/format'

/** The few fintechs most likely to churn. Unscored ones (no transactions) are excluded. */
export default function TopRiskList({ count = 5 }) {
  const { data, isLoading } = useChurnScores({ limit: 50 })
  if (isLoading) return <Skeleton height={300} />

  const top = (data?.data || []).filter(f => f.churn_risk !== 'Unknown').slice(0, count)

  return (
    <Card title="Most at risk" subtitle="Highest churn probability" chip="Top 5">
      {top.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nothing to flag yet">
          Risk is scored once a fintech has transaction history.
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {top.map((f, i) => {
            const tone = RISK_TONE[f.churn_risk]
            return (
              <a key={f.fintech_id} href={`#/fintech/${encodeURIComponent(f.fintech_id)}`} className="row-link-card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span className="tnum" style={{ width: 20, fontSize: 12, color: 'var(--muted)' }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fintech_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.region} · {f.type || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={`tone-${tone}`} style={{ fontSize: 16, fontWeight: 700, color: 'var(--tone)' }}>{fmtPct(f.churn_probability)}</div>
                  <Badge tone={tone}>{f.churn_risk}</Badge>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </Card>
  )
}
