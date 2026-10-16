import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { PageHeader, Card, Alert } from '../components/ui'
import { BASE_URL } from '../api/client'
import { copyText } from '../lib/format'

const GROUPS = [
  { name: 'Analytics', endpoints: [
    { m: 'GET',  p: '/analytics/summary',        d: 'Top-level KPIs',              ret: 'total_wallets, total_volume_usd, dormancy_rate, never_active_wallets, high_risk_fintechs' },
    { m: 'GET',  p: '/analytics/monthly-volume', d: 'Monthly volume by region',    ret: 'month, region, volume, tx_count' },
    { m: 'GET',  p: '/analytics/regional',       d: 'Per-region aggregates',       ret: 'region, fintechs, total_wallets, activation_rate, avg_churn_prob' },
    { m: 'GET',  p: '/analytics/type-breakdown', d: 'Volume by fintech type',      ret: 'type, count, avg_volume_k, high_risk' },
    { m: 'GET',  p: '/analytics/status',         d: 'Pipeline status',             ret: 'data_source, last_refreshed, last_error, refreshing' },
    { m: 'GET',  p: '/analytics/history',        d: 'Daily metric snapshots',      params: 'days (≤800)', ret: 'day, dormancy_rate, active_wallets, high_risk, total_volume_usd' },
    { m: 'POST', p: '/analytics/refresh',        d: 'Re-sync now (1 per 30s)',     ret: 'status object' },
  ]},
  { name: 'Workspace', endpoints: [
    { m: 'GET',    p: '/workspace',            d: 'Workspace + connection summary',     ret: 'workspace, role, connection{connected, api_key_last4, last_synced_at}' },
    { m: 'PUT',    p: '/workspace/connection', d: 'Connect Blockradar (admin only)',    params: 'api_key, wallet_id', ret: 'workspace summary + status. The key is verified, then stored encrypted and never returned' },
    { m: 'DELETE', p: '/workspace/connection', d: 'Disconnect and clear cached data',   ret: 'workspace summary' },
  ]},
  { name: 'Alerts', endpoints: [
    { m: 'GET',    p: '/workspace/alerts/events',   d: 'Recent alert history (any member)',  ret: 'kind, fintech_name, title, detail, created_at' },
    { m: 'GET',    p: '/workspace/alerts/channels', d: 'List alert channels (admin)',         ret: 'id, kind, label, hint, enabled, last_sent_at, last_error' },
    { m: 'POST',   p: '/workspace/alerts/channels', d: 'Add email / Slack / webhook (admin)', params: 'kind, target, label', ret: 'channel (+ one-time webhook secret)' },
    { m: 'PATCH',  p: '/workspace/alerts/channels/{id}',      d: 'Enable or disable (admin)', params: 'enabled', ret: 'channel' },
    { m: 'POST',   p: '/workspace/alerts/channels/{id}/test', d: 'Send a test message (admin)', ret: 'ok, error' },
    { m: 'DELETE', p: '/workspace/alerts/channels/{id}',      d: 'Remove a channel (admin)', ret: 'removed' },
  ]},
  { name: 'Churn', endpoints: [
    { m: 'GET', p: '/churn/scores',       d: 'Churn scores',          params: 'limit (≤200), risk, region', ret: 'fintech_id, churn_probability, churn_risk, total_volume' },
    { m: 'GET', p: '/churn/high-risk',    d: 'High-risk fintechs',    ret: 'count, data[]' },
    { m: 'GET', p: '/churn/fintech/{id}', d: 'One fintech in depth', ret: 'fintech (+ score breakdown), wallets, weekly activity, recent_transactions, daily risk history' },
    { m: 'GET', p: '/churn/distribution', d: 'Risk tier counts',      ret: 'High, Medium, Low, Unknown' },
  ]},
  { name: 'Wallets', endpoints: [
    { m: 'GET', p: '/wallets/dormancy',       d: 'Dormancy stats',        params: 'region', ret: 'overall + by_region' },
    { m: 'GET', p: '/wallets/activity',       d: 'Wallet list',           params: 'fintech_id, limit (≤1000)', ret: 'id, lastActive, neverActive, isDormant, balanceUsd' },
    { m: 'GET', p: '/wallets/activity-trend', d: 'Daily activity',        params: 'days (≤90)', ret: 'day, transactions, active_wallets' },
  ]},
]

function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  return (
    <button className="btn btn-sm" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1600) } }}>
      {done ? <><Check size={14} /> Copied</> : <><Copy size={14} /> {label}</>}
    </button>
  )
}

const SNIPPET = `# 1. Get a token
curl -X POST ${BASE_URL}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@company.com","password":"********"}'

# 2. Call any endpoint with it
curl ${BASE_URL}/analytics/summary \\
  -H "Authorization: Bearer <access_token>"`

export default function Developers() {
  return (
    <div className="stack">
      <PageHeader eyebrow="Developers" title="API reference">
        Everything the dashboard shows is available over a REST API.
      </PageHeader>

      <div className="grid-2">
        <Card title="Base URL" action={<CopyButton text={BASE_URL} />}>
          <div className="code" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{BASE_URL}</div>
          <p className="hint" style={{ marginTop: 10 }}>All endpoints below are relative to this URL.</p>
        </Card>
        <Card title="Authentication">
          <p style={{ fontSize: 14, color: 'var(--text-2)' }}>
            Every endpoint except <code>/auth/*</code> and <code>/health</code> needs an
            <code> Authorization: Bearer &lt;token&gt;</code> header. Tokens last 24 hours.
          </p>
        </Card>
      </div>

      <Card title="Quick start" action={<CopyButton text={SNIPPET} />}>
        <pre className="code">{SNIPPET}</pre>
      </Card>

      {GROUPS.map(g => (
        <Card key={g.name} title={`${g.name} endpoints`} chip={`${g.endpoints.length}`}>
          <div style={{ display: 'grid', gap: 10 }}>
            {g.endpoints.map(e => (
              <div className="endpoint" key={e.p}>
                <div className="endpoint-top">
                  <span className={`method ${e.m !== 'GET' ? 'post' : ''}`}>{e.m}</span>
                  <code style={{ fontSize: 13, fontWeight: 600 }}>{e.p}</code>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{e.d}</span>
                </div>
                <div className="endpoint-meta">
                  {e.params && <span><b>Params</b> {e.params}</span>}
                  <span><b>Returns</b> {e.ret}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Alert tone="info">
        <strong>Rate limits.</strong> Login and registration are limited to 10 attempts per minute per IP, and data refresh to one run every 30 seconds.
      </Alert>
    </div>
  )
}
