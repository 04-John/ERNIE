import { useState } from 'react'
import { Inbox } from 'lucide-react'
import { useDormancy, useActivityTrend, useWalletList } from '../hooks/useAnalytics'
import { PageHeader, Card, Skeleton, EmptyState } from '../components/ui'
import { fmtNum, fmtUsd, fmtPct, timeAgo } from '../lib/format'

const COLS = 'minmax(0,1.3fr) minmax(0,1.2fr) 90px 120px 120px 90px 100px'
const STATUS = {
  active:  { tone: 'success', label: 'Active' },
  dormant: { tone: 'warn',    label: 'Dormant' },
  never:   { tone: 'neutral', label: 'Never active' },
}
const FILTERS = [[null, 'All'], ['active', 'Active'], ['dormant', 'Dormant'], ['never', 'Never active']]
const walletStatus = w => (w.neverActive ? 'never' : w.isDormant ? 'dormant' : 'active')
const shortId = id => (id && id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id || '—')
const dayOfMonth = d => (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d).slice(8) : String(d).split(' ').pop())

function Kpi({ label, value, sub, tone, loading }) {
  return (
    <div className={`card stat tone-${tone}`} style={{ padding: 20 }}>
      <div className="stat-top" style={{ marginBottom: 0 }}><span className="stat-label">{label}</span><span className="stat-square" aria-hidden="true" /></div>
      {loading ? <div className="skeleton" style={{ height: 32, width: '55%', marginTop: 12 }} /> : <div className="stat-value" style={{ marginTop: 12, fontSize: 32 }}>{value}</div>}
      <div className="stat-sub" style={{ marginTop: 8 }}>{sub}</div>
    </div>
  )
}

function WalletTable() {
  const [status, setStatus] = useState(null)
  const { data, isLoading, isFetching } = useWalletList({ limit: 25, ...(status ? { status } : {}) })
  if (isLoading) return <Skeleton height={300} />
  const rows = data?.data || []

  return (
    <section className="panel">
      <div className="panel-head">
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h2 className="section-title">Wallets</h2>
          <div className="panel-sub">Individual addresses and their activity · showing {fmtNum(rows.length)} of {fmtNum(data?.total)}</div>
        </div>
        <div className="filters" style={{ marginBottom: 0 }}>
          {FILTERS.map(([k, label]) => <button key={label} className="pill" aria-pressed={status === k} onClick={() => setStatus(k)}>{label}</button>)}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title={status ? 'No wallets with that status' : 'No wallets yet'}>
          {status ? 'Try another filter.' : 'Addresses created in your Blockradar wallet will appear here.'}
        </EmptyState>
      ) : (
        <div className="gt-wrap">
          <div style={{ minWidth: 820, opacity: isFetching ? .6 : 1, transition: 'opacity .15s' }}>
            <div className="gt-head" style={{ gridTemplateColumns: COLS }}>
              <span>Fintech</span><span>Address</span><span>Network</span><span>Status</span><span>Last activity</span><span className="gt-r">Tx</span><span className="gt-r">Balance</span>
            </div>
            {rows.map(w => {
              const st = STATUS[walletStatus(w)]
              return (
                <div key={w.id} className="gt-row" style={{ gridTemplateColumns: COLS }}>
                  <span style={{ fontWeight: 600 }}>{w._fintechName || '—'}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{shortId(w.id)}</span>
                  <span style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{w.network || '—'}</span>
                  <span className={`sbadge tone-${st.tone}`} style={{ justifySelf: 'start' }}><i />{st.label}</span>
                  <span style={{ color: 'var(--text-2)' }}>
                    {w.neverActive ? <span className="hint">created {w.daysSinceLastTx}d ago</span> : timeAgo(w.lastActive)}
                  </span>
                  <span className="gt-r">{fmtNum(w.totalTransactions)}</span>
                  <span className="gt-r">{fmtUsd(w.balanceUsd)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

export default function Wallets() {
  const { data, isLoading } = useDormancy()
  const { data: trend = [] } = useActivityTrend()

  const o = data?.overall || {}
  const regions = (data?.by_region || []).map(r => {
    const never = r.never_active || 0
    return { region: r.region, total: r.total, active: Math.max(0, r.total - r.dormant - never), dormant: r.dormant, never }
  })
  const days = trend.slice(-14)
  const peak = Math.max(...days.map(d => d.transactions || 0), 1)
  const hasTrend = days.some(d => d.transactions > 0)

  return (
    <div className="stack">
      <PageHeader eyebrow="Wallets" title="Wallet activity">
        Activation, dormancy and day-to-day activity across every address.
      </PageHeader>

      <div className="grid-tiers">
        <Kpi loading={isLoading} label="Total wallets" value={fmtNum(o.total_wallets)} sub="All addresses" tone="info" />
        <Kpi loading={isLoading} label="Active" value={fmtNum(o.active_wallets)} sub={`${fmtPct(o.activation_rate)} activation · last 60 days`} tone="accent" />
        <Kpi loading={isLoading} label="Dormant" value={fmtNum(o.dormant_wallets)} sub={`${fmtPct(o.dormancy_rate)} · inactive 60+ days`} tone="warn" />
        <Kpi loading={isLoading} label="Never active" value={fmtNum(o.never_active_wallets)} sub="No successful transactions" tone="neutral" />
      </div>

      <div className="grid-2">
        <Card title="Wallet status by region" subtitle="Share of wallets"
          action={<div className="legend"><span><i style={{ background: 'var(--emerald)' }} />Active</span><span><i style={{ background: 'var(--warn)' }} />Dormant</span><span><i style={{ background: 'var(--border-strong)' }} />Never</span></div>}>
          {regions.length === 0 ? <EmptyState title="No wallet data yet" /> : (
            <div style={{ display: 'grid', gap: 14 }}>
              {regions.map(g => (
                <div key={g.region} className="region-bar">
                  <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.region}</span>
                  <div className="stacked">
                    <div style={{ width: `${(g.active / (g.total || 1)) * 100}%`, background: 'var(--emerald)' }} />
                    <div style={{ width: `${(g.dormant / (g.total || 1)) * 100}%`, background: 'var(--warn)' }} />
                    <div style={{ width: `${(g.never / (g.total || 1)) * 100}%`, background: 'var(--border-strong)' }} />
                  </div>
                  <span className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>{fmtNum(g.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Daily activity" subtitle="Successful transactions · last 14 days" chip="14 days" className="type-card">
          {!hasTrend ? (
            <EmptyState title="No transactions in this period">Daily activity appears once wallets start transacting.</EmptyState>
          ) : (
            <div className="day-bars">
              {days.map((d, i) => (
                <div key={d.day} title={`${d.day}: ${fmtNum(d.transactions)} transactions · ${fmtNum(d.active_wallets)} active wallets`} className="day-col">
                  <div className="day-bar" style={{ height: `${Math.max(3, (d.transactions / peak) * 100)}%`, background: i === days.length - 1 ? 'var(--brand-grad)' : 'color-mix(in srgb, var(--emerald) 55%, transparent)' }} />
                  <span className="mono day-label">{dayOfMonth(d.day)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <WalletTable />
    </div>
  )
}
