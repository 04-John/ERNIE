import { RefreshCw } from 'lucide-react'
import { useStatus, useRefresh } from '../hooks/useAnalytics'
import { Badge } from './ui'
import { timeAgo } from '../lib/format'

const SOURCE = {
  real:                 { tone: 'success', label: 'Live · Blockradar', live: true },
  simulated:            { tone: 'warn',    label: 'Demo data' },
  'simulated-fallback': { tone: 'danger',  label: 'Blockradar unreachable · demo data' },
}

/** Shows where the data comes from, how fresh it is, and lets the user re-sync. */
export default function DataStatus({ compact = false }) {
  const { data: status } = useStatus()
  const refresh = useRefresh()

  const src = SOURCE[status?.data_source] || { tone: 'neutral', label: 'Connecting…' }
  const busy = refresh.isPending || status?.refreshing
  const error = refresh.error?.response?.data?.detail

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Badge tone={src.tone} dot live={src.live}>
        <span className={compact ? 'hide-sm' : undefined}>{src.label}</span>
        {compact && <span className="hide-sm" style={{ opacity: .7 }}> · {timeAgo(status?.last_refreshed)}</span>}
      </Badge>
      <button
        className="btn btn-icon"
        onClick={() => refresh.mutate()}
        disabled={busy}
        aria-label="Refresh data now"
        title={error || `Last updated ${timeAgo(status?.last_refreshed)} · click to re-sync`}
      >
        <RefreshCw size={15} className={busy ? 'spin' : undefined} />
      </button>
    </div>
  )
}
