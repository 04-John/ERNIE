import { timeAgo } from './format'

/** What the topbar chip says, and the colour of its dot, for each state of the data. */
export function syncChip(status) {
  const src = status?.data_source
  if (src === 'simulated') return { label: 'Demo data', dot: 'var(--warn)' }
  if (src === 'syncing') return { label: 'Syncing…', dot: 'var(--info)' }
  if (src === 'error') return { label: 'Sync failed', dot: 'var(--danger)' }
  if (src === 'real' && status?.last_error) return { label: 'Sync failed · showing last good data', dot: 'var(--danger)' }
  if (src === 'real') return { label: `Live · synced ${timeAgo(status?.last_refreshed)}`, dot: 'var(--success)' }
  return { label: 'Connecting…', dot: 'var(--muted)' }
}

export function isSyncing(status) {
  return status?.data_source === 'syncing' || Boolean(status?.refreshing)
}

