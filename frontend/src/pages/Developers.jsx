import { useEffect, useState } from 'react'
import { Copy, Check, ArrowRight, BellRing, Database, LayoutDashboard, Send, Zap, ShieldCheck, FlaskConical } from 'lucide-react'
import ApiConsole from '../components/ApiConsole'
import { useDeveloper } from '../hooks/useAnalytics'
import { BASE_URL } from '../api/client'
import { copyText } from '../lib/format'
import './developers.css'

const SECTIONS = [
  ['quickstart', 'Quickstart'], ['authentication', 'Authentication'], ['endpoints', 'Endpoints'],
  ['pricing', 'Pricing and credits'], ['errors', 'Errors and limits'],
]

const BUILD = [
  { icon: BellRing, title: 'Alert on churn risk', text: 'Page your team in Slack or PagerDuty the moment a fintech turns high risk.' },
  { icon: Database, title: 'Feed your CRM', text: 'Write each fintech\'s risk score and reasons onto its account record.' },
  { icon: LayoutDashboard, title: 'Power your own dashboards', text: 'Pull health, insights and history into the BI tools you already use.' },
  { icon: Send, title: 'Automate outreach', text: 'Trigger a check-in workflow when a fintech\'s activity drops.' },
]

const SAMPLES = {
  cURL: `curl "${BASE_URL}/v1/fintechs?risk=High&limit=5" \\
  -H "Authorization: Bearer $ERNIE_API_KEY"`,
  Python: `import os, requests

r = requests.get(
    "${BASE_URL}/v1/fintechs",
    params={"risk": "High", "limit": 5},
    headers={"Authorization": f"Bearer {os.environ['ERNIE_API_KEY']}"},
    timeout=30,
)
r.raise_for_status()
for f in r.json()["data"]:
    print(f["name"], f["risk_probability"])`,
  JavaScript: `const res = await fetch("${BASE_URL}/v1/fintechs?risk=High&limit=5", {
  headers: { Authorization: \`Bearer \${process.env.ERNIE_API_KEY}\` },
})
if (!res.ok) throw new Error((await res.json()).detail)
const { data } = await res.json()
for (const f of data) console.log(f.name, f.risk_probability)`,
}

const ENDPOINTS = [
  { id: 'fintechs.list', path: '/v1/fintechs', desc: 'Your fintechs ranked by churn risk. Filter by risk or region and paginate.',
    params: [['risk', 'High, Medium, Low or Unknown'], ['region', 'Exact region name'], ['limit', '1 to 100, default 50'], ['offset', 'Skip this many, default 0']],
    sample: `{
  "total": 12, "limit": 5, "offset": 0,
  "data": [{
    "id": "fin_01", "name": "OmniPay", "region": "West Africa", "type": "Payments",
    "risk": "High", "risk_probability": 0.74,
    "days_since_last_transaction": 41, "transactions": 1840,
    "total_volume_usd": 508213.4,
    "volume_last_3_months_usd": 51230.0, "volume_previous_3_months_usd": 214900.0,
    "dormant_wallet_share": 0.38
  }]
}` },
  { id: 'fintechs.get', path: '/v1/fintechs/{id}', desc: 'One fintech with the reasons behind its score, so you can show your team why it was flagged.',
    params: [['id', 'The fintech id from the list']],
    sample: `{
  "id": "fin_01", "name": "OmniPay", "risk": "High", "risk_probability": 0.74,
  "score_breakdown": [{
    "signal": "Silence vs its usual rhythm", "weight": 0.4, "contribution": 0.31,
    "detail": "Usually transacts every ~2 days; silent for 41 (20.5x its usual gap)"
  }]
}` },
  { id: 'health', path: '/v1/health', desc: 'The retention health score (0 to 100) and what drives it.', params: [],
    sample: `{
  "score": 82, "grade": "Strong", "volume_change_28d": -0.04,
  "components": [{ "name": "Wallet activation", "value": 100, "detail": "100% of wallets have transacted" }]
}` },
  { id: 'insights', path: '/v1/insights', desc: 'Current findings, most important first, each with a suggested next step.', params: [],
    sample: `{
  "data": [{
    "severity": "critical", "kind": "volume_drop",
    "title": "3 fintechs cut volume by half or more",
    "detail": "FlowPay: $51.3k to $64 in 4 weeks.",
    "suggested_next_step": "Ask what changed before they stop completely.",
    "fintech_ids": ["fin_07"]
  }]
}` },
  { id: 'history', path: '/v1/history', desc: 'Daily headline metrics for charts. Window is limited by your plan.',
    params: [['days', '1 to 800, default 30 (capped by your plan)']],
    sample: `{ "days": 30, "data": [{ "day": "2026-10-15", "active_wallets": 4120, "dormancy_rate": 0.31, "high_risk": 7, "total_volume_usd": 4210000 }] }` },
  { id: 'usage', path: '/v1/usage', desc: 'Your key\'s mode, credit balance and the price list. Always free.', params: [],
    sample: `{ "mode": "live", "credits_remaining": 9120, "pricing": { "credit_usd": 0.001, "endpoints": { "health": 2 } } }` },
]

