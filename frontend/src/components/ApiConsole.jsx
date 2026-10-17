import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, KeyRound, Loader2, Wallet, TriangleAlert } from 'lucide-react'
import { Alert, Badge, EmptyState, Skeleton } from './ui'
import { useDeveloper, useApiUsage, useCreateApiKey, useRevokeApiKey, useWorkspace } from '../hooks/useAnalytics'
import { startTopup } from '../api/client'
import { copyText, fmtNum, timeAgo } from '../lib/format'

const usd = credits => `$${(credits / 1000).toFixed(credits >= 100_000 ? 0 : 2)}`

/** The last `n` calendar days, oldest first, filled with zeros where nothing happened. */
function lastDays(days, n, field) {
  const byDay = Object.fromEntries((days || []).map(d => [d.day, d]))
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    out.push({ day: key, value: byDay[key]?.[field] || 0 })
  }
  return out
}

function Bars({ series, height, opacity = 1, label }) {
  const peak = Math.max(...series.map(s => s.value), 1)
  return (
    <div className="mini-bars" style={{ height }} role="img" aria-label={label}>
      {series.map(s => <div key={s.day} title={`${s.day}: ${fmtNum(s.value)}`} style={{ height: `${Math.max(2, (s.value / peak) * 100)}%`, background: 'var(--emerald)', opacity }} />)}
    </div>
  )
}

function NewKeyReveal({ created, onDone }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { if (await copyText(created.key)) { setCopied(true); setTimeout(() => setCopied(false), 1600) } }
  return (
    <div className="reveal tone-success">
      <strong>Your new {created.mode} key. Copy it now.</strong>
      <p>For your security we only store a fingerprint of it, so it can't be shown again. If you lose it, create a new one and revoke this one.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <code className="dev-key">{created.key}</code>
        <button className="btn btn-primary btn-sm" onClick={copy} style={{ height: 36 }}>{copied ? 'Copied' : 'Copy key'}</button>
      </div>
      <div><button className="btn btn-sm" onClick={onDone}>I've saved it</button></div>
    </div>
  )
}

