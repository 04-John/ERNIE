import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { useMonthlyVolume, useForecast } from '../hooks/useAnalytics'
import { Card, Skeleton, EmptyState, ChartTooltip } from './ui'
import { fmtUsd } from '../lib/format'

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortMonth = m => {
  if (m === 'forecast') return 'forecast'
  const [y, mo] = m.split('-')
  return `${MONTHS[+mo]} '${y.slice(2)}`
}

/** Monthly successful volume across all regions, with the next-30-day forecast drawn as a dashed lime tail. */
export default function VolumeChart() {
  const { data: raw = [], isLoading } = useMonthlyVolume()
  const { data: fc } = useForecast()
  if (isLoading) return <Skeleton height={360} />

  const byMonth = {}
  raw.forEach(({ month, volume }) => { byMonth[month] = (byMonth[month] || 0) + volume })
  const data = Object.keys(byMonth).sort().slice(-12).map(month => ({ month, volume: byMonth[month] }))
  const next30 = fc?.forecast?.status === 'ok' ? fc.forecast.next30 : null
  if (data.length && next30 != null) {
    data[data.length - 1] = { ...data[data.length - 1], forecast: data[data.length - 1].volume }     // the dashed tail starts where the real line ends
    data.push({ month: 'forecast', forecast: next30 })
  }
  const tick = { fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }

  return (
    <Card title="Transaction volume" subtitle={next30 != null ? 'Monthly successful volume, with a 30-day forecast' : 'Monthly successful volume'} chip="12 months">
      {data.length === 0 ? (
        <EmptyState icon={BarChart3} title="No transaction volume yet">
          Volume will appear here as soon as your wallets record successful transactions.
        </EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#10D9A0" stopOpacity=".3" /><stop offset="1" stopColor="#10D9A0" stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={shortMonth} tick={tick} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => fmtUsd(v)} tick={tick} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<ChartTooltip valueFormatter={fmtUsd} />} cursor={{ stroke: 'var(--border-strong)' }} />
            <Area type="monotone" dataKey="volume" name="Volume" stroke="var(--emerald)" strokeWidth={2.5} fill="url(#volFill)" />
            {next30 != null && <Line type="monotone" dataKey="forecast" name="Forecast" stroke="var(--lime)" strokeWidth={2} strokeDasharray="4 4" dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
