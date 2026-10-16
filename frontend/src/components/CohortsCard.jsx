import { Users } from 'lucide-react'
import { useCohorts } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState, ProgressBar } from './ui'
import { fmtNum } from '../lib/format'

const pct = v => `${Math.round(v * 100)}%`
const monthLabel = m => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function CohortsCard() {
  const { data: rows = [], isLoading } = useCohorts()
  if (isLoading) return <Skeleton height={300} />

  return (
    <Card title="Wallet cohorts" subtitle="How each month's new wallets activate and stay active" chip={`${rows.length} month${rows.length === 1 ? '' : 's'}`}>
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No cohorts yet">Cohorts appear once wallets exist.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Created</th><th className="num">Wallets</th><th style={{ minWidth: 160 }}>Ever transacted</th><th style={{ minWidth: 160 }}>Active in last 30 days</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.month}>
                  <td style={{ fontWeight: 600 }}>{monthLabel(r.month)}</td>
                  <td className="num">{fmtNum(r.wallets)}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ flex: 1 }}><ProgressBar value={r.activated_pct * 100} tone="accent" /></div><span className="tnum" style={{ width: 40, textAlign: 'right', fontSize: 12 }}>{pct(r.activated_pct)}</span></div></td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ flex: 1 }}><ProgressBar value={r.active_pct * 100} tone="info" /></div><span className="tnum" style={{ width: 40, textAlign: 'right', fontSize: 12 }}>{pct(r.active_pct)}</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint" style={{ marginTop: 12 }}>Older cohorts that stay high on "active" are your stickiest customers; a steep fall means wallets are being created but not retained.</p>
    </Card>
  )
}