const ERRORS = [
  ['401', 'Missing, wrong or revoked API key.'],
  ['402', 'Not enough credits for this call. Nothing was returned or charged. Add credits and retry.'],
  ['404', 'That fintech does not exist in your workspace. Not billed.'],
  ['409', 'A live key needs a connected Blockradar wallet. Use a test key to try the API on demo data.'],
  ['422', 'A parameter is invalid. Not billed.'],
  ['429', 'You hit the per-key rate limit. Wait for the Retry-After seconds.'],
  ['503', 'Your data is still syncing. Retry shortly.'],
]

function CodeBlock({ samples }) {
  const langs = Object.keys(samples)
  const [lang, setLang] = useState(langs[0])
  const [copied, setCopied] = useState(false)
  const copy = async () => { if (await copyText(samples[lang])) { setCopied(true); setTimeout(() => setCopied(false), 1600) } }
  return (
    <div className="dev-codeblock">
      <div className="dev-codebar">
        <div className="dev-langs" role="tablist">
          {langs.length > 1 ? langs.map(l => <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)}>{l}</button>) : <span>{langs[0]}</span>}
        </div>
        <button className="dev-copy" onClick={copy} aria-label="Copy code">{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
      </div>
      <pre><code>{samples[lang]}</code></pre>
    </div>
  )
}

function useScrollSpy(ids) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) setActive(visible.target.id)
    }, { rootMargin: '-15% 0px -70% 0px' })
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [ids])
  return active
}

