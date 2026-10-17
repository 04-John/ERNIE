import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LayoutDashboard, BarChart3, Wallet, Code2, Settings, LogOut, Menu, Sun, Moon, Lightbulb, Sparkles, ShieldCheck } from 'lucide-react'
import Logo from '../components/Logo'
import DataStatus from '../components/DataStatus'
import FintechDrawerProvider from '../components/FintechDrawer'
import { isSyncing } from '../lib/sync'
import Notifications from '../components/Notifications'
import { Skeleton, Alert } from '../components/ui'
import { resendVerification } from '../api/client'
import { initials } from '../lib/format'
import { useStatus, useInsights } from '../hooks/useAnalytics'

// Pages load on demand so the first paint stays small (charts are the heavy part)
const Overview   = lazy(() => import('./Overview'))
const Analytics  = lazy(() => import('./Analytics'))
const Insights   = lazy(() => import('./Insights'))
const Assistant  = lazy(() => import('./Assistant'))
const Admin      = lazy(() => import('./Admin'))
const Wallets    = lazy(() => import('./Wallets'))
const Developers = lazy(() => import('./Developers'))
const FintechDetail = lazy(() => import('./FintechDetail'))
const SettingsPage = lazy(() => import('./SettingsPage'))

const NAV = [
  { id: 'overview',   label: 'Overview',   icon: LayoutDashboard },
  { id: 'insights',   label: 'Insights',   icon: Lightbulb },
  { id: 'assistant',  label: 'Ask ERNIE',  icon: Sparkles },
  { id: 'analytics',  label: 'Analytics',  icon: BarChart3 },
  { id: 'wallets',    label: 'Wallets',    icon: Wallet },
  { id: 'developers', label: 'Developers', icon: Code2 },
]
const BOTTOM = [{ id: 'settings', label: 'Settings', icon: Settings }]
const ADMIN = { id: 'admin', label: 'Admin', icon: ShieldCheck }          // shown only to platform admins; the server enforces it
const ALL = [...NAV, ADMIN, ...BOTTOM]

// "#/analytics" -> { id: 'analytics' }   "#/fintech/abc" -> { id: 'fintech', param: 'abc' }
const parseHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0]
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

function NavLink({ item, active, onNavigate, badge }) {
  return (
    <a href={`#/${item.id}`} className="nav-item" aria-current={active ? 'page' : undefined} onClick={onNavigate}>
      <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
      {item.label}
      {badge > 0 && <span className="nav-badge" aria-label={`${badge} need attention`}>{badge}</span>}
    </a>
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
  const { data: insightData } = useInsights()
  const { data: syncStatus } = useStatus()
  const attention = (insightData?.data || []).filter(i => i.severity === 'critical' || i.severity === 'warning').length
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

  const Page = { overview: Overview, insights: Insights, assistant: Assistant, analytics: Analytics, wallets: Wallets, developers: Developers, settings: SettingsPage, fintech: FintechDetail, admin: Admin }[route]

  return (
    <FintechDrawerProvider>
    <div className="shell">
      <div className={`sidebar-backdrop ${drawer ? 'open' : ''}`} onClick={closeDrawer} aria-hidden="true" />
      <aside className={`sidebar ${drawer ? 'open' : ''}`} aria-label="Primary">
        <a href="#/overview" className="side-logo" aria-label="ERNIE overview"><Logo size={34} tagline /></a>

        <div className="sidebar-section">Workspace</div>
        <nav className="nav">
          {NAV.map(item => <NavLink key={item.id} item={item} active={navId === item.id} onNavigate={closeDrawer} badge={item.id === 'insights' ? attention : 0} />)}
        </nav>

        <div className="sidebar-foot">
          <nav className="nav">
            {[...(user?.platform_admin ? [ADMIN] : []), ...BOTTOM].map(item => <NavLink key={item.id} item={item} active={navId === item.id} onNavigate={closeDrawer} />)}
          </nav>
          {user && (
            <div className="side-user">
              <span className="avatar">{initials(user)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="side-user-name">{user.name || user.email}</div>
                <div className="side-user-sub">{[user.workspace || user.company, user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : null].filter(Boolean).join(' · ') || user.email}</div>
              </div>
              <button className="btn btn-icon btn-ghost" style={{ width: 30, height: 30 }} onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
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
            <DataStatus />
            <button className="btn btn-icon" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Notifications />
          </div>
        </header>
        <div className="topbar-progress" aria-hidden="true">{isSyncing(syncStatus) && <i />}</div>

        <main className="content" id="main">
          <VerifyBanner user={user} />
          <Suspense fallback={<div className="stack"><Skeleton height={60} /><Skeleton height={140} /><Skeleton height={320} /></div>}>
            <Page user={user} theme={theme} setTheme={setTheme} onLogout={onLogout} param={param} />
          </Suspense>
        </main>
      </div>
    </div>
    </FintechDrawerProvider>
  )
}
