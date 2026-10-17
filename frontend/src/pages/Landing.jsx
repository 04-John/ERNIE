import { useEffect, useRef, useState } from 'react'
import { usePlans, useApiPricing } from '../hooks/useAnalytics'
import { useMedia } from '../lib/useMedia'
import { createSound } from '../lib/landingSound'
import LedgerLanes from '../components/landing/LedgerLanes'
import HowItWorks from '../components/landing/HowItWorks'
import ScoringModel from '../components/landing/ScoringModel'
import './landing.css'

const SECTIONS = ['Hero', 'How it works', 'Scoring', 'Intelligence', 'Developers', 'Security', 'Pricing', 'FAQ']

const SECURITY = [
  ['READ-ONLY', 'Can look, can’t move funds', 'ERNIE only reads addresses, balances and transactions. Nothing is ever written back to Blockradar.'],
  ['FERNET · SHA-256', 'Keys encrypted at rest', 'Blockradar keys are encrypted and only the last 4 characters are ever shown. API keys are stored as hashes and shown once.'],
  ['TENANT ISOLATION', 'Isolated workspaces', 'Every table is keyed by workspace, and a test suite checks reads, writes, keys and deletes across workspaces.'],
  ['HMAC · SSRF GUARD', 'Signed, constrained webhooks', 'Webhooks only go to public HTTPS addresses on port 443, which are re-checked on every send. Redirects are never followed.'],
  ['STRIPE-HOSTED', 'Cards never touch ERNIE', 'Credits are only added by a verified Stripe webhook. Plans change through Stripe or an ERNIE admin, never from a customer’s browser, and every change is logged.'],
  ['OPT-IN AI', 'Ask ERNIE, on your terms', 'The assistant is off by default. When an admin turns it on, it only sees totals and scores, never wallet addresses, keys or emails.'],
]

const FAQ = [
  ['What data does ERNIE read?', 'The addresses and transactions of the Blockradar wallet you connect, plus per-address balances. Nothing else, and nothing is ever written back to Blockradar.'],
  ['How is churn risk calculated?', 'It’s a transparent rule-based score built from four signals: silence against the fintech’s own rhythm (35%), volume trend (25%), dormant wallets (20%) and low activity (20%). Fintechs with no transactions show as Unknown instead of being guessed.'],
  ['Can I try it without connecting Blockradar?', 'Yes. Until you connect a wallet, your workspace shows clearly labelled demo data so you can explore every screen.'],
  ['Which assets are valued in USD?', 'Stablecoins such as USDC, USDT and PYUSD are valued 1:1. Other assets count towards activity but aren’t given a USD value.'],
  ['Is ERNIE affiliated with Blockradar?', 'No. ERNIE is an independent product that connects to Blockradar with read-only access.'],
]

// Shown only if the live price list can't be fetched. The numbers on the real page always come from the server (/billing/plans and /v1/pricing).
const FALLBACK_ENDPOINTS = { health: 2, insights: 2, 'fintechs.list': 5, history: 5, 'fintechs.get': 10 }
const ENDPOINT_ROWS = [['/v1/health', 'health'], ['/v1/insights', 'insights'], ['/v1/fintechs', 'fintechs.list'], ['/v1/history', 'history'], ['/v1/fintechs/{id}', 'fintechs.get']]

const Mark = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="lnlg" x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse"><stop stopColor="#A3FF3C" /><stop offset="1" stopColor="#10D9A0" /></linearGradient></defs>
    <g fill="url(#lnlg)"><rect x="10" y="10" width="44" height="12" rx="6" /><rect x="10" y="26" width="31" height="12" rx="6" /><rect x="10" y="42" width="44" height="12" rx="6" /></g>
  </svg>
)

/** Fades and lifts into view the first time it is scrolled to. `i` staggers siblings by 90 ms. */
function Reveal({ i = 0, className = '', children, ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id) }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.12 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`ln-reveal ${shown ? 'in' : ''} ${className}`} style={{ '--d': `${i * 90}ms` }} {...rest}>{children}</div>
}

