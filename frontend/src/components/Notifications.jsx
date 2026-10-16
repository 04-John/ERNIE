import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, AlertTriangle, PauseCircle, WifiOff, Info, CheckCircle2, Hourglass } from 'lucide-react'
import { useStatus, useSummary, useHighRisk } from '../hooks/useAnalytics'
import { timeAgo } from '../lib/format'

const ICON = { danger: AlertTriangle, warn: PauseCircle, info: Info, success: CheckCircle2 }

/** Alerts are derived from live data: nothing here is hard-coded. */
function useAlerts() {
  const { data: status } = useStatus()
  const { data: summary } = useSummary()
  const { data: high } = useHighRisk()

  return useMemo(() => {
    const out = []
    if (status?.data_source === 'simulated-fallback') {
      out.push({ tone: 'danger', icon: WifiOff, title: 'Blockradar is unreachable',
        text: `Showing demo data instead. ${status.last_error || ''}`.trim() })
    } else if (status?.data_source === 'simulated') {
      out.push({ tone: 'info', icon: Info, title: 'You are viewing demo data',
        text: 'Set DATA_MODE=real on the API to use your live Blockradar wallet.' })
    }
    if (high?.count > 0) {
      const names = high.data.slice(0, 3).map(f => f.fintech_name).join(', ')
      out.push({ tone: 'danger', icon: AlertTriangle, title: `${high.count} fintech${high.count > 1 ? 's' : ''} at high churn risk`,
        text: names + (high.count > 3 ? ` and ${high.count - 3} more` : '') })
    }
    if (summary?.never_active_wallets > 0) {
      out.push({ tone: 'warn', icon: Hourglass, title: `${summary.never_active_wallets} wallet${summary.never_active_wallets > 1 ? 's have' : ' has'} never transacted`,
        text: 'These addresses exist but have no successful transactions yet.' })
    }
    if (summary?.dormancy_rate >= 0.5) {
      out.push({ tone: 'warn', icon: PauseCircle, title: `Dormancy is ${(summary.dormancy_rate * 100).toFixed(0)}%`,
        text: 'More than half of wallets have been inactive for 60+ days.' })
    }
    return out
  }, [status, summary, high])
}

export default function Notifications() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { data: status } = useStatus()
  const alerts = useAlerts()
  const urgent = alerts.filter(a => a.tone === 'danger' || a.tone === 'warn').length

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="popover-anchor" ref={ref}>
      <button className="btn btn-icon" style={{ position: 'relative' }} onClick={() => setOpen(o => !o)}
        aria-label={`Alerts${urgent ? `, ${urgent} need attention` : ''}`} aria-expanded={open}>
        <Bell size={16} />
        {urgent > 0 && <span className="dot-badge" />}
      </button>

      {open && (
        <div className="popover" role="dialog" aria-label="Alerts">
          <div className="popover-head">
            <strong style={{ fontSize: 14 }}>Alerts</strong>
            <span className="hint">Synced {timeAgo(status?.last_refreshed)}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="popover-item" style={{ alignItems: 'center' }}>
              <CheckCircle2 size={18} color="var(--success)" />
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>All clear. Nothing needs your attention right now.</div>
            </div>
          ) : alerts.map(a => {
            const Icon = a.icon || ICON[a.tone]
            return (
              <div className="popover-item" key={a.title}>
                <span className={`stat-icon tone-${a.tone}`} style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0 }}><Icon size={15} /></span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{a.text}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
