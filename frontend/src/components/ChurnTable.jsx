import { useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { useChurnScores, useRegional } from '../hooks/useAnalytics'
import { Card, Badge, Skeleton, EmptyState, ProgressBar } from './ui'
import { fmtNum, fmtUsd, fmtPct, RISK_TONE } from '../lib/format'

const RISKS = ['High', 'Medium', 'Low', 'Unknown']

export default function ChurnTable() {
  const [risk, setRisk]     = useState(null)
  const [region, setRegion] = useState(null)
  const [query, setQuery]   = useState('')
  const [limit, setLimit]   = useState(20)

  const { data: regions = [] } = useRegional()
  const { data, isLoading, isFetching } = useChurnScores({
    limit,
    ...(risk ? { risk } : {}),
    ...(region ? { region } : {}),
  })

  const total = data?.total || 0
  const rows = useMemo(() => {
    const all = data?.data || []
    const q = query.trim().toLowerCase()
    return q ? all.filter(r => (r.fintech_name || '').toLowerCase().includes(q)) : all
  }, [data, query])

  if (isLoading) return <Skeleton height={420} />

  return (
    <Card title="Fintech churn risk" subtitle="Ranked by churn probability" chip={`${total} fintech${total === 1 ? '' : 's'}`}>
      <div className="filters">
        <div className="search">
          <Search size={15} />
          <input className="input" placeholder="Search fintechs" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search fintechs" />
        </div>
        {RISKS.map(r => (
          <button key={r} className="pill" aria-pressed={risk === r} onClick={() => { setRisk(risk === r ? null : r); setLimit(20) }}>{r}</button>
        ))}
        {regions.length > 1 && <span style={{ width: 1, height: 20, background: 'var(--border)' }} />}
        {regions.length > 1 && regions.map(r => (
          <button key={r.region} className="pill" aria-pressed={region === r.region} onClick={() => { setRegion(region === r.region ? null : r.region); setLimit(20) }}>{r.region}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No fintechs match">Try clearing a filter or search.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fintech</th><th>Region</th><th>Type</th><th>Risk</th><th>Probability</th>
                <th className="num">Wallets</th><th className="num">Dormancy</th><th className="num">Volume</th>
              </tr>
            </thead>
            <tbody style={{ opacity: isFetching ? .6 : 1, transition: 'opacity .15s' }}>
              {rows.map(row => {
                const tone = RISK_TONE[row.churn_risk] || 'neutral'
                const scored = row.churn_risk !== 'Unknown'
                const prob = (row.churn_probability || 0) * 100
                return (
                  <tr key={row.fintech_id}>
                    <td style={{ fontWeight: 600 }}><a href={`#/fintech/${encodeURIComponent(row.fintech_id)}`} className="row-link">{row.fintech_name}</a></td>
                    <td style={{ color: 'var(--text-2)' }}>{row.region}</td>
                    <td style={{ color: 'var(--text-2)' }}>{row.type || '—'}</td>
                    <td><Badge tone={tone}>{row.churn_risk}</Badge></td>
                    <td style={{ minWidth: 150 }}>
                      {scored ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1 }}><ProgressBar value={prob} tone={tone} /></div>
                          <span className="tnum" style={{ fontSize: 12, width: 44, textAlign: 'right' }}>{prob.toFixed(1)}%</span>
                        </div>
                      ) : <span className="hint">No transactions yet</span>}
                    </td>
                    <td className="num">{fmtNum(row.total_wallets)}</td>
                    <td className="num">{fmtPct(row.dormancy_rate)}</td>
                    <td className="num">{fmtUsd(row.total_volume)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {limit < total && !query && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn btn-sm" onClick={() => setLimit(l => Math.min(l + 20, 200))} disabled={limit >= 200}>
            Show more ({Math.min(total - limit, 200 - limit)} more)
          </button>
        </div>
      )}
    </Card>
  )
}
