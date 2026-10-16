import { useState } from 'react'
import { Users, Building2, PlugZap, TriangleAlert, DollarSign, Sparkles } from 'lucide-react'
import { PageHeader, StatCard, Card, Badge, Alert, Skeleton } from '../components/ui'
import { useAdminOverview, useAdminWorkspaces, useSetWorkspacePlan } from '../hooks/useAnalytics'
import { fmtNum, timeAgo } from '../lib/format'

const PLANS = ['free', 'pro', 'business']

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

      <div className="grid-4" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <StatCard label="Workspaces" value={fmtNum(o.workspaces)} sub={`${o.signups_7d} new in 7 days · ${o.signups_30d} in 30`} icon={Building2} />
        <StatCard label="Users" value={fmtNum(o.users)} icon={Users} />
        <StatCard label="Connected" value={fmtNum(o.connected)} sub={`${o.with_sync_errors} with sync errors`} tone={o.with_sync_errors ? 'warn' : 'accent'} icon={o.with_sync_errors ? TriangleAlert : PlugZap} />
        <StatCard label="MRR (list price)" value={`$${fmtNum(o.mrr_usd)}`} sub={`Free ${o.by_plan.free} · Pro ${o.by_plan.pro} · Business ${o.by_plan.business}`} icon={DollarSign} />
        <StatCard label="AI messages this month" value={fmtNum(o.ai_messages_this_month)} icon={Sparkles} />
      </div>
      <p className="hint">{o.note}</p>

      <Card title="Workspaces" action={
        <input className="input" style={{ height: 36, width: 240 }} placeholder="Search name or email" value={q} onChange={e => setQ(e.target.value)} aria-label="Search workspaces" />
      }>
        {setPlan.isError && <div style={{ marginBottom: 12 }}><Alert tone="danger">{setPlan.error?.response?.data?.detail || 'Could not change the plan.'}</Alert></div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Workspace</th><th>Owner</th><th>Plan</th><th>Members</th><th>Data</th><th>AI</th><th>Created</th></tr></thead>
            <tbody>
              {(rows || []).map(w => (
                <tr key={w.id}>
                  <td><strong>{w.name}</strong></td>
                  <td>{w.owner || '—'}</td>
                  <td>
                    <select className="input" style={{ height: 32, padding: '0 8px' }} value={w.plan} aria-label={`Plan for ${w.name}`}
                      disabled={setPlan.isPending} onChange={e => setPlan.mutate({ id: w.id, plan: e.target.value })}>
                      {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {w.subscription_status && <div className="hint">{w.subscription_status}</div>}
                  </td>
                  <td className="tnum">{w.members}</td>
                  <td>
                    {!w.connected ? <Badge>Not connected</Badge>
                      : w.sync_error ? <Badge tone="danger" dot>Error</Badge>
                      : <Badge tone="success" dot>OK</Badge>}
                    {w.last_synced_at && <div className="hint">{timeAgo(w.last_synced_at)}</div>}
                    {w.sync_error && <div className="hint" style={{ maxWidth: 220 }}>{w.sync_error}</div>}
                  </td>
                  <td className="tnum">{w.ai_messages_this_month}</td>
                  <td className="hint">{w.created_at ? new Date(w.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {rows && rows.length === 0 && <tr><td colSpan={7} className="hint" style={{ textAlign: 'center', padding: 24 }}>No workspaces match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
