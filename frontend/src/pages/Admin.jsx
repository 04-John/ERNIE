import { useState } from 'react'
import { Search } from 'lucide-react'
import { PageHeader, Alert, Skeleton } from '../components/ui'
import { useAdminOverview, useAdminWorkspaces, useSetWorkspacePlan } from '../hooks/useAnalytics'
import { fmtNum, timeAgo } from '../lib/format'

const PLANS = ['free', 'pro', 'business']
const COLS = 'minmax(0,1.2fr) minmax(0,1.3fr) 140px 80px minmax(0,1.3fr) 70px 110px'

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`card stat tone-${tone}`} style={{ padding: 20 }}>
      <div className="stat-top" style={{ marginBottom: 0 }}><span className="stat-label">{label}</span><span className="stat-square" aria-hidden="true" /></div>
      <div className="stat-value" style={{ marginTop: 12, fontSize: 30 }}>{value}</div>
      <div className="stat-sub" style={{ marginTop: 8 }}>{sub}</div>
    </div>
  )
}

/** For whoever runs ERNIE. The server answers 404 to everyone else, so non-admins just see "not available". */
export default function Admin() {
  const [q, setQ] = useState('')
  const { data: o, isLoading, isError } = useAdminOverview()
  const { data: rows } = useAdminWorkspaces(q.trim())
  const setPlan = useSetWorkspacePlan()

  if (isError) return <Alert tone="info">The admin console isn't available for this account.</Alert>
  if (isLoading) return <div className="stack"><Skeleton height={60} /><Skeleton height={300} /></div>

  return (
    <div className="stack">
      <PageHeader eyebrow="Platform" title="Admin console">Every workspace on this ERNIE server, its plan and its sync health.</PageHeader>

      <div className="grid-tiers" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Kpi label="Workspaces" value={fmtNum(o.workspaces)} sub={`${o.signups_7d} new in 7 days · ${o.signups_30d} in 30`} tone="accent" />
        <Kpi label="Users" value={fmtNum(o.users)} sub="Across all workspaces" tone="info" />
        <Kpi label="Connected" value={fmtNum(o.connected)} sub={`${o.with_sync_errors} with sync errors`} tone={o.with_sync_errors ? 'warn' : 'success'} />
        <Kpi label="MRR (list price)" value={`$${fmtNum(o.mrr_usd)}`} sub={`Free ${o.by_plan.free} · Pro ${o.by_plan.pro} · Business ${o.by_plan.business}`} tone="success" />
        <Kpi label="AI messages this month" value={fmtNum(o.ai_messages_this_month)} sub="Ask ERNIE, all workspaces" tone="neutral" />
      </div>
      <p className="hint" style={{ fontSize: 12.5 }}>{o.note}</p>

      <section className="panel">
        <div className="panel-head">
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h2 className="section-title">Workspaces</h2>
            <div className="panel-sub">{rows ? `${rows.length} workspace${rows.length === 1 ? '' : 's'}${q.trim() ? ' match' : ''}` : 'Loading…'}</div>
          </div>
          <div className="search" style={{ maxWidth: 240 }}>
            <Search size={14} />
            <input className="input" placeholder="Search name or email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search workspaces" />
          </div>
        </div>
        {setPlan.isError && <div style={{ padding: '12px 22px 0' }}><Alert tone="danger">{setPlan.error?.response?.data?.detail || 'Could not change the plan.'}</Alert></div>}

        <div className="gt-wrap">
          <div style={{ minWidth: 980 }}>
            <div className="gt-head" style={{ gridTemplateColumns: COLS }}>
              <span>Workspace</span><span>Owner</span><span>Plan</span><span className="gt-r">Members</span><span>Data</span><span className="gt-r">AI</span><span>Created</span>
            </div>
            {(rows || []).map(w => {
              const dataTone = !w.connected ? 'neutral' : w.sync_error ? 'danger' : 'success'
              return (
                <div key={w.id} className="gt-row" style={{ gridTemplateColumns: COLS, alignItems: 'start' }}>
                  <span style={{ fontWeight: 600 }}>{w.name}</span>
                  <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.owner || '—'}</span>
                  <div>
                    <select className="input" style={{ height: 32, padding: '0 8px', fontSize: 13 }} value={w.plan} aria-label={`Plan for ${w.name}`}
                      disabled={setPlan.isPending} onChange={e => setPlan.mutate({ id: w.id, plan: e.target.value })}>
                      {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {w.subscription_status && <div style={{ fontSize: 11.5, marginTop: 3, color: w.subscription_status === 'past_due' ? 'var(--warn)' : 'var(--muted)' }}>{w.subscription_status}</div>}
                  </div>
                  <span className="gt-r">{w.members}</span>
                  <div style={{ minWidth: 0 }}>
                    <span className={`sbadge tone-${dataTone}`}><i />{!w.connected ? 'Not connected' : w.sync_error ? 'Error' : 'OK'}</span>
                    {w.last_synced_at && <div className="hint" style={{ fontSize: 11.5, marginTop: 3 }}>{timeAgo(w.last_synced_at)}</div>}
                    {w.sync_error && <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 2 }}>{w.sync_error}</div>}
                  </div>
                  <span className="gt-r">{w.ai_messages_this_month}</span>
                  <span className="hint" style={{ fontSize: 12.5 }}>{w.created_at ? new Date(w.created_at).toLocaleDateString() : '—'}</span>
                </div>
              )
            })}
            {rows && rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>No workspaces match.</div>}
          </div>
        </div>
      </section>
    </div>
  )
}