export default function Developers() {
  const { data: dev } = useDeveloper()
  const active = useScrollSpy(SECTIONS.map(s => s[0]))
  const costs = dev?.pricing?.endpoints
  const go = id => e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  return (
    <div className="dev">
      <header className="dev-hero">
        <span className="eyebrow">Developers</span>
        <h1>Programmatic access to <span>retention intelligence</span></h1>
        <p>Pull risk scores, health, insights and history for your fintechs straight into your own systems. Prepaid credits, pay only for the calls you make, and a free test mode on demo data.</p>
        <div className="dev-cta">
          <a className="btn btn-primary" href="#console" onClick={go('console')}>Get an API key <ArrowRight size={16} /></a>
          <a className="btn" href="#quickstart" onClick={go('quickstart')}>Read the docs</a>
        </div>
        <div className="dev-badges">
          <span><Zap size={14} /> REST and JSON</span><span><FlaskConical size={14} /> Free test keys</span><span><ShieldCheck size={14} /> Keys stored hashed</span>
        </div>
      </header>

      <section>
        <h2 className="dev-h2">What do you want to build?</h2>
        <div className="dev-build">
          {BUILD.map(b => (
            <div className="dev-card" key={b.title}>
              <div className="dev-ico"><b.icon size={19} /></div>
              <h3>{b.title}</h3><p>{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      <ApiConsole />

      <div className="dev-docs">
        <nav className="dev-toc" aria-label="Documentation">
          <span>On this page</span>
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go(id)} aria-current={active === id ? 'true' : undefined}>{label}</a>)}
        </nav>

        <div className="dev-content">
          <section id="quickstart">
            <h2 className="dev-h2">Quickstart</h2>
            <ol className="dev-steps">
              <li><b>Create a test key</b> in the console above. Test keys return demo data for free, so you can build before you add credits.</li>
              <li><b>Make a request.</b> Send the key as a bearer token:</li>
            </ol>
            <CodeBlock samples={SAMPLES} />
            <ol className="dev-steps" start={3}>
              <li><b>Go live.</b> Connect your Blockradar wallet in Settings, add credits, and create a live key. Same calls, your real data.</li>
            </ol>
            <p className="dev-note">Base URL: <code>{BASE_URL}</code></p>
          </section>

          <section id="authentication">
            <h2 className="dev-h2">Authentication</h2>
            <p>Send your key in the <code>Authorization</code> header on every request.</p>
            <CodeBlock samples={{ HTTP: 'Authorization: Bearer ernie_live_xxxxxxxxxxxxxxxx' }} />
            <ul className="dev-list">
              <li><code>ernie_live_…</code> reads your own workspace data and spends credits.</li>
              <li><code>ernie_test_…</code> reads a fixed demo dataset, is free, and has a lower rate limit.</li>
              <li>Keep keys on your server. Never put one in a browser app or a public repository. If one leaks, revoke it in the console, which takes effect immediately.</li>
              <li>Only a fingerprint of each key is stored, so we cannot show it again after you create it.</li>
            </ul>
          </section>

          <section id="endpoints">
            <h2 className="dev-h2">Endpoints</h2>
            <p>All endpoints are <code>GET</code> and return JSON.</p>
            {ENDPOINTS.map(e => (
              <article className="dev-endpoint" key={e.id} id={`ep-${e.id.replace('.', '-')}`}>
                <div className="dev-ep-head">
                  <span className="method">GET</span><code className="dev-path">{e.path}</code>
                  <span className="dev-cost">{e.id === 'usage' ? 'free' : `${costs?.[e.id] ?? '…'} credits`}</span>
                </div>
                <p>{e.desc}</p>
                {e.params.length > 0 && (
                  <table className="dev-params"><tbody>{e.params.map(([n, d]) => <tr key={n}><td><code>{n}</code></td><td>{d}</td></tr>)}</tbody></table>
                )}
                <CodeBlock samples={{ 'Example response': e.sample }} />
              </article>
            ))}
          </section>

          <section id="pricing">
            <h2 className="dev-h2">Pricing and credits</h2>
            <p>You buy credits in advance and each successful call spends a few. One credit is $0.001, so $10 is 10,000 credits. Larger top-ups include a bonus. Credits don't expire.</p>
            <table className="dev-table">
              <thead><tr><th>Endpoint</th><th>Credits per call</th><th>Cost per call</th></tr></thead>
              <tbody>
                {ENDPOINTS.filter(e => e.id !== 'usage').map(e => (
                  <tr key={e.id}><td><code>{e.path}</code></td><td className="tnum">{costs?.[e.id] ?? '…'}</td><td className="tnum">{costs ? `$${(costs[e.id] * (dev.pricing.credit_usd)).toFixed(3)}` : '…'}</td></tr>
                ))}
                <tr><td><code>/v1/usage</code></td><td>0</td><td>free</td></tr>
              </tbody>
            </table>
            {dev && (
              <table className="dev-table">
                <thead><tr><th>Top-up</th><th>Credits</th><th>Bonus</th></tr></thead>
                <tbody>{dev.pricing.packs.map(p => <tr key={p.usd}><td className="tnum">${p.usd}</td><td className="tnum">{p.credits.toLocaleString()}</td><td>{Math.round((p.credits / (p.usd * 1000) - 1) * 100) || '—'}{p.credits > p.usd * 1000 ? '%' : ''}</td></tr>)}</tbody>
              </table>
            )}
            <ul className="dev-list">
              <li>You are only billed for calls that succeed. Errors, unknown ids and invalid parameters are free.</li>
              <li>Every billed response includes <code>X-Credits-Charged</code> and <code>X-Credits-Remaining</code>.</li>
              <li>If your balance can't cover a call you get a <code>402</code> and no data. Nothing goes negative.</li>
              <li>Test keys never spend credits.</li>
            </ul>
          </section>

          <section id="errors">
            <h2 className="dev-h2">Errors and limits</h2>
            <p>Errors return a JSON body with a human-readable <code>detail</code>.</p>
            <table className="dev-table">
              <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
              <tbody>{ERRORS.map(([c, m]) => <tr key={c}><td><code>{c}</code></td><td>{m}</td></tr>)}</tbody>
            </table>
            <ul className="dev-list">
              <li>Rate limits are per key: {dev?.pricing?.rate_limits_per_minute?.live ?? 300} requests a minute for live keys and {dev?.pricing?.rate_limits_per_minute?.test ?? 30} for test keys.</li>
              <li>Data refreshes on your workspace's sync schedule, not on every call, so polling faster than a few times an hour won't give you newer numbers.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
