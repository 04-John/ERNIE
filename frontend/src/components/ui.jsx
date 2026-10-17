import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

export function Card({ title, subtitle, chip, action, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || chip || action) && (
        <div className="card-head">
          <div>
            <h3 className="card-title">{title}</h3>
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {chip && <span className="chip">{chip}</span>}
            {action}
          </div>
        </div>
      )}
      {children}
    </section>
  )
}

export function Badge({ tone = 'neutral', dot = false, live = false, children }) {
  return (
    <span className={`badge tone-${tone}`}>
      {dot && <span className={`badge-dot ${live ? 'live' : ''}`} />}
      {children}
    </span>
  )
}

export function Skeleton({ height = 200 }) {
  return <div className="skeleton" style={{ height }} aria-hidden="true" />
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={22} /></div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, children, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions}
    </header>
  )
}

// eslint-disable-next-line no-unused-vars
export function StatCard({ label, value, sub, tone = 'accent', icon: _icon, loading }) {
  return (
    <div className={`card stat tone-${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-square" aria-hidden="true" />
      </div>
      {loading ? <div className="skeleton" style={{ height: 34, width: '60%' }} /> : <div className="stat-value">{value}</div>}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function ProgressBar({ value, tone = 'accent' }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={`progress tone-${tone}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

const ALERT_ICON = { info: Info, warn: AlertTriangle, danger: XCircle, success: CheckCircle2 }
export function Alert({ tone = 'info', children }) {
  const Icon = ALERT_ICON[tone] || Info
  return (
    <div className={`alert tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} />
      <div>{children}</div>
    </div>
  )
}

/**
 * A number that counts up to its value over 1.4s (ease-out cubic). If animation frames never tick
 * (a background tab, a test browser) a 1.6s fallback still shows the final value.
 */
export function CountUp({ value, format = v => String(v), duration = 1400 }) {
  const target = Number(value)
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!Number.isFinite(target) || reduce) return undefined
    let raf = 0
    const start = performance.now()
    const tick = now => {
      const t = Math.min(1, (now - start) / duration)
      setShown(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const fallback = setTimeout(() => { cancelAnimationFrame(raf); setShown(target) }, duration + 200)
    return () => { cancelAnimationFrame(raf); clearTimeout(fallback) }
  }, [target, duration, reduce])
  if (!Number.isFinite(target)) return <>{value}</>
  return <>{format(reduce ? target : shown)}</>
}

// Shared Recharts tooltip, themed through CSS variables
export function ChartTooltip({ active, payload, label, valueFormatter = v => v }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card" style={{ padding: '10px 14px', boxShadow: '0 12px 32px var(--shadow)' }}>
      {label != null && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>}
      {payload.map(p => (
        <div key={p.dataKey || p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '2px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.fill }} />
          <span style={{ color: 'var(--text-2)' }}>{p.name}</span>
          <span style={{ marginLeft: 'auto', paddingLeft: 18, fontWeight: 600 }} className="tnum">{valueFormatter(p.value)}</span>
        </div>
      ))}
    </div>
  )
}
