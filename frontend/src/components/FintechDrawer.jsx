import { useEffect, useState } from 'react'
import { X, SearchX } from 'lucide-react'
import { useFintech } from '../hooks/useAnalytics'
import { DrawerContext } from '../lib/drawer'
import DraftOutreach from './DraftOutreach'
import { Skeleton, EmptyState } from './ui'
import { fmtNum, fmtUsd, fmtPct } from '../lib/format'

const tierClass = risk => `tier-${String(risk || 'unknown').toLowerCase()}`

const daysLabel = d => (d == null ? '—' : d < 1 ? 'Today' : `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'} ago`)

function volumeSub(f) {
  const prior = Number(f.vol_prior_3m || 0), recent = Number(f.vol_recent_3m || 0)
  if (prior <= 0) return 'No earlier 3 months to compare'
  const change = (recent - prior) / prior
  return `${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}% vs previous 3 months`
}

/** Risk over time: the daily score with the 0.60 and 0.30 thresholds drawn in. */
function RiskHistory({ history, tone }) {
  const pts = (history || []).slice(-30).map(h => h.probability)
  const y = p => 132 - Math.max(0, Math.min(1, p)) * 120
  if (pts.length < 2) {
    return <p className="hint" style={{ padding: '18px 0' }}>History builds up day by day. A trend line appears here after a couple of syncs.</p>
  }
  const x = i => (i / (pts.length - 1)) * 480
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const area = `${line} L480 140 L0 140 Z`
  return (
    <>
      <svg viewBox="0 0 480 140" width="100%" height="150" preserveAspectRatio="none" style={{ display: 'block' }} role="img" aria-label="Daily risk score for the last 30 days">
        <line x1="0" x2="480" y1={y(0.6)} y2={y(0.6)} strokeDasharray="4 4" opacity=".7" style={{ stroke: 'var(--danger)' }} />
        <line x1="0" x2="480" y1={y(0.3)} y2={y(0.3)} strokeDasharray="4 4" opacity=".7" style={{ stroke: 'var(--warn)' }} />
        <path d={area} style={{ fill: `color-mix(in srgb, ${tone} 14%, transparent)` }} />
        <path d={line} fill="none" strokeWidth="2.2" strokeLinejoin="round" style={{ stroke: tone }} />
      </svg>
      <div className="drawer-axis"><span>30d ago</span><span style={{ color: 'var(--danger)' }}>— 0.60 High</span><span style={{ color: 'var(--warn)' }}>— 0.30 Medium</span><span>today</span></div>
    </>
  )
}

