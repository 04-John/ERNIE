import { useState } from 'react'
import { Sun, Moon, RefreshCw, LogOut, Link2, Unplug, KeyRound, Loader2, UserPlus, Trash2, Copy, Check } from 'lucide-react'
import { PageHeader, Card, Badge, Alert } from '../components/ui'
import {
  useStatus, useRefresh, useWorkspace, useConnect, useDisconnect,
  useMembers, useInvites, useCreateInvite, useRevokeInvite, useChangeRole, useRemoveMember,
} from '../hooks/useAnalytics'
import { BASE_URL } from '../api/client'
import { fmtNum, timeAgo, copyText } from '../lib/format'

const SOURCE_LABEL = {
  real: { tone: 'success', text: 'Live Blockradar data' },
  simulated: { tone: 'warn', text: 'Demo data' },
  syncing: { tone: 'info', text: 'First sync in progress…' },
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

function InviteForm({ emailEnabled }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [sendEmail, setSendEmail] = useState(true)
  const [created, setCreated] = useState(null)   // { link, email, expires_at } shown once
  const [copied, setCopied] = useState(false)
  const create = useCreateInvite()
  const error = create.error?.response?.data?.detail || (create.isError ? 'Could not create the invite.' : '')

  const submit = e => {
    e.preventDefault()
    create.mutate({ email: email.trim(), role, sendEmail: emailEnabled && sendEmail && Boolean(email.trim()) }, {
      onSuccess: inv => {
        setCreated({ link: `${window.location.origin}/?invite=${inv.token}`, email: inv.email, emailed: inv.emailed, expires_at: inv.expires_at })
        setEmail(''); setCopied(false)
      },
    })
  }
  const copy = async () => { if (await copyText(created.link)) { setCopied(true); setTimeout(() => setCopied(false), 1800) } }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 240px' }}>
          <label htmlFor="inv-email">Email <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional, locks the link to one person)</span></label>
          <input id="inv-email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@company.com" />
        </div>
        <div className="field">
          <label htmlFor="inv-role">Role</label>
          <select id="inv-role" className="input" value={role} onChange={e => setRole(e.target.value)} style={{ minWidth: 120 }}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={create.isPending}><UserPlus size={15} /> {emailEnabled && sendEmail && email.trim() ? 'Send invite' : 'Create invite link'}</button>
      </form>
      {emailEnabled && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
          <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} /> Email the invite to this address
        </label>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {created && (
        <Alert tone="success">
          <div><strong>{created.emailed ? `Invite emailed to ${created.email}.` : 'Invite link created.'}</strong> {created.emailed ? 'You can also copy the link below. ' : 'Copy it now. '}It can't be shown again once you leave this page, works once, and expires {new Date(created.expires_at).toLocaleDateString()}.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input className="input mono" readOnly value={created.link} onFocus={e => e.target.select()} style={{ flex: '1 1 260px', height: 38, fontSize: 12 }} aria-label="Invite link" />
            <button className="btn btn-sm" type="button" onClick={copy} style={{ height: 38 }}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
          </div>
        </Alert>
      )}
    </div>
  )
}

function TeamCard({ emailEnabled }) {
  const { data: ws } = useWorkspace()
  const { data: members = [] } = useMembers()
  const isAdmin = ws?.role === 'admin'
  const { data: invites = [] } = useInvites(isAdmin)
  const revoke = useRevokeInvite()
  const setRole = useChangeRole()
  const remove = useRemoveMember()
  const [removing, setRemoving] = useState(null)
  const actionError = setRole.error?.response?.data?.detail || remove.error?.response?.data?.detail

  return (
    <Card title="Team" subtitle="People in this workspace" chip={`${members.length} member${members.length === 1 ? '' : 's'}`}>
      {actionError && <div style={{ marginBottom: 12 }}><Alert tone="danger">{actionError}</Alert></div>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th>{isAdmin && <th />}</tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{m.name || m.email} {m.is_you && <span className="chip" style={{ marginLeft: 6 }}>You</span>}</div>
                  <div className="hint">{m.email}</div>
                </td>
                <td>
                  {isAdmin && !m.is_you ? (
                    <select className="input" value={m.role} aria-label={`Role for ${m.email}`} style={{ height: 34, width: 120 }}
                      onChange={e => setRole.mutate({ id: m.id, role: e.target.value })}>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : <Badge tone={m.role === 'admin' ? 'accent' : 'neutral'}>{m.role}</Badge>}
                </td>
                <td style={{ color: 'var(--text-2)' }}>{m.last_login ? timeAgo(m.last_login) : '—'}</td>
                {isAdmin && (
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!m.is_you && (removing === m.id ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button className="btn btn-sm btn-danger" onClick={() => remove.mutate(m.id, { onSettled: () => setRemoving(null) })}>Remove</button>
                        <button className="btn btn-sm" onClick={() => setRemoving(null)}>Cancel</button>
                      </span>
                    ) : <button className="btn btn-sm btn-ghost" onClick={() => setRemoving(m.id)} aria-label={`Remove ${m.email}`}><Trash2 size={14} /></button>)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <>
          {invites.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="stat-label" style={{ marginBottom: 8 }}>Pending invites</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {invites.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
                      <strong>{i.email || 'Anyone with the link'}</strong>
                      <span className="hint"> · {i.role} · expires {new Date(i.expires_at).toLocaleDateString()}</span>
                    </div>
                    <button className="btn btn-sm btn-danger" onClick={() => revoke.mutate(i.id)} disabled={revoke.isPending}>Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
            <div className="stat-label" style={{ marginBottom: 12 }}>Invite a teammate</div>
            <InviteForm emailEnabled={emailEnabled} />
          </div>
        </>
      ) : <p className="hint" style={{ marginTop: 14 }}>Only workspace admins can invite or manage teammates.</p>}
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
          <Row k="Email">{user?.email}{user?.is_verified !== undefined && <span style={{ marginLeft: 8 }}><Badge tone={user.is_verified ? 'success' : 'warn'}>{user.is_verified ? 'Verified' : 'Unverified'}</Badge></span>}</Row>
          <Row k="Workspace">{ws?.workspace?.name || user?.workspace || '—'}</Row>
          <Row k="Role"><Badge tone={ws?.role === 'admin' ? 'accent' : 'neutral'}>{ws?.role || user?.role || '—'}</Badge></Row>
          <Row k="Last sign-in">{user?.last_login ? new Date(user.last_login + 'Z').toLocaleString() : '—'}</Row>
        </div>
      </Card>

      <ConnectionCard />

      <TeamCard emailEnabled={user?.email_enabled} />

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