const KEY_COLS = 'minmax(0,1.4fr) 180px 80px 110px 80px'

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
        <div className="gt-wrap">
          <div style={{ minWidth: 620 }}>
            <div className="gt-head" style={{ gridTemplateColumns: KEY_COLS, padding: '0 0 10px' }}><span>Name</span><span>Key</span><span>Mode</span><span>Last used</span><span /></div>
            {data.keys.map(k => (
              <div key={k.id} className={`gt-row ${k.mode === 'live' ? 'tone-accent' : 'tone-neutral'}`} style={{ gridTemplateColumns: KEY_COLS, padding: '12px 0' }}>
                <div><div style={{ fontWeight: 600 }}>{k.name}</div><div className="hint">Created {timeAgo(k.created_at)}</div></div>
                <code className="mono" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{k.prefix}…</code>
                <span className="key-mode">{k.mode}</span>
                <span style={{ color: 'var(--muted)' }}>{k.last_used_at ? timeAgo(k.last_used_at) : 'never'}</span>
                <span style={{ justifySelf: 'end' }}>
                  {isAdmin && (confirm === k.id
                    ? <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn btn-sm btn-danger-solid" onClick={() => { revoke.mutate(k.id); setConfirm('') }}>Revoke</button>
                        <button className="btn btn-sm" onClick={() => setConfirm('')}>Keep</button>
                      </span>
                    : <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setConfirm(k.id)}>Revoke</button>)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', paddingTop: 6 }}>
          <label className="field" style={{ flex: '1 1 220px' }}><span>Key name</span>
            <input className="input" style={{ height: 40 }} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production backend" maxLength={60} required />
          </label>
          <label className="field"><span>Mode</span>
            <select className="input" style={{ height: 40 }} value={mode} onChange={e => setMode(e.target.value)}>
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
    <div style={{ display: 'grid', gap: 20 }}>
      {returned && <Alert tone="success">Thanks! Your payment went through. Your credits will appear in a moment.</Alert>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div className="stat-label" style={{ fontSize: 11 }}>Balance</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="credits-num">{fmtNum(data.credits)}</span>
            <span className="hint" style={{ fontSize: 13 }}>credits · about {usd(data.credits)} of calls</span>
          </div>
        </div>
        <span className="chip">1 credit = $0.001 · credits never expire</span>
      </div>
      {data.credits < 500 && data.keys.some(k => k.mode === 'live') && <Badge tone="warn"><TriangleAlert size={12} /> Running low: live calls fail at zero</Badge>}

      <div>
        <Bars series={lastDays(usage?.days, 14, 'credits')} height={72} opacity={0.55} label="Credits spent per day, last 14 days" />
        <div className="hint" style={{ marginTop: 6, fontSize: 11.5 }}>Credits spent per day · last 14 days</div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {isAdmin ? (
        data.topups_available ? (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            {data.pricing.packs.map(p => {
              const bonus = Math.round((p.credits / (p.usd * 1000) - 1) * 100)
              return (
                <div key={p.usd} className="pack">
                  <div className="pack-usd">${p.usd}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{fmtNum(p.credits)} credits</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent-text)', minHeight: 16 }}>{bonus > 0 ? `${bonus}% bonus` : ''}</div>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 6, height: 34 }} onClick={() => buy(p)} disabled={busy === p.usd}>
                    {busy === p.usd ? <Loader2 size={14} className="spin" /> : <Wallet size={14} />} Add credits
                  </button>
                </div>
              )
            })}
          </div>
        ) : <Alert tone="info">Online payments aren't switched on yet. To add credits, contact us.</Alert>
      ) : <p className="hint">Only workspace admins can add credits.</p>}
      <p className="hint" style={{ lineHeight: 1.6 }}>Credits are prepaid usage credit for the API. They don't expire, can't be withdrawn or transferred, and are non-refundable once bought.</p>

      {usage?.transactions?.length > 0 && (
        <div>
          {usage.transactions.map(t => (
            <div className="ledger-row" key={t.id}>
              <span>{t.note || t.kind}<span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{t.at ? timeAgo(t.at) : ''}</span></span>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: t.credits >= 0 ? 'var(--success)' : 'var(--text)' }}>{t.credits >= 0 ? '+' : ''}{fmtNum(t.credits)}</span>
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
  const series = lastDays(data.days, 30, 'calls')
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div><div className="stat-label" style={{ fontSize: 11 }}>Calls (30 days)</div><div className="display" style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmtNum(data.total_calls)}</div></div>
        <div><div className="stat-label" style={{ fontSize: 11 }}>Credits used</div><div className="display" style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmtNum(data.total_credits)}</div></div>
      </div>
      <div>
        <Bars series={series} height={160} opacity={0.75} label="Calls per day, last 30 days" />
        <div style={{ display: 'flex', justifyContent: 'space-between', font: '500 11px var(--font-mono)', color: 'var(--muted)', marginTop: 6 }}>
          <span>{series[0].day.slice(5)}</span><span>{series[series.length - 1].day.slice(5)}</span>
        </div>
      </div>
      <div>
        <div className="gt-head" style={{ gridTemplateColumns: '1fr 90px 90px', padding: '0 0 10px' }}><span>Endpoint</span><span className="gt-r">Calls</span><span className="gt-r">Credits</span></div>
        {data.endpoints.map(e => (
          <div key={e.endpoint} className="gt-row" style={{ gridTemplateColumns: '1fr 90px 90px', padding: '11px 0' }}>
            <code className="mono" style={{ fontSize: 12.5 }}>{e.endpoint}</code><span className="gt-r">{fmtNum(e.calls)}</span><span className="gt-r">{fmtNum(e.credits)}</span>
          </div>
        ))}
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
