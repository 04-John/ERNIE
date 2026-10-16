import { DollarSign, Wallet, PauseCircle, AlertTriangle } from 'lucide-react'
import { useSummary, useStatus } from '../hooks/useAnalytics'
import { PageHeader, StatCard, Alert } from '../components/ui'
import VolumeChart from '../components/VolumeChart'
import ChurnDonut from '../components/ChurnDonut'
import TypeBars from '../components/TypeBars'
import RegionalCards from '../components/RegionalCards'
import TopRiskList from '../components/TopRiskList'
import { fmtNum, fmtUsd, fmtPct } from '../lib/format'

export default function Overview({ user }) {
  const { data: s = {}, isLoading } = useSummary()
  const { data: status } = useStatus()
  const first = (user?.name || '').split(' ')[0]

  const noActivity = status?.data_source === 'real' && s.total_transactions === 0

  return (
    <div className="stack">
      <PageHeader eyebrow="Overview" title={first ? `Welcome back, ${first}` : 'Retention overview'}>
        Track wallet activity, spot dormant accounts and catch churn risk early.
      </PageHeader>

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
