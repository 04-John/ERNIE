import { Sun, Moon, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react'
import Logo from '../components/Logo'
import { usePublicStatus } from '../hooks/useAnalytics'
import { timeAgo } from '../lib/format'
import './landing.css'

const UPDATED = 'October 2026'
const CONTACT = import.meta.env.VITE_SUPPORT_EMAIL || ''

function Shell({ title, subtitle, theme, onToggleTheme, children }) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <a href="#/" onClick={() => { window.location.hash = '' }} aria-label="ERNIE home"><Logo size={34} /></a>
          <div className="lp-nav-actions">
            <button className="btn btn-icon" onClick={onToggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            <a className="btn" href="#/" onClick={() => { window.location.hash = '' }}><ArrowLeft size={15} /> Back</a>
          </div>
        </div>
      </header>
      <main>
        <section className="lp-section" style={{ paddingTop: 56 }}>
          <div className="lp-wrap" style={{ maxWidth: 780 }}>
            <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.03em', marginBottom: 8 }}>{title}</h1>
            <p className="hint" style={{ marginBottom: 32 }}>{subtitle}</p>
            <div className="prose">{children}</div>
          </div>
        </section>
      </main>
    </div>
  )
}

const H = ({ children }) => <h2 style={{ fontSize: 19, margin: '32px 0 10px' }}>{children}</h2>
const P = ({ children }) => <p style={{ color: 'var(--text-2)', lineHeight: 1.75, marginBottom: 12 }}>{children}</p>
const L = ({ items }) => <ul style={{ color: 'var(--text-2)', lineHeight: 1.75, paddingLeft: 22, marginBottom: 12, display: 'grid', gap: 6 }}>{items.map(i => <li key={i}>{i}</li>)}</ul>
const Contact = () => (CONTACT
  ? <P>Questions about this page? Email <a href={`mailto:${CONTACT}`} style={{ color: 'var(--accent-text)' }}>{CONTACT}</a>.</P>
  : null)

export function Terms(props) {
  return (
    <Shell title="Terms of Service" subtitle={`Last updated ${UPDATED}`} {...props}>
      <P>These terms govern your use of ERNIE, a service that analyses wallet activity from your Blockradar account to show which of your fintech customers are becoming inactive. By creating an account or using ERNIE you agree to them.</P>

      <H>1. Your account</H>
      <P>You must give accurate information and keep your login secure. You are responsible for activity in your workspace, including what your team members do. Workspace admins decide who joins and what role they have.</P>

      <H>2. Your data</H>
      <P>You keep all rights to the data you connect. You give us permission to process it only to provide ERNIE to you: syncing it, scoring it, showing it to your team, and sending the alerts you configure. We do not sell your data and do not share it with other customers. You can export it or delete it at any time from Settings.</P>
      <P>You confirm you are allowed to connect the Blockradar account and wallet you add, and that using ERNIE on that data does not breach your obligations to anyone else.</P>

      <H>3. Acceptable use</H>
      <L items={['Do not attempt to access another customer\'s data or break, probe or overload the service.', 'Do not use ERNIE to break the law or to harass, defraud or surveil people.', 'Do not resell or white-label ERNIE without our written agreement.', 'Do not send alert webhooks to systems you do not control.']} />

      <H>4. Independence from Blockradar</H>
      <P>ERNIE is an independent product. It is not made, endorsed or supported by Blockradar. ERNIE can only show what Blockradar's API returns, and changes or outages there can affect ERNIE.</P>

      <H>5. Scores, insights and AI answers</H>
      <P>Risk scores, forecasts, findings and the Ask ERNIE assistant are decision aids built from the data available. They can be incomplete or wrong, especially with little history. They are not financial, legal or investment advice, so check important details before acting on them. Ask ERNIE is optional, off by default, and uses an AI model from a third party as described in our Privacy Policy.</P>

      <H>6. Plans and payment</H>
      <P>ERNIE has a free plan and paid plans billed monthly in US dollars through Stripe. Paid plans renew automatically until cancelled. You can change or cancel at any time from Settings, and a cancellation takes effect at the end of the period you have paid for. Fees already paid are not refunded unless the law requires it. We may change prices or plan limits with notice, and a change does not affect a period you have already paid for. Taxes may apply.</P>

      <H>7. Availability</H>
      <P>We work to keep ERNIE running and show live system status on our status page, but we do not promise uninterrupted service. We may change, add or remove features.</P>

      <H>8. Ending your use</H>
      <P>You can delete your account or workspace from Settings at any time, and your data is erased as described in the Privacy Policy. We may suspend or end access if you break these terms or put the service or other customers at risk.</P>

      <H>9. Warranties and liability</H>
      <P>ERNIE is provided "as is" and "as available". To the extent the law allows, we disclaim all warranties, and our total liability for any claim relating to ERNIE is limited to the amount you paid us in the 12 months before the claim. We are not liable for indirect or consequential losses, including lost profits or lost customers. Nothing here limits liability that cannot be limited by law.</P>

      <H>10. Changes to these terms</H>
      <P>We may update these terms. If a change is material we will tell you in the product or by email before it applies. Continuing to use ERNIE after that means you accept the new terms.</P>
      <Contact />
    </Shell>
  )
}

