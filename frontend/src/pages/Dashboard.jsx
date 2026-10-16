import { useState } from 'react'
import Analytics from './Analytics'
import Wallets from './Wallets'
import {
  Home, Wallet, BarChart3, Link2, Layers, Shield,
  RotateCcw, Code2, ScrollText, Settings, BookOpen,
  LogOut, Bell, Sun, Moon, TrendingUp, AlertTriangle,
  PauseCircle, DollarSign, ChevronRight
} from 'lucide-react'
import KPICard from '../components/KPICard'
import VolumeChart from '../components/VolumeChart'
import RegionalMap from '../components/RegionalMap'
import WalletActivity from '../components/WalletActivity'
import ChurnTable from '../components/ChurnTable'
import { BASE_URL } from '../api/client'
import { useSummary, useDistribution, useTypeBreakdown, useStatus, useRefresh } from '../hooks/useAnalytics'

// ── Sidebar Nav Item
function NavItem({ item, active, setActive }) {
  const isActive = active === item.id
  return (
    <button onClick={() => setActive(item.id)} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      width: '100%', padding: '9px 12px',
      borderRadius: 8, border: 'none',
      background: isActive ? 'var(--bg-card-hover)' : 'transparent',
      color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
      fontSize: 13, fontWeight: isActive ? 600 : 400,
      cursor: 'pointer', transition: 'all .15s', textAlign: 'left',
    }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-secondary)' }}}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}}
    >
      <span style={{ color: isActive ? 'var(--green)' : 'inherit', display: 'flex', flexShrink: 0 }}>
        <item.icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
      </span>
      {item.label}
      {item.badge && (
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 700,
          background: 'var(--red)', color: '#fff',
          padding: '1px 6px', borderRadius: 10,
        }}>{item.badge}</span>
      )}
    </button>
  )
}

// ── Sidebar
function Sidebar({ active, setActive, onLogout, user }) {
  const nav = [
    { id: 'home',       label: 'Home',        icon: Home },
    { id: 'analytics',  label: 'Analytics',   icon: BarChart3 },
    { id: 'wallets',    label: 'Wallets',     icon: Wallet },
    { id: 'developers', label: 'Developers',  icon: Code2 },
  ]
  const bottom = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'docs',     label: 'Docs',     icon: BookOpen },
  ]

  return (
    <aside style={{
      width: 'var(--sidebar-width)', flexShrink: 0,
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      height: '100vh', position: 'sticky', top: 0,
      display: 'flex', flexDirection: 'column',
      padding: '0 8px', overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ padding: '16px 6px 14px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Layers size={15} color="#000" strokeWidth={2.5} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.03em' }}>Blockradar</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, paddingLeft: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Intelligence
        </div>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 6 }}>
        {nav.map(item => <NavItem key={item.id} item={item} active={active} setActive={setActive} />)}
      </nav>

      {/* Bottom nav */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {bottom.map(item => <NavItem key={item.id} item={item} active={active} setActive={setActive} />)}
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to log out?')) {
              onLogout()
            }
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '9px 12px', borderRadius: 8,
            border: 'none', background: 'transparent',
            color: 'var(--text-muted)', fontSize: 13,
            cursor: 'pointer', transition: 'all .15s', textAlign: 'left',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-dim)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut size={15} strokeWidth={1.8} />
          Log out
        </button>
      </div>

      {/* Plan badge */}
      <div style={{
        margin: '0 0 10px', padding: 12,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10, fontSize: 11,
      }}>

      {/* User info */}
      {user && (
        <div style={{ padding: '10px 12px', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, truncate: true }}>{user.name || user.email}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
        </div>
      )}

        <div style={{ fontWeight: 700, marginBottom: 2 }}>Free Plan</div>
        <div style={{ color: 'var(--text-muted)', marginBottom: 8, fontSize: 10 }}>0 of 100 Addresses · $0 of $50k</div>
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 10 }}>
          <div style={{ height: '100%', width: '1%', background: 'var(--green)', borderRadius: 2 }} />
        </div>
        <button style={{
          width: '100%', padding: '7px',
          background: 'var(--green)', border: 'none',
          borderRadius: 6, fontWeight: 700, fontSize: 12,
          color: '#000', cursor: 'pointer', letterSpacing: '.01em',
          transition: 'opacity .15s',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Upgrade Plan
        </button>
      </div>
    </aside>
  )
}

