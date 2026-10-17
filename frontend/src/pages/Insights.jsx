import { useState } from 'react'
import { useInsights, useRestoreInsights } from '../hooks/useAnalytics'
import { PageHeader, Skeleton } from '../components/ui'
import { InsightList } from '../components/Insights'
import { SEVERITY } from '../lib/severity'

export default function Insights() {
  const { data, isLoading } = useInsights()
  const restore = useRestoreInsights()
  const [filter, setFilter] = useState(null)
  const all = data?.data || []
  const shown = filter ? all.filter(i => i.severity === filter) : all
  const count = s => all.filter(i => i.severity === s).length
  const dismissed = data?.dismissed || 0

  return (
    <div className="stack" style={{ maxWidth: 980 }}>
      <PageHeader eyebrow="Insights" title="What needs your attention">
        ERNIE reads your data after every sync and turns it into findings, each with the evidence behind it and a suggested next step.
      </PageHeader>

      {data?.demo && (
        <div className="banner tone-warn" role="status">
          <span className="banner-glyph">!</span>
          <div style={{ flex: 1 }}><b>These insights are about demo data.</b> Connect your Blockradar wallet in <a href="#/settings" className="link-btn">Settings →</a> to get findings about your own fintechs.</div>
        </div>
      )}

      <div className="filters" style={{ marginBottom: 0 }}>
        <button className="pill" aria-pressed={filter === null} onClick={() => setFilter(null)}>All {all.length}</button>
        {Object.entries(SEVERITY).map(([k, m]) => (
          count(k) > 0 && <button key={k} className="pill" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? null : k)}>{m.label} {count(k)}</button>
        ))}
      </div>

      {isLoading ? <div style={{ display: 'grid', gap: 12 }}><Skeleton height={140} /><Skeleton height={140} /></div> : <InsightList insights={shown} />}

      {dismissed > 0 && (
        <div className="dismissed-strip">
          <span>{dismissed} finding{dismissed === 1 ? '' : 's'} hidden until the situation materially changes.</span>
          <button className="link-btn" onClick={() => restore.mutate()} disabled={restore.isPending}>{restore.isPending ? 'Restoring…' : 'Show again'}</button>
        </div>
      )}

      <p className="hint" style={{ lineHeight: 1.6, fontSize: 12.5 }}>
        Findings come from fixed, transparent rules over your own data: risk tiers, each fintech's usual rhythm, volume trends, concentration,
        activation, dormancy and a statistical forecast.
      </p>
    </div>
  )
}
