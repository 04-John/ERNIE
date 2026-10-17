import { Users } from 'lucide-react'
import { useCohorts } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState } from './ui'
import { fmtNum } from '../lib/format'

const COLS = '110px 80px 1fr 1fr'
const pct = v => `${Math.round(v * 100)}%`
const monthLabel = m => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })

function Meter({ value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="bar" style={{ flex: 1 }}><i style={{ width: `${value * 100}%`, background: color }} /></div>
      <span className="mono" style={{ width: 40, textAlign: 'right', fontSize: 12, fontWeight: 500 }}>{pct(value)}</span>
    </div>
  )
}

export default function CohortsCard() {
  const { data: rows = [], isLoading } = useCohorts()
  if (isLoading) return <Skeleton height={300} />

  return (
    <Card title="Wallet cohorts" subtitle="How each month's new wallets activate and stay active" chip={`${rows.length} month${rows.length === 1 ? '' : 's'}`}>
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No cohorts yet">Cohorts appear once wallets exist.</EmptyState>
      ) : (
        <div className="gt-wrap">
          <div style={{ minWidth: 560 }}>
            <div className="gt-head" style={{ gridTemplateColumns: COLS, padding: '0 0 10px', gap: 16 }}>
              <span>Created</span><span className="gt-r">Wallets</span><span>Ever transacted</span><span>Active in last 30 days</span>
            </div>
            {rows.map(r => (
              <div key={r.month} className="gt-row" style={{ gridTemplateColumns: COLS, padding: '12px 0', gap: 16 }}>
                <span style={{ fontWeight: 600 }}>{monthLabel(r.month)}</span>
                <span className="gt-r">{fmtNum(r.wallets)}</span>
                <Meter value={r.activated_pct} color="var(--lime)" />
                <Meter value={r.active_pct} color="var(--info)" />
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="hint" style={{ marginTop: 12, lineHeight: 1.6 }}>Older cohorts that stay high on "active" are your stickiest customers. A steep fall means wallets are being created but not retained.</p>
    </Card>
  )
}