// ── Top bar
function TopBar({ theme, setTheme, activeSection, notifOpen, setNotifOpen, setNotifPanelOpen }) {
  const labels = {
    home:'Home', analytics:'Analytics', wallets:'Wallets',
    payment:'Payment Links', gateway:'Gateway', aml:'AML Lookup',
    recovery:'Asset Recovery', developers:'Developers',
    logs:'Audit Logs', settings:'Settings', docs:'Docs',
  }
  return (
    <header style={{
      height: 54, borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 24px',
      background: 'var(--bg-sidebar)',
      position: 'sticky', top: 0, zIndex: 50,
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <span style={{ color: 'var(--text-muted)' }}>My Wallets</span>
        <ChevronRight size={13} color="var(--text-muted)" />
        <span style={{ fontWeight: 600 }}>{labels[activeSection] || 'Dashboard'}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Live badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 600,
          padding: '4px 10px', borderRadius: 20,
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' }} />
          Live Mode
        </div>

        {/* Last refreshed */}
        <div style={{
          fontSize: 11, color: 'var(--text-muted)',
          padding: '4px 10px', borderRadius: 20,
          border: '1px solid var(--border)',
        }}>
          Auto-refresh: 6h
        </div>

        {/* Theme toggle */}
        <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={{
          width: 34, height: 34, borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .15s', cursor: 'pointer',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Bell */}
        {/* Notifications */}
        <div style={{ position: 'relative' }}>
            <button
            onClick={() => setNotifOpen(o => !o)}
            style={{
                width: 34, height: 34, borderRadius: 8,
                border: `1px solid ${notifOpen ? 'var(--green)' : 'var(--border)'}`,
                background: notifOpen ? 'var(--green-dim)' : 'var(--bg-card)',
                color: notifOpen ? 'var(--green)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all .15s', position: 'relative',
            }}
            >
            <Bell size={14} />
            {/* Badge */}
            <div style={{
                position: 'absolute', top: 6, right: 6,
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--red)',
            }} />
            </button>

            {/* Notification panel */}
            {notifOpen && (
            <div style={{
                position: 'absolute', top: 42, right: 0,
                width: 320, background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 12,
                boxShadow: 'var(--shadow)', zIndex: 200,
                animation: 'fadeUp .2s ease both',
            }}>
                <div style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Notifications</span>
                <span style={{ fontSize: 10, color: 'var(--green)', cursor: 'pointer', fontWeight: 600 }}>Mark all read</span>
                </div>
                {[
                { title: 'High churn risk detected',   desc: 'FlowPay has reached 100% churn score',         time: '2m ago',  color: 'var(--red)',   dot: true },
                { title: 'Dormancy rate increased',     desc: 'Platform dormancy crossed 92% threshold',      time: '1h ago',  color: 'var(--amber)', dot: true },
                { title: 'Pipeline completed',          desc: 'Data simulation refreshed successfully',       time: '6h ago',  color: 'var(--green)', dot: false },
                { title: 'New fintech onboarded',       desc: 'SwiftChain joined via API integration',        time: '1d ago',  color: 'var(--blue)',  dot: false },
                { title: 'Volume milestone reached',    desc: 'Total transaction volume crossed $25M',        time: '2d ago',  color: 'var(--green)', dot: false },
                ].map((n, i) => (
                <div key={i} style={{
                    padding: '12px 16px',
                    borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    transition: 'background .15s', cursor: 'pointer',
                }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: n.dot ? n.color : 'var(--border)',
                    flexShrink: 0, marginTop: 5,
                    }} />
                    <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{n.desc}</div>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginTop: 2 }}>{n.time}</span>
                </div>
                ))}
                <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                  <span
                    onClick={() => { setNotifOpen(false); setNotifPanelOpen(true) }}
                    style={{ fontSize: 12, color: 'var(--green)', cursor: 'pointer', fontWeight: 600 }}
                  >
                     View all notifications →
                  </span>
                </div>
            </div>
            )}
        </div>
      </div>
    </header>
  )
}

