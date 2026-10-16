import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LayoutDashboard, BarChart3, Wallet, Code2, Settings, LogOut, Menu, Sun, Moon, ChevronDown } from 'lucide-react'
import Logo from '../components/Logo'
import DataStatus from '../components/DataStatus'
import Notifications from '../components/Notifications'
import { Skeleton, Alert } from '../components/ui'
import { resendVerification } from '../api/client'
import { initials } from '../lib/format'
import { useStatus } from '../hooks/useAnalytics'

// Pages load on demand so the first paint stays small (charts are the heavy part)
const Overview   = lazy(() => import('./Overview'))
const Analytics  = lazy(() => import('./Analytics'))
const Wallets    = lazy(() => import('./Wallets'))
const Developers = lazy(() => import('./Developers'))
const FintechDetail = lazy(() => import('./FintechDetail'))
const SettingsPage = lazy(() => import('./SettingsPage'))

const NAV = [
  { id: 'overview',   label: 'Overview',   icon: LayoutDashboard },
  { id: 'analytics',  label: 'Analytics',  icon: BarChart3 },
  { id: 'wallets',    label: 'Wallets',    icon: Wallet },
  { id: 'developers', label: 'Developers', icon: Code2 },
]
const BOTTOM = [{ id: 'settings', label: 'Settings', icon: Settings }]
const ALL = [...NAV, ...BOTTOM]

// "#/analytics" -> { id: 'analytics' }   "#/fintech/abc" -> { id: 'fintech', param: 'abc' }
const parseHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const fin = hash.match(/^fintech\/(.+)$/)
  if (fin) return { id: 'fintech', param: decodeURIComponent(fin[1]) }
  return { id: ALL.some(n => n.id === hash) ? hash : 'overview', param: null }
}

function useRoute() {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const onChange = () => { setRoute(parseHash()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

// Shown only when the server can send email and this account's address isn't confirmed yet
function VerifyBanner({ user }) {
  const [state, setState] = useState('idle')   // idle | sending | sent | error
  if (!user?.email_enabled || user.is_verified !== false) return null
  const resend = async () => {
    setState('sending')
    try { await resendVerification(); setState('sent') } catch { setState('error') }
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <Alert tone="warn">
        <strong>Confirm your email address.</strong> We sent a link to {user.email}.{' '}
        {state === 'sent' ? 'A new link is on its way.'
          : state === 'error' ? 'Could not resend right now. Try again later.'
          : <button className="link" onClick={resend} disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Resend the email'}</button>}
      </Alert>
    </div>
  )
}

function NavLink({ item, active, onNavigate }) {
  return (
    <a href={`#/${item.id}`} className="nav-item" aria-current={active ? 'page' : undefined} onClick={onNavigate}>
      <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
      {item.label}
    </a>
  )
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="popover-anchor" ref={ref}>
      <button className="btn" style={{ padding: '0 8px 0 4px', gap: 8, height: 38 }} onClick={() => setOpen(o => !o)}
        aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
        <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(user)}</span>
        <ChevronDown size={14} className="hide-sm" />
      </button>
      {open && (
        <div className="popover" role="menu" style={{ width: 260 }}>
          <div className="popover-head" style={{ display: 'block' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{user?.name || 'Your account'}</div>
            <div className="hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
          <a href="#/settings" className="menu-item" role="menuitem" onClick={() => setOpen(false)}><Settings size={16} /> Settings</a>
          <button className="menu-item" role="menuitem" onClick={onLogout}><LogOut size={16} /> Sign out</button>
        </div>
      )}
    </div>
  )
}

// When a background sync finishes, reload every view so it shows the freshly synced data
function useSyncWatcher() {
  const { data } = useStatus()
  const qc = useQueryClient()
  const wasRefreshing = useRef(false)
  const refreshing = Boolean(data?.refreshing)
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) qc.invalidateQueries()
    wasRefreshing.current = refreshing
  }, [refreshing, qc])
}

export default function Dashboard({ theme, setTheme, user, onLogout }) {
  useSyncWatcher()
  const { id: route, param } = useRoute()
  const [drawer, setDrawer] = useState(false)
  const navId = route === 'fintech' ? 'analytics' : route          // a fintech page lives under Analytics
  const current = ALL.find(n => n.id === navId)

  const closeDrawer = () => setDrawer(false)
  useEffect(() => {
    if (!drawer) return
    const onKey = e => { if (e.key === 'Escape') setDrawer(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  const Page = { overview: Overview, analytics: Analytics, wallets: Wallets, developers: Developers, settings: SettingsPage, fintech: FintechDetail }[route]

  return (
    <div className="shell">
      <div className={`sidebar-backdrop ${drawer ? 'open' : ''}`} onClick={closeDrawer} aria-hidden="true" />
      <aside className={`sidebar ${drawer ? 'open' : ''}`} aria-label="Primary">
        <div style={{ padding: '4px 8px 8px' }}><Logo size={36} tagline /></div>

        <div className="sidebar-section">Workspace</div>
        <nav className="nav">
          {NAV.map(item => <NavLink key={item.id} item={item} active={navId === item.id} onNavigate={closeDrawer} />)}
        </nav>

        <div className="sidebar-foot">
          <nav className="nav">
            {BOTTOM.map(item => <NavLink key={item.id} item={item} active={navId === item.id} onNavigate={closeDrawer} />)}
            <button className="nav-item btn-danger" style={{ width: '100%', textAlign: 'left' }} onClick={onLogout}>
              <LogOut size={18} strokeWidth={1.8} /> Sign out
            </button>
          </nav>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 8px 0' }}>
              <span className="avatar">{initials(user)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.email}</div>
                <div className="hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.workspace || user.company || user.email}</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="btn btn-icon menu-btn" onClick={() => setDrawer(true)} aria-label="Open navigation"><Menu size={18} /></button>
            <div className="crumbs hide-sm"><span>ERNIE</span><span>/</span>{route === 'fintech' ? <><a href="#/analytics">Analytics</a><span>/</span><strong>Fintech</strong></> : <strong>{current?.label}</strong>}</div>
            <strong className="menu-btn" style={{ fontSize: 15 }}>{current?.label}</strong>
          </div>
          <div className="topbar-right">
            <DataStatus compact />
            <button className="btn btn-icon" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Notifications />
            <UserMenu user={user} onLogout={onLogout} />
          </div>
        </header>

        <main className="content" id="main">
          <VerifyBanner user={user} />
          <Suspense fallback={<div className="stack"><Skeleton height={60} /><Skeleton height={140} /><Skeleton height={320} /></div>}>
            <Page user={user} theme={theme} setTheme={setTheme} onLogout={onLogout} param={param} />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
