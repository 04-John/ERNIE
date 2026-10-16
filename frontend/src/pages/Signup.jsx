import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, User, Layers, ArrowRight, Building2 } from 'lucide-react'
import { useGoogleLogin } from '@react-oauth/google'

// ── These MUST be outside the component to prevent re-render focus loss
function InputField({ label, icon: Icon, type, value, onChange, placeholder, children }) {
  return (
    <div>
      <label style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.08em', color: 'var(--text-muted)',
        display: 'block', marginBottom: 8,
      }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <Icon size={15} style={{
          position: 'absolute', left: 14, top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)', pointerEvents: 'none',
        }} />
        <input
          type={type || 'text'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            width: '100%',
            padding: `12px ${children ? '44px' : '14px'} 12px 40px`,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: 'var(--font)',
            outline: 'none',
            transition: 'border-color .15s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--green)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        {children}
      </div>
    </div>
  )
}

export default function Signup({ onSignup, onLogin }) {
  const [name,     setName]     = useState('')
  const [company,  setCompany]  = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
        try {
        const { googleAuth } = await import('../api/client')
        const data = await googleAuth(tokenResponse.access_token)
        onSignup(data.user, data.access_token)
        } catch (err) {
        setError('Google sign up failed. Please try again.')
        }
    },
    onError: () => setError('Google sign up failed. Please try again.'),
  })

  const handle = async (e) => {
    e.preventDefault()
    if (!name || !email || !password) { setError('Please fill in all required fields.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true); setError('')

    try {
        const { registerUser } = await import('../api/client')
        const data = await registerUser(email, password, name, company)
        onSignup(data.user, data.access_token)
    } catch (err) {
        const msg = err.response?.data?.detail || 'Registration failed. Please try again.'
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
      <style>{`@keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }`}</style>

      {/* ── Left panel — branding */}
      <div style={{
        flex: 1, background: '#000',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '40px 40px', opacity: 0.4,
        }} />
        <div style={{
          position: 'absolute', bottom: '20%', right: '10%',
          width: 350, height: 350, borderRadius: '50%',
          background: 'radial-gradient(circle, #8DFF1C15 0%, transparent 70%)',
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
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--green-dim)', border: '1px solid #8DFF1C25',
            padding: '6px 14px', borderRadius: 20, marginBottom: 24,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            <span style={{
              fontSize: 11, color: 'var(--green)',
              fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em',
            }}>
              Free plan — no credit card
            </span>
          </div>

          <h2 style={{
            fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em',
            lineHeight: 1.1, textTransform: 'uppercase', marginBottom: 16,
          }}>
            Start Building<br />
            <span style={{ color: 'var(--green)' }}>In Minutes</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 360 }}>
            Get access to wallet analytics, churn prediction, and retention insights for your fintech platform.
          </p>

          {/* Feature list */}
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              '100 wallet addresses on free plan',
              'Real-time churn risk scoring',
              'Regional performance analytics',
              'Plug-and-play API integration',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: 'var(--green-dim)',
                  border: '1px solid #8DFF1C30',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          position: 'relative', fontSize: 11,
          color: 'rgba(255,255,255,0.25)', letterSpacing: '.04em',
        }}>
          ERNIE · 2026
        </div>
      </div>

      {/* ── Right panel — form */}
      <div style={{
        width: 480, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '48px',
        animation: 'fadeUp .5s ease .1s both',
        overflowY: 'auto',
      }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>
            Create your account
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Start with the free plan — no credit card required
          </p>
        </div>

        {/* Google signup button */}
        <button
          type="button"
          onClick={() => googleLogin()}
          style={{
            width: '100%', padding: '11px 14px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            fontFamily: 'var(--font)', marginBottom: 20,
            transition: 'border-color .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          {/* Google SVG icon */}
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

        <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <InputField
              label="Full name *"
              icon={User}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="John Doe"
            />
            <InputField
              label="Company"
              icon={Building2}
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Acme Fintech"
            />
          </div>

          <InputField
            label="Email address *"
            icon={Mail}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
          />

          <InputField
            label="Password *"
            icon={Lock}
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
          >
            <button
              type="button"
              onClick={() => setShowPass(s => !s)}
              style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', padding: 0,
              }}
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </InputField>

          {error && (
            <div style={{
              fontSize: 12, color: 'var(--red)',
              padding: '10px 14px', background: 'var(--red-dim)',
              borderRadius: 6, border: '1px solid #ef444430',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '13px',
              background: loading ? 'var(--border)' : 'var(--green)',
              border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: 14,
              color: loading ? 'var(--text-muted)' : '#000',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all .15s', marginTop: 4,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
              fontFamily: 'var(--font)',
            }}
          >
            {loading ? 'Creating account...' : (<>Create free account <ArrowRight size={16} /></>)}
          </button>
        </form>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginTop: 24 }}>
          Already have an account?{' '}
          <span
            onClick={onLogin}
            style={{ color: 'var(--green)', fontWeight: 600, cursor: 'pointer' }}
          >
            Sign in
          </span>
        </p>
      </div>
    </div>
  )
}