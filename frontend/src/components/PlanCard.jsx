import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, CreditCard } from 'lucide-react'
import { Card, Badge, ProgressBar, Alert } from './ui'
import Pricing from './Pricing'
import { useWorkspace, useBilling } from '../hooks/useAnalytics'
import { startCheckout, openBillingPortal } from '../api/client'
import { fmtNum } from '../lib/format'

const ROWS = [
  ['members', 'Team members'],
  ['alert_channels', 'Alert channels'],
  ['ai_messages', 'Ask ERNIE messages this month'],
]

/** The workspace's plan, how much of each allowance it has used, and how to change plan. */
export default function PlanCard() {
  const { data: ws } = useWorkspace()
  const { data: billing } = useBilling()
  const qc = useQueryClient()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [showPlans, setShowPlans] = useState(false)
  const returned = window.location.hash.includes('billing=success')
  const plan = ws?.plan
  const isAdmin = ws?.role === 'admin'

  // After paying, Stripe tells our server a moment later; check a few times so the new plan appears by itself
  useEffect(() => {
    if (!returned) return
    const timers = [1500, 4000, 9000].map(ms => setTimeout(() => { qc.invalidateQueries({ queryKey: ['workspace'] }); qc.invalidateQueries({ queryKey: ['billing'] }) }, ms))
    return () => timers.forEach(clearTimeout)
  }, [returned, qc])

  if (!plan) return null

  const go = async (key, fn) => {
    setBusy(key); setError('')
    try { window.location.assign((await fn()).url) }
    catch (err) { setError(err.response?.data?.detail || 'Something went wrong. Please try again.'); setBusy('') }
  }

  return (
    <Card title="Plan" subtitle="What your workspace includes and how much you've used."
      action={<Badge tone={plan.id === 'free' ? 'neutral' : 'accent'}>{plan.name}{plan.price_usd ? ` · $${plan.price_usd}/mo` : ''}</Badge>}>
      <div style={{ display: 'grid', gap: 16 }}>
        {returned && <Alert tone="success">Thanks! Your payment went through. Your new plan will show here in a moment.</Alert>}
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

        {error && <Alert tone="danger">{error}</Alert>}
        {isAdmin && billing && (
          <div style={{ display: 'grid', gap: 14 }}>
            {billing.has_subscription || billing.can_manage ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => go('portal', openBillingPortal)} disabled={busy === 'portal'}>
                  {busy === 'portal' ? <Loader2 size={15} className="spin" /> : <CreditCard size={15} />} Manage billing
                </button>
                {billing.status === 'past_due' && <Badge tone="warn">Payment failed. Update your card.</Badge>}
              </div>
            ) : null}
            {!billing.has_subscription && (billing.enabled ? (
              <>
                {!showPlans && <div><button className="btn btn-primary" onClick={() => setShowPlans(true)}>See plans &amp; upgrade</button></div>}
                {showPlans && <Pricing current={plan.id} busyPlan={busy} onChoose={p => p.price_usd && go(p.id, () => startCheckout(p.id))}
                  ctaLabel={p => (p.price_usd ? `Upgrade to ${p.name}` : 'Free plan')} />}
              </>
            ) : <p className="hint">Online payments aren't switched on yet. To change your plan, contact us.</p>)}
          </div>
        )}
      </div>
    </Card>
  )
}
