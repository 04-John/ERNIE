import { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { Eye, EyeOff, Radar, Activity, ShieldCheck, Sun, Moon } from 'lucide-react'
import Logo from '../components/Logo'
import Starfield from '../components/Starfield'
import { googleAuth } from '../api/client'

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

const POINTS = [
  { icon: Radar,       title: 'Churn risk scoring',      text: 'Rank every fintech by how likely it is to go quiet.' },
  { icon: Activity,    title: 'Wallet dormancy tracking', text: 'See which wallets stopped transacting, and since when.' },
  { icon: ShieldCheck, title: 'Built on your own data',   text: 'Live from your Blockradar wallet, refreshed automatically.' },
]

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/>
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  )
}

export function GoogleButton({ label, onAuthed, onError, inviteToken }) {
  const login = useGoogleLogin({
    onSuccess: async tokenResponse => {
      try {
        const data = await googleAuth(tokenResponse.access_token, inviteToken)
        onAuthed(data.user, data.access_token)
      } catch (err) {
        onError(err.response?.data?.detail || 'Google sign-in failed. Please try again.')
      }
    },
    onError: () => onError('Google sign-in was cancelled or failed.'),
  })
  if (!GOOGLE_ENABLED) return null
  return (
    <>
      <button type="button" className="btn btn-block" style={{ height: 46 }} onClick={() => login()}>
        <GoogleIcon /> {label}
      </button>
      <div className="divider">or</div>
    </>
  )
}

export function PasswordField({ id, value, onChange, autoComplete, hint }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>Password</label>
      <div className="input-wrap">
        <input
          id={id} className="input has-trail" type={show ? 'text' : 'password'}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder="••••••••" autoComplete={autoComplete} required
        />
        <button type="button" className="btn btn-ghost btn-icon input-trail" style={{ width: 32, height: 32 }}
          onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export default function AuthLayout({ title, lede, children, footer, theme, onToggleTheme, onHome }) {
  const brand = (size, tagline) => (onHome
    ? <button type="button" onClick={onHome} aria-label="Back to ERNIE home" style={{ display: 'inline-flex' }}><Logo size={size} tagline={tagline} /></button>
    : <Logo size={size} tagline={tagline} />)
  return (
    <div className="auth">
      <aside className="auth-brand">
        <Starfield />
        {brand(40, true)}
        <div>
          <h1 className="auth-headline">
            Know who's going quiet<br /><span>before they churn.</span>
          </h1>
          <div className="auth-points">
            {POINTS.map(p => (
              <div className="auth-point" key={p.title}>
                <div className="auth-point-icon"><p.icon size={18} /></div>
                <div><b>{p.title}</b><span>{p.text}</span></div>
              </div>
            ))}
          </div>
        </div>
        <small style={{ color: '#5E6E7E' }}>© {new Date().getFullYear()} ERNIE · Engagement &amp; Retention Network Intelligence Engine</small>
      </aside>

      <main className="auth-form-side">
        <div className="auth-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="auth-mobile-logo">
            {brand(36, false)}
          </div>
          <h2>{title}</h2>
          <p className="lede">{lede}</p>
          {children}
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-2)' }}>{footer}</p>
        </div>
      </main>

      {onToggleTheme && (
        <button className="btn btn-icon" onClick={onToggleTheme} aria-label="Toggle theme"
          style={{ position: 'fixed', top: 16, right: 16, zIndex: 5 }}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      )}
    </div>
  )
}
