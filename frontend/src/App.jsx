import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import { getMe } from './api/client'

export default function App() {
  const [theme, setTheme]   = useState('dark')
  const [auth, setAuth]     = useState('loading')
  const [user, setUser]     = useState(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // check if already logged in on mount
  useEffect(() => {
    const token = localStorage.getItem('br_token')
    if (!token) { setAuth('login'); return }

    getMe()
      .then(u => { setUser(u); setAuth('dashboard') })
      .catch(() => {
        localStorage.removeItem('br_token')
        setAuth('login')
      })
  }, [])

  const handleLogin = (userData, token) => {
    localStorage.setItem('br_token', token)
    setUser(userData)
    setAuth('dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('br_token')
    setUser(null)
    setAuth('login')
  }

  if (auth === 'loading') return (
    <div style={{
      minHeight: '100vh', background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: '#8DFF1C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: '#000' }}>E</span>
      </div>
      <div style={{ fontSize: 12, color: '#555', letterSpacing: '.1em', textTransform: 'uppercase' }}>Loading...</div>
    </div>
  )

  if (auth === 'login')
    return <Login
      theme={theme}
      onLogin={handleLogin}
      onSignup={() => setAuth('signup')}
    />

  if (auth === 'signup')
    return <Signup
      theme={theme}
      onSignup={handleLogin}
      onLogin={() => setAuth('login')}
    />

  return <Dashboard
    theme={theme}
    setTheme={setTheme}
    user={user}
    onLogout={handleLogout}
  />
}