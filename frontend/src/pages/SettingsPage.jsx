import { Sun, Moon, RefreshCw, LogOut } from 'lucide-react'
import { PageHeader, Card, Badge, Alert } from '../components/ui'
import { useStatus, useRefresh } from '../hooks/useAnalytics'
import { BASE_URL } from '../api/client'
import { fmtNum, timeAgo } from '../lib/format'

const SOURCE_LABEL = {
  real: { tone: 'success', text: 'Live Blockradar data' },
  simulated: { tone: 'warn', text: 'Simulated demo data' },
  'simulated-fallback': { tone: 'danger', text: 'Demo data (Blockradar unreachable)' },
}

function Row({ k, hint, children }) {
  return (
    <div className="kv-row">
      <div className="kv-key">{k}{hint && <small>{hint}</small>}</div>
      <div className="kv-val">{children}</div>
    </div>
  )
}

export default function SettingsPage({ user, theme, setTheme, onLogout }) {
  const { data: s } = useStatus()
  const refresh = useRefresh()
  const src = SOURCE_LABEL[s?.data_source] || { tone: 'neutral', text: '—' }
  const busy = refresh.isPending || s?.refreshing

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <PageHeader eyebrow="Settings" title="Account &amp; workspace">
        Your profile, appearance and data connection.
      </PageHeader>

      <Card title="Profile">
        <div className="kv">
          <Row k="Name">{user?.name || '—'}</Row>
          <Row k="Email">{user?.email}</Row>
          <Row k="Company">{user?.company || '—'}</Row>
          <Row k="Last sign-in">{user?.last_login ? new Date(user.last_login + 'Z').toLocaleString() : '—'}</Row>
        </div>
      </Card>

      <Card title="Appearance">
        <div className="kv-row" style={{ borderBottom: 'none' }}>
          <div className="kv-key">Theme<small>Saved on this device</small></div>
          <div className="segmented" role="group" aria-label="Theme">
            <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Sun size={15} /> Light</button>
            <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Moon size={15} /> Dark</button>
          </div>
        </div>
      </Card>

      <Card title="Data connection" action={
        <button className="btn btn-sm" onClick={() => refresh.mutate()} disabled={busy}>
          <RefreshCw size={14} className={busy ? 'spin' : undefined} /> {busy ? 'Refreshing…' : 'Refresh now'}
        </button>
      }>
        {s?.last_error && <div style={{ marginBottom: 12 }}><Alert tone="danger"><strong>Last fetch failed:</strong> {s.last_error}</Alert></div>}
        {refresh.isError && <div style={{ marginBottom: 12 }}><Alert tone="warn">{refresh.error?.response?.data?.detail || 'Refresh failed.'}</Alert></div>}
        <div className="kv">
          <Row k="Source"><Badge tone={src.tone} dot>{src.text}</Badge></Row>
          <Row k="Configured mode" hint="Set by DATA_MODE on the API">{s?.data_mode || '—'}</Row>
          <Row k="Last updated">{s?.last_refreshed ? `${timeAgo(s.last_refreshed)} · ${new Date(s.last_refreshed).toLocaleString()}` : '—'}</Row>
          <Row k="Auto-refresh">{s ? `Every ${s.refresh_interval_hours} hours` : '—'}</Row>
          <Row k="Wallets / fintechs / transactions">{s ? `${fmtNum(s.total_wallets)} / ${fmtNum(s.total_fintechs)} / ${fmtNum(s.total_transactions)}` : '—'}</Row>
          <Row k="API endpoint"><code>{BASE_URL}</code></Row>
        </div>
      </Card>

      <Card title="Session">
        <div className="kv-row" style={{ borderBottom: 'none' }}>
          <div className="kv-key">Sign out<small>You'll need to sign in again on this device</small></div>
          <button className="btn btn-danger" onClick={onLogout}><LogOut size={15} /> Sign out</button>
        </div>
      </Card>
    </div>
  )
}
