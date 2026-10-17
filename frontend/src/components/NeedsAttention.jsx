import { Check, ChevronRight } from 'lucide-react'
import { useChurnScores, useDistribution, useInsights, useSparklines } from '../hooks/useAnalytics'
import { useFintechDrawer } from '../lib/drawer'
import Spark from './Spark'
import { Skeleton } from './ui'
import { fmtPct } from '../lib/format'

const tierClass = risk => `tier-${String(risk || 'unknown').toLowerCase()}`

/**
 * The main block on Overview: the fintechs most likely to churn, ranked, each with the reason it is here
 * and a 30-day trend. It merges what used to be the top-insights list and the "Most at risk" list.
 */
export default function NeedsAttention() {
  const { data, isLoading } = useChurnScores({ limit: 50 })
  const { data: dist = {} } = useDistribution()
  const { data: ins } = useInsights()
  const { openFintech } = useFintechDrawer()

  const rows = (data?.data || []).filter(f => f.churn_risk === 'High' || f.churn_risk === 'Medium').slice(0, 5)
  const { data: sparks = {} } = useSparklines(rows.map(r => r.fintech_id))

  if (isLoading) return <Skeleton height={380} />

  const insights = ins?.data || []
  const also = insights.find(i => !(i.fintech_ids || []).length) || insights[0]

  return (
    <section className="panel" aria-label="Needs attention">
      <div className="panel-head">
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h2 className="section-title">Needs attention</h2>
          <div className="panel-sub">Ranked by risk score · each with the reason it's here</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dist.High > 0 && <span className="count-pill tier-high">{dist.High} High</span>}
          {dist.Medium > 0 && <span className="count-pill tier-medium">{dist.Medium} Medium</span>}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <span className="empty-icon" style={{ color: 'var(--success)' }}><Check size={22} /></span>
          <h3 className="display" style={{ fontSize: 16, fontWeight: 700 }}>Nothing needs your attention</h3>
          <p>ERNIE checks your data after every sync. Findings appear here when something changes.</p>
        </div>
      ) : (
        <div className="gt-wrap">
          <div style={{ minWidth: 760 }}>
            {rows.map(f => (
              <button key={f.fintech_id} className={`gt-row attn-row ${tierClass(f.churn_risk)}`} onClick={() => openFintech(f.fintech_id)}>
                <div style={{ minWidth: 0 }}>
                  <div className="attn-name">{f.fintech_name}</div>
                  <div className="attn-meta">{[f.region, f.type].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <div className="attn-reason">{f.top_reason || 'Scored from its transaction history'}</div>
                <Spark points={sparks[f.fintech_id]} tone="var(--tone)" />
                <div className="attn-prob">
                  <span className="mono attn-pct">{fmtPct(f.churn_probability, 0)}</span>
                  <span className="sbadge">{f.churn_risk}</span>
                </div>
                <ChevronRight size={15} style={{ color: 'var(--muted)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel-foot">
        <span>{also ? <><b style={{ color: 'var(--text)' }}>Also:</b> {also.title}</> : 'No other findings right now.'}</span>
        <a href="#/insights" className="link" style={{ whiteSpace: 'nowrap' }}>All insights →</a>
      </div>
    </section>
  )
}
