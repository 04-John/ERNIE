import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useAssistantStatus, useChurnScores } from '../hooks/useAnalytics'
import { assistantChat } from '../api/client'
import { PageHeader, Card, Alert, Skeleton } from '../components/ui'
import AiConsent from '../components/AiConsent'
import { useTyped } from '../lib/useTyped'

const BASE_PROMPTS = [
  'Summarize where things stand this week.',
  'Which fintech should I contact first, and why?',
  'What changed in my volume recently?',
  'What are the biggest risks to my business right now?',
]

const Avatar = () => <span className="ai-avatar" aria-hidden="true">✦</span>

function Bubble({ role, text, animate = false, onGrow }) {
  const mine = role === 'user'
  const typed = useTyped(animate ? text : '')
  const shown = animate ? typed.shown : text
  useEffect(() => { if (animate) onGrow?.() }, [shown, animate, onGrow])
  return (
    <div className="bubble-row" style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      {!mine && <Avatar />}
      <div className={`bubble ${mine ? 'mine' : ''}`}>{shown}{animate && !typed.done && <span className="caret" />}</div>
    </div>
  )
}

export default function Assistant() {
  const { data: status, isLoading } = useAssistantStatus()
  const { data: scores } = useChurnScores({ limit: 3 })
  const qc = useQueryClient()
  const [messages, setMessages] = useState([])
  const [fresh, setFresh] = useState(-1)                 // index of the reply that is still typing out
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef(null)
  const toBottom = useCallback(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [])

  useEffect(() => { toBottom() }, [messages, busy, toBottom])

  const top = (scores?.data || []).find(f => f.churn_risk && f.churn_risk !== 'Unknown')
  const prompts = top ? [...BASE_PROMPTS.slice(0, 2), `Why is ${top.fintech_name} ${top.churn_risk.toLowerCase()} risk?`, BASE_PROMPTS[2]] : BASE_PROMPTS

  const send = async text => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setError(''); setBusy(true); setFresh(-1)
    try {
      const r = await assistantChat(next)
      setMessages([...next, { role: 'assistant', content: r.reply }])
      setFresh(next.length)
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
  const used = status?.limit == null ? `${status?.used ?? 0} messages used this month` : `${status?.used ?? 0} of ${status?.limit} messages used this month`

  return (
    <div className="stack" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
      <PageHeader eyebrow="Ask ERNIE" title="Ask about your retention data"
        actions={ready && messages.length > 0 && <button className="btn btn-sm" onClick={() => { setMessages([]); setError(''); setFresh(-1) }}><RotateCcw size={14} /> New chat</button>}>
        An analyst that knows your fintechs, their risk scores and what changed. Ask in plain English.
      </PageHeader>

      {!ready ? (
        <Card title="Turn on the AI assistant" subtitle="Off by default. Nothing is sent until an admin enables it.">
          <AiConsent status={status} />
        </Card>
      ) : (
        <section className="chat-card">
          <div className="chat-scroll">
            {messages.length === 0 && (
              <div className="chat-empty">
                <div>
                  <span className="ai-avatar lg" aria-hidden="true">✦</span>
                  <h3 className="display">What would you like to know?</h3>
                  <p className="hint" style={{ marginTop: 6 }}>Try one of these, or ask your own question.</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {prompts.map(p => <button key={p} className="pill prompt" onClick={() => send(p)}>{p}</button>)}
                </div>
              </div>
            )}

            {messages.map((m, i) => <Bubble key={i} role={m.role} text={m.content} animate={i === fresh} onGrow={toBottom} />)}
            {busy && (
              <div className="bubble-row"><Avatar /><span className="mono thinking">Thinking<span className="dots"><i /><i /><i /></span></span></div>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
            <div ref={bottom} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'flex-end' }}>
            <textarea className="input" rows={2} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
              placeholder="Ask about a fintech, a trend, or what to do next…" maxLength={2000} aria-label="Your question" />
            <button className="btn btn-primary" style={{ height: 48, padding: '0 18px', fontSize: 14, opacity: busy || !input.trim() ? .55 : 1 }} onClick={() => send()} disabled={busy || !input.trim()}>Send</button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            {used} · Only totals and scores are shared, never wallet addresses, keys or emails · AI can make mistakes, so check important details before acting.
          </p>
        </section>
      )}
    </div>
  )
}
