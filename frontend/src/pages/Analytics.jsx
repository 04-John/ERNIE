import { useState } from 'react'
import { useDistribution } from '../hooks/useAnalytics'
import { PageHeader, Skeleton } from '../components/ui'
import ChurnTable from '../components/ChurnTable'
import TopRiskList from '../components/TopRiskList'
import TypeBars from '../components/TypeBars'
import RegionalCards from '../components/RegionalCards'
import TrendsCard from '../components/TrendsCard'
import ForecastCard from '../components/ForecastCard'
import CohortsCard from '../components/CohortsCard'
import { fmtNum } from '../lib/format'

const TIERS = [
  { key: 'High', label: 'High risk', tone: 'danger' },
  { key: 'Medium', label: 'Medium risk', tone: 'warn' },
  { key: 'Low', label: 'Low risk', tone: 'success' },
  { key: 'Unknown', label: 'Not scored', tone: 'neutral' },
]

export default function Analytics() {
  const { data: dist = {}, isLoading } = useDistribution()
  const [risk, setRisk] = useState(null)

  const scored = (dist.High || 0) + (dist.Medium || 0) + (dist.Low || 0)
  const sub = k => (k === 'Unknown' ? 'No transaction history yet' : scored ? `${(((dist[k] || 0) / scored) * 100).toFixed(0)}% of scored fintechs` : 'No scored fintechs yet')

  // clicking a tile filters the table at the bottom of the page
  const pick = k => {
    setRisk(r => (r === k ? null : k))
    requestAnimationFrame(() => document.getElementById('fintech-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Analytics" title="Risk intelligence">
        Churn risk scores, risk distribution and fintech-level retention signals.
      </PageHeader>

      <div className="grid-tiers">
        {TIERS.map(t => isLoading ? <Skeleton key={t.key} height={120} /> : (
          <button key={t.key} className={`tier-tile tone-${t.tone}`} aria-pressed={risk === t.key} onClick={() => pick(t.key)}>
            <div className="tier-tile-label"><span className="dot" />{t.label}</div>
            <div className="display tier-tile-value">{fmtNum(dist[t.key] || 0)}</div>
            <div className="tier-tile-sub">{sub(t.key)}</div>
          </button>
        ))}
      </div>

      <TrendsCard />
      <ForecastCard />

      <div className="grid-2" style={{ alignItems: 'stretch' }}>
        <TypeBars title="Average volume by fintech type" subtitle="USD (thousands) per fintech" chip="Per fintech" />
        <TopRiskList />
      </div>

      <RegionalCards />
      <CohortsCard />
      <ChurnTable risk={risk} onRisk={setRisk} />
    </div>
  )
}
