import { useState } from 'react'
import { Mail, User, Building2, ArrowRight, Loader2 } from 'lucide-react'
import AuthLayout, { GoogleButton, PasswordField } from './AuthLayout'
import { Alert } from '../components/ui'
import { registerUser } from '../api/client'

const MIN_PASSWORD = 8 // must match the backend rule

export default function Signup({ onSignup, onLogin, theme, onToggleTheme }) {
  const [name, setName]         = useState('')
  const [company, setCompany]   = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const submit = async e => {
    e.preventDefault()
    if (!name || !email || !password) { setError('Please fill in your name, email and password.'); return }
    if (password.length < MIN_PASSWORD) { setError(`Password must be at least ${MIN_PASSWORD} characters.`); return }
    setLoading(true); setError('')
    try {
      const data = await registerUser(email, password, name, company)
      onSignup(data.user, data.access_token)
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail
      setError(
        status === 429 ? 'Too many attempts. Please wait a minute and try again.'
        : status === 422 ? 'Please enter a valid email address.'
        : typeof detail === 'string' && status < 500 ? detail
        : 'Could not reach the server. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      theme={theme} onToggleTheme={onToggleTheme}
      title="Create your account"
      lede="Start tracking wallet activity and churn risk in minutes."
      footer={<>Already have an account? <button className="link" onClick={onLogin}>Sign in</button></>}
    >
      <div className="form">
        <GoogleButton label="Sign up with Google" onAuthed={onSignup} onError={setError} />

        <form className="form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <div className="input-wrap">
              <User size={16} className="lead" />
              <input id="name" className="input has-lead" value={name} onChange={e => setName(e.target.value)}
                placeholder="Ada Lovelace" autoComplete="name" required />
            </div>
          </div>

          <div className="field">
            <label htmlFor="company">Company <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
            <div className="input-wrap">
              <Building2 size={16} className="lead" />
              <input id="company" className="input has-lead" value={company} onChange={e => setCompany(e.target.value)}
                placeholder="Acme Payments" autoComplete="organization" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="email">Work email</label>
            <div className="input-wrap">
              <Mail size={16} className="lead" />
              <input id="email" className="input has-lead" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" autoComplete="email" required />
            </div>
          </div>

          <PasswordField id="password" value={password} onChange={setPassword}
            autoComplete="new-password" hint={`At least ${MIN_PASSWORD} characters.`} />

          {error && <Alert tone="danger">{error}</Alert>}

          <button type="submit" className="btn btn-primary btn-block" style={{ height: 46 }} disabled={loading}>
            {loading ? <><Loader2 size={16} className="spin" /> Creating account…</> : <>Create account <ArrowRight size={16} /></>}
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}
