import { useState } from 'react'
import { MailPlus, Loader2, Copy, Check, RefreshCw, X } from 'lucide-react'
import { useAssistantStatus } from '../hooks/useAnalytics'
import { draftOutreach } from '../api/client'
import { Alert } from './ui'
import { copyText } from '../lib/format'

/** "Draft outreach" for one fintech. Only offered once the workspace has turned the AI assistant on. */
export default function DraftOutreach({ fintechId, name }) {
  const { data: status } = useAssistantStatus()
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState('email')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  if (!status?.available) return null

  const generate = async ch => {
    setBusy(true); setError(''); setText('')
    try {
      const r = await draftOutreach(fintechId, ch)
      setText(r.text)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not write a draft. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const start = () => { setOpen(true); generate(channel) }
  const copy = async () => { if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 1600) } }

  if (!status.enabled) {
    return <a href="#/assistant" className="btn btn-sm"><MailPlus size={14} /> Draft outreach with AI</a>
  }
  if (!open) return <button className="btn btn-sm" onClick={start}><MailPlus size={14} /> Draft outreach</button>

  return (
    <div className="card" style={{ width: 'min(560px, 100%)', padding: 16, boxShadow: 'var(--shadow-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Outreach to {name}</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="segmented" role="group" aria-label="Format">
            {['email', 'message'].map(c => (
              <button key={c} aria-pressed={channel === c} onClick={() => { setChannel(c); generate(c) }} disabled={busy}>{c === 'email' ? 'Email' : 'Chat message'}</button>
            ))}
          </div>
          <button className="btn btn-icon btn-ghost" style={{ width: 30, height: 30 }} onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button>
        </div>
      </div>
      {busy && <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)', padding: '24px 0' }}><Loader2 size={15} className="spin" /> Writing a draft…</div>}
      {error && <Alert tone="danger">{error}</Alert>}
      {text && (
        <>
          <textarea className="input" value={text} onChange={e => setText(e.target.value)} rows={10} aria-label="Draft"
            style={{ height: 'auto', padding: 14, fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-sm btn-primary" onClick={copy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
            <button className="btn btn-sm" onClick={() => generate(channel)} disabled={busy}><RefreshCw size={14} /> Rewrite</button>
            <span className="hint">AI-written. Check the facts and fill in the [placeholders] before sending.</span>
          </div>
        </>
      )}
    </div>
  )
}
