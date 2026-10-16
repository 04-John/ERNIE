import { Card, Badge, ProgressBar } from './ui'
import { useWorkspace } from '../hooks/useAnalytics'
import { fmtNum } from '../lib/format'

const ROWS = [
  ['members', 'Team members'],
  ['alert_channels', 'Alert channels'],
  ['ai_messages', 'Ask ERNIE messages this month'],
]

/** The workspace's plan and how much of each allowance it has used. */
export default function PlanCard() {
  const { data: ws } = useWorkspace()
  const plan = ws?.plan
  if (!plan) return null
  return (
    <Card title="Plan" subtitle="What your workspace includes and how much you've used."
      action={<Badge tone={plan.id === 'free' ? 'neutral' : 'accent'}>{plan.name}{plan.price_usd ? ` · $${plan.price_usd}/mo` : ''}</Badge>}>
      <div style={{ display: 'grid', gap: 16 }}>
        {ROWS.map(([key, label]) => {
          const used = plan.usage[key] ?? 0
          const cap = plan.limits[key]
          const pct = cap ? (used / cap) * 100 : 0
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 6 }}>
                <span>{label}</span>
                <span className="tnum" style={{ color: 'var(--muted)' }}>{fmtNum(used)} of {cap == null ? 'unlimited' : fmtNum(cap)}</span>
              </div>
              <ProgressBar value={pct} tone={pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : 'accent'} />
            </div>
          )
        })}
        <p className="hint">History shown in charts: last {fmtNum(plan.limits.history_days)} days.</p>
      </div>
    </Card>
  )
}
