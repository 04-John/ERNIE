import { X, ArrowRight, Lightbulb } from 'lucide-react'
import { useChurnScores, useDismissInsight } from '../hooks/useAnalytics'
import { Badge, EmptyState } from './ui'
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

export function InsightCard({ insight, names, compact = false }) {
  const dismiss = useDismissInsight()
  const sev = SEVERITY[insight.severity] || SEVERITY.info
  const Icon = sev.icon
  const lines = evidenceLines(insight).filter(Boolean)
  const ids = (insight.fintech_ids || []).filter(id => names?.[id]).slice(0, 4)

  return (
    <article className={`card tone-${sev.tone}`} style={{ padding: compact ? 16 : 20, borderLeft: '3px solid var(--tone)' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span className="stat-icon" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }}><Icon size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{insight.title}</h3>
            {!compact && <Badge tone={sev.tone}>{sev.label}</Badge>}
          </div>
          {insight.detail && <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 6 }}>{insight.detail}</p>}

          {!compact && lines.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {lines.map((l, k) => <span key={k} className="chip">{l}</span>)}
            </div>
          )}

          {insight.action && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, fontSize: 13.5 }}>
              <Lightbulb size={15} style={{ color: 'var(--tone)', flexShrink: 0, marginTop: 3 }} />
              <span><strong>Next step:</strong> <span style={{ color: 'var(--text-2)' }}>{insight.action}</span></span>
            </div>
          )}

          {!compact && ids.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {ids.map(id => (
                <a key={id} href={`#/fintech/${encodeURIComponent(id)}`} className="btn btn-sm">{names[id]} <ArrowRight size={13} /></a>
              ))}
              {insight.fintech_ids.length > ids.length && <span className="hint" style={{ alignSelf: 'center' }}>+{insight.fintech_ids.length - ids.length} more</span>}
            </div>
          )}
        </div>
        {insight.dismissable && (
          <button className="btn btn-icon btn-ghost" style={{ width: 30, height: 30 }} aria-label="Dismiss this insight"
            title="Hide until the situation changes" onClick={() => dismiss.mutate(insight.key)} disabled={dismiss.isPending}>
            <X size={15} />
          </button>
        )}
      </div>
    </article>
  )
}

/** A list of insight cards, resolving fintech names for the "view fintech" links. */
export function InsightList({ insights, compact = false, empty }) {
  const { data } = useChurnScores({ limit: 200 })
  const names = Object.fromEntries((data?.data || []).map(f => [f.fintech_id, f.fintech_name]))

  if (!insights.length) {
    return empty || (
      <EmptyState icon={Lightbulb} title="Nothing needs your attention">
        ERNIE checks your data after every sync. Findings appear here when something changes.
      </EmptyState>
    )
  }
  return <div style={{ display: 'grid', gap: compact ? 10 : 14 }}>{insights.map(i => <InsightCard key={i.key} insight={i} names={names} compact={compact} />)}</div>
}

