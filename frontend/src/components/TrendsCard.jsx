import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { useHistory } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState, ChartTooltip } from './ui'
import { fmtNum, fmtUsd } from '../lib/format'

const METRICS = [
  { key: 'dormancy_rate',   label: 'Dormancy rate',  fmt: v => `${(v * 100).toFixed(1)}%`, axis: v => `${Math.round(v * 100)}%`, color: 'var(--warn)' },
  { key: 'active_wallets',  label: 'Active wallets', fmt: fmtNum,                          axis: fmtNum,                          color: 'var(--emerald)' },
  { key: 'high_risk',       label: 'High-risk fintechs', fmt: fmtNum,                      axis: v => v,                          color: 'var(--danger)' },
  { key: 'total_volume_usd', label: 'Volume',        fmt: fmtUsd,                          axis: fmtUsd,                          color: 'var(--info)' },
]

const dayLabel = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function TrendsCard() {
  const [metricKey, setMetricKey] = useState('dormancy_rate')
  const [days, setDays] = useState(30)
  const { data, isLoading } = useHistory(days)
  const metric = METRICS.find(m => m.key === metricKey)

  if (isLoading) return <Skeleton height={340} />

  const points = (data?.data || []).map(p => ({ ...p, label: dayLabel(p.day) }))

  return (
    <Card title="Trends" subtitle="Daily snapshots of your workspace" chip={`${points.length} day${points.length === 1 ? '' : 's'} recorded`}
      action={
        <div className="segmented" role="group" aria-label="Range">
          {[30, 90].map(d => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d}d</button>)}
        </div>
      }>
      <div className="filters">
        {METRICS.map(m => (
          <button key={m.key} className="pill" aria-pressed={metricKey === m.key} onClick={() => setMetricKey(m.key)}>{m.label}</button>
        ))}
      </div>

      {data?.demo ? (
        <EmptyState icon={TrendingUp} title="Connect your wallet to track trends">
          ERNIE records a snapshot of your metrics after every sync, so you can see whether dormancy and risk are improving over time.
        </EmptyState>
      ) : points.length < 2 ? (
        <EmptyState icon={TrendingUp} title="Your history starts today">
          One snapshot is saved per day. Trends appear here from your second day of data{points.length === 1 ? ` (today: ${metric.fmt(points[0][metric.key])})` : ''}.
        </EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metric.color} stopOpacity={0.3} /><stop offset="100%" stopColor={metric.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={metric.axis} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={64} allowDecimals={false} />
            <Tooltip content={<ChartTooltip valueFormatter={metric.fmt} />} cursor={{ stroke: 'var(--border-strong)' }} />
            <Area type="monotone" dataKey={metric.key} name={metric.label} stroke={metric.color} strokeWidth={2.2} fill="url(#trendFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
