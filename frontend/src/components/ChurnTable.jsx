import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useChurnScores, useRegional } from '../hooks/useAnalytics'
import { useFintechDrawer } from '../lib/drawer'
import { Skeleton } from './ui'
import { fmtNum, fmtUsd, fmtPct } from '../lib/format'

const RISKS = ['High', 'Medium', 'Low', 'Unknown']
const COLS = 'minmax(0,1.3fr) 120px 100px 90px minmax(0,1.2fr) 70px 80px 90px'
const tierClass = risk => `tier-${String(risk || 'unknown').toLowerCase()}`

/** Every fintech ranked by churn probability. Clicking a row opens its drawer. The risk filter can be driven from outside (the tier tiles). */
export default function ChurnTable({ risk, onRisk }) {
  const [localRisk, setLocalRisk] = useState(null)
  const [region, setRegion] = useState(null)
  const [query, setQuery]   = useState('')
  const [limit, setLimit]   = useState(20)
  const { openFintech } = useFintechDrawer()
  const activeRisk = onRisk ? risk : localRisk
  const setRisk = r => { (onRisk || setLocalRisk)(r); setLimit(20) }

  const { data: regions = [] } = useRegional()
  const { data, isLoading, isFetching } = useChurnScores({
    limit,
    ...(activeRisk ? { risk: activeRisk } : {}),
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
    <section className="panel" id="fintech-table">
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h2 className="section-title">Fintech churn risk</h2>
            <div className="panel-sub">Ranked by churn probability · click a row for the reasons</div>
          </div>
          <span className="chip">{total} fintech{total === 1 ? '' : 's'}</span>
        </div>
        <div className="filters" style={{ marginTop: 14, marginBottom: 0 }}>
          <div className="search">
            <Search size={14} />
            <input className="input" placeholder="Search fintechs" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search fintechs" />
          </div>
          {RISKS.map(r => (
            <button key={r} className="pill" aria-pressed={activeRisk === r} onClick={() => setRisk(activeRisk === r ? null : r)}>{r}</button>
          ))}
          {regions.length > 1 && <span className="pill-divider" />}
          {regions.length > 1 && regions.map(r => (
            <button key={r.region} className="pill" aria-pressed={region === r.region} onClick={() => { setRegion(region === r.region ? null : r.region); setLimit(20) }}>{r.region}</button>
          ))}
        </div>
      </div>

      <div className="gt-wrap">
        <div style={{ minWidth: 960 }}>
          <div className="gt-head" style={{ gridTemplateColumns: COLS }}>
            <span>Fintech</span><span>Region</span><span>Type</span><span>Risk</span><span>Probability</span>
            <span className="gt-r">Wallets</span><span className="gt-r">Dormancy</span><span className="gt-r">Volume</span>
          </div>
          <div style={{ opacity: isFetching ? .6 : 1, transition: 'opacity .15s' }}>
            {rows.map(row => {
              const scored = row.churn_risk !== 'Unknown'
              const prob = (row.churn_probability || 0) * 100
              return (
                <button key={row.fintech_id} className={`gt-row ${tierClass(row.churn_risk)}`} style={{ gridTemplateColumns: COLS }} onClick={() => openFintech(row.fintech_id)}>
                  <span style={{ fontWeight: 600 }}>{row.fintech_name}</span>
                  <span style={{ color: 'var(--text-2)' }}>{row.region}</span>
                  <span style={{ color: 'var(--text-2)' }}>{row.type || '—'}</span>
                  <span className="sbadge" style={{ justifySelf: 'start' }}>{row.churn_risk}</span>
                  {scored ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="bar" style={{ flex: 1 }}><i style={{ width: `${prob}%`, background: 'var(--tone)' }} /></div>
                      <span className="mono" style={{ width: 46, textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--tone)' }}>{prob.toFixed(1)}%</span>
                    </div>
                  ) : <span className="hint">No transactions yet</span>}
                  <span className="gt-r">{fmtNum(row.total_wallets)}</span>
                  <span className="gt-r">{fmtPct(row.dormancy_rate)}</span>
                  <span className="gt-r">{fmtUsd(row.total_volume)}</span>
                </button>
              )
            })}
            {rows.length === 0 && <div style={{ padding: 40, textAlign: 'center', fontSize: 14, color: 'var(--muted)' }}>No fintechs match. Try clearing a filter or search.</div>}
          </div>
        </div>
      </div>

      {limit < total && !query && (
        <div style={{ padding: 14, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-sm" onClick={() => setLimit(l => Math.min(l + 20, 200))} disabled={limit >= 200}>
            Show more ({Math.min(total - limit, 200 - limit)} more)
          </button>
        </div>
      )}
    </section>
  )
}
