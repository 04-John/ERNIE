import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Check, Plus, Trash2, KeyRound, Loader2, Wallet, TriangleAlert } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Alert, Badge, EmptyState, ChartTooltip, Skeleton } from './ui'
import { useDeveloper, useApiUsage, useCreateApiKey, useRevokeApiKey, useWorkspace } from '../hooks/useAnalytics'
import { startTopup } from '../api/client'
import { copyText, fmtNum, timeAgo } from '../lib/format'

const usd = credits => `$${(credits / 1000).toFixed(credits >= 100_000 ? 0 : 2)}`

function NewKeyReveal({ created, onDone }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { if (await copyText(created.key)) { setCopied(true); setTimeout(() => setCopied(false), 1600) } }
  return (
    <div className="card tone-success" style={{ background: 'var(--surface-2)', boxShadow: 'none', display: 'grid', gap: 12 }}>
      <strong>Your new {created.mode} key. Copy it now.</strong>
      <p style={{ fontSize: 13.5, color: 'var(--text-2)' }}>For your security we only store a fingerprint of it, so it can't be shown again. If you lose it, create a new one and revoke this one.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <code className="dev-key">{created.key}</code>
        <button className="btn btn-primary btn-sm" onClick={copy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy key</>}</button>
      </div>
      <div><button className="btn btn-sm" onClick={onDone}>I've saved it</button></div>
    </div>
  )
}

