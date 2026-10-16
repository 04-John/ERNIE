import { ArrowLeft, Clock, DollarSign, Repeat, Wallet as WalletIcon, SearchX, TrendingUp } from 'lucide-react'
import { ComposedChart, Bar, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import DraftOutreach from '../components/DraftOutreach'
import { useFintech } from '../hooks/useAnalytics'
import { PageHeader, StatCard, Card, Badge, Skeleton, EmptyState, ChartTooltip, ProgressBar } from '../components/ui'
import { fmtNum, fmtUsd, fmtPct, timeAgo, RISK_TONE } from '../lib/format'

const TX_TONE = { SUCCESS: 'success', FAILED: 'danger', PENDING: 'warn' }
const dayLabel = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

function walletState(w) {
  if (w.neverActive) return { tone: 'neutral', label: 'Never active' }
  if (w.isDormant) return { tone: 'warn', label: 'Dormant' }
  return { tone: 'success', label: 'Active' }
}

function WhyCard({ fintech }) {
  const items = fintech.breakdown || []
  if (!items.length) {
    return (
      <Card title="Why this score" subtitle="How the risk was worked out">
        <EmptyState icon={TrendingUp} title="Not scored yet">Risk is scored once this fintech has at least one successful transaction.</EmptyState>
      </Card>
    )
  }
  const tone = RISK_TONE[fintech.churn_risk]
  return (
    <Card title="Why this score" subtitle="Every point of the score, explained" chip={`${fmtPct(fintech.churn_probability, 0)} · ${fintech.churn_risk}`}>
      <div style={{ display: 'grid', gap: 18 }}>
        {items.map(b => (
          <div key={b.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{b.label} <span className="hint">· weight {Math.round(b.weight * 100)}%</span></span>
              <span className="tnum" style={{ fontWeight: 700, color: b.points > 0 ? `var(--${tone === 'success' ? 'success' : tone === 'neutral' ? 'text-2' : tone})` : 'var(--muted)' }}>+{b.points.toFixed(2)}</span>
            </div>
            <ProgressBar value={b.value * 100} tone={b.points > 0 ? tone : 'neutral'} />
            <div className="hint" style={{ marginTop: 6 }}>{b.detail}</div>
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        Probability is the sum of these points. High is 0.60 or more and Medium is 0.30 or more. The score never depends on other fintechs,
        so it only changes when this fintech's own behaviour does. It is a transparent heuristic, not a trained model.
      </p>
    </Card>
  )
}

export default function FintechDetail({ param }) {
  const { data, isLoading, isError, error } = useFintech(param)

  const back = <a href="#/analytics" className="btn btn-sm" style={{ alignSelf: 'flex-start' }}><ArrowLeft size={14} /> Analytics</a>

  if (isLoading) return <div className="stack">{back}<Skeleton height={80} /><Skeleton height={140} /><Skeleton height={320} /></div>
  if (isError || !data) {
    return (
      <div className="stack">{back}
        <Card><EmptyState icon={SearchX} title={error?.response?.status === 404 ? 'Fintech not found' : 'Could not load this fintech'}>
          It may have been removed, or belong to a different workspace.
        </EmptyState></Card>
      </div>
    )
  }

  const f = data.fintech
  const tone = RISK_TONE[f.churn_risk] || 'neutral'
  const history = (data.history || []).map(p => ({ ...p, label: dayLabel(p.day) }))
  const hasActivity = data.activity.some(w => w.transactions > 0)
  const lastTx = f.total_tx > 0 ? (f.days_since_last_tx < 1 ? 'Today' : `${Math.round(f.days_since_last_tx)}d ago`) : 'Never'

  return (
    <div className="stack">
      {back}
      <PageHeader eyebrow="Fintech" title={f.fintech_name}
        actions={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Badge tone={tone}>{f.churn_risk === 'Unknown' ? 'Not scored' : `${f.churn_risk} risk`}</Badge>
          {f.churn_risk !== 'Unknown' && <span className="tnum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: `var(--${tone === 'neutral' ? 'text' : tone})` }}>{fmtPct(f.churn_probability, 0)}</span>}
        </div>}>
        {f.region} · {f.type || 'Unclassified'}{f.country && f.country !== 'Unknown' ? ` · ${f.country}` : ''}
      </PageHeader>
      {f.churn_risk !== 'Unknown' && <div><DraftOutreach fintechId={f.fintech_id} name={f.fintech_name} /></div>}

      <div className="grid-kpi">
        <StatCard label="Last transaction" value={lastTx} sub="Successful transactions only" tone={f.days_since_last_tx > 60 ? 'warn' : 'accent'} icon={Clock} />
        <StatCard label="Volume" value={fmtUsd(f.total_volume)} sub={`Average ${fmtUsd(f.avg_tx_size)} per transaction`} tone="info" icon={DollarSign} />
        <StatCard label="Transactions" value={fmtNum(f.total_tx)} sub="Successful, all time" tone="accent" icon={Repeat} />
        <StatCard label="Wallets" value={fmtNum(data.wallet_count)} sub={`${fmtPct(f.dormancy_rate, 0)} dormant`} tone="neutral" icon={WalletIcon} />
      </div>

      <div className="grid-2">
        <WhyCard fintech={f} />

        <Card title="Risk over time" subtitle="Daily risk score for this fintech" chip={`${history.length} day${history.length === 1 ? '' : 's'}`}>
          {data.demo ? (
            <EmptyState icon={TrendingUp} title="Connect your wallet to track risk over time">Daily risk history is recorded for connected workspaces.</EmptyState>
          ) : history.length < 2 ? (
            <EmptyState icon={TrendingUp} title="History starts today">One score is saved per day. The trend appears from the second day.</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={history} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF6B78" stopOpacity={0.28} /><stop offset="100%" stopColor="#FF6B78" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.3, 0.6, 1]} tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
                <ReferenceLine y={0.6} stroke="var(--danger)" strokeDasharray="4 4" />
                <ReferenceLine y={0.3} stroke="var(--warn)" strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip valueFormatter={v => `${(v * 100).toFixed(0)}%`} />} cursor={{ stroke: 'var(--border-strong)' }} />
                <Area type="monotone" dataKey="probability" name="Churn probability" stroke="#FF6B78" strokeWidth={2.2} fill="url(#riskFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card title="Weekly activity" subtitle="Successful volume and transaction count" chip="Last 26 weeks">
        {!hasActivity ? (
          <EmptyState icon={Repeat} title="No transactions in this period">Weekly activity appears once this fintech transacts.</EmptyState>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data.activity} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" interval="preserveStartEnd" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="v" tickFormatter={fmtUsd} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
              <YAxis yAxisId="t" orientation="right" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip content={<ChartTooltip valueFormatter={v => fmtNum(v)} />} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar yAxisId="v" dataKey="volume" name="Volume (USD)" fill="var(--emerald)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Line yAxisId="t" type="monotone" dataKey="transactions" name="Transactions" stroke="var(--info)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Wallets" subtitle="Addresses belonging to this fintech" chip={`${fmtNum(data.wallet_count)}`}>
          {data.wallets.length === 0 ? <EmptyState title="No wallets" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Status</th><th>Last activity</th><th className="num">Balance</th></tr></thead>
                <tbody>
                  {data.wallets.slice(0, 10).map(w => {
                    const st = walletState(w)
                    return (
                      <tr key={w.id}>
                        <td style={{ fontWeight: 600 }}>{w.label}<div className="hint" style={{ textTransform: 'capitalize' }}>{w.network}</div></td>
                        <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
                        <td style={{ color: 'var(--text-2)' }}>{w.neverActive ? '—' : timeAgo(w.lastActive)}</td>
                        <td className="num">{fmtUsd(w.balanceUsd)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {data.wallet_count > 10 && <p className="hint" style={{ marginTop: 12 }}>Showing 10 of {fmtNum(data.wallet_count)} wallets.</p>}
            </div>
          )}
        </Card>

        <Card title="Recent transactions" subtitle="Newest first" chip={`${data.recent_transactions.length}`}>
          {data.recent_transactions.length === 0 ? <EmptyState title="No transactions yet" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>When</th><th>Type</th><th className="num">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {data.recent_transactions.map(t => (
                    <tr key={t.id}>
                      <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{timeAgo(t.createdAt)}{t.hash && <div className="hint mono">{t.hash}</div>}</td>
                      <td style={{ textTransform: 'capitalize' }}>{t.type}</td>
                      <td className="num">{fmtNum(t.amount)} <span className="hint">{t.currency}</span></td>
                      <td><Badge tone={TX_TONE[t.status] || 'neutral'}>{t.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
