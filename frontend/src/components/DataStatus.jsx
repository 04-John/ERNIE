import { RefreshCw } from 'lucide-react'
import { useStatus, useRefresh } from '../hooks/useAnalytics'
import { timeAgo } from '../lib/format'
import { syncChip, isSyncing } from '../lib/sync'

/** Where the data comes from, how fresh it is, and a button to re-sync. */
export default function DataStatus() {
  const { data: status } = useStatus()
  const refresh = useRefresh()
  const chip = syncChip(status)
  const busy = refresh.isPending || isSyncing(status)
  const error = refresh.error?.response?.data?.detail

  return (
    <>
      <div className="sync-chip hide-sm" role="status">
        <span className="sync-dot" style={{ background: chip.dot, boxShadow: `0 0 10px ${chip.dot}` }} />
        {chip.label}
      </div>
      <button className="btn btn-sm refresh-btn" onClick={() => refresh.mutate()} disabled={busy || status?.data_source === 'simulated'}
        aria-label="Refresh data now" title={error || `Last updated ${timeAgo(status?.last_refreshed)} · click to re-sync`}>
        <RefreshCw size={14} style={{ transform: `rotate(${busy ? 720 : 0}deg)`, transition: 'transform 2.4s cubic-bezier(.4,0,.2,1)' }} />
        <span className="hide-sm">Refresh</span>
      </button>
    </>
  )
}
