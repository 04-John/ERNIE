import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, ReferenceLine, ResponsiveContainer } from 'recharts'
import { LineChart as LineIcon } from 'lucide-react'
import { useForecast } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState, ChartTooltip } from './ui'
import { fmtUsd } from '../lib/format'

const label = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function ForecastCard() {
  const { data, isLoading } = useForecast()
  if (isLoading) return <Skeleton height={380} />

  const fc = data?.forecast
  const anomalies = data?.anomalies || []

  if (!fc || fc.status !== 'ok') {
    return (
      <Card title="Volume forecast" subtitle="Next 30 days, with an 80% range">
        <EmptyState icon={LineIcon} title="Not enough history to forecast yet">
          {fc?.reason || 'A forecast needs a few weeks of transactions.'} ERNIE won't guess.
        </EmptyState>
      </Card>
    )
  }

  const lastActual = fc.history[fc.history.length - 1]
  const points = [
    ...fc.history.map(p => ({ day: p.day, label: label(p.day), actual: p.value })),
    // join the lines: the forecast starts from the last actual point
    ...fc.forecast.map((p, i) => ({ day: p.day, label: label(p.day), forecast: p.value, band: [p.low, p.high], ...(i === 0 ? { actual: undefined } : {}) })),
  ]
  points[fc.history.length - 1] = { ...points[fc.history.length - 1], forecast: lastActual.value }
  const change = fc.change
  const byDay = Object.fromEntries(points.map(p => [p.day, p]))

  return (
    <Card title="Volume forecast" subtitle="Next 30 days, with an 80% range"
      chip={change == null ? undefined : `${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}% vs last 30 days`}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
        <div><div className="stat-label">Last 30 days</div><div className="tnum display" style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{fmtUsd(fc.last30)}</div></div>
        <div><div className="stat-label">Next 30 days (forecast)</div><div className="tnum display" style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: change < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtUsd(fc.next30)}</div></div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5FAEFF" stopOpacity={0.25} /><stop offset="100%" stopColor="#5FAEFF" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmtUsd} tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={64} />
          <Tooltip content={<ChartTooltip valueFormatter={v => (Array.isArray(v) ? `${fmtUsd(v[0])} to ${fmtUsd(v[1])}` : fmtUsd(v))} />} cursor={{ stroke: 'var(--border-strong)' }} />
          <ReferenceLine x={label(lastActual.day)} stroke="var(--border-strong)" strokeDasharray="4 4" label={{ value: 'Today', fill: 'var(--muted)', fontSize: 11, position: 'top' }} />
          <Area dataKey="band" name="80% range" stroke="none" fill="url(#bandFill)" connectNulls />
          <Line dataKey="actual" name="Actual" stroke="var(--emerald)" strokeWidth={2} dot={false} connectNulls />
          <Line dataKey="forecast" name="Forecast" stroke="var(--info)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
          {anomalies.filter(a => byDay[a.day]).map(a => (
            <ReferenceDot key={a.day} x={label(a.day)} y={a.value} r={5} fill={a.direction === 'spike' ? 'var(--info)' : 'var(--danger)'} stroke="var(--surface)" strokeWidth={2} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="hint" style={{ marginTop: 12 }}>
        {fc.method} Dots mark unusual days ({anomalies.length || 'none'} in the last two weeks). This is a statistical projection from your own history, not a promise.
      </p>
    </Card>
  )
}
