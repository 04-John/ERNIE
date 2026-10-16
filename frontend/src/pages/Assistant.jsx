import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, RotateCcw, Loader2, User as UserIcon } from 'lucide-react'
import { useAssistantStatus, useChurnScores } from '../hooks/useAnalytics'
import { assistantChat } from '../api/client'
import { PageHeader, Card, Alert, Skeleton } from '../components/ui'
import AiConsent from '../components/AiConsent'
import { useQueryClient } from '@tanstack/react-query'

const BASE_PROMPTS = [
  'Summarize where things stand this week.',
  'Which fintech should I contact first, and why?',
  'What changed in my volume recently?',
  'What are the biggest risks to my business right now?',
]

function Bubble({ role, children }) {
  const mine = role === 'user'
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-start' }}>
      {!mine && <span className="avatar" style={{ width: 30, height: 30, flexShrink: 0 }}><Sparkles size={14} /></span>}
      <div style={{
        maxWidth: 'min(720px, 85%)', padding: '12px 16px', borderRadius: 14, whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.6,
        background: mine ? 'var(--accent-soft)' : 'var(--surface-2)', border: `1px solid ${mine ? 'var(--accent-ring)' : 'var(--border)'}`,
      }}>{children}</div>
      {mine && <span className="avatar" style={{ width: 30, height: 30, flexShrink: 0, background: 'var(--surface-hover)', color: 'var(--text-2)' }}><UserIcon size={14} /></span>}
    </div>
  )
}

export default function Assistant() {
  const { data: status, isLoading } = useAssistantStatus()
  const { data: scores } = useChurnScores({ limit: 3 })
  const qc = useQueryClient()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef(null)

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy])

  const top = (scores?.data || []).find(f => f.churn_risk && f.churn_risk !== 'Unknown')
  const prompts = top ? [...BASE_PROMPTS.slice(0, 2), `Why is ${top.fintech_name} ${top.churn_risk.toLowerCase()} risk?`, BASE_PROMPTS[2]] : BASE_PROMPTS

  const send = async text => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setError(''); setBusy(true)
    try {
      const r = await assistantChat(next)
      setMessages([...next, { role: 'assistant', content: r.reply }])
      qc.invalidateQueries({ queryKey: ['assistant-status'] })
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  if (isLoading) return <div className="stack"><Skeleton height={60} /><Skeleton height={320} /></div>

  const ready = status?.available && status?.enabled
  return (
    <div className="stack">
      <PageHeader eyebrow="Ask ERNIE" title="Ask about your retention data"
        actions={ready && messages.length > 0 && <button className="btn btn-sm" onClick={() => { setMessages([]); setError('') }}><RotateCcw size={14} /> New chat</button>}>
        An analyst that knows your fintechs, their risk scores and what changed. Ask in plain English.
      </PageHeader>

      {!ready ? (
        <Card title="Turn on the AI assistant" subtitle="Off by default. Nothing is sent until an admin enables it.">
          <AiConsent status={status} />
        </Card>
      ) : (
        <Card>
          <div style={{ display: 'grid', gap: 16, minHeight: 360 }}>
            {messages.length === 0 && (
              <div style={{ display: 'grid', gap: 14, padding: '20px 0' }}>
                <div style={{ textAlign: 'center' }}>
                  <span className="avatar" style={{ width: 44, height: 44, margin: '0 auto 12px' }}><Sparkles size={20} /></span>
                  <h3 style={{ fontSize: 17 }}>What would you like to know?</h3>
                  <p className="hint" style={{ marginTop: 4 }}>Try one of these, or ask your own question.</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {prompts.map(p => <button key={p} className="pill" onClick={() => send(p)}>{p}</button>)}
                </div>
              </div>
            )}

            {messages.map((m, i) => <Bubble key={i} role={m.role}>{m.content}</Bubble>)}
            {busy && <Bubble role="assistant"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}><Loader2 size={15} className="spin" /> Thinking…</span></Bubble>}
            {error && <Alert tone="danger">{error}</Alert>}
            <div ref={bottom} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'flex-end' }}>
            <textarea className="input" rows={2} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
              placeholder="Ask about a fintech, a trend, or what to do next…" maxLength={2000} aria-label="Your question"
              style={{ height: 'auto', padding: '12px 14px', resize: 'vertical', fontFamily: 'inherit' }} />
            <button className="btn btn-primary" style={{ height: 46 }} onClick={() => send()} disabled={busy || !input.trim()}><Send size={15} /> Send</button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            {status.used} of {status.limit} messages used this month · AI can make mistakes, so check important details before acting.
          </p>
        </Card>
      )}
    </div>
  )
}