function Content({ id }) {
  const { data, isLoading, isError } = useFintech(id)
  if (isLoading) return <div style={{ display: 'grid', gap: 16 }}><Skeleton height={70} /><Skeleton height={150} /><Skeleton height={260} /></div>
  if (isError || !data) return <EmptyState icon={SearchX} title="Couldn't load this fintech">It may have been removed, or belong to another workspace.</EmptyState>

  const f = data.fintech
  const scored = f.churn_risk !== 'Unknown'
  const tone = scored ? `var(--${f.churn_risk === 'High' ? 'danger' : f.churn_risk === 'Medium' ? 'warn' : 'success'})` : 'var(--muted)'
  const items = f.breakdown || []
  const stats = [
    ['LAST TRANSACTION', daysLabel(f.days_since_last_tx), 'Successful transactions only'],
    ['VOLUME, 3 MONTHS', fmtUsd(f.vol_recent_3m), volumeSub(f)],
    ['TRANSACTIONS', fmtNum(f.total_tx), 'Successful, all time'],
    ['WALLETS', fmtNum(data.wallet_count), `${fmtPct(f.dormancy_rate, 0)} dormant`],
  ]

  return (
    <>
      <div className={`drawer-title ${tierClass(f.churn_risk)}`}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h2 className="display">{f.fintech_name}</h2>
          <div className="drawer-meta">{[f.region, f.type || 'Unclassified', f.country && f.country !== 'Unknown' ? f.country : null].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {scored && <div className="display drawer-pct" style={{ color: tone }}>{fmtPct(f.churn_probability, 0)}</div>}
          <span className="sbadge" style={{ marginTop: 6 }}>{scored ? `${f.churn_risk} risk` : 'Not scored'}</span>
        </div>
      </div>

      <div className="drawer-stats">
        {stats.map(([label, value, sub]) => (
          <div key={label}><div className="stat-label" style={{ fontSize: 11 }}>{label}</div><div className="display drawer-stat-v">{value}</div><div className="drawer-stat-s">{sub}</div></div>
        ))}
      </div>

      <section className="drawer-card">
        <div className="drawer-card-head">
          <div><div className="card-title">Why this score</div><div className="card-sub">Every point of the score, explained</div></div>
          {scored && <span className="mono drawer-chip">Σ {Number(f.churn_probability).toFixed(2)}</span>}
        </div>
        {!items.length ? (
          <p className="hint">Risk is scored once this fintech has at least one successful transaction.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 16 }}>
              {items.map(b => {
                const c = b.points > 0 ? tone : 'var(--muted)'
                return (
                  <div key={b.key}>
                    <div className="drawer-part-head"><span>{b.label} <span className="drawer-weight">· weight {Math.round(b.weight * 100)}%</span></span><span className="mono" style={{ color: c }}>+{b.points.toFixed(2)}</span></div>
                    <div className="bar"><i style={{ width: `${Math.round(b.value * 100)}%`, background: c, transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} /></div>
                    <div className="drawer-detail">{b.detail}</div>
                  </div>
                )
              })}
            </div>
            <p className="drawer-note">Probability is the sum of these points. High is 0.60 or more and Medium is 0.30 or more. The score only changes when this fintech's own behaviour does.</p>
          </>
        )}
      </section>

      <section className="drawer-card">
        <div className="card-title">Risk over time</div>
        <div className="card-sub" style={{ margin: '2px 0 12px' }}>Daily score, last 30 days</div>
        <RiskHistory history={data.history} tone={tone} />
      </section>

      {scored && <DraftOutreach fintechId={f.fintech_id} name={f.fintech_name} variant="card" />}

      <a className="btn btn-sm" href={`#/fintech/${encodeURIComponent(f.fintech_id)}`} style={{ alignSelf: 'flex-start' }}>Open full page →</a>
    </>
  )
}

/** Wraps the app: any page can open the right-hand fintech drawer by calling openFintech(id). */
export default function FintechDrawerProvider({ children }) {
  const [openId, setOpenId] = useState(null)
  const [visible, setVisible] = useState(false)          // drives the slide, so the shadow only exists while open

  const open = id => { setOpenId(id); requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true))) }
  const close = () => { setVisible(false); setTimeout(() => setOpenId(null), 500) }

  useEffect(() => {
    if (!openId) return undefined
    const onKey = e => { if (e.key === 'Escape') { setVisible(false); setTimeout(() => setOpenId(null), 500) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openId])

  return (
    <DrawerContext.Provider value={{ openFintech: open, closeFintech: close, openId }}>
      {children}
      {openId && (
        <>
          <div className="drawer-scrim" onClick={close} style={{ opacity: visible ? 1 : 0 }} aria-hidden="true" />
          <aside className="drawer" aria-label="Fintech detail" role="dialog" aria-modal="true"
            style={{ transform: visible ? 'none' : 'translateX(104%)', boxShadow: visible ? '-24px 0 60px var(--shadow)' : 'none' }}>
            <div className="drawer-body">
              <div className="drawer-top">
                <span className="eyebrow-plain">FINTECH</span>
                <button className="btn btn-icon" style={{ width: 32, height: 32 }} onClick={close} aria-label="Close"><X size={16} /></button>
              </div>
              <Content id={openId} />
            </div>
          </aside>
        </>
      )}
    </DrawerContext.Provider>
  )
}
