import { useState } from 'react'
import { Download, Loader2, Trash2, ScrollText } from 'lucide-react'
import { Card, Alert, EmptyState, Skeleton } from './ui'
import { useAudit, useWorkspace } from '../hooks/useAnalytics'
import { downloadExport, deleteWorkspace, deleteAccount } from '../api/client'
import { timeAgo } from '../lib/format'

const LABELS = {
  'connection.saved': 'Wallet connected', 'connection.removed': 'Wallet disconnected', 'invite.created': 'Invitation sent',
  'invite.revoked': 'Invitation revoked', 'member.role_changed': 'Role changed', 'member.removed': 'Member removed', 'member.left': 'Member left',
  'alert_channel.added': 'Alert channel added', 'alert_channel.toggled': 'Alert channel changed', 'alert_channel.removed': 'Alert channel removed',
  'ai.enabled': 'Ask ERNIE turned on', 'ai.disabled': 'Ask ERNIE turned off', 'plan.changed': 'Plan changed', 'workspace.exported': 'Data exported',
  'api_key.created': 'API key created', 'api_key.revoked': 'API key revoked', 'credits.added': 'API credits added', 'invite.email_failed': 'Invite email failed',
}

/** Admin-only record of who changed what. */
export function AuditCard() {
  const { data, isLoading } = useAudit()
  return (
    <Card title="Activity log" subtitle="Who changed what in this workspace. Secrets are never recorded.">
      {isLoading ? <Skeleton height={120} /> : !data?.length ? (
        <EmptyState icon={ScrollText} title="Nothing yet">Changes to your connection, team, alerts and plan will appear here.</EmptyState>
      ) : (
        <div className="kv" style={{ maxHeight: 360, overflowY: 'auto' }}>
          {data.slice(0, 50).map(e => (
            <div className="kv-row" key={e.id}>
              <div className="kv-key" style={{ minWidth: 150 }}>{LABELS[e.action] || e.action}<small>{e.at ? timeAgo(e.at) : ''}</small></div>
              <div className="kv-val" style={{ fontSize: 13.5 }}>{e.detail} <span className="hint">· {e.actor}</span></div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function DeleteForm({ title, warning, confirmLabel, confirmValue, needsPassword, submit, onDone, onCancel }) {
  const [typed, setTyped] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ok = typed.trim() === confirmValue && (!needsPassword || password)

  const run = async e => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await submit(typed, password); onDone() }
    catch (err) { setError(err.response?.data?.detail || 'Something went wrong. Nothing was deleted.'); setBusy(false) }
  }

  return (
    <form onSubmit={run} className="card tone-danger" style={{ background: 'var(--surface-2)', boxShadow: 'none', display: 'grid', gap: 12 }}>
      <strong>{title}</strong>
      <p style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{warning}</p>
      <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>{confirmLabel}
        <input className="input" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      {needsPassword && (
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>Your password
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-danger-solid" type="submit" disabled={!ok || busy}>{busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />} Delete permanently</button>
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  )
}

/** Export and erasure. Deleting is deliberate: type to confirm, password if the account has one. */
export function DataCard({ user, onLogout }) {
  const { data: ws } = useWorkspace()
  const [open, setOpen] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const isAdmin = ws?.role === 'admin'
  const needsPassword = user?.has_password !== false

  const doExport = async () => {
    setExporting(true); setExportError('')
    try { await downloadExport() } catch { setExportError('Could not prepare your export. Please try again.') }
    setExporting(false)
  }

  return (
    <Card title="Your data" subtitle="Take it with you, or erase it. You are in control.">
      <div style={{ display: 'grid', gap: 16 }}>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={doExport} disabled={exporting}>
              {exporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />} Download workspace data
            </button>
            <span className="hint">A JSON file with your fintechs, history, insights, team and activity log. It never includes your API key or other secrets.</span>
          </div>
        )}
        {exportError && <Alert tone="danger">{exportError}</Alert>}

        {open === 'account' && (
          <DeleteForm title="Delete my account"
            warning="This permanently deletes your login. If you are the only person in this workspace, the workspace and all its data are deleted too. This cannot be undone."
            confirmLabel={`Type your email (${user?.email}) to confirm`} confirmValue={user?.email} needsPassword={needsPassword}
            submit={(typed, password) => deleteAccount({ confirm_email: typed.trim(), password: password || null })}
            onDone={onLogout} onCancel={() => setOpen('')} />
        )}
        {open === 'workspace' && (
          <DeleteForm title="Delete this workspace"
            warning="This permanently deletes the workspace, every member's access, your stored wallet data, history, insights and alerts, and cancels any subscription. This cannot be undone."
            confirmLabel={`Type the workspace name (${ws?.workspace?.name}) to confirm`} confirmValue={ws?.workspace?.name} needsPassword={needsPassword}
            submit={(typed, password) => deleteWorkspace({ confirm_name: typed.trim(), password: password || null })}
            onDone={onLogout} onCancel={() => setOpen('')} />
        )}

        {!open && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => setOpen('account')}><Trash2 size={14} /> Delete my account</button>
            {isAdmin && <button className="btn btn-sm" onClick={() => setOpen('workspace')}><Trash2 size={14} /> Delete this workspace</button>}
          </div>
        )}
      </div>
    </Card>
  )
}
