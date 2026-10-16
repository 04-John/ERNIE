import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Layers, ArrowRight } from 'lucide-react'
import { useGoogleLogin } from '@react-oauth/google'

export default function Login({ onLogin, onSignup }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
        try {
        const { googleAuth } = await import('../api/client')
        const data = await googleAuth(tokenResponse.access_token)
        onLogin(data.user, data.access_token)
        } catch (err) {
        setError('Google login failed. Please try again.')
        }
    },
    onError: () => setError('Google login failed. Please try again.'),
  })

  const handle = async (e) => {
    e.preventDefault()
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true); setError('')

    try {
        const { loginUser } = await import('../api/client')
        const data = await loginUser(email, password)
        onLogin(data.user, data.access_token)
    } catch (err) {
        const msg = err.response?.data?.detail || 'Invalid email or password.'
        setError(msg)
    } finally {
        setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', fontFamily: 'var(--font)',
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
      `}</style>

      {/* Left panel — branding */}
      <div style={{
        flex: 1, background: '#000',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Grid background */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '40px 40px', opacity: 0.4,
        }} />

        {/* Glow */}
        <div style={{
          position: 'absolute', top: '30%', left: '20%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, #8DFF1C18 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Layers size={18} color="#000" strokeWidth={2.5} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em' }}>ERNIE</span>
        </div>

        {/* Center content */}
        <div style={{ position: 'relative', animation: 'fadeUp .6s ease both' }}>
          {/* Floating stat cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 48 }}>
            {[
              { label: 'Total Transaction Volume', value: '$486M+', color: 'var(--green)' },
              { label: 'Wallets Created',           value: '152K+',  color: '#3b82f6' },
              { label: 'Fintechs Served',           value: '100+',   color: '#a855f7' },
            ].map((s, i) => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: '16px 20px',
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center',
                animation: `fadeUp .6s ease ${i * .1 + .2}s both`,
                backdropFilter: 'blur(10px)',
              }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{s.label}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</span>
              </div>
            ))}
          </div>

          <h2 style={{
            fontSize: 36, fontWeight: 800,
            letterSpacing: '-0.03em', lineHeight: 1.1,
            textTransform: 'uppercase',
          }}>
            Wallet Intelligence<br />
            <span style={{ color: 'var(--green)' }}>For Fintechs</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginTop: 14, lineHeight: 1.7, maxWidth: 380 }}>
            Real-time churn prediction, wallet dormancy tracking,
            and transaction analytics across your Blockradar-connected fintechs.
          </p>
        </div>

        {/* Bottom */}
        <div style={{ position: 'relative', fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '.04em' }}>
          ERNIE · 2026
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        width: 480, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '48px',
        animation: 'fadeUp .5s ease .1s both',
      }}>
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Sign in to your Intelligence dashboard
          </p>
        </div>

        {/* Google login */}
        <button
          type="button"
          onClick={() => googleLogin()}
          style={{
            width: '100%', padding: '11px 14px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8, cursor: 'pointer',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10,
            fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font)', marginBottom: 20,
            transition: 'border-color .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.4-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3-11.3-7.3l-6.5 5C9.5 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.2 5.2C40.7 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              Email address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={{
                  width: '100%', padding: '12px 14px 12px 40px',
                  background: 'var(--bg-card)', border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: 8, color: 'var(--text-primary)',
                  fontSize: 13, fontFamily: 'var(--font)',
                  outline: 'none', transition: 'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--green)'}
                onBlur={e => e.target.style.borderColor = error ? 'var(--red)' : 'var(--border)'}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type={showPass ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '12px 44px 12px 40px',
                  background: 'var(--bg-card)', border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: 8, color: 'var(--text-primary)',
                  fontSize: 13, fontFamily: 'var(--font)',
                  outline: 'none', transition: 'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--green)'}
                onBlur={e => e.target.style.borderColor = error ? 'var(--red)' : 'var(--border)'}
              />
              <button type="button" onClick={() => setShowPass(s => !s)} style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', padding: 0,
              }}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ fontSize: 12, color: 'var(--red)', padding: '10px 14px', background: 'var(--red-dim)', borderRadius: 6, border: '1px solid #ef444430' }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '13px',
            background: loading ? 'var(--border)' : 'var(--green)',
            border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 14,
            color: loading ? 'var(--text-muted)' : '#000',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all .15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {loading ? 'Signing in...' : (<>Sign in <ArrowRight size={16} /></>)}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Signup link */}
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          Don't have an account?{' '}
          <span onClick={onSignup} style={{ color: 'var(--green)', fontWeight: 600, cursor: 'pointer' }}>
            Create one free
          </span>
        </p>
      </div>
    </div>
  )
}