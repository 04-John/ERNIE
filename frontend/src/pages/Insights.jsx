import { useState } from 'react'
import { useInsights } from '../hooks/useAnalytics'
import { PageHeader, Alert, Skeleton } from '../components/ui'
import { InsightList } from '../components/Insights'
import { SEVERITY } from '../lib/severity'
import HealthCard from '../components/HealthCard'

export default function Insights() {
  const { data, isLoading } = useInsights()
  const [filter, setFilter] = useState(null)
  const all = data?.data || []
  const shown = filter ? all.filter(i => i.severity === filter) : all
  const count = s => all.filter(i => i.severity === s).length

  return (
    <div className="stack">
      <PageHeader eyebrow="Insights" title="What needs your attention">
        ERNIE reads your data after every sync and turns it into findings, each with the evidence behind it and a suggested next step.
      </PageHeader>

      {data?.demo && (
        <Alert tone="warn">
          <strong>These insights are about demo data.</strong> Connect your Blockradar wallet in <a href="#/settings" className="link">Settings</a> to get findings about your own fintechs.
        </Alert>
      )}

      <HealthCard />

      <div className="filters" style={{ marginBottom: 0 }}>
        <button className="pill" aria-pressed={filter === null} onClick={() => setFilter(null)}>All {all.length}</button>
        {Object.entries(SEVERITY).map(([k, m]) => (
          count(k) > 0 && <button key={k} className="pill" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? null : k)}>{m.label} {count(k)}</button>
        ))}
      </div>

      {isLoading ? <div style={{ display: 'grid', gap: 14 }}><Skeleton height={140} /><Skeleton height={140} /></div> : <InsightList insights={shown} />}

      <p className="hint">
        Findings come from fixed, transparent rules over your own data (risk tiers, each fintech's usual rhythm, volume trends, concentration,
        activation, dormancy and a statistical forecast). Dismiss one to hide it until the situation changes.
      </p>
    </div>
  )
}
