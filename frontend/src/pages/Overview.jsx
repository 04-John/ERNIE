import { DollarSign, Wallet, PauseCircle, AlertTriangle } from 'lucide-react'
import { useSummary, useStatus, useInsights } from '../hooks/useAnalytics'
import { PageHeader, StatCard, Alert } from '../components/ui'
import VolumeChart from '../components/VolumeChart'
import ChurnDonut from '../components/ChurnDonut'
import TypeBars from '../components/TypeBars'
import RegionalCards from '../components/RegionalCards'
import TopRiskList from '../components/TopRiskList'
import HealthCard from '../components/HealthCard'
import { InsightList } from '../components/Insights'
import { fmtNum, fmtUsd, fmtPct } from '../lib/format'

export default function Overview({ user }) {
  const { data: s = {}, isLoading } = useSummary()
  const { data: status } = useStatus()
  const { data: ins } = useInsights()
  const top = (ins?.data || []).filter(i => i.kind !== 'getting_started' || true).slice(0, 3)
  const first = (user?.name || '').split(' ')[0]

  const noActivity = status?.data_source === 'real' && s.total_transactions === 0
  const isDemo = status?.data_source === 'simulated'
  const syncing = status?.data_source === 'syncing'

  return (
    <div className="stack">
      <PageHeader eyebrow="Overview" title={first ? `Welcome back, ${first}` : 'Retention overview'}>
        Track wallet activity, spot dormant accounts and catch churn risk early.
      </PageHeader>

      {syncing && (
        <Alert tone="info">
          <strong>Syncing your Blockradar wallet.</strong> The first sync reads your full history and can take a minute on a busy wallet.
          This page updates by itself when it finishes.
        </Alert>
      )}

      {status?.history_truncated && (
        <Alert tone="warn">
          <strong>Very large wallet.</strong> ERNIE stored the most recent 40,000 transactions. Older history isn't included in the analytics.
        </Alert>
      )}

      {isDemo && (
        <Alert tone="warn">
          <strong>You're viewing demo data.</strong> Connect your Blockradar wallet to see your own fintechs, volume and churn risk.{' '}
          <a href="#/settings" className="link">Connect Blockradar →</a>
        </Alert>
      )}

      {status?.last_error && !syncing && (
        <Alert tone="danger">
          <strong>Blockradar sync failed.</strong> {status.data_source === 'error' ? 'No data has loaded yet.' : 'Showing your last good data.'}{' '}
          {status.last_error} <a href="#/settings" className="link">Check connection →</a>
        </Alert>
      )}

      {noActivity && (
        <Alert tone="info">
          <strong>Connected, but no transactions yet.</strong> Your Blockradar wallet has {fmtNum(s.total_wallets)} address{s.total_wallets === 1 ? '' : 'es'} and
          no successful transactions. Churn scores, volume and dormancy fill in automatically after the first deposits or withdrawals.
        </Alert>
      )}

      <div className="grid-kpi">
        <StatCard loading={isLoading} label="Transaction volume" value={fmtUsd(s.total_volume_usd)}
          sub={`${fmtNum(s.total_transactions)} successful transactions`} tone="accent" icon={DollarSign} />
        <StatCard loading={isLoading} label="Wallets" value={fmtNum(s.total_wallets)}
          sub={`${fmtNum(s.total_fintechs)} fintech${s.total_fintechs === 1 ? '' : 's'}`} tone="info" icon={Wallet} />
        <StatCard loading={isLoading} label="Dormancy rate" value={fmtPct(s.dormancy_rate)}
          sub={s.never_active_wallets ? `${fmtNum(s.never_active_wallets)} never active · 60-day window` : 'No activity in 60+ days'} tone="warn" icon={PauseCircle} />
        <StatCard loading={isLoading} label="High churn risk" value={fmtNum(s.high_risk_fintechs)}
          sub="Fintechs needing attention" tone="danger" icon={AlertTriangle} />
      </div>

      {top.length > 0 && (
        <section aria-label="Top insights" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>What needs your attention</h2>
            <a href="#/insights" className="link" style={{ fontSize: 13 }}>See all {ins.data.length} →</a>
          </div>
          <InsightList insights={top} compact />
        </section>
      )}

      <HealthCard />

      <VolumeChart />

      <div className="split">
        <div className="stack-col">
          <ChurnDonut />
          <TypeBars />
        </div>
        <TopRiskList />
      </div>

      <RegionalCards />
    </div>
  )
}
