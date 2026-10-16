import { useEffect, useRef, useState } from 'react'
import { Mail, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react'
import AuthLayout, { PasswordField } from './AuthLayout'
import { Alert } from '../components/ui'
import { forgotPassword, resetPassword, verifyEmail } from '../api/client'

const MIN_PASSWORD = 8 // must match the backend rule

export function ForgotPassword({ onBack, onHome, theme, onToggleTheme }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async e => {
    e.preventDefault()
    if (!email) return
    setLoading(true); setError('')
    try {
      await forgotPassword(email)
      setSent(true)                       // same answer whether or not the account exists
    } catch (err) {
      setError(err.response?.status === 429 ? 'Too many attempts. Please wait a minute and try again.'
        : err.response?.status === 422 ? 'Please enter a valid email address.'
        : 'Could not reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme} onHome={onHome}
      title="Reset your password"
      lede="Enter your account email and we'll send you a link to choose a new password."
      footer={<button className="link" onClick={onBack}>Back to sign in</button>}>
      {sent ? (
        <Alert tone="success">
          <strong>Check your inbox.</strong> If an account exists for <b>{email}</b>, a reset link is on its way. It works for 1 hour.
        </Alert>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="fp-email">Email</label>
            <div className="input-wrap">
              <Mail size={16} className="lead" />
              <input id="fp-email" className="input has-lead" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" autoComplete="email" required />
            </div>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <button type="submit" className="btn btn-primary btn-block" style={{ height: 46 }} disabled={loading || !email}>
            {loading ? <><Loader2 size={16} className="spin" /> Sending…</> : <>Send reset link <ArrowRight size={16} /></>}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPassword({ token, onDone, onHome, theme, onToggleTheme }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async e => {
    e.preventDefault()
    if (password.length < MIN_PASSWORD) { setError(`Password must be at least ${MIN_PASSWORD} characters.`); return }
    if (password !== confirm) { setError("Those passwords don't match."); return }
    setLoading(true); setError('')
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err.response?.status === 429 ? 'Too many attempts. Please wait a minute and try again.'
        : (err.response?.status < 500 && err.response?.data?.detail) || 'Could not reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme} onHome={onHome}
      title={done ? 'Password updated' : 'Choose a new password'}
      lede={done ? 'You can now sign in with your new password. Any other devices have been signed out.' : 'Pick something at least 8 characters long.'}
      footer={done ? null : <button className="link" onClick={onDone}>Back to sign in</button>}>
      {done ? (
        <button className="btn btn-primary btn-block" style={{ height: 46 }} onClick={onDone}>Continue to sign in <ArrowRight size={16} /></button>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <PasswordField id="rp-new" value={password} onChange={setPassword} autoComplete="new-password" hint={`At least ${MIN_PASSWORD} characters.`} />
          <div className="field">
            <label htmlFor="rp-confirm">Confirm password</label>
            <input id="rp-confirm" className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••" autoComplete="new-password" required />
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <button type="submit" className="btn btn-primary btn-block" style={{ height: 46 }} disabled={loading}>
            {loading ? <><Loader2 size={16} className="spin" /> Saving…</> : <>Update password <ArrowRight size={16} /></>}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}

export function VerifyEmail({ token, onContinue, theme, onToggleTheme }) {
  const [state, setState] = useState('working')     // working | ok | error
  const [message, setMessage] = useState('')
  const ran = useRef(false)                          // the token is single-use: never call twice (StrictMode)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    verifyEmail(token)
      .then(() => setState('ok'))
      .catch(err => { setState('error'); setMessage(err.response?.data?.detail || 'Could not confirm your email.') })
  }, [token])

  return (
    <AuthLayout theme={theme} onToggleTheme={onToggleTheme}
      title={state === 'ok' ? 'Email confirmed' : state === 'error' ? "That link didn't work" : 'Confirming your email…'}
      lede={state === 'ok' ? 'Thanks. Your email address is verified.' : state === 'error' ? message : 'One moment.'}>
      {state === 'working' && <div className="skeleton" style={{ height: 6, width: 160 }} />}
      {state === 'ok' && <Alert tone="success"><CheckCircle2 size={0} /> You're all set.</Alert>}
      {state !== 'working' && (
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary btn-block" style={{ height: 46 }} onClick={onContinue}>Continue <ArrowRight size={16} /></button>
        </div>
      )}
    </AuthLayout>
  )
}
