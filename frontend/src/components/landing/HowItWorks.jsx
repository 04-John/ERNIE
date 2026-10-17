import { useEffect, useRef, useState } from 'react'
import { NOTES } from '../../lib/landingSound'
import { useMedia } from '../../lib/useMedia'

const STEPS = [
  { n: '01', title: 'Connect your wallet', text: 'Paste your Blockradar wallet ID and API key. ERNIE checks them with Blockradar before saving and encrypts the key at rest. Access is read-only, so ERNIE can look but can never move funds.', meta: 'Fernet encryption · last 4 shown · read-only' },
  { n: '02', title: 'Read the chain', text: "Each child address becomes a fintech. ERNIE pulls successful deposits and withdrawals, ignores internal sweeps and never invents a region or type. Later syncs are incremental and only stop early when it's provably safe.", meta: 'every 6 h · on demand · up to 40,000 tx' },
  { n: '03', title: 'Judge each fintech by its own rhythm', text: "Silence only means something against a baseline. ERNIE compares the days since a fintech's last transaction with its own 90th-percentile gap between active days. A daily payer that goes quiet for a week is a risk. A bursty one isn't.", meta: '≤ 2× normal · ≥ 8× maximum risk' },
  { n: '04', title: 'Explain every point', text: "Four signals add up to a risk score between 0 and 1. The fintech page shows exactly how many points each one contributed, so your team never has to trust a black box. Scores are absolute: one fintech never moves another's.", meta: 'High ≥ 0.60 · Medium ≥ 0.30 · Unknown if no tx' },
  { n: '05', title: 'Alert on changes, not noise', text: 'After every sync ERNIE compares each tier with the last one. When a fintech turns High or recovers, you get one digest per channel. A fintech that keeps flipping gets at most one alert every 24 hours.', meta: 'email · Slack · HMAC-signed webhook' },
]

const PARTS = [
  ['Silence vs its own rhythm', '35%', '+0.31', 88, 'Silent 15 days, 7.3× its usual gap'],
  ['Volume trend', '25%', '+0.18', 72, 'Down 72% on the previous 3 months'],
  ['Dormant wallets', '20%', '+0.12', 60, '6 of 10 wallets quiet for 60+ days'],
  ['Low activity', '20%', '+0.10', 50, 'Fewer than 20 successful transactions in total'],
]

