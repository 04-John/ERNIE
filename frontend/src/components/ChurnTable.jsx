import { useState } from 'react'
import { useChurnScores } from '../hooks/useAnalytics'
import { Card, Skeleton } from './VolumeChart'

const RISK_STYLES = {
  High:   { color: 'var(--red)',   bg: 'var(--red-dim)',   border: '#ef444440' },
  Medium: { color: 'var(--amber)', bg: 'var(--amber-dim)', border: '#f59e0b40' },
  Low:    { color: 'var(--green)', bg: 'var(--green-dim)', border: '#00c48c40' },
  Unknown:{ color: 'var(--text-muted)', bg: 'transparent', border: 'var(--border)' },
}

export default function ChurnTable() {
  const [risk, setRisk]     = useState(null)
  const [region, setRegion] = useState(null)
  const [limit, setLimit]   = useState(20)

  const { data, isLoading } = useChurnScores({
    limit,
    ...(risk   ? { risk }   : {}),
    ...(region ? { region } : {}),
  })

  const rows  = data?.data  || []
  const total = data?.total || 0

  if (isLoading) return <Skeleton height={400} />

  return (
    <Card title="Fintech Churn Risk Scores" chip={`${total} fintechs`}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Risk filter */}
        {['High', 'Medium', 'Low', 'Unknown'].map(r => {
          const s = RISK_STYLES[r]
          const active = risk === r
          return (
            <button key={r} onClick={() => setRisk(active ? null : r)} style={{
              fontSize: 11, fontWeight: 600,
              padding: '5px 12px', borderRadius: 20,
              border: `1px solid ${active ? s.border : 'var(--border)'}`,
              background: active ? s.bg : 'transparent',
              color: active ? s.color : 'var(--text-muted)',
              transition: 'all .15s',
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              {r}
            </button>
          )
        })}

        {/* Region filter */}
        {['Africa', 'LatAm', 'Middle East', 'Southeast Asia'].map(reg => {
          const active = region === reg
          return (
            <button key={reg} onClick={() => setRegion(active ? null : reg)} style={{
              fontSize: 11, padding: '5px 12px', borderRadius: 20,
              border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
              background: active ? 'var(--green-dim)' : 'transparent',
              color: active ? 'var(--green)' : 'var(--text-muted)',
              transition: 'all .15s',
            }}>
              {reg}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['#','Name','Region','Type','Plan','Risk','Score','Wallets','Dormancy','Volume'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '8px 12px',
                  color: 'var(--text-muted)', fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: '.07em',
                  borderBottom: '1px solid var(--border)', fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const s = RISK_STYLES[row.churn_risk] || RISK_STYLES.Unknown
              const prob = ((row.churn_probability || 0) * 100).toFixed(1)
              const dorm = ((row.dormancy_rate || 0) * 100).toFixed(1)
              const vol  = `$${((row.total_volume || 0) / 1000).toFixed(0)}k`

              return (
                <tr key={row.fintech_id}
                  style={{ transition: 'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{row.fintech_name}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }}>
                      {row.region}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{row.type || '—'}</td>
                  <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{row.plan}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                      textTransform: 'uppercase', letterSpacing: '.06em',
                    }}>
                      {row.churn_risk}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${prob}%`, background: s.color, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{prob}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px', fontVariantNumeric: 'tabular-nums' }}>{(row.total_wallets || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px', color: 'var(--amber)', fontVariantNumeric: 'tabular-nums' }}>{dorm}%</td>
                  <td style={{ padding: '12px', fontVariantNumeric: 'tabular-nums' }}>{vol}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {limit < total && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => setLimit(l => l + 20)} style={{
            fontSize: 12, color: 'var(--green)',
            background: 'none', border: 'none', padding: '8px 16px',
          }}>
            Load more ({total - limit} remaining) ↓
          </button>
        </div>
      )}
    </Card>
  )
}