function Keys({ data, isAdmin }) {
  const create = useCreateApiKey()
  const revoke = useRevokeApiKey()
  const [name, setName] = useState('')
  const [mode, setMode] = useState('live')
  const [created, setCreated] = useState(null)
  const [confirm, setConfirm] = useState('')
  const error = create.error?.response?.data?.detail || revoke.error?.response?.data?.detail

  const submit = async e => {
    e.preventDefault()
    try { setCreated(await create.mutateAsync({ name: name.trim(), mode })); setName('') } catch { /* shown below */ }
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {created && <NewKeyReveal created={created} onDone={() => setCreated(null)} />}
      {error && <Alert tone="danger">{error}</Alert>}

      {data.keys.length === 0 ? (
        <EmptyState icon={KeyRound} title="No API keys yet">{isAdmin ? 'Create a test key to try the API on demo data for free.' : 'A workspace admin can create keys.'}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Key</th><th>Mode</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {data.keys.map(k => (
                <tr key={k.id}>
                  <td><strong>{k.name}</strong><div className="hint">Created {timeAgo(k.created_at)}</div></td>
                  <td><code>{k.prefix}…</code></td>
                  <td><Badge tone={k.mode === 'live' ? 'accent' : 'neutral'}>{k.mode}</Badge></td>
                  <td className="hint">{k.last_used_at ? timeAgo(k.last_used_at) : 'never'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {isAdmin && (confirm === k.id
                      ? <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn btn-sm btn-danger" onClick={() => { revoke.mutate(k.id); setConfirm('') }}>Revoke</button>
                          <button className="btn btn-sm" onClick={() => setConfirm('')}>Keep</button>
                        </span>
                      : <button className="btn btn-sm btn-ghost" aria-label={`Revoke ${k.name}`} onClick={() => setConfirm(k.id)}><Trash2 size={14} /></button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, flex: '1 1 220px' }}>Key name
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production backend" maxLength={60} required />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>Mode
            <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
              <option value="live">Live: your data, billed per call</option>
              <option value="test">Test: demo data, free</option>
            </select>
          </label>
          <button className="btn btn-primary" disabled={create.isPending || !name.trim()}>
            {create.isPending ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Create key
          </button>
        </form>
      )}
    </div>
  )
}

function Credits({ data, isAdmin }) {
  const qc = useQueryClient()
  const { data: usage } = useApiUsage()
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState('')
  const returned = window.location.hash.includes('credits=success')

  useEffect(() => {
    if (!returned) return
    const timers = [1500, 4000, 9000].map(ms => setTimeout(() => { qc.invalidateQueries({ queryKey: ['developer'] }); qc.invalidateQueries({ queryKey: ['api-usage'] }) }, ms))
    return () => timers.forEach(clearTimeout)
  }, [returned, qc])

  const buy = async pack => {
    setBusy(pack.usd); setError('')
    try { window.location.assign((await startTopup(pack.usd)).url) }
    catch (err) { setError(err.response?.data?.detail || 'Something went wrong. Please try again.'); setBusy(0) }
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {returned && <Alert tone="success">Thanks! Your payment went through. Your credits will appear in a moment.</Alert>}
      <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div><div className="stat-label">Balance</div>
          <div className="tnum" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>{fmtNum(data.credits)}</div></div>
        <span className="hint">credits · about {usd(data.credits)} of calls</span>
        {data.credits < 500 && data.keys.some(k => k.mode === 'live') && <Badge tone="warn"><TriangleAlert size={12} /> Running low: live calls fail at zero</Badge>}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {isAdmin ? (
        data.topups_available ? (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            {data.pricing.packs.map(p => {
              const bonus = Math.round((p.credits / (p.usd * 1000) - 1) * 100)
              return (
                <div key={p.usd} className="card" style={{ display: 'grid', gap: 6, boxShadow: 'none', background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>${p.usd}</div>
                  <div className="hint">{fmtNum(p.credits)} credits{bonus > 0 ? ` · ${bonus}% bonus` : ''}</div>
                  <button className="btn btn-primary btn-sm" onClick={() => buy(p)} disabled={busy === p.usd}>{busy === p.usd ? <Loader2 size={14} className="spin" /> : <Wallet size={14} />} Add credits</button>
                </div>
              )
            })}
          </div>
        ) : <Alert tone="info">Online payments aren't switched on yet. To add credits, contact us.</Alert>
      ) : <p className="hint">Only workspace admins can add credits.</p>}
      <p className="hint">Credits are prepaid usage credit for the API. They don't expire, can't be withdrawn or transferred, and are non-refundable once bought.</p>

      {usage?.transactions?.length > 0 && (
        <div className="kv">
          {usage.transactions.map(t => (
            <div className="kv-row" key={t.id}>
              <div className="kv-key">{t.note || t.kind}<small>{t.at ? timeAgo(t.at) : ''}</small></div>
              <div className="kv-val tnum" style={{ color: t.credits >= 0 ? 'var(--success)' : 'var(--text)' }}>{t.credits >= 0 ? '+' : ''}{fmtNum(t.credits)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Usage() {
  const { data, isLoading } = useApiUsage()
  if (isLoading) return <Skeleton height={220} />
  if (!data?.total_calls) return <EmptyState icon={KeyRound} title="No calls yet">Usage appears here once a key makes its first request.</EmptyState>
  const days = data.days.map(d => ({ ...d, label: d.day.slice(5) }))
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div><div className="stat-label">Calls (30 days)</div><div className="tnum" style={{ fontSize: 28, fontWeight: 800 }}>{fmtNum(data.total_calls)}</div></div>
        <div><div className="stat-label">Credits used</div><div className="tnum" style={{ fontSize: 28, fontWeight: 800 }}>{fmtNum(data.total_credits)}</div></div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
          <Tooltip content={<ChartTooltip valueFormatter={fmtNum} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Bar dataKey="calls" name="Calls" fill="var(--emerald)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Endpoint</th><th>Calls</th><th>Credits</th></tr></thead>
          <tbody>{data.endpoints.map(e => <tr key={e.endpoint}><td><code>{e.endpoint}</code></td><td className="tnum">{fmtNum(e.calls)}</td><td className="tnum">{fmtNum(e.credits)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

/** Keys, credits and usage in one place. */
export default function ApiConsole() {
  const { data, isLoading } = useDeveloper()
  const { data: ws } = useWorkspace()
  const [tab, setTab] = useState(() => (window.location.hash.includes('credits=') ? 'credits' : 'keys'))
  const isAdmin = ws?.role === 'admin'

  return (
    <section className="dev-console" id="console">
      <div className="dev-console-head">
        <div>
          <h2>Your API</h2>
          <p>Create keys, add credits and watch usage.</p>
        </div>
        <div className="segmented" role="group" aria-label="Console section">
          {[['keys', 'API keys'], ['credits', 'Credits'], ['usage', 'Usage']].map(([id, label]) => (
            <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>
      {isLoading || !data ? <Skeleton height={180} /> : tab === 'keys' ? <Keys data={data} isAdmin={isAdmin} /> : tab === 'credits' ? <Credits data={data} isAdmin={isAdmin} /> : <Usage />}
    </section>
  )
}
