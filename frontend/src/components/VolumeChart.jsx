import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { useMonthlyVolume } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState, ChartTooltip } from './ui'
import { fmtUsd, regionColor } from '../lib/format'

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortMonth = m => { const [y, mo] = m.split('-'); return `${MONTHS[+mo]} '${y.slice(2)}` }

export default function VolumeChart() {
  const { data: raw = [], isLoading } = useMonthlyVolume()

  if (isLoading) return <Skeleton height={360} />

  // pivot rows into [{ month, Africa: n, LatAm: n, ... }]
  const pivot = {}
  raw.forEach(({ month, region, volume }) => {
    pivot[month] ??= { month }
    pivot[month][region] = volume
  })
  const data = Object.values(pivot).sort((a, b) => a.month.localeCompare(b.month)).slice(-18)
  const regions = [...new Set(raw.map(r => r.region))]

  return (
    <Card title="Transaction volume" subtitle="Successful transactions by region, USD" chip="Last 18 months">
      {data.length === 0 ? (
        <EmptyState icon={BarChart3} title="No transaction volume yet">
          Volume will appear here as soon as your wallets record successful transactions.
        </EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={290}>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => fmtUsd(v)} tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<ChartTooltip valueFormatter={fmtUsd} />} cursor={{ stroke: 'var(--border-strong)' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 14 }} />
            {regions.map(r => (
              <Line key={r} type="monotone" dataKey={r} stroke={regionColor(r)} strokeWidth={2.2} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
