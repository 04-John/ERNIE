import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Logo from './components/Logo'
import { getMe, TOKEN_KEY } from './api/client'

const THEME_KEY = 'ernie_theme'

const initialTheme = () => {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function App() {
  const [theme, setTheme] = useState(initialTheme)
  // loading | login | signup | app. Only 'loading' if a saved token needs validating.
  const [view, setView]   = useState(() => (localStorage.getItem(TOKEN_KEY) ? 'loading' : 'login'))
  const [user, setUser]   = useState(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    queryClient.clear()
    setUser(null)
    setView('login')
  }, [queryClient])

  // restore session
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    getMe()
      .then(u => { setUser(u); setView('app') })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setView('login') })
  }, [])

  // api client fires this when a token expires mid-session
  useEffect(() => {
    window.addEventListener('ernie:logout', logout)
    return () => window.removeEventListener('ernie:logout', logout)
  }, [logout])

  const handleAuthed = (userData, token) => {
    localStorage.setItem(TOKEN_KEY, token)
    setUser(userData)
    setView('app')
  }

  if (view === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ display: 'grid', gap: 18, justifyItems: 'center' }}>
          <Logo size={44} />
          <div className="skeleton" style={{ width: 120, height: 4 }} />
        </div>
      </div>
    )
  }

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  if (view === 'login')  return <Login  onLogin={handleAuthed}  onSignup={() => setView('signup')} theme={theme} onToggleTheme={toggleTheme} />
  if (view === 'signup') return <Signup onSignup={handleAuthed} onLogin={() => setView('login')} theme={theme} onToggleTheme={toggleTheme} />

  return <Dashboard theme={theme} setTheme={setTheme} user={user} onLogout={logout} />
}
