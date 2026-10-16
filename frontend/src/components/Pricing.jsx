import { Check } from 'lucide-react'
import { usePlans } from '../hooks/useAnalytics'

/** Plan cards. Read from the API so the pricing page can never disagree with what the server enforces. */
export default function Pricing({ current, onChoose, busyPlan, ctaLabel }) {
  const { data: plans } = usePlans()
  if (!plans?.length) return null
  return (
    <div className="lp-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
      {plans.map(p => {
        const featured = p.id === 'pro'
        const isCurrent = current === p.id
        return (
          <div className="lp-card" key={p.id} style={{ display: 'flex', flexDirection: 'column', borderColor: featured ? 'var(--accent)' : undefined }}>
            <span className="badge tone-accent" style={{ alignSelf: 'flex-start', marginBottom: 10, visibility: featured ? 'visible' : 'hidden' }} aria-hidden={!featured}>Most popular</span>
            <h3>{p.name}</h3>
            <p style={{ minHeight: 44 }}>{p.tagline}</p>
            <div style={{ margin: '14px 0 18px' }}>
              <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em' }}>${p.price_usd}</span>
              <span style={{ color: 'var(--muted)' }}> / month</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'grid', gap: 10, flex: 1 }}>
              {p.features.map(f => (
                <li key={f} style={{ display: 'flex', gap: 8, fontSize: 14, alignItems: 'flex-start' }}>
                  <Check size={16} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} /> <span>{f}</span>
                </li>
              ))}
            </ul>
            {isCurrent
              ? <button className="btn" disabled>Current plan</button>
              : <button className={`btn ${featured ? 'btn-primary' : ''}`} disabled={busyPlan === p.id} onClick={() => onChoose(p)}>
                  {ctaLabel ? ctaLabel(p) : (p.price_usd ? `Choose ${p.name}` : 'Start free')}
                </button>}
          </div>
        )
      })}
    </div>
  )
}