export function Privacy(props) {
  return (
    <Shell title="Privacy Policy" subtitle={`Last updated ${UPDATED}`} {...props}>
      <P>This explains what ERNIE collects, why, who else handles it, and the choices you have. In short: we process the data you connect to give you analytics, we keep it separate per workspace, and we never sell it.</P>

      <H>What we collect</H>
      <L items={[
        'Account details: your name, email address, company name, and a hashed password (or your Google account identifier if you sign in with Google).',
        'Workspace details: workspace name, team members and their roles, invitations, alert channels (emails, Slack and webhook addresses are stored encrypted), and your settings.',
        'Blockradar connection: your wallet ID and an encrypted copy of your API key. The key is never shown again or written to logs.',
        'Wallet data from Blockradar: addresses and transactions, which we store to compute your analytics and history.',
        'Usage and security records: an activity log of admin actions in your workspace, AI message counts, and technical logs such as IP addresses used for rate limiting and abuse prevention.',
      ]} />
      <P>We do not use advertising or tracking cookies. Your browser stores a sign-in token and your theme preference locally so the app works.</P>

      <H>How we use it</H>
      <L items={['To provide ERNIE: syncing, scoring, insights, forecasts, alerts and the dashboard.', 'To secure the service, prevent abuse and fix problems.', 'To send service emails such as password resets, invitations and alerts you asked for.', 'To bill you if you choose a paid plan.']} />

      <H>Who else handles your data</H>
      <P>We use these providers only as needed to run ERNIE:</P>
      <L items={[
        'Our hosting provider (Render) runs the application and database.',
        'Google, only if you choose to sign in with Google.',
        'Stripe, only if you buy a paid plan. Card details go directly to Stripe and never reach ERNIE.',
        'An email delivery provider, to send the emails above.',
        'Anthropic, only if a workspace admin turns on Ask ERNIE. Then, when someone asks a question or requests a draft, we send a summary of fintech-level facts: fintech names, regions and types, volumes, transaction counts, risk scores with their reasons, and current findings. We never send your API key, wallet addresses, transaction hashes, email addresses or team details. Anthropic processes this to produce an answer.',
        'Slack or any webhook address you configure, which receive the alerts you set up.',
      ]} />
      <P>We may disclose information if the law requires it. We do not sell personal data or share it with advertisers.</P>

      <H>How long we keep it</H>
      <P>We keep your data while your workspace exists. If you disconnect Blockradar, the wallet data stored from it is deleted. If you delete your workspace, we erase it, its members, history, insights, alerts and activity log. Backups kept by our hosting provider age out on their normal schedule. Billing records may be kept by Stripe as the law requires.</P>

      <H>Security</H>
      <P>Secrets are encrypted at rest, passwords are hashed, traffic uses HTTPS, each workspace's data is kept separate, and admin actions are logged. No system is perfectly secure, so please use a strong, unique password and tell us if you notice anything wrong.</P>

      <H>Your choices and rights</H>
      <L items={['Download a copy of your workspace data from Settings.', 'Delete your account or workspace from Settings.', 'Turn Ask ERNIE on or off at any time.', 'Remove alert channels or disconnect Blockradar whenever you like.', 'Depending on where you live, you may have further rights, such as to access, correct or object to processing. Contact us and we will help.']} />

      <H>Children</H>
      <P>ERNIE is for businesses and is not directed at children.</P>

      <H>Changes</H>
      <P>If we change this policy in a material way we will tell you in the product or by email.</P>
      <Contact />
    </Shell>
  )
}

export function Status(props) {
  const { data, isLoading, isError } = usePublicStatus()
  const ok = data?.status === 'operational'
  return (
    <Shell title="System status" subtitle="Live checks, refreshed every 30 seconds." {...props}>
      {isLoading && <P>Checking…</P>}
      {isError && (
        <div className="card tone-danger" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <AlertTriangle size={22} /> <div><strong>We can't reach the API right now.</strong><div className="hint">If this keeps happening, the service may be down or restarting.</div></div>
        </div>
      )}
      {data && (
        <>
          <div className={`card tone-${ok ? 'success' : 'warn'}`} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
            {ok ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
            <div><strong style={{ fontSize: 17 }}>{ok ? 'All systems operational' : 'Some systems are degraded'}</strong>
              <div className="hint">Checked {timeAgo(data.checked_at)}</div></div>
          </div>
          <div className="kv">
            {data.components.map(c => (
              <div className="kv-row" key={c.name}>
                <div className="kv-key">{c.name}</div>
                <div className="kv-val" style={{ color: c.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{c.ok ? 'Operational' : 'Degraded'}</div>
              </div>
            ))}
          </div>
          <H>Optional features on this server</H>
          <div className="kv">
            {data.optional.map(c => (
              <div className="kv-row" key={c.name}>
                <div className="kv-key">{c.name}</div>
                <div className="kv-val" style={{ color: 'var(--text-2)' }}>{c.configured ? 'Available' : 'Not enabled'}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Shell>
  )
}
