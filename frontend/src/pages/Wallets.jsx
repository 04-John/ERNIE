import { Wallet, Activity, PauseCircle, Hourglass, Inbox } from 'lucide-react'
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useDormancy, useActivityTrend, useWalletList } from '../hooks/useAnalytics'
import { PageHeader, StatCard, Card, Badge, Skeleton, EmptyState, ChartTooltip } from '../components/ui'
import { fmtNum, fmtUsd, fmtPct, timeAgo } from '../lib/format'

function walletState(w) {
  if (w.neverActive) return { tone: 'neutral', label: 'Never active' }
  if (w.isDormant)   return { tone: 'warn',    label: 'Dormant' }
  return { tone: 'success', label: 'Active' }
}

function WalletTable() {
  const { data, isLoading } = useWalletList({ limit: 25 })
  if (isLoading) return <Skeleton height={300} />
  const rows = data?.data || []

  return (
    <Card title="Wallets" subtitle="Individual addresses and their activity" chip={`${fmtNum(data?.total)} total`}>
      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title="No wallets yet">Addresses created in your Blockradar wallet will appear here.</EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Network</th><th>Status</th><th>Last activity</th><th className="num">Transactions</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                {rows.map(w => {
                  const st = walletState(w)
                  return (
                    <tr key={w.id}>
                      <td style={{ fontWeight: 600 }}>{w._fintechName || '—'}</td>
                      <td style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{w.network || '—'}</td>
                      <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
                      <td style={{ color: 'var(--text-2)' }}>
                        {w.neverActive ? <span className="hint">No transactions · created {w.daysSinceLastTx}d ago</span> : timeAgo(w.lastActive)}
                      </td>
                      <td className="num">{fmtNum(w.totalTransactions)}</td>
                      <td className="num">{fmtUsd(w.balanceUsd)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {data.total > rows.length && <p className="hint" style={{ marginTop: 14 }}>Showing the first {rows.length} of {fmtNum(data.total)} wallets.</p>}
        </>
      )}
    </Card>
  )
}

export default function Wallets() {
  const { data, isLoading } = useDormancy()
  const { data: trend = [] } = useActivityTrend()

  const o = data?.overall || {}
  const regions = (data?.by_region || []).map(r => ({
    region: r.region,
    Active: r.total - r.dormant - (r.never_active || 0),
    Dormant: r.dormant,
    'Never active': r.never_active || 0,
  }))
  const hasTrend = trend.some(d => d.transactions > 0)

  return (
    <div className="stack">
      <PageHeader eyebrow="Wallets" title="Wallet activity">
        Activation, dormancy and day-to-day activity across every address.
      </PageHeader>

      <div className="grid-kpi">
        <StatCard loading={isLoading} label="Total wallets"  value={fmtNum(o.total_wallets)} sub="All addresses" tone="info" icon={Wallet} />
        <StatCard loading={isLoading} label="Active"  value={fmtNum(o.active_wallets)} sub={`${fmtPct(o.activation_rate)} activation · last 60 days`} tone="accent" icon={Activity} />
        <StatCard loading={isLoading} label="Dormant" value={fmtNum(o.dormant_wallets)} sub={`${fmtPct(o.dormancy_rate)} · inactive 60+ days`} tone="warn" icon={PauseCircle} />
        <StatCard loading={isLoading} label="Never active" value={fmtNum(o.never_active_wallets)} sub="No successful transactions" tone="neutral" icon={Hourglass} />
      </div>

      <div className="grid-2">
        <Card title="Wallet status by region" subtitle="Number of wallets" chip="Stacked">
          {regions.length === 0 ? <EmptyState title="No wallet data yet" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={regions} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="region" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString()} width={52} />
                <Tooltip content={<ChartTooltip valueFormatter={fmtNum} />} cursor={{ fill: 'var(--surface-2)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar dataKey="Active" stackId="a" fill="var(--emerald)" maxBarSize={48} />
                <Bar dataKey="Dormant" stackId="a" fill="var(--warn)" maxBarSize={48} />
                <Bar dataKey="Never active" stackId="a" fill="var(--border-strong)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Daily activity" subtitle="Successful transactions and active wallets" chip="Last 14 days">
          {!hasTrend ? (
            <EmptyState icon={Activity} title="No transactions in this period">Daily activity appears once wallets start transacting.</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10D9A0" stopOpacity={0.35} /><stop offset="100%" stopColor="#10D9A0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" interval="preserveStartEnd" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                <Tooltip content={<ChartTooltip valueFormatter={fmtNum} />} cursor={{ stroke: 'var(--border-strong)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Area type="monotone" dataKey="transactions" name="Transactions" stroke="#10D9A0" strokeWidth={2} fill="url(#actFill)" />
                <Area type="monotone" dataKey="active_wallets" name="Active wallets" stroke="var(--info)" strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <WalletTable />
    </div>
  )
}
