import { useState } from 'react'
import { Mail, ArrowRight, Loader2 } from 'lucide-react'
import AuthLayout, { GoogleButton, PasswordField } from './AuthLayout'
import { Alert } from '../components/ui'
import { loginUser } from '../api/client'

export default function Login({ onLogin, onSignup, theme, onToggleTheme }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const submit = async e => {
    e.preventDefault()
    if (!email || !password) { setError('Enter your email and password.'); return }
    setLoading(true); setError('')
    try {
      const data = await loginUser(email, password)
      onLogin(data.user, data.access_token)
    } catch (err) {
      const status = err.response?.status
      setError(
        status === 429 ? 'Too many attempts. Please wait a minute and try again.'
        : err.response?.data?.detail && status < 500 ? err.response.data.detail
        : 'Could not reach the server. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      theme={theme} onToggleTheme={onToggleTheme}
      title="Welcome back"
      lede="Sign in to your retention intelligence dashboard."
      footer={<>New to ERNIE? <button className="link" onClick={onSignup}>Create an account</button></>}
    >
      <div className="form">
        <GoogleButton label="Continue with Google" onAuthed={onLogin} onError={setError} />

        <form className="form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <div className="input-wrap">
              <Mail size={16} className="lead" />
              <input id="email" className="input has-lead" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                autoComplete="email" required />
            </div>
          </div>

          <PasswordField id="password" value={password} onChange={setPassword} autoComplete="current-password" />

          {error && <Alert tone="danger">{error}</Alert>}

          <button type="submit" className="btn btn-primary btn-block" style={{ height: 46 }} disabled={loading}>
            {loading ? <><Loader2 size={16} className="spin" /> Signing in…</> : <>Sign in <ArrowRight size={16} /></>}
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}
