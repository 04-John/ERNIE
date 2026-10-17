import { useState } from 'react'
import { NOTES } from '../../lib/landingSound'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const WEIGHTS = [0.35, 0.25, 0.2, 0.2]
const LABELS = ['Silence vs its own rhythm', 'Volume trend', 'Dormant wallets', 'Low activity']
const GAPS = ['Daily · 1d', 'Weekly · 7d', 'Bursty · 14d']
const TXS = ['Under 5', '5–19', '20+']
const tierOf = p => (p >= 0.6 ? 'High' : p >= 0.3 ? 'Medium' : 'Low')

/**
 * The real scoring model from churn_engine.py, interactive. Move an input and watch each signal add its share:
 *   recency = .35 x clamp((days / gap - 2) / 6), trend = .25 x clamp(-change), dormancy = .20 x share, activity = .20 x (<5 tx: 1, <20: .5, else 0)
 *   probability = the sum. High at 0.60, Medium at 0.30.
 */
export default function ScoringModel({ sound }) {
  const [days, setDays] = useState(15)
  const [gap, setGap] = useState(0)
  const [trend, setTrend] = useState(-72)
  const [dorm, setDorm] = useState(60)
  const [tx, setTx] = useState(1)

  const gapDays = [1, 7, 14][gap]
  const ratio = days / gapDays
  const v = [clamp((ratio - 2) / 6, 0, 1), clamp(-trend / 100, 0, 1), dorm / 100, [1, 0.5, 0][tx]]
  const pts = v.map((x, i) => x * WEIGHTS[i])
  const p = pts.reduce((a, b) => a + b, 0)
  const tier = tierOf(p)
  const detail = [
    `Silent ${days} day${days === 1 ? '' : 's'}, ${ratio.toFixed(1)}× its usual gap${ratio <= 2 ? ' (within normal)' : ''}`,
    trend >= 0 ? `Volume up ${trend}% on the previous 3 months` : `Volume down ${-trend}% on the previous 3 months`,
    `${dorm}% of its wallets quiet for 60+ days`,
    ['Fewer than 5 successful transactions', 'Between 5 and 19 successful transactions', '20 or more successful transactions'][tx],
  ]
  const tick = value => sound?.blip(1200 + value * 8, 0.006, 0.05)
  const pick = (setter, i) => { setter(i); sound?.blip(NOTES[i] * 2, 0.02, 0.25, 'triangle') }

  return (
    <div className="ln-score">
      <div className="ln-score-in">
        <div>
          <div className="ln-row"><label htmlFor="sc-days">Days since last transaction</label><span className="ln-val">{days}d</span></div>
          <input id="sc-days" type="range" min="0" max="45" value={days} onChange={e => { setDays(+e.target.value); tick(+e.target.value) }} />
        </div>
        <div>
          <div className="ln-q">Its usual gap <span>(90th percentile)</span></div>
          <div className="segmented" role="group" aria-label="Usual gap">
            {GAPS.map((g, i) => <button key={g} aria-pressed={gap === i} onClick={() => pick(setGap, i)}>{g}</button>)}
          </div>
        </div>
        <div>
          <div className="ln-row"><label htmlFor="sc-trend">Volume vs previous 3 months</label><span className="ln-val">{trend > 0 ? '+' : ''}{trend}%</span></div>
          <input id="sc-trend" type="range" min="-100" max="50" value={trend} onChange={e => { setTrend(+e.target.value); tick(+e.target.value) }} />
        </div>
        <div>
          <div className="ln-row"><label htmlFor="sc-dorm">Wallets dormant 60+ days</label><span className="ln-val">{dorm}%</span></div>
          <input id="sc-dorm" type="range" min="0" max="100" value={dorm} onChange={e => { setDorm(+e.target.value); tick(+e.target.value) }} />
        </div>
        <div>
          <div className="ln-q">Successful transactions</div>
          <div className="segmented" role="group" aria-label="Successful transactions">
            {TXS.map((g, i) => <button key={g} aria-pressed={tx === i} onClick={() => pick(setTx, i)}>{g}</button>)}
          </div>
        </div>
      </div>

      <div className={`ln-score-out tier-${tier.toLowerCase()}`}>
        <div className="ln-score-head">
          <div>
            <div className="ln-cap">CHURN PROBABILITY</div>
            <div className="ln-prob" aria-live="polite">{p.toFixed(2)}</div>
          </div>
          <span className="sbadge ln-tier"><i />{tier} risk</span>
        </div>
        <div className="ln-zones" aria-hidden="true"><div className="ln-marker" style={{ left: `${Math.min(p, 1) * 100}%` }} /></div>
        <div className="ln-zone-labels"><span>0</span><span>0.30</span><span>0.60</span><span>1.00</span></div>
        <div className="ln-parts">
          {LABELS.map((label, i) => (
            <div key={label}>
              <div className="ln-part-head"><span>{label} <span className="ln-dim">· {WEIGHTS[i] * 100}%</span></span><span className="mono" style={{ color: v[i] > 0 ? 'var(--tone)' : 'var(--muted)' }}>+{pts[i].toFixed(2)}</span></div>
              <div className="bar"><i style={{ width: `${v[i] * 100}%`, background: v[i] > 0 ? 'var(--tone)' : 'var(--border-strong)', transition: 'width .45s cubic-bezier(.2,.8,.2,1)' }} /></div>
              <div className="ln-detail">{detail[i]}</div>
            </div>
          ))}
        </div>
        <p className="ln-foot">Probability is the sum of the four signals. It's a transparent heuristic, not a trained model, and daily scores are stored so one can be trained later.</p>
      </div>
    </div>
  )
}
