import { useSummary, useStatus, useDistribution } from '../hooks/useAnalytics'
import { PageHeader, StatCard, CountUp } from '../components/ui'
import VolumeChart from '../components/VolumeChart'
import TypeBars from '../components/TypeBars'
import HealthCard from '../components/HealthCard'
import NeedsAttention from '../components/NeedsAttention'
import { fmtNum, fmtUsd, fmtPct } from '../lib/format'

function Banner({ tone, glyph, title, children }) {
  return (
    <div className={`banner tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="banner-glyph">{glyph}</span>
      <div style={{ flex: 1, minWidth: 0 }}><b>{title}</b> {children}</div>
    </div>
  )
}

export default function Overview({ user }) {
  const { data: s = {}, isLoading } = useSummary()
  const { data: status } = useStatus()
  const { data: dist = {} } = useDistribution()
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
        <Banner tone="info" glyph="↻" title="Syncing your Blockradar wallet.">
          The first sync reads your full history and can take a minute on a busy wallet. This page updates by itself when it finishes.
        </Banner>
      )}

      {status?.history_truncated && (
        <Banner tone="warn" glyph="!" title="Very large wallet.">
          ERNIE stored the most recent 40,000 transactions. Older history isn't included in the analytics.
        </Banner>
      )}

      {isDemo && (
        <Banner tone="warn" glyph="!" title="You're viewing demo data.">
          Connect your Blockradar wallet to see your own fintechs, volume and churn risk.{' '}
          <a href="#/settings" className="link-btn">Connect Blockradar →</a>
        </Banner>
      )}

      {status?.last_error && !syncing && (
        <Banner tone="danger" glyph="×" title="Blockradar sync failed.">
          {status.data_source === 'error' ? 'No data has loaded yet.' : 'Showing your last good data.'} {status.last_error}{' '}
          <a href="#/settings" className="link-btn">Check connection →</a>
        </Banner>
      )}

      {noActivity && (
        <Banner tone="info" glyph="i" title="Connected, but no transactions yet.">
          Your Blockradar wallet has {fmtNum(s.total_wallets)} address{s.total_wallets === 1 ? '' : 'es'} and no successful transactions.
          Churn scores, volume and dormancy fill in automatically after the first deposits or withdrawals.
        </Banner>
      )}

      <div className="grid-kpi">
        <StatCard loading={isLoading} label="Transaction volume" tone="accent"
          value={<CountUp value={s.total_volume_usd} format={fmtUsd} />} sub={`${fmtNum(s.total_transactions)} successful transactions`} />
        <StatCard loading={isLoading} label="Wallets" tone="info"
          value={<CountUp value={s.total_wallets} format={v => fmtNum(Math.round(v))} />}
          sub={`${fmtNum(s.total_fintechs)} fintech${s.total_fintechs === 1 ? '' : 's'}`} />
        <StatCard loading={isLoading} label="Dormancy rate" tone="warn"
          value={<CountUp value={s.dormancy_rate} format={v => fmtPct(v)} />}
          sub={s.never_active_wallets ? `${fmtNum(s.never_active_wallets)} never active · 60-day window` : 'No activity in 60+ days'} />
        <StatCard loading={isLoading} label="High churn risk" tone="danger"
          value={<CountUp value={s.high_risk_fintechs} format={v => fmtNum(Math.round(v))} />}
          sub={`${fmtNum(dist.Medium || 0)} medium · ${fmtNum(dist.Low || 0)} low · ${fmtNum(dist.Unknown || 0)} unknown`} />
      </div>

      <NeedsAttention />

      <div className="grid-2">
        <HealthCard />
        <VolumeChart />
      </div>

      <TypeBars columns />
    </div>
  )
}
