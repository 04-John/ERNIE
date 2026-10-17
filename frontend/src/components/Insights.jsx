import { X } from 'lucide-react'
import { useChurnScores, useDismissInsight } from '../hooks/useAnalytics'
import { useFintechDrawer } from '../lib/drawer'
import { fmtUsd } from '../lib/format'
import { SEVERITY } from '../lib/severity'

const pct = v => `${Math.round(v * 100)}%`

/** Short evidence lines per insight kind: the numbers behind the finding. */
function evidenceLines(i) {
  const e = i.evidence || {}
  switch (i.kind) {
    case 'high_risk':            return [`${e.count} fintech${e.count === 1 ? '' : 's'}`, e.volume ? `${fmtUsd(e.volume)} in the last 3 months` : null, e.volume_share ? `${pct(e.volume_share)} of recent volume` : null]
    case 'went_quiet':           return (e.fintechs || []).slice(0, 3).map(f => `${f.name}: silent ${f.silent_days}d, usually every ~${f.usual_gap_days}d`)
    case 'fintech_volume_drop':  return (e.fintechs || []).slice(0, 3).map(f => `${f.name}: ${fmtUsd(f.before)} to ${fmtUsd(f.after)}`)
    case 'volume_trend':         return [`${fmtUsd(e.recent)} last 4 weeks`, `${fmtUsd(e.prior)} the 4 weeks before`]
    case 'concentration':        return [`${pct(e.share)} of 90-day volume`]
    case 'activation_gap':       return [`${e.wallets} wallets`, `${pct(e.share)} of all wallets`]
    case 'dormancy_rising':      return [`${pct(e.from)} to ${pct(e.to)} dormant`]
    case 'regional_hotspot':     return [`${e.region}: ${pct(e.avg)} average risk`, `${pct(e.overall)} overall`]
    case 'forecast_decline':
    case 'forecast_growth':      return [`${fmtUsd(e.next30)} forecast`, `${fmtUsd(e.last30)} last 30 days`]
    case 'volume_anomaly':       return [`${fmtUsd(e.value)} actual`, `${fmtUsd(e.expected)} expected`]
    default:                     return []
  }
}

export function InsightCard({ insight, names }) {
  const dismiss = useDismissInsight()
  const { openFintech } = useFintechDrawer()
  const sev = SEVERITY[insight.severity] || SEVERITY.info
  const Icon = sev.icon
  const lines = evidenceLines(insight).filter(Boolean)
  const ids = (insight.fintech_ids || []).filter(id => names?.[id]).slice(0, 4)

  return (
    <article className={`insight tone-${sev.tone}`}>
      <span className="glyph"><Icon size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 className="display insight-title">{insight.title}</h3>
          <span className="sbadge">{sev.label}</span>
        </div>
        {insight.detail && <p className="insight-detail">{insight.detail}</p>}

        {lines.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {lines.map((l, k) => <span key={k} className="chip mono">{l}</span>)}
          </div>
        )}

        {insight.action && (
          <div className="insight-next"><strong>Next step:</strong> <span>{insight.action}</span></div>
        )}

        {ids.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {ids.map(id => <button key={id} className="btn btn-sm" onClick={() => openFintech(id)}>{names[id]} →</button>)}
            {insight.fintech_ids.length > ids.length && <span className="hint" style={{ alignSelf: 'center' }}>+{insight.fintech_ids.length - ids.length} more</span>}
          </div>
        )}
      </div>
      {insight.dismissable && (
        <button className="btn btn-icon btn-ghost" style={{ width: 30, height: 30 }} aria-label="Dismiss this insight"
          title="Hide until the situation changes" onClick={() => dismiss.mutate(insight.key)} disabled={dismiss.isPending}>
          <X size={16} />
        </button>
      )}
    </article>
  )
}

/** A list of insight cards, resolving fintech names for the "view fintech" buttons. */
export function InsightList({ insights, empty }) {
  const { data } = useChurnScores({ limit: 200 })
  const names = Object.fromEntries((data?.data || []).map(f => [f.fintech_id, f.fintech_name]))

  if (!insights.length) {
    return empty || (
      <div className="insight-empty">Nothing here. ERNIE checks again after every sync.</div>
    )
  }
  return <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>{insights.map(i => <InsightCard key={i.key} insight={i} names={names} />)}</div>
}
