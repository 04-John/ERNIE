import { useState } from 'react'
import { MailPlus, Loader2, Copy, Check, RefreshCw, Sparkles } from 'lucide-react'
import { useAssistantStatus } from '../hooks/useAnalytics'
import { draftOutreach } from '../api/client'
import { Alert } from './ui'
import { copyText } from '../lib/format'
import { useTyped } from '../lib/useTyped'

/**
 * "Draft outreach" for one fintech, shown as a card in the fintech drawer and page.
 * Only offered when the server has the assistant; asks the workspace to turn it on first.
 * The draft types itself out, then becomes editable.
 */
export default function DraftOutreach({ fintechId, name }) {
  const { data: status } = useAssistantStatus()
  const [channel, setChannel] = useState('email')
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const { shown, done } = useTyped(text)

  if (!status?.available) return null

  const generate = async ch => {
    setBusy(true); setError(''); setText(''); setEdited(null)
    try {
      const r = await draftOutreach(fintechId, ch)
      setText(r.text)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not write a draft. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const current = edited ?? text
  const copy = async () => { if (await copyText(current)) { setCopied(true); setTimeout(() => setCopied(false), 1600) } }

  return (
    <section className="drawer-card draft-card">
      <div className="drawer-card-head" style={{ marginBottom: text || error ? 14 : 0 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div className="card-title">Draft outreach</div>
          <div className="card-sub">Ask ERNIE writes a check-in grounded in these numbers{name ? ` for ${name}` : ''}</div>
        </div>
        {status.enabled
          ? <button className="btn btn-primary btn-sm" onClick={() => generate(channel)} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <MailPlus size={14} />} {text ? 'Rewrite' : 'Draft outreach'}
            </button>
          : <a href="#/assistant" className="btn btn-sm"><Sparkles size={14} /> Turn on Ask ERNIE</a>}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {text && (
        <>
          <div className="segmented" role="group" aria-label="Format" style={{ marginBottom: 12 }}>
            {['email', 'message'].map(c => (
              <button key={c} aria-pressed={channel === c} disabled={busy} onClick={() => { setChannel(c); generate(c) }}>{c === 'email' ? 'Email' : 'Chat message'}</button>
            ))}
          </div>
          {done ? (
            <textarea className="input draft-text" rows={9} value={current} onChange={e => setEdited(e.target.value)} aria-label="Draft" />
          ) : (
            <p className="draft-text typed">{shown}<span className="caret" /></p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={copy} disabled={!done}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
            <button className="btn btn-sm" onClick={() => generate(channel)} disabled={busy}><RefreshCw size={14} /> Rewrite</button>
            <span className="hint">AI-written. Check the facts and fill in the [placeholders] before sending.</span>
          </div>
        </>
      )}
    </section>
  )
}