const Block = ({ n, name }) => <div className="ln-eyebrow mono"><span />{`BLOCK ${String(n).padStart(2, '0')} · ${name}`}</div>

function PlanCards({ onSignup }) {
  const { data: plans, isError } = usePlans()
  const list = plans || (isError ? [
    { id: 'free', name: 'Free', price_usd: 0, tagline: 'Try ERNIE on one wallet.', limits: { members: 2, alert_channels: 1, ai_messages: 10, history_days: 30 } },
    { id: 'pro', name: 'Pro', price_usd: 49, tagline: 'For teams who watch retention weekly.', limits: { members: 10, alert_channels: 5, ai_messages: 300, history_days: 365 } },
    { id: 'business', name: 'Business', price_usd: 199, tagline: 'For larger teams and heavier use.', limits: { members: 50, alert_channels: 10, ai_messages: 2000, history_days: 800 } },
  ] : null)
  if (!list) return <div className="ln-plans">{[0, 1, 2].map(k => <div key={k} className="skeleton" style={{ height: 380, borderRadius: 18 }} />)}</div>
  return (
    <div className="ln-plans">
      {list.map((p, i) => {
        const featured = p.id === 'pro'
        const L = p.limits
        return (
          <Reveal key={p.id} i={i} className={`ln-plan ${featured ? 'feat' : ''}`}>
            <div className="ln-plan-top"><span className="display">{p.name}</span>{featured && <span className="ln-pop">Most popular</span>}</div>
            <div className="ln-plan-tag">{p.tagline}</div>
            <div className="ln-price"><span className="display">${p.price_usd}</span><span>/ month</span></div>
            <div className="ln-plan-list">
              <span>✓ {L.members} team members</span>
              <span>✓ {L.alert_channels} alert channel{L.alert_channels === 1 ? '' : 's'}</span>
              <span>✓ {L.ai_messages.toLocaleString()} Ask ERNIE messages / mo</span>
              <span>✓ {L.history_days} days of chart history</span>
            </div>
            <button className={`ln-btn ${featured ? 'primary' : ''}`} onClick={onSignup}>{p.price_usd ? `Start with ${p.name}` : 'Start free'}</button>
          </Reveal>
        )
      })}
    </div>
  )
}

export default function Landing({ onLogin, onSignup }) {
  const wide = useMedia('(min-width: 900px)')
  const navWide = useMedia('(min-width: 1120px)')
  const { data: pricing } = useApiPricing()
  const [sound] = useState(createSound)
  const [soundOn, setSoundOn] = useState(false)
  const [eq, setEq] = useState(0)
  const [section, setSection] = useState(0)
  const root = useRef(null)
  const bar = useRef(null)
  const seen = useRef(null)

  useEffect(() => () => sound.close(), [sound])
  useEffect(() => {
    if (!soundOn) return undefined
    const id = setInterval(() => setEq(n => n + 1), 220)
    return () => clearInterval(id)
  }, [soundOn])

  // scroll progress, the current "block" for the rail, and the soft chime when it changes
  useEffect(() => {
    const onScroll = () => {
      const vh = window.innerHeight, max = document.documentElement.scrollHeight - vh
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0})`
      let a = 0
      root.current?.querySelectorAll('[data-sec]').forEach((s, i) => { if (s.getBoundingClientRect().top < vh * 0.5) a = i })
      if (a !== seen.current) {
        const changed = seen.current !== null
        seen.current = a
        setSection(a)
        if (changed) sound.chime(a)
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [sound])

  const toggleSound = () => { const on = sound.toggle(); setSoundOn(on); if (on) sound.chime(section) }
  const eqH = [0, 1, 2].map(i => (soundOn ? `${3 + ((eq * (i + 2) * 7) % 8)}px` : '3px'))
  const costs = pricing?.endpoints || FALLBACK_ENDPOINTS
  const credit = pricing?.credit_usd ?? 0.001
  const packs = pricing?.packs || [{ usd: 10, credits: 10000 }, { usd: 50, credits: 55000 }, { usd: 200, credits: 240000 }]
  const live = pricing?.rate_limits_per_minute?.live ?? 300

  return (
    <div className="ln" data-theme="dark" ref={root}>
      <header className="ln-nav">
        <div className="ln-wrap ln-nav-in">
          <a href="#/" className="ln-brand" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Mark /><span className="display">ERNIE</span></a>
          {navWide && (
            <nav className="ln-links" aria-label="Sections">
              {[['how', 'How it works'], ['scoring', 'Scoring'], ['intelligence', 'Intelligence'], ['developers', 'Developers'], ['security', 'Security'], ['pricing', 'Pricing']].map(([id, label]) => (
                <a key={id} href={`#${id}`} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{label}</a>
              ))}
            </nav>
          )}
          <div className="ln-nav-actions">
            <button className="ln-sound mono" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}>
              <span className="eq">{eqH.map((h, k) => <span key={k} style={{ height: h, background: soundOn ? 'var(--lime)' : 'var(--muted)' }} />)}</span>{soundOn ? 'Sound on' : 'Sound off'}
            </button>
            {navWide && <button className="ln-signin" onClick={onLogin}>Sign in</button>}
            <button className="ln-btn primary sm" onClick={onSignup}>Start free</button>
          </div>
        </div>
        <div className="ln-progress" ref={bar} />
      </header>

      {wide && (
        <div className="ln-rail" aria-hidden="true">
          <div className="ln-rail-line" />
          {SECTIONS.map((s, i) => <span key={s} title={s} className={`ln-sq ${i < section ? 'past' : ''} ${i === section ? 'now' : ''}`} />)}
          <span className="ln-rail-label mono">{`BLOCK 0${section + 1}/08 · ${SECTIONS[section].toUpperCase()}`}</span>
        </div>
      )}

      <main>
        <section id="top" data-sec="0" className="ln-hero">
          <div className="ln-wrap">
            <div className="ln-hero-grid">
              <div style={{ flex: '1 1 560px', minWidth: 0 }}>
                <div className="ln-pill"><i />Retention intelligence for on-chain businesses</div>
                <h1 className="display">Know who&apos;s going quiet, <span>before they churn.</span></h1>
              </div>
              <div style={{ flex: '1 1 340px', minWidth: 0, maxWidth: 440 }}>
                <p className="ln-lede">ERNIE reads your Blockradar wallet and scores every fintech against its own rhythm. Each score comes with its reasons, so you can act while there&apos;s still time.</p>
                <div className="ln-cta"><button className="ln-btn primary lg" onClick={onSignup}>Connect a wallet →</button><button className="ln-btn lg" onClick={onSignup}>Explore the demo</button></div>
              </div>
            </div>
            <div className="ln-canvas-wrap"><LedgerLanes sound={sound} /></div>
            <div className="ln-trust mono">
              <span><b>✓</b>Read-only Blockradar access</span><span><b>✓</b>Keys encrypted at rest</span><span><b>✓</b>Demo data until you connect</span>
              <span style={{ marginLeft: 'auto' }}>Illustrative data · not a real customer</span>
            </div>
          </div>
        </section>

        <section id="how" data-sec="1" className="ln-section" style={{ paddingBottom: 60 }}>
          <div className="ln-wrap">
            <Reveal className="ln-head">
              <Block n={2} name="HOW IT WORKS" />
              <h2 className="display">From a raw transaction to a reason you can act on.</h2>
              <p>There are no pipelines to build and nothing to install. Here&apos;s what happens between connecting a wallet and getting an alert.</p>
            </Reveal>
            <HowItWorks sound={sound} />
          </div>
        </section>

        <section id="scoring" data-sec="2" className="ln-section glow">
          <div className="ln-wrap">
            <Reveal className="ln-head">
              <Block n={3} name="SCORING" />
              <h2 className="display">Try the model. It hides nothing.</h2>
              <p>This is the real scoring logic. Move the inputs and watch each signal add its share of the risk.</p>
            </Reveal>
            <Reveal i={1} style={{ marginTop: 56 }}><ScoringModel sound={sound} /></Reveal>
          </div>
        </section>

        <section id="intelligence" data-sec="3" className="ln-section">
          <div className="ln-wrap">
            <Reveal className="ln-head">
              <Block n={4} name="INTELLIGENCE" />
              <h2 className="display">Beyond the score: where your wallet is heading.</h2>
              <p>A second pass turns raw numbers into prioritised findings, each with a suggested next step. Findings resolve themselves when the condition clears, so they never nag.</p>
            </Reveal>
            <div className="ln-cards4">
              <Reveal i={0} className="ln-icard">
                <div className="t">30-day forecast</div><div className="s mono">Holt-Winters · with range</div>
                <svg viewBox="0 0 260 120" width="100%" height="130">
                  <path d="M170 52 C190 46 210 40 258 26 L258 70 C210 74 190 72 170 64 Z" style={{ fill: 'rgba(163,255,60,.10)' }} />
                  <path className="ln-draw" pathLength="1" d="M2 96 C20 90 30 98 46 86 S74 80 90 82 S118 66 134 70 S158 58 170 58" fill="none" strokeWidth="2.2" strokeLinecap="round" style={{ stroke: 'var(--emerald)' }} />
                  <path d="M170 58 C190 56 210 54 258 46" fill="none" strokeWidth="2" strokeDasharray="4 4" style={{ stroke: 'var(--lime)' }} />
                  <line x1="170" y1="10" x2="170" y2="112" style={{ stroke: 'var(--border-strong)' }} />
                </svg>
                <div className="d">Volume is on track for <b>$4.6M</b> next month, within a $3.9M–$5.2M range.</div>
              </Reveal>
              <Reveal i={1} className="ln-icard">
                <div className="t">Anomaly days</div><div className="s mono">Robust z-score</div>
                <svg viewBox="0 0 260 120" width="100%" height="130">
                  <path d="M4 112V70h8v42zM17 112V64h8v48zM30 112V74h8v38zM43 112V60h8v52zM56 112V68h8v44zM69 112V72h8v40zM82 112V62h8v50zM95 112V66h8v46zM108 112V58h8v54zM134 112V70h8v42zM147 112V64h8v48zM160 112V60h8v52zM173 112V68h8v44zM199 112V62h8v50zM212 112V66h8v46zM225 112V60h8v52zM238 112V64h8v48z" style={{ fill: 'color-mix(in srgb, var(--emerald) 55%, transparent)' }} />
                  <path d="M121 112V18h8v94z" style={{ fill: 'var(--warn)' }} /><path d="M186 112V100h8v12z" style={{ fill: 'var(--danger)' }} />
                </svg>
                <div className="d">Two unusual days this month: a <b style={{ color: 'var(--warn)' }}>3.4σ spike</b> on the 9th and a <b style={{ color: 'var(--danger)' }}>drop</b> on the 21st.</div>
              </Reveal>
              <Reveal i={2} className="ln-icard">
                <div className="t">Cohorts</div><div className="s mono">By wallet creation month</div>
                <div className="ln-cohort mono">
                  <span /><span className="h">activated</span><span className="h">active</span>
                  {[['May', 84, 52, 0.42, 0.26], ['Jun', 79, 58, 0.38, 0.28], ['Jul', 71, 47, 0.32, 0.22], ['Aug', 43, 31, 0.18, 0.12]].map(([m, a, b, x, y]) => (
                    <FragmentRow key={m} m={m} a={a} b={b} x={x} y={y} />
                  ))}
                </div>
                <div className="d">August wallets are activating at <b>half</b> the usual rate.</div>
              </Reveal>
              <Reveal i={3} className="ln-icard">
                <div className="t">Retention health</div><div className="s mono">0–100 · four components</div>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 16 }}>
                  <svg viewBox="0 0 100 100" width="104" height="104" style={{ flex: 'none' }}>
                    <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" style={{ stroke: 'var(--border)' }} />
                    <circle className="ln-draw ring" pathLength="1" cx="50" cy="50" r="42" fill="none" strokeWidth="8" strokeLinecap="round" transform="rotate(-90 50 50)" style={{ stroke: 'var(--emerald)' }} />
                    <text x="50" y="57" textAnchor="middle" style={{ font: '700 22px var(--font-mono)', fill: 'var(--text)' }}>72</text>
                  </svg>
                  <div className="ln-hcomp mono">{[['fintech health', '40%'], ['activation', '25%'], ['momentum', '20%'], ['diversification', '15%']].map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}</div>
                </div>
                <div className="d">Down <b style={{ color: 'var(--warn)' }}>4 points</b> this week, mostly from momentum.</div>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="developers" data-sec="4" className="ln-section">
          <div className="ln-wrap ln-dev">
            <Reveal>
              <Block n={5} name="DEVELOPERS" />
              <h2 className="display ln-h2">Wire retention signals into your own stack.</h2>
              <p className="ln-p">Everything in the dashboard is available over a REST API. You pay per call from prepaid credits, and only successful calls are billed. Test keys return demo data for free.</p>
              <div className="ln-eptable mono">
                <div className="ln-eprow head"><span /><span>ENDPOINT</span><span className="r">CREDITS</span><span className="r">PER CALL</span></div>
                {ENDPOINT_ROWS.map(([path, key]) => (
                  <div key={path} className={`ln-eprow ${key === 'fintechs.get' ? 'hl' : ''}`}><span className="get">GET</span><span>{path}</span><span className="r">{costs[key]}</span><span className="r dim">${(costs[key] * credit).toFixed(3)}</span></div>
                ))}
                <div className="ln-eprow"><span className="get">GET</span><span>/v1/usage</span><span className="r free">free</span><span className="r dim">—</span></div>
              </div>
              <div className="ln-epnote">Top up {packs.map((p, i) => `${i ? (i === packs.length - 1 ? ' or ' : ', ') : ''}$${p.usd} for ${p.credits.toLocaleString()} credits`).join('')}. Credits never expire. Live keys allow {live} calls a minute.</div>
            </Reveal>
            <Reveal i={1} className="ln-term">
              <div className="bar"><i /><i /><i /><span className="mono">terminal</span></div>
              <pre className="mono">
                <span className="dim">$</span> curl $ERNIE_API/v1/fintechs/ft_8f2a \{'\n'}    -H <span className="g">&quot;Authorization: Bearer ernie_live_…&quot;</span>{'\n\n'}
                <span className="dim">HTTP/1.1 200{'\n'}X-Credits-Charged: 10{'\n'}X-Credits-Remaining: 54,990</span>{'\n\n'}
                {'{'}{'\n'}  &quot;id&quot;: <span className="g">&quot;ft_8f2a&quot;</span>,{'\n'}  &quot;name&quot;: <span className="g">&quot;NovaRemit&quot;</span>,{'\n'}  &quot;risk&quot;: <span className="r">&quot;High&quot;</span>,{'\n'}  &quot;risk_probability&quot;: <span className="b">0.7092</span>,{'\n'}  &quot;days_since_last_transaction&quot;: <span className="b">15</span>,{'\n'}  <span className="dim">…</span>{'\n'}  &quot;score_breakdown&quot;: [{'\n'}    {'{ "signal": '}<span className="g">&quot;Silence vs its usual rhythm&quot;</span>{', "contribution": '}<span className="b">0.3092</span>{' },'}{'\n'}    {'{ "signal": '}<span className="g">&quot;Dormant wallets&quot;</span>{', "contribution": '}<span className="b">0.12</span>{' },'}{'\n'}    {'{ "signal": '}<span className="g">&quot;Volume trend&quot;</span>{', "contribution": '}<span className="b">0.18</span>{' },'}{'\n'}    {'{ "signal": '}<span className="g">&quot;Low activity&quot;</span>{', "contribution": '}<span className="b">0.1</span>{' }'}{'\n'}  ]{'\n'}{'}'}
              </pre>
            </Reveal>
          </div>
        </section>

        <section id="security" data-sec="5" className="ln-section">
          <div className="ln-wrap">
            <Reveal className="ln-head">
              <Block n={6} name="SECURITY" />
              <h2 className="display">Your data stays yours.</h2>
              <p>The same few rules apply everywhere. Secrets are encrypted or hashed, never returned and never logged. Every query is scoped to a workspace, and every outbound call is constrained.</p>
            </Reveal>
            <div className="ln-sec-grid">
              {SECURITY.map(([tag, title, text], i) => (
                <Reveal key={tag} i={i % 3} className="ln-sec"><div className="tag mono">{tag}</div><div className="title display">{title}</div><p>{text}</p></Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" data-sec="6" className="ln-section">
          <div className="ln-wrap">
            <Reveal className="ln-head"><Block n={7} name="PRICING" /><h2 className="display">Start free. Upgrade when the team grows.</h2></Reveal>
            <div style={{ marginTop: 56 }}><PlanCards onSignup={onSignup} /></div>
            <div className="ln-epnote" style={{ marginTop: 18 }}>API calls are billed separately from prepaid credits. Limits are enforced on the server.</div>
          </div>
        </section>

        <section id="faq" data-sec="7" className="ln-section" style={{ paddingBottom: 80 }}>
          <div className="ln-wrap ln-faq">
            <Reveal><Block n={8} name="FAQ" /><h2 className="display ln-h2">Questions, answered plainly.</h2></Reveal>
            <Reveal i={1} className="ln-faq-list">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}
            </Reveal>
          </div>
        </section>

        <section style={{ padding: '40px 0 100px' }}>
          <div className="ln-wrap">
            <Reveal className="ln-final">
              <h2 className="display">See who&apos;s going quiet, today.</h2>
              <p>Create a workspace and explore it with demo data, then connect your own wallet when you&apos;re ready.</p>
              <div className="ln-cta" style={{ justifyContent: 'center' }}><button className="ln-btn primary lg" onClick={onSignup}>Get started →</button><button className="ln-btn lg" onClick={onSignup}>Explore the demo</button></div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="ln-footer">
        <div className="ln-wrap ln-footer-in">
          <div style={{ maxWidth: 520 }}>
            <div className="ln-footer-brand"><Mark size={22} /><span>ERNIE</span></div>
            <p>© {new Date().getFullYear()} ERNIE, the Engagement &amp; Retention Network Intelligence Engine. ERNIE is an independent product and is not affiliated with or endorsed by Blockradar.</p>
          </div>
          <nav aria-label="Footer">
            <a href="#how" onClick={e => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }) }}>How it works</a>
            <a href="#security" onClick={e => { e.preventDefault(); document.getElementById('security')?.scrollIntoView({ behavior: 'smooth' }) }}>Security</a>
            <a href="#pricing" onClick={e => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }) }}>Pricing</a>
            <a href="#/terms">Terms</a><a href="#/privacy">Privacy</a><a href="#/status">Status</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

function FragmentRow({ m, a, b, x, y }) {
  return (
    <>
      <span className="m">{m}</span>
      <span style={{ background: `rgba(163,255,60,${x})` }}>{a}%</span>
      <span style={{ background: `rgba(163,255,60,${y})` }}>{b}%</span>
    </>
  )
}
