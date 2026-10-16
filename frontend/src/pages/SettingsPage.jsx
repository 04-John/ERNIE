import { useState } from 'react'
import { Sun, Moon, RefreshCw, LogOut, Link2, Unplug, KeyRound, Loader2 } from 'lucide-react'
import { PageHeader, Card, Badge, Alert } from '../components/ui'
import { useStatus, useRefresh, useWorkspace, useConnect, useDisconnect } from '../hooks/useAnalytics'
import { BASE_URL } from '../api/client'
import { fmtNum, timeAgo } from '../lib/format'

const SOURCE_LABEL = {
  real: { tone: 'success', text: 'Live Blockradar data' },
  simulated: { tone: 'warn', text: 'Demo data' },
  error: { tone: 'danger', text: 'Sync failed, no data loaded yet' },
}

function Row({ k, hint, children }) {
  return (
    <div className="kv-row">
      <div className="kv-key">{k}{hint && <small>{hint}</small>}</div>
      <div className="kv-val">{children}</div>
    </div>
  )
}

function ConnectForm({ onDone, submitLabel }) {
  const [apiKey, setApiKey] = useState('')
  const [walletId, setWalletId] = useState('')
  const connect = useConnect()
  const error = connect.error?.response?.data?.detail || (connect.isError ? 'Could not connect. Please try again.' : '')

  const submit = e => {
    e.preventDefault()
    connect.mutate({ apiKey, walletId }, { onSuccess: () => { setApiKey(''); setWalletId(''); onDone?.() } })
  }

  return (
    <form className="form" onSubmit={submit} autoComplete="off">
      <div className="field">
        <label htmlFor="bk-wallet">Wallet ID</label>
        <input id="bk-wallet" className="input mono" value={walletId} onChange={e => setWalletId(e.target.value)}
          placeholder="123e4567-e89b-12d3-a456-426614174000" spellCheck={false} required />
      </div>
      <div className="field">
        <label htmlFor="bk-key">API key</label>
        <div className="input-wrap">
          <KeyRound size={16} className="lead" />
          <input id="bk-key" className="input has-lead mono" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="Paste your Blockradar API key" autoComplete="new-password" spellCheck={false} required />
        </div>
        <span className="hint">Find both in your Blockradar dashboard. The key is verified, then stored encrypted. It is never shown again or sent back to your browser.</span>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={connect.isPending || !apiKey || !walletId}>
          {connect.isPending ? <><Loader2 size={15} className="spin" /> Verifying…</> : <><Link2 size={15} /> {submitLabel}</>}
        </button>
      </div>
    </form>
  )
}

function ConnectionCard() {
  const { data: ws } = useWorkspace()
  const disconnect = useDisconnect()
  const [replacing, setReplacing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const conn = ws?.connection
  const isAdmin = ws?.role === 'admin'

  return (
    <Card title="Blockradar connection" subtitle="The wallet this workspace analyses"
      chip={conn?.connected ? 'Connected' : 'Not connected'}>
      {!conn?.connected ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <Alert tone="warn"><strong>You're viewing demo data.</strong> Connect a Blockradar wallet to analyse your own fintechs.</Alert>
          </div>
          {isAdmin ? <ConnectForm submitLabel="Connect Blockradar" /> : <p className="hint">Ask a workspace admin to connect Blockradar.</p>}
        </>
      ) : (
        <>
          {conn.last_error && <div style={{ marginBottom: 12 }}><Alert tone="danger"><strong>Last sync failed:</strong> {conn.last_error}</Alert></div>}
          <div className="kv">
            <Row k="Wallet ID"><code>{conn.wallet_id}</code></Row>
            <Row k="API key"><code>••••••••{conn.api_key_last4}</code></Row>
            <Row k="Last synced">{conn.last_synced_at ? timeAgo(conn.last_synced_at) : 'Not yet'}</Row>
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="btn btn-sm" onClick={() => { setReplacing(r => !r); setConfirming(false) }}>
                {replacing ? 'Cancel' : 'Replace credentials'}
              </button>
              {!confirming ? (
                <button className="btn btn-sm btn-danger" onClick={() => { setConfirming(true); setReplacing(false) }}><Unplug size={14} /> Disconnect</button>
              ) : (
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  Remove this connection and its data?
                  <button className="btn btn-sm btn-danger" onClick={() => disconnect.mutate(undefined, { onSuccess: () => setConfirming(false) })} disabled={disconnect.isPending}>Yes, disconnect</button>
                  <button className="btn btn-sm" onClick={() => setConfirming(false)}>Keep</button>
                </span>
              )}
            </div>
          )}
          {replacing && isAdmin && <div style={{ marginTop: 18 }}><ConnectForm submitLabel="Verify & replace" onDone={() => setReplacing(false)} /></div>}
        </>
      )}
    </Card>
  )
}

export default function SettingsPage({ user, theme, setTheme, onLogout }) {
  const { data: s } = useStatus()
  const { data: ws } = useWorkspace()
  const refresh = useRefresh()
  const src = SOURCE_LABEL[s?.data_source] || { tone: 'neutral', text: '—' }
  const busy = refresh.isPending || s?.refreshing

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <PageHeader eyebrow="Settings" title="Account &amp; workspace">
        Your profile, workspace, data connection and appearance.
      </PageHeader>

      <Card title="Profile">
        <div className="kv">
          <Row k="Name">{user?.name || '—'}</Row>
          <Row k="Email">{user?.email}</Row>
          <Row k="Workspace">{ws?.workspace?.name || user?.workspace || '—'}</Row>
          <Row k="Role"><Badge tone={ws?.role === 'admin' ? 'accent' : 'neutral'}>{ws?.role || user?.role || '—'}</Badge></Row>
          <Row k="Last sign-in">{user?.last_login ? new Date(user.last_login + 'Z').toLocaleString() : '—'}</Row>
        </div>
      </Card>

      <ConnectionCard />

      <Card title="Data status" action={
        <button className="btn btn-sm" onClick={() => refresh.mutate()} disabled={busy || s?.data_source === 'simulated'}
          title={s?.data_source === 'simulated' ? 'Demo data is static' : undefined}>
          <RefreshCw size={14} className={busy ? 'spin' : undefined} /> {busy ? 'Refreshing…' : 'Refresh now'}
        </button>
      }>
        {refresh.isError && <div style={{ marginBottom: 12 }}><Alert tone="warn">{refresh.error?.response?.data?.detail || 'Refresh failed.'}</Alert></div>}
        <div className="kv">
          <Row k="Source"><Badge tone={src.tone} dot>{src.text}</Badge></Row>
          <Row k="Last updated">{s?.last_refreshed ? `${timeAgo(s.last_refreshed)} · ${new Date(s.last_refreshed).toLocaleString()}` : '—'}</Row>
          <Row k="Auto-refresh">{s ? `Every ${s.refresh_interval_hours} hours` : '—'}</Row>
          <Row k="Wallets / fintechs / transactions">{s ? `${fmtNum(s.total_wallets)} / ${fmtNum(s.total_fintechs)} / ${fmtNum(s.total_transactions)}` : '—'}</Row>
          <Row k="API endpoint"><code>{BASE_URL}</code></Row>
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

      <Card title="Session">
        <div className="kv-row" style={{ borderBottom: 'none' }}>
          <div className="kv-key">Sign out<small>You'll need to sign in again on this device</small></div>
          <button className="btn btn-danger" onClick={onLogout}><LogOut size={15} /> Sign out</button>
        </div>
      </Card>
    </div>
  )
}
