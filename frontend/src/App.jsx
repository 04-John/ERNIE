import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Landing from './pages/Landing'
import { ForgotPassword, ResetPassword, VerifyEmail } from './pages/PasswordPages'
import { Terms, Privacy, Status } from './pages/PublicPages'
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

// Emailed links look like https://site/?invite=TOKEN, ?reset=TOKEN or ?verify=TOKEN
const PARAMS = new URLSearchParams(window.location.search)
const INVITE_TOKEN = PARAMS.get('invite') || ''
const RESET_TOKEN = PARAMS.get('reset') || ''
const VERIFY_TOKEN = PARAMS.get('verify') || ''
const cleanUrl = () => window.history.replaceState({}, '', window.location.pathname + window.location.hash)

const PUBLIC_PAGES = { terms: Terms, privacy: Privacy, status: Status }
const publicPage = () => window.location.hash.replace(/^#\/?/, '').split('?')[0]

export default function App() {
  const [theme, setTheme] = useState(initialTheme)
  const [page, setPage] = useState(publicPage)
  useEffect(() => {
    const onHash = () => setPage(publicPage())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // loading | landing | login | signup | forgot | reset | verify | app. Only 'loading' if a saved token needs validating.
  const [view, setView]   = useState(() => (
    RESET_TOKEN ? 'reset'
    : VERIFY_TOKEN ? 'verify'
    : localStorage.getItem(TOKEN_KEY) ? 'loading'
    : INVITE_TOKEN ? 'signup' : 'landing'
  ))
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
    setView('landing')
  }, [queryClient])

  // restore session
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY) || RESET_TOKEN || VERIFY_TOKEN) return
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
    if (INVITE_TOKEN) cleanUrl()
    setUser(userData)
    setView('app')
    getMe().then(setUser).catch(() => {})     // login responses are minimal; load the full profile (role, workspace, verified)
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
  const PublicPage = PUBLIC_PAGES[page]
  if (PublicPage) return <PublicPage theme={theme} onToggleTheme={toggleTheme} />          // terms, privacy and status are readable signed in or out
  const home = () => setView('landing')
  const finishLink = () => { cleanUrl(); window.location.assign(window.location.pathname) }
  if (view === 'reset') return <ResetPassword token={RESET_TOKEN} onDone={finishLink} onHome={home} theme={theme} onToggleTheme={toggleTheme} />
  if (view === 'verify') return <VerifyEmail token={VERIFY_TOKEN} onContinue={finishLink} theme={theme} onToggleTheme={toggleTheme} />
  if (view === 'forgot') return <ForgotPassword onBack={() => setView('login')} onHome={home} theme={theme} onToggleTheme={toggleTheme} />
  if (view === 'landing') return <Landing theme={theme} onToggleTheme={toggleTheme} onLogin={() => setView('login')} onSignup={() => setView('signup')} />
  if (view === 'login')  return <Login  onLogin={handleAuthed}  onSignup={() => setView('signup')} onForgot={() => setView('forgot')} onHome={home} theme={theme} onToggleTheme={toggleTheme} />
  if (view === 'signup') return <Signup onSignup={handleAuthed} onLogin={() => setView('login')} onHome={home} theme={theme} onToggleTheme={toggleTheme} inviteToken={INVITE_TOKEN} />

  return <Dashboard theme={theme} setTheme={setTheme} user={user} onLogout={logout} />
}
