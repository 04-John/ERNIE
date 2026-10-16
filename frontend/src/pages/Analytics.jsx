import { AlertTriangle, TrendingDown, CheckCircle2, HelpCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useDistribution, useTypeBreakdown } from '../hooks/useAnalytics'
import { PageHeader, StatCard, Card, EmptyState, ChartTooltip } from '../components/ui'
import ChurnTable from '../components/ChurnTable'
import TopRiskList from '../components/TopRiskList'
import RegionalCards from '../components/RegionalCards'
import TrendsCard from '../components/TrendsCard'
import ForecastCard from '../components/ForecastCard'
import CohortsCard from '../components/CohortsCard'
import { fmtNum } from '../lib/format'

export default function Analytics() {
  const { data: dist = {}, isLoading } = useDistribution()
  const { data: types = [] } = useTypeBreakdown()

  const high = dist.High || 0, medium = dist.Medium || 0, low = dist.Low || 0
  const total = high + medium + low
  const share = n => (total ? `${((n / total) * 100).toFixed(0)}% of scored fintechs` : 'No scored fintechs yet')
  const byType = [...types].sort((a, b) => b.avg_volume_k - a.avg_volume_k)

  return (
    <div className="stack">
      <PageHeader eyebrow="Analytics" title="Risk intelligence">
        Churn probability, risk distribution and fintech-level retention signals.
      </PageHeader>

      <div className="grid-kpi">
        <StatCard loading={isLoading} label="High risk"   value={fmtNum(high)}   sub={share(high)}   tone="danger"  icon={AlertTriangle} />
        <StatCard loading={isLoading} label="Medium risk" value={fmtNum(medium)} sub={share(medium)} tone="warn"    icon={TrendingDown} />
        <StatCard loading={isLoading} label="Low risk"    value={fmtNum(low)}    sub={share(low)}    tone="success" icon={CheckCircle2} />
        <StatCard loading={isLoading} label="Not scored"  value={fmtNum(dist.Unknown)} sub="No transaction history yet" tone="neutral" icon={HelpCircle} />
      </div>

      <TrendsCard />

      <ForecastCard />

      <div className="grid-2">
        <Card title="Average volume by fintech type" subtitle="USD (thousands)" chip="Per fintech">
          {byType.length === 0 ? (
            <EmptyState title="No type data yet">Tag addresses with a type in Blockradar metadata to compare segments.</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, byType.length * 44)}>
              <BarChart data={byType} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}k`} />
                <YAxis type="category" dataKey="type" tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<ChartTooltip valueFormatter={v => `$${v}k`} />} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="avg_volume_k" name="Avg volume" fill="var(--emerald)" radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <TopRiskList />
      </div>

      <RegionalCards />
      <CohortsCard />
      <ChurnTable />
    </div>
  )
}