// ── Donut chart
function ChurnDonut({ distribution }) {
  const high = distribution?.High || 0
  const medium = distribution?.Medium || 0
  const low = distribution?.Low || 0
  const total = high + medium + low || 1
  const R = 52, SW = 12, CX = 68, CY = 68
  const C = 2 * Math.PI * R
  const segs = [
    { label: 'High Risk',   value: high,   color: 'var(--red)' },
    { label: 'Medium Risk', value: medium, color: 'var(--amber)' },
    { label: 'Low Risk',    value: low,    color: 'var(--green)' },
  ]
  let off = 0
  const arcs = segs.map(s => {
    const dash = (s.value / total) * C
    const arc = { ...s, dash, off }
    off += dash
    return arc
  })

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Churn Risk</span>
        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{total} fintechs</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width={136} height={136} viewBox="0 0 136 136">
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={SW} />
            {arcs.map(a => (
              <circle key={a.label} cx={CX} cy={CY} r={R}
                fill="none" stroke={a.color} strokeWidth={SW}
                strokeDasharray={`${a.dash} ${C - a.dash}`}
                strokeDashoffset={C / 4 - a.off}
                style={{ transition: 'stroke-dasharray .6s ease' }}
              />
            ))}
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>{total}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Total</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          {segs.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Type bars
function TypeBars() {
  const { data = [] } = useTypeBreakdown()
  const max = Math.max(...data.map(d => d.avg_volume_k || 0), 1)
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Volume by Type</span>
        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>USD (k)</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[...data].sort((a, b) => b.avg_volume_k - a.avg_volume_k).map(d => (
          <div key={d.type}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{d.type}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ${d.avg_volume_k}k
                {d.high_risk > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>· {d.high_risk} high risk</span>}
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(d.avg_volume_k / max) * 100}%`, background: 'var(--green)', borderRadius: 3, transition: 'width .8s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Coming soon placeholder
function ComingSoon({ label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '60vh', gap: 16,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--green)',
      }}>
        <TrendingUp size={28} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
        This section connects to the live Blockradar API.<br />
        Add your API key to unlock real data.
      </div>
      <button style={{
        marginTop: 8, padding: '10px 24px',
        background: 'var(--green)', border: 'none',
        borderRadius: 8, fontWeight: 700, fontSize: 13,
        color: '#000', cursor: 'pointer', letterSpacing: '.01em',
        transition: 'opacity .15s',
      }}>
        Connect API Key
      </button>
    </div>
  )
}

// ── Data source badge, last-updated time and manual refresh
function DataStatus() {
  const { data: status } = useStatus()
  const refresh = useRefresh()

  const source = status?.data_source
  const label = {
    real: 'Live · Blockradar API',
    simulated: 'Demo data (simulated)',
    'simulated-fallback': 'Blockradar unreachable · showing demo data',
  }[source] || 'Loading…'
  const isLive = source === 'real'
  const warn = source === 'simulated-fallback'

  const updated = status?.last_refreshed ? new Date(status.last_refreshed).toLocaleString() : '—'
  const err = refresh.error?.response?.data?.detail || (refresh.isError ? 'Refresh failed' : null)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em',
        padding: '4px 12px', borderRadius: 20,
        color: isLive ? '#000' : warn ? 'var(--red)' : 'var(--amber)',
        background: isLive ? 'var(--green)' : 'transparent',
        border: isLive ? 'none' : `1px solid ${warn ? 'var(--red)' : 'var(--amber)'}`,
      }}>{label}</span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)' }}>
        Updated {updated}{status?.refresh_interval_hours ? ` · auto every ${status.refresh_interval_hours}h` : ''}
      </span>
      <button
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending || status?.refreshing}
        style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
          padding: '4px 12px', borderRadius: 20, cursor: refresh.isPending ? 'wait' : 'pointer',
          background: 'transparent', color: 'var(--green)', border: '1px solid var(--green)',
        }}
      >
        {refresh.isPending || status?.refreshing ? 'Refreshing…' : 'Refresh now'}
      </button>
      {err && <span style={{ fontSize: 11, color: 'var(--red)' }}>{err}</span>}
      {warn && status?.last_error && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }} title={status.last_error}>Reason: {status.last_error.slice(0, 80)}</span>
      )}
    </div>
  )
}

// ── Main content
function MainContent({ active }) {
  const { data: summary = {} }      = useSummary()
  const { data: distribution = {} } = useDistribution()

  const fmt  = n => n == null ? '—' : Number(n).toLocaleString()
  const fmtM = n => n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const fmtP = n => n == null ? '—' : `${(n * 100).toFixed(1)}%`

  // Dedicated pages
  if (active === 'analytics') return <Analytics />
  if (active === 'wallets')   return <Wallets />

  // Developers page
  if (active === 'developers') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeUp .4s ease both' }}>
      <div>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#000', padding: '4px 12px', borderRadius: 20, background: 'var(--green)', display: 'inline-block', marginBottom: 12 }}>API Access</span>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 8 }}>Developer<br />Integration</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 480 }}>Connect your application to Blockradar Intelligence using the REST API.</p>
      </div>
      {[
        { method: 'GET', path: '/analytics/summary',       desc: 'Top-level KPIs — volume, wallets, churn counts' },
        { method: 'GET', path: '/analytics/monthly-volume',desc: 'Monthly transaction volume by region' },
        { method: 'GET', path: '/analytics/regional',      desc: 'Per-region wallet and risk aggregates' },
        { method: 'GET', path: '/churn/scores',            desc: 'Churn probability scores for all fintechs' },
        { method: 'GET', path: '/churn/high-risk',         desc: 'Fintechs with High churn risk only' },
        { method: 'GET', path: '/churn/distribution',      desc: 'Risk tier counts (High/Medium/Low)' },
        { method: 'GET', path: '/wallets/dormancy',        desc: 'Dormancy stats overall and by region' },
        { method: 'GET', path: '/wallets/activity',        desc: 'Raw wallet activity data' },
      ].map(e => (
        <div key={e.path} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, transition: 'border-color .15s' }}
          onMouseEnter={el => el.currentTarget.style.borderColor = 'var(--green)'}
          onMouseLeave={el => el.currentTarget.style.borderColor = 'var(--border)'}
        >
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'var(--green-dim)', color: 'var(--green)', fontFamily: 'monospace', flexShrink: 0 }}>{e.method}</span>
          <code style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, fontFamily: 'monospace' }}>{e.path}</code>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.desc}</span>
        </div>
      ))}
    </div>
  )

  // Settings page
  if (active === 'settings') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeUp .4s ease both', maxWidth: 600 }}>
      <div>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#000', padding: '4px 12px', borderRadius: 20, background: 'var(--green)', display: 'inline-block', marginBottom: 12 }}>Configuration</span>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 8 }}>Settings</h1>
      </div>
      {[
        { label: 'API Base URL',     value: BASE_URL,    tag: 'Backend' },
        { label: 'Data Mode',        value: 'Simulated',                tag: 'Pipeline' },
        { label: 'Database',         value: 'blockradar-intelligence',  tag: 'PostgreSQL' },
        { label: 'Pipeline Schedule',value: 'Every 6 hours',            tag: 'Cron' },
      ].map(s => (
        <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{s.value}</div>
          </div>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'var(--green-dim)', color: 'var(--green)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.tag}</span>
        </div>
      ))}
    </div>
  )

  // Docs page
  if (active === 'docs') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'fadeUp .4s ease both' }}>
      <div>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#000', padding: '4px 12px', borderRadius: 20, background: 'var(--green)', display: 'inline-block', marginBottom: 12 }}>
          Documentation
        </span>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 8 }}>
          API Reference &<br />Integration Guide
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 520 }}>
          Everything you need to integrate Blockradar Intelligence into your fintech stack.
        </p>
      </div>

      {/* Quick start */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 16, color: 'var(--green)' }}>Quick Start</div>
        <pre style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '16px 20px',
          fontSize: 12, color: 'var(--text-secondary)',
          fontFamily: 'monospace', overflowX: 'auto', lineHeight: 1.8,
        }}>{`# 1. Clone the repo
git clone <your-repo-url>

# 2. Configure environment
cp .env.example .env
# Add your BLOCKRADAR_API_KEY and BLOCKRADAR_WALLET_ID

# 3. Start the backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# 4. Start the frontend  
cd frontend && npm install && npm run dev

# 5. Open http://localhost:5173`}</pre>
      </div>

      {/* Base URL */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 16 }}>Base URL</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 16px',
        }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--green-dim)', color: 'var(--green)', fontFamily: 'monospace', fontWeight: 700 }}>BASE</span>
          <code style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{BASE_URL}</code>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>All endpoints are prefixed with this URL</span>
        </div>
      </div>

      {/* Endpoints by section */}
      {[
        {
          section: 'Analytics',
          color: 'var(--blue)',
          endpoints: [
            { method: 'GET', path: '/analytics/summary',        desc: 'Top-level KPIs', params: 'None', returns: 'total_wallets, total_volume_usd, dormancy_rate, high_risk_fintechs' },
            { method: 'GET', path: '/analytics/monthly-volume', desc: 'Monthly tx volume by region', params: 'None', returns: 'month, region, volume, tx_count' },
            { method: 'GET', path: '/analytics/regional',       desc: 'Per-region aggregates', params: 'None', returns: 'region, fintechs, total_wallets, activation_rate, avg_churn_prob' },
            { method: 'GET', path: '/analytics/type-breakdown', desc: 'Volume by fintech type', params: 'None', returns: 'type, count, avg_volume_k, high_risk' },
          ]
        },
        {
          section: 'Churn',
          color: 'var(--red)',
          endpoints: [
            { method: 'GET', path: '/churn/scores',       desc: 'All fintech churn scores', params: 'limit, risk, region', returns: 'fintech_id, churn_probability, churn_risk, total_volume' },
            { method: 'GET', path: '/churn/high-risk',    desc: 'High risk fintechs only', params: 'None', returns: 'count, data[]' },
            { method: 'GET', path: '/churn/distribution', desc: 'Risk tier counts', params: 'None', returns: 'High, Medium, Low counts' },
          ]
        },
        {
          section: 'Wallets',
          color: 'var(--green)',
          endpoints: [
            { method: 'GET', path: '/wallets/dormancy', desc: 'Dormancy stats', params: 'region (optional)', returns: 'overall stats + by_region breakdown' },
            { method: 'GET', path: '/wallets/activity', desc: 'Raw wallet activity', params: 'fintech_id, limit', returns: 'wallet list with last_active, balance, tx count' },
          ]
        },
      ].map(group => (
        <div key={group.section} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 16, color: group.color }}>{group.section} Endpoints</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.endpoints.map(ep => (
              <div key={ep.path} style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '14px 16px',
                transition: 'border-color .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = group.color}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--green-dim)', color: 'var(--green)', fontFamily: 'monospace' }}>{ep.method}</span>
                  <code style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>{ep.path}</code>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>— {ep.desc}</span>
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span><strong style={{ color: 'var(--text-secondary)' }}>Params:</strong> {ep.params}</span>
                  <span><strong style={{ color: 'var(--text-secondary)' }}>Returns:</strong> {ep.returns}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Auth note */}
      <div style={{
        padding: '16px 20px', background: 'var(--amber-dim)',
        border: '1px solid #f59e0b30', borderRadius: 10,
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7,
      }}>
        <strong style={{ color: 'var(--amber)' }}>Authentication:</strong> All endpoints require an <code style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>Authorization: Bearer &lt;token&gt;</code> header (obtained from <code style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>POST /auth/login</code>). The backend reads <code style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>BLOCKRADAR_API_KEY</code> from its environment to call Blockradar; it is never exposed to the browser.
      </div>
    </div>
  )

  // Home page (default)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ animation: 'fadeUp .4s ease both' }}>
        <div style={{ marginBottom: 12 }}><DataStatus /></div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 8, textTransform: 'uppercase' }}>
          Wallet Analytics &<br />Retention Insights
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 480, lineHeight: 1.6 }}>
          Real-time churn prediction, wallet dormancy tracking, and transaction volume trends across Blockradar's fintech network.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, animation: 'fadeUp .4s ease .08s both' }}>
        <KPICard label="Transaction Volume" value={fmtM(summary.total_volume_usd)} sub="Successful only"       accent="green" icon={DollarSign} />
        <KPICard label="Total Wallets"      value={fmt(summary.total_wallets)}      sub={`${fmt(summary.total_fintechs)} fintechs`} accent="blue"  icon={Wallet} />
        <KPICard label="Dormancy Rate"      value={fmtP(summary.dormancy_rate)}     sub={summary.never_active_wallets ? `Inactive 60+ days · ${summary.never_active_wallets} never active` : 'Inactive 60+ days'}   accent="amber" icon={PauseCircle} />
        <KPICard label="High Churn Risk"    value={summary.high_risk_fintechs ?? '—'} sub="Need attention"    accent="red"   icon={AlertTriangle} />
      </div>

      <div style={{ animation: 'fadeUp .4s ease .12s both' }}><VolumeChart /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, animation: 'fadeUp .4s ease .16s both' }}>
        <ChurnDonut distribution={distribution} />
        <TypeBars />
      </div>
      <div style={{ animation: 'fadeUp .4s ease .2s both' }}><RegionalMap /></div>
    </div>
  )
}