function Visual({ i, active }) {
  const grow = active === 3
  return (
    <div className="ln-vis" data-on={active === i} style={{ transform: active === i ? 'none' : `translateY(${i < active ? -18 : 18}px) scale(.98)` }} aria-hidden={active !== i}>
      {i === 0 && (
        <div className="ln-vis-pad center">
          <div className="ln-vt">Connect Blockradar</div><div className="ln-vs">Settings → Connection</div>
          <div style={{ marginTop: 22, display: 'grid', gap: 14 }}>
            <div><div className="ln-flabel">Wallet ID</div><div className="ln-finput">wlt_8d1f3c47b2e9a920</div></div>
            <div><div className="ln-flabel">API key</div><div className="ln-finput focus">br_live_••••••••••••••••4f2a</div></div>
            <div className="ln-fbtn">Verify and connect</div>
          </div>
          <div className="ln-vmeta"><span style={{ color: 'var(--success)' }}>✓ Verified with Blockradar</span><span>Stored encrypted · last 4 shown</span></div>
        </div>
      )}
      {i === 1 && (
        <div className="ln-vis-pad center">
          <div className="ln-vhead"><span>stored_transactions</span><span style={{ color: 'var(--info)' }}>● syncing · page 3 of 3</span></div>
          <div className="ln-table mono">
            <div className="ln-trow head"><span>HASH</span><span>FINTECH</span><span className="r">AMOUNT</span><span className="r">STATUS</span></div>
            {[['0x9f2c…', 'Kora Pay', '12,400 USDC', 'SUCCESS', 'ok'], ['0x41ab…', 'StableSend', '3,050 USDT', 'SUCCESS', 'ok'], ['0x7e01…', 'Treasury sweep', 'SALVAGE', 'IGNORED', 'skip'], ['0xc3d8…', 'Meridian FX', '880 PYUSD', 'PENDING', 'wait'], ['0x0b6a…', 'NovaRemit', '41,000 USDC', 'SUCCESS', 'ok new']].map(r => (
              <div key={r[0]} className={`ln-trow ${r[4]}`}><span className="dim">{r[0]}</span><span className={r[4] === 'skip' ? 'strike' : ''}>{r[1]}</span><span className="r">{r[2]}</span><span className={`r st-${r[4].split(' ')[0]}`}>{r[3]}</span></div>
            ))}
          </div>
          <div className="ln-vnote">One child address = one fintech. Stablecoins are valued 1:1; other assets are counted but never given a USD value.</div>
        </div>
      )}
      {i === 2 && (
        <div className="ln-vis-pad center" style={{ gap: 28 }}>
          <div className="ln-vs mono">Same 8 days of silence. Two different answers.</div>
          {[['Kora Pay', 'pays daily · p90 gap 1d', '8.0× · maximum', 'tier-high', 18], ['Baobab Pay', 'bursty · p90 gap 10d', '0.8× · normal', 'tier-low', 3]].map(([name, sub, ratio, tier, ticks]) => (
            <div key={name} className={tier}>
              <div className="ln-rhythm-head"><span>{name} <span className="mono ln-dim">· {sub}</span></span><span className="mono" style={{ color: 'var(--tone)', fontWeight: 600 }}>{ratio}</span></div>
              <svg viewBox="0 0 400 44" width="100%" height="56" style={{ marginTop: 10, display: 'block' }}>
                <line x1="0" y1="22" x2="400" y2="22" style={{ stroke: 'var(--border)' }} />
                {ticks === 18
                  ? Array.from({ length: 18 }, (_, k) => <line key={k} x1={16 + k * 14} y1="12" x2={16 + k * 14} y2="32" strokeWidth="2" style={{ stroke: 'var(--emerald)' }} />)
                  : [4, 12, 20, 142, 150, 158, 166, 266, 274, 282].map(x => <line key={x} x1={x} y1="12" x2={x} y2="32" strokeWidth="2" style={{ stroke: 'var(--emerald)' }} />)}
                <line x1="288" y1="22" x2="380" y2="22" strokeDasharray="3 4" style={{ stroke: 'var(--tone)' }} />
                <line x1="380" y1="4" x2="380" y2="40" style={{ stroke: 'var(--lime)' }} />
              </svg>
            </div>
          ))}
          <div className="ln-legend mono"><span>≤ 2× normal</span><span style={{ color: 'var(--warn)' }}>2–8× rising</span><span style={{ color: 'var(--danger)' }}>≥ 8× maximum</span></div>
        </div>
      )}
      {i === 3 && (
        <div className="ln-vis-pad center tier-high">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div><div className="ln-vt">NovaRemit · Why this score</div><div className="ln-vs">Every point of the score, explained</div></div>
            <div style={{ textAlign: 'right' }}><div className="mono" style={{ font: '700 34px/1 var(--font-mono)', color: 'var(--tone)', letterSpacing: '-0.04em' }}>0.71</div><div style={{ font: '600 11px var(--font)', color: 'var(--tone)', marginTop: 6 }}>High risk</div></div>
          </div>
          <div style={{ display: 'grid', gap: 18, marginTop: 26 }}>
            {PARTS.map(([label, weight, pts, w, detail], k) => (
              <div key={label}>
                <div className="ln-part-head"><span>{label} <span className="ln-dim">· {weight}</span></span><span className="mono" style={{ color: 'var(--tone)' }}>{pts}</span></div>
                <div className="bar"><i style={{ width: `${w}%`, background: 'var(--tone)', transformOrigin: 'left', transform: grow ? 'scaleX(1)' : 'scaleX(0)', transition: `transform 1.1s ${k * 120}ms cubic-bezier(.2,.8,.2,1)` }} /></div>
                <div className="ln-detail">{detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {i === 4 && (
        <div className="ln-vis-pad center" style={{ gap: 14, padding: 32 }}>
          <div className="ln-card-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="ln-app" /><b>ERNIE</b><span className="ln-tag">APP</span><span className="ln-vs" style={{ margin: 0 }}>#retention · 09:41</span></div>
            <div style={{ marginTop: 12, font: '600 14px var(--font)' }}>1 fintech turned High risk</div>
            <div className="ln-alert-line"><i style={{ background: 'var(--danger)' }} /><span><b>NovaRemit</b> · 0.71 · silent 7.3× its usual gap, volume down 72%</span></div>
            <div className="ln-alert-line"><i style={{ background: 'var(--success)' }} /><span><b>ClearVault</b> recovered from High</span></div>
          </div>
          <div className="ln-card-in mono" style={{ whiteSpace: 'pre', overflow: 'hidden', font: '500 12px/1.8 var(--font-mono)', color: 'var(--text-2)' }}>
            <span style={{ color: 'var(--accent-text)' }}>POST</span> https://hooks.acme.io/ernie{'\n'}<span style={{ color: 'var(--muted)' }}>X-ERNIE-Signature:</span> sha256=9f2c41e0…b7{'\n'}{'{ "type": '}<span style={{ color: 'var(--accent-text)' }}>"ernie.alerts"</span>{', "events": [ … ] }'}
          </div>
          <div className="ln-pills mono"><span>email · delivered</span><span>slack · delivered</span><span>webhook · 200</span></div>
        </div>
      )}
    </div>
  )
}

/** Five steps on the right; a sticky panel on the left crossfades to the visual for whichever step is in view. */
export default function HowItWorks({ sound }) {
  const wide = useMedia('(min-width: 900px)')
  const [active, setActive] = useState(0)
  const refs = useRef([])
  const last = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const vh = window.innerHeight
      let s = 0
      refs.current.forEach((el, i) => { if (el && el.getBoundingClientRect().top < vh * 0.55) s = i })
      if (s !== last.current) {
        last.current = s
        setActive(s)
        sound?.blip(NOTES[s] * 2, 0.03, 0.5, 'triangle')
        if (s === 4) setTimeout(() => sound?.alertTone(), 250)
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [sound])

  return (
    <div className={`ln-how ${wide ? 'wide' : ''}`}>
      {wide && (
        <div className="ln-sticky"><div className="ln-panel">{STEPS.map((_, i) => <Visual key={i} i={i} active={active} />)}</div></div>
      )}
      <div className="ln-steps">
        {STEPS.map((s, i) => (
          <div key={s.n} ref={el => { refs.current[i] = el }} className="ln-step" style={{ opacity: wide ? (i === active ? 1 : 0.32) : 1 }}>
            <div className="ln-step-n mono">{s.n}</div>
            <h3 className="display">{s.title}</h3>
            <p>{s.text}</p>
            <div className="ln-step-meta mono">{s.meta}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
