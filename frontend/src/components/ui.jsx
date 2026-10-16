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

export function StatCard({ label, value, sub, tone = 'accent', icon: Icon, loading }) {
  return (
    <div className={`card stat tone-${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && <span className="stat-icon"><Icon size={17} strokeWidth={2} /></span>}
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

// Shared Recharts tooltip, themed through CSS variables
export function ChartTooltip({ active, payload, label, valueFormatter = v => v }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card" style={{ padding: '10px 14px', boxShadow: 'var(--shadow-md)' }}>
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