// ── Root
export default function Dashboard({ theme, setTheme, onLogout, user }) {
  const [active, setActive] = useState('home')
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <Sidebar active={active} setActive={setActive} onLogout={onLogout} user={user} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar theme={theme} setTheme={setTheme} activeSection={active} notifOpen={notifOpen} setNotifOpen={setNotifOpen} setNotifPanelOpen={setNotifPanelOpen} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 60px' }}>
          <MainContent active={active} />
        </main>
      </div>
      {/* ── Notifications side panel */}
      {notifPanelOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setNotifPanelOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
          />
          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0,
            width: 400, height: '100vh',
            background: 'var(--bg-card)',
            borderLeft: '1px solid var(--border)',
            zIndex: 201, display: 'flex', flexDirection: 'column',
            animation: 'slideIn .25s ease both',
          }}>
            <style>{`@keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }`}</style>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Notifications</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>5 total · 2 unread</div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--green)', cursor: 'pointer', fontWeight: 600 }}>Mark all read</span>
                <button
                  onClick={() => setNotifPanelOpen(false)}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {[
                { title: 'High churn risk detected',  desc: 'FlowPay has reached 100% churn score. Immediate action recommended to prevent customer loss.', time: '2 minutes ago',  color: 'var(--red)',   unread: true,  icon: '⚠' },
                { title: 'Dormancy rate increased',    desc: 'Platform dormancy crossed 92% threshold. Consider launching a re-engagement campaign.', time: '1 hour ago',    color: 'var(--amber)', unread: true,  icon: '⏸' },
                { title: 'Pipeline completed',         desc: 'Data simulation pipeline refreshed successfully. All analytics are up to date.', time: '6 hours ago',   color: 'var(--green)', unread: false, icon: '✓' },
                { title: 'New fintech onboarded',      desc: 'SwiftChain joined via API integration. Their first wallet was created 3 minutes after onboarding.', time: '1 day ago',     color: 'var(--blue)',  unread: false, icon: '◈' },
                { title: 'Volume milestone reached',   desc: 'Total transaction volume crossed $25M. This is a 38% increase compared to the prior period.', time: '2 days ago',    color: 'var(--green)', unread: false, icon: '$' },
              ].map((n, i) => (
                <div key={i} style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid var(--border)',
                  background: n.unread ? 'rgba(141,255,28,0.03)' : 'transparent',
                  transition: 'background .15s', cursor: 'pointer',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.unread ? 'rgba(141,255,28,0.03)' : 'transparent'}
                >
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: `${n.color}18`,
                      border: `1px solid ${n.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, color: n.color,
                    }}>
                      {n.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: n.unread ? 700 : 600 }}>{n.title}</span>
                        {n.unread && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0, marginTop: 4 }} />}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 6 }}>{n.desc}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{n.time}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
              <button style={{
                width: '100%', padding: '10px',
                background: 'var(--green)', border: 'none',
                borderRadius: 8, fontWeight: 700, fontSize: 13,
                color: '#000', cursor: 'pointer',
              }}>
                Configure Notification Preferences
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Forgot password modal */}
      {forgotOpen && (
        <>
          <div onClick={() => setForgotOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 400, background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 16, padding: 32, zIndex: 301,
            animation: 'fadeUp .2s ease both',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Reset Password</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
              Enter your email and we'll send you a reset link.
            </p>
            <input
              type="email"
              placeholder="you@company.com"
              style={{
                width: '100%', padding: '12px 14px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'var(--font)',
                outline: 'none', marginBottom: 16,
              }}
              onFocus={e => e.target.style.borderColor = 'var(--green)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setForgotOpen(false)}
                style={{ flex: 1, padding: '11px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { alert('Reset link sent! Check your email.'); setForgotOpen(false) }}
                style={{ flex: 1, padding: '11px', background: 'var(--green)', border: 'none', borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Send Reset Link
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}