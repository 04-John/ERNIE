import {
  Radar, Activity, Globe2, RefreshCw, Users, Code2, ShieldCheck, KeyRound, Lock, Eye,
  ArrowRight, Check, Sun, Moon,
} from 'lucide-react'
import Logo from '../components/Logo'
import Pricing from '../components/Pricing'
import './landing.css'

const FEATURES = [
  { icon: Radar,     title: 'Churn risk scoring',   text: 'Every fintech gets a probability and a High / Medium / Low tier, built from recency, dormancy, volume trend and activity. Fintechs with no history are marked "Unknown", never guessed.' },
  { icon: Activity,  title: 'Dormancy tracking',    text: 'See which wallets stopped transacting and how long ago. Brand-new addresses are tracked separately as "never active", so a fresh account never reads as churn.' },
  { icon: Globe2,    title: 'Volume & regions',     text: 'Monthly volume by region and fintech type, plus per-region activation, so you can see where engagement is growing and where it is fading.' },
  { icon: RefreshCw, title: 'Stays in sync',        text: 'Connected wallets refresh automatically every few hours, or on demand with one click. If a sync fails you keep your last good data and see exactly why.' },
  { icon: Users,     title: 'Built for teams',      text: 'Invite teammates with single-use links. Admins manage the connection and the team; members get read access to the same analytics.' },
  { icon: Code2,     title: 'Developer API',        text: 'Everything in the dashboard is available over a documented REST API, so retention signals can feed your own tools and alerts.' },
]

const STEPS = [
  { title: 'Connect your wallet',   text: 'Paste your Blockradar wallet ID and API key. ERNIE verifies them and stores the key encrypted.' },
  { title: 'ERNIE reads the activity', text: 'Each address is treated as a fintech. Transactions and balances are pulled and scored automatically.' },
  { title: 'Act before they leave', text: 'Spot the fintechs going quiet, see how long they have been inactive, and reach out while it still matters.' },
]

const SECURITY = [
  { icon: KeyRound,    title: 'Keys encrypted at rest',   text: 'Your Blockradar API key is encrypted before it touches the database and is never sent back to your browser or written to logs.' },
  { icon: Lock,        title: 'Isolated workspaces',      text: 'Every workspace sees only its own data. Isolation is enforced on the server for every request and covered by automated tests.' },
  { icon: Eye,         title: 'Read-only by design',      text: 'ERNIE only ever reads wallet, address and transaction data. It never moves funds or changes anything in your Blockradar account.' },
  { icon: ShieldCheck, title: 'Hardened sign-in',         text: 'Rate-limited login, verified Google sign-in, expiring sessions, and role-based access for every workspace.' },
]

const FAQ = [
  ['What data does ERNIE read?', 'The addresses and transactions of the Blockradar wallet you connect, plus per-address balances. Nothing else, and nothing is ever written back to Blockradar.'],
  ['How is churn risk calculated?', 'A transparent, rule-based score combining how recently a fintech transacted, its dormancy rate, its transaction count and volume trend, and its total volume. Fintechs without transaction history are shown as "Unknown" instead of being scored.'],
  ['Can I try it without connecting Blockradar?', 'Yes. Until you connect a wallet, your workspace shows clearly labelled demo data so you can explore every screen.'],
  ['Which assets are valued in USD?', 'Stablecoins such as USDC and USDT are valued 1:1. Other assets are counted in activity but not given a USD value.'],
  ['What does it cost?', 'ERNIE is in early access and there is no billing yet.'],
]

const PEAK = [12, 18, 15, 24, 22, 31, 29, 40, 37, 49, 46, 58]
const toPath = (pts, w, h) => {
  const max = Math.max(...pts)
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w)
  const ys = pts.map(v => h - (v / max) * (h - 8) - 4)
  return xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
}

function Preview() {
  const line = toPath(PEAK, 420, 120)
  const risks = [
    ['NovaRemit', 'High', 'var(--danger)', 'var(--danger-soft)'],
    ['ClearVault', 'High', 'var(--danger)', 'var(--danger-soft)'],
    ['PocketFi', 'Medium', 'var(--warn)', 'var(--warn-soft)'],
    ['StableSend', 'Low', 'var(--success)', 'var(--success-soft)'],
  ]
  return (
    <div className="lp-preview" aria-hidden="true">
      <div className="lp-preview-frame">
        <div className="lp-bar"><i /><i /><i /><b>ERNIE · Overview</b><em>Illustrative data</em></div>
        <div className="lp-mock">
          <div className="lp-mock-kpis">
            {[['Volume', '$4.2M'], ['Wallets', '12,480'], ['Dormancy', '38.2%'], ['High risk', '7']].map(([k, v]) => (
              <div className="lp-kpi" key={k}><small>{k}</small><strong>{v}</strong></div>
            ))}
          </div>
          <div className="lp-mock-grid">
            <div className="lp-panel">
              <h4>Transaction volume</h4>
              <svg viewBox="0 0 420 120" width="100%" height="140" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lpFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10D9A0" stopOpacity=".32" /><stop offset="100%" stopColor="#10D9A0" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="lpLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#A3FF3C" /><stop offset="100%" stopColor="#10D9A0" />
                  </linearGradient>
                </defs>
                <path d={`${line} L420 120 L0 120 Z`} fill="url(#lpFill)" />
                <path d={line} fill="none" stroke="url(#lpLine)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </div>
            <div className="lp-panel">
              <h4>Most at risk</h4>
              {risks.map(([n, tier, c, bg]) => (
                <div className="lp-risk-row" key={n}>
                  <span>{n}</span>
                  <span style={{ color: c, background: bg, padding: '2px 9px', borderRadius: 999, fontWeight: 700, fontSize: 11 }}>{tier}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="lp-caption">A preview of the dashboard. Numbers shown are illustrative, not real customer data.</p>
    </div>
  )
}

export default function Landing({ theme, onToggleTheme, onLogin, onSignup }) {
  const go = id => e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <a href="/" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label="ERNIE home"><Logo size={34} /></a>
          <nav className="lp-links" aria-label="Sections">
            <a onClick={go('features')}>Features</a>
            <a onClick={go('how')}>How it works</a>
            <a onClick={go('security')}>Security</a>
            <a onClick={go('pricing')}>Pricing</a>
            <a onClick={go('faq')}>FAQ</a>
          </nav>
          <div className="lp-nav-actions">
            <button className="btn btn-icon" onClick={onToggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="btn btn-ghost" onClick={onLogin}>Sign in</button>
            <button className="btn btn-primary" onClick={onSignup}>Get started</button>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap">
            <span className="lp-pill"><i /> Retention intelligence for on-chain businesses</span>
            <h1 className="lp-h1">Know who's going quiet <span>before they churn.</span></h1>
            <p className="lp-sub">
              ERNIE connects to your Blockradar wallet, tracks the activity of every address, and shows you which fintechs
              are drifting away, while there is still time to do something about it.
            </p>
            <div className="lp-cta">
              <button className="btn btn-primary" onClick={onSignup}>Get started <ArrowRight size={17} /></button>
              <button className="btn" onClick={onLogin}>Sign in</button>
            </div>
            <div className="lp-trust">
              <span><Check size={15} /> Read-only access</span>
              <span><Check size={15} /> Keys encrypted at rest</span>
              <span><Check size={15} /> Demo data until you connect</span>
            </div>
            <Preview />
          </div>
        </section>

        <section className="lp-section" id="features">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2>Everything you need to keep fintechs active</h2>
              <p>From a single risk score to the daily activity behind it.</p>
            </div>
            <div className="lp-grid">
              {FEATURES.map(f => (
                <div className="lp-card" key={f.title}>
                  <div className="ico"><f.icon size={21} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section alt" id="how">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2>Up and running in three steps</h2>
              <p>No pipelines to build and nothing to install.</p>
            </div>
            <div className="lp-steps">
              {STEPS.map(s => (
                <div className="lp-step" key={s.title}><h3>{s.title}</h3><p>{s.text}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="security">
          <div className="lp-wrap lp-sec">
            <div>
              <h2>Your data stays yours</h2>
              <p>ERNIE handles wallet data, so it is built to be careful with it.</p>
              <ul>
                {SECURITY.map(s => (
                  <li key={s.title}><s.icon size={20} /><div><b>{s.title}</b><span>{s.text}</span></div></li>
                ))}
              </ul>
            </div>
            <div className="lp-card" style={{ padding: 28 }}>
              <div className="ico"><ShieldCheck size={21} /></div>
              <h3>What we store</h3>
              <p style={{ marginTop: 10 }}>
                Your account details, your workspace settings, and your Blockradar wallet ID plus an encrypted copy of your API key.
                Address and transaction data is processed to produce your analytics and is not shared with other workspaces.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section alt" id="pricing">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2>Simple pricing that grows with you</h2>
              <p>Start free with one wallet. Upgrade when your team needs more.</p>
            </div>
            <Pricing onChoose={onSignup} ctaLabel={p => (p.price_usd ? `Start with ${p.name}` : 'Start free')} />
          </div>
        </section>

        <section className="lp-section" id="faq">
          <div className="lp-wrap">
            <div className="lp-head"><h2>Frequently asked questions</h2></div>
            <div className="lp-faq">
              {FAQ.map(([q, a]) => (
                <details key={q}><summary>{q}</summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-wrap">
            <div className="lp-final">
              <h2>See who's going quiet, today.</h2>
              <p>Create a workspace, explore it with demo data, then connect your own wallet when you're ready.</p>
              <div className="lp-cta" style={{ marginTop: 0 }}>
                <button className="btn btn-primary" onClick={onSignup}>Get started <ArrowRight size={17} /></button>
                <button className="btn" onClick={onLogin}>Sign in</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div>
            <Logo size={30} />
            <small>
              © {new Date().getFullYear()} ERNIE, the Engagement &amp; Retention Network Intelligence Engine.
              ERNIE is an independent product and is not affiliated with or endorsed by Blockradar.
            </small>
          </div>
          <nav aria-label="Footer">
            <a onClick={go('features')}>Features</a>
            <a onClick={go('security')}>Security</a>
            <a onClick={go('pricing')}>Pricing</a>
            <a href="#/terms">Terms</a>
            <a href="#/privacy">Privacy</a>
            <a href="#/status">Status</a>
            <a onClick={onLogin}>Sign in</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
