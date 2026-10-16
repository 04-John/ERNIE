import { HeartPulse } from 'lucide-react'
import { useHealth } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState, ProgressBar } from './ui'

const GRADE_COLOR = { Strong: 'var(--success)', Healthy: 'var(--emerald)', 'Needs attention': 'var(--warn)', 'At risk': 'var(--danger)' }
const GRADE_TONE = { Strong: 'success', Healthy: 'accent', 'Needs attention': 'warn', 'At risk': 'danger' }

export default function HealthCard() {
  const { data: h, isLoading } = useHealth()
  if (isLoading) return <Skeleton height={250} />

  if (!h || h.score == null) {
    return (
      <Card title="Retention health" subtitle="One score for how healthy your retention is">
        <EmptyState icon={HeartPulse} title="Not enough data yet">The score appears once your wallets have transactions.</EmptyState>
      </Card>
    )
  }

  const R = 54, C = 2 * Math.PI * R
  const color = GRADE_COLOR[h.grade] || 'var(--emerald)'

  return (
    <Card title="Retention health" subtitle="Fintech health, activation, momentum and diversification" chip={h.grade}>
      <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 150, height: 150, flexShrink: 0 }}>
          <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`Health score ${h.score} out of 100, ${h.grade}`}>
            <circle cx="75" cy="75" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="13" />
            <circle cx="75" cy="75" r={R} fill="none" stroke={color} strokeWidth="13" strokeLinecap="round"
              strokeDasharray={`${(h.score / 100) * C} ${C}`} transform="rotate(-90 75 75)" style={{ transition: 'stroke-dasharray .8s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <div>
              <div className="tnum" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{h.score}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 4 }}>of 100</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 14 }}>
          {h.components.map(c => (
            <div key={c.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                <span style={{ fontWeight: 600 }}>{c.label} <span className="hint">· {Math.round(c.weight * 100)}%</span></span>
                <span className="tnum" style={{ color: 'var(--text-2)' }}>{Math.round(c.value * 100)}</span>
              </div>
              <ProgressBar value={c.value * 100} tone={c.value >= 0.7 ? 'success' : c.value >= 0.4 ? 'warn' : 'danger'} />
              <div className="hint" style={{ marginTop: 4 }}>{c.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

export { GRADE_TONE }
