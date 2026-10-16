import { useDormancy, useActivityTrend } from '../hooks/useAnalytics'
import { Card } from '../components/VolumeChart'
import { Wallet, TrendingDown, Activity, Globe } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'

export default function Wallets() {
  const { data, isLoading } = useDormancy()
  const { data: trendData = [] } = useActivityTrend()
  const overall   = data?.overall   || {}
  const byRegion  = data?.by_region || []

  const total    = overall.total_wallets   || 0
  const active   = overall.active_wallets  || 0
  const dormant  = overall.dormant_wallets || 0
  const neverActive = overall.never_active_wallets || 0
  const dormRate = ((overall.dormancy_rate || 0) * 100).toFixed(1)
  const actRate  = ((overall.activation_rate || 0) * 100).toFixed(1)

  // chart data
  const chartData = byRegion.map(r => ({
    region: r.region,
    Active:  +((r.activation_rate || 0) * 100).toFixed(1),
    Dormant: +((r.dormancy_rate   || 0) * 100).toFixed(1),
    Total:   r.total,
  }))

  const StatCard = ({ label, value, sub, color, icon: Icon }) => (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '20px 22px',
      transition: 'border-color .2s, transform .2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)' }}>{label}</span>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <Icon size={15} strokeWidth={2} />
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{sub}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeUp .4s ease both' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#000', padding: '4px 12px', borderRadius: 20, background: 'var(--green)' }}>
            Wallet Management
          </span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 8 }}>
          Wallet Activation<br />& Dormancy
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 480 }}>
          Track wallet activation rates, identify dormant wallets, and monitor activity across all regions.
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label="Total Wallets"   value={total.toLocaleString()}   sub="Across all fintechs"       color="var(--blue)"  icon={Wallet} />
        <StatCard label="Active Wallets"  value={active.toLocaleString()}  sub={`${actRate}% activation`}  color="var(--green)" icon={Activity} />
        <StatCard label="Dormant Wallets" value={dormant.toLocaleString()} sub={neverActive ? `Inactive 60+ days · ${neverActive.toLocaleString()} never active` : "Inactive 60+ days"} color="var(--red)"   icon={TrendingDown} />
        <StatCard label="Dormancy Rate"   value={`${dormRate}%`}           sub="Platform-wide average"     color="var(--amber)" icon={Globe} />
      </div>

      {/* Activation bar chart */}
      <Card title="Activation vs Dormancy by Region" chip="% Share">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="region" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => `${v}%`} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v, n) => [`${v}%`, n]}
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--text-secondary)' }}
            />
            <Bar dataKey="Active"  fill="#8DFF1C"     radius={[4,4,0,0]} maxBarSize={48} />
            <Bar dataKey="Dormant" fill="#ef444455"   radius={[4,4,0,0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Activity trend */}
      <Card title="Wallet Activity Trend" chip="14 days">
        {trendData.every(d => !d.transactions) ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No transactions in this period yet.</div>
        ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#8DFF1C" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#8DFF1C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" interval="preserveStartEnd" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString()} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              formatter={v => [v.toLocaleString(), '']}
            />
            <Area type="monotone" dataKey="active_wallets" stroke="#8DFF1C" strokeWidth={2} fill="url(#activeGrad)" dot={false} name="Active wallets" />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </Card>

      {/* Region table */}
      <Card title="Wallet Breakdown by Region" chip="All regions">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Region','Total Wallets','Active','Dormant','Activation Rate','Dormancy Rate'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 14px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: '1px solid var(--border)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byRegion.map(r => (
                <tr key={r.region}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.region}</td>
                  <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums' }}>{(r.total || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{(r.total - r.dormant - (r.never_active || 0) || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{(r.dormant || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${((r.activation_rate||0)*100).toFixed(0)}%`, background: 'var(--green)', borderRadius: 2 }} />
                      </div>
                      <span style={{ color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{((r.activation_rate||0)*100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--amber)', fontVariantNumeric: 'tabular-nums' }}>{((r.dormancy_rate||0)*100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}