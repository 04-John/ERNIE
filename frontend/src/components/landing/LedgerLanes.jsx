import { useEffect, useRef } from 'react'
import { NOTES } from '../../lib/landingSound'

const SP = 84, RH = 46, Y0 = 74, ORDER = [2, 0, 4, 1, 5, 3]            // px per second, lane height, first lane's top, which lane goes quiet next
const NAMES = ['NovaRemit', 'ClearVault', 'PocketFi', 'StableSend', 'Kora Pay', 'Meridian FX']
const GAPS = [0.8, 1.25, 0.65, 1.7, 1.0, 1.45]
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const hex = () => Math.random().toString(16).slice(2, 6)
const tierOf = p => (p >= 0.6 ? 'High' : p >= 0.3 ? 'Medium' : 'Low')

/** Reads the design tokens once, so the canvas follows the theme tokens instead of hard-coded colours. */
function readColors(el) {
  const cs = getComputedStyle(el)
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback
  return {
    High: v('--danger', '#FF6B78'), Medium: v('--warn', '#FFB938'), Low: v('--success', '#34E3A0'),
    HighSoft: 'rgba(255,107,120,.13)', MediumSoft: 'rgba(255,185,56,.13)', LowSoft: 'rgba(52,227,160,.12)',
    text: v('--text', '#EAF0F6'), text2: v('--text-2', '#A3B1C0'), muted: v('--muted', '#6F7F90'),
    border: v('--border', '#161B21'), borderStrong: v('--border-strong', '#232A33'), surface: v('--surface', '#07090B'),
    lime: v('--lime', '#A3FF3C'), emerald: v('--emerald', '#10D9A0'), accentText: v('--accent-text', '#B6FF62'), contrast: v('--accent-contrast', '#06140A'),
  }
}

/**
 * The hero illustration. Six fintech "lanes": every successful transaction is a block sliding left along a chain.
 * Every 14 seconds one lane goes quiet; its silence is drawn as a dashed line, and its risk climbs with the ratio of
 * silence to its own usual rhythm until it crosses High (a digest is "sent"), then recovers.
 */
export default function LedgerLanes({ sound }) {
  const canvas = useRef(null)
  const visible = useRef(true)

  useEffect(() => {
    const c = canvas.current
    if (!c) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const col = readColors(c)
    let size = { ctx: null, w: 0, h: 0 }
    let raf = 0, t0 = performance.now(), stopped = false

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight
      if (!w) return
      c.width = w * dpr; c.height = h * dpr
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      size = { ctx, w, h }
    }

    const lanes = NAMES.map((n, i) => {
      const o = { n, gap: GAPS[i], b: [], last: 0, next: 0, quiet: false, alerted: false, p: 0.1 }
      let t = -13
      while (t < 0) { o.b.push({ t, h: hex() }); o.last = t; t += o.gap * (0.55 + Math.random() * 0.9) }
      o.next = t
      return o
    })
    const toast = { txt: '', t: -99, c: '' }
    const audible = () => visible.current && sound?.on

    const badge = (ctx, x, y, w, tier, p) => {
      ctx.fillStyle = col[`${tier}Soft`]; ctx.beginPath(); ctx.roundRect(x, y - 11, w, 22, 11); ctx.fill()
      ctx.fillStyle = col[tier]; ctx.font = '600 11px Geist, system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${tier} ${p.toFixed(2)}`, x + w / 2, y + 4)
    }

    const draw = t => {
      const { ctx, w, h } = size
      if (!ctx) return
      const compact = w < 860
      const X0 = compact ? 128 : 204, X1 = compact ? w - 104 : w - 270, bot = Y0 + RH * 6
      const BX = w - (compact ? 88 : 96), BW = compact ? 88 : 96
      const ph = (t + 1) % 14, q = ORDER[Math.floor((t + 1) / 14) % 6]
      ctx.clearRect(0, 0, w, h); ctx.lineWidth = 1

      ctx.font = `500 9px ${MONO}`; ctx.textAlign = 'center'
      for (let n = Math.floor(t); ; n--) {                                      // block-height grid lines
        const x = X1 - (t - n) * SP
        if (x < X0) break
        const a = Math.min(1, (x - X0) / 60)
        ctx.strokeStyle = `rgba(35,42,51,${0.6 * a})`; ctx.beginPath(); ctx.moveTo(x, Y0 - 16); ctx.lineTo(x, bot); ctx.stroke()
        if (n % 2 === 0 && !compact) { ctx.fillStyle = `rgba(111,127,144,${0.75 * a})`; ctx.fillText('#' + (1287400 + n).toLocaleString('en-US'), x, Y0 - 22) }
      }
      ctx.textAlign = 'left'; ctx.font = '600 10px Geist, system-ui'; ctx.fillStyle = col.muted; ctx.letterSpacing = '1.2px'
      ctx.fillText('FINTECH', 0, 18); ctx.fillText(compact ? 'ACTIVITY' : 'ON-CHAIN ACTIVITY  ·  1 BLOCK = 1 SUCCESSFUL TX', X0, 18)
      if (!compact) ctx.fillText('SILENCE ÷ RHYTHM', X1 + 24, 18)
      ctx.fillText('RISK', BX, 18); ctx.letterSpacing = '0px'

      lanes.forEach((o, i) => {
        const want = i === q && ph < 10
        if (o.quiet && !want) {                                                 // the quiet lane starts transacting again
          o.quiet = false; o.next = t + 0.1
          if (o.alerted) { Object.assign(toast, { txt: `${o.n} is transacting again · recovered from High`, t, c: col.Low }); if (audible()) sound.recoverTone() }
          o.alerted = false
        }
        if (!o.quiet && want) o.quiet = true
        if (!o.quiet && t >= o.next) {
          o.b.push({ t, h: hex() }); o.last = t; o.next = t + o.gap * (0.55 + Math.random() * 0.9)
          if (audible()) sound.blip(NOTES[i] * 2, 0.013, 0.22, 'triangle')
        }
        while (o.b.length && X1 - (t - o.b[0].t) * SP < X0 - 30) o.b.shift()

        const r = (t - o.last) / o.gap
        const target = r < 2 ? 0.06 + (0.05 * r) / 2 : Math.min(0.88, 0.11 + ((r - 2) / 6) * 0.77)
        o.p += (target - o.p) * 0.06
        const tier = tierOf(o.p), tc = col[tier], y = Y0 + i * RH + RH / 2
        if (tier === 'High' && !o.alerted) {
          o.alerted = true
          Object.assign(toast, { txt: `${o.n} turned High · one digest sent to Slack, email and webhook`, t, c: col.High })
          if (audible()) sound.alertTone()
        }

        ctx.textAlign = 'left'; ctx.font = `600 ${compact ? 13 : 14}px Geist, system-ui`; ctx.fillStyle = tier === 'High' ? col.High : col.text; ctx.fillText(o.n, 0, y - 2)
        ctx.font = `400 10px ${MONO}`; ctx.fillStyle = col.muted; ctx.fillText(`usual gap ${(o.gap * 2.4).toFixed(1)}d`, 0, y + 13)
        ctx.strokeStyle = col.border; ctx.beginPath(); ctx.moveTo(X0, y); ctx.lineTo(X1, y); ctx.stroke()

        let px = null                                                            // chain lines between blocks
        o.b.forEach(b => {
          const x = X1 - (t - b.t) * SP, a = clamp((x - X0) / 70, 0, 1)
          if (px !== null) { ctx.strokeStyle = `rgba(16,217,160,${0.4 * a})`; ctx.beginPath(); ctx.moveTo(px + 13, y); ctx.lineTo(x - 13, y); ctx.stroke() }
          px = x
        })
        o.b.forEach(b => {                                                       // the blocks
          const x = X1 - (t - b.t) * SP, a = clamp((x - X0) / 70, 0, 1), age = t - b.t, fresh = age < 0.7
          ctx.globalAlpha = a; ctx.beginPath(); ctx.roundRect(x - 13, y - 9, 26, 18, 4)
          if (fresh) {
            const g = ctx.createLinearGradient(x - 13, y - 9, x + 13, y + 9); g.addColorStop(0, col.lime); g.addColorStop(1, col.emerald)
            ctx.shadowBlur = 20 * (1 - age / 0.7); ctx.shadowColor = col.emerald; ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0
          } else { ctx.fillStyle = col.surface; ctx.fill(); ctx.strokeStyle = 'rgba(16,217,160,.5)'; ctx.stroke() }
          ctx.font = `500 8px ${MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = fresh ? col.contrast : col.muted; ctx.fillText(b.h, x, y + 3)
        })
        ctx.globalAlpha = 1

        if (r > 1.3) {                                                           // the silence, drawn as a dashed line
          const xl = Math.max(X0, X1 - (t - o.last) * SP + 13)
          ctx.globalAlpha = clamp((r - 1.3) / 1.5, 0, 1); ctx.setLineDash([3, 4]); ctx.strokeStyle = tc
          ctx.beginPath(); ctx.moveTo(xl, y); ctx.lineTo(X1, y); ctx.stroke(); ctx.setLineDash([])
          ctx.font = `500 10px ${MONO}`; ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.fillText(`silent ${((t - o.last) * 2.4).toFixed(1)}d`, (xl + X1) / 2, y - 8); ctx.globalAlpha = 1
        }
        if (!compact) {                                                          // silence ÷ rhythm readout
          ctx.textAlign = 'left'; ctx.font = `600 15px ${MONO}`; ctx.fillStyle = r > 2 ? tc : col.text2; ctx.fillText(r.toFixed(1) + '×', X1 + 24, y + 5)
          ctx.fillStyle = col.border; ctx.fillRect(X1 + 88, y - 2, 64, 4)
          ctx.fillStyle = r > 2 ? tc : col.Low; ctx.fillRect(X1 + 88, y - 2, Math.min(r / 8, 1) * 64, 4)
        }
        badge(ctx, BX, y, BW, tier, o.p)
      })

      ctx.strokeStyle = 'rgba(163,255,60,.55)'; ctx.beginPath(); ctx.moveTo(X1, Y0 - 16); ctx.lineTo(X1, bot); ctx.stroke()
      ctx.font = `600 9px ${MONO}`; ctx.fillStyle = col.accentText; ctx.textAlign = 'center'; ctx.fillText('NOW', X1, bot + 14)

      const e = t - toast.t                                                      // the toast under the lanes
      if (e < 4.5) {
        ctx.globalAlpha = clamp(Math.min(e / 0.3, (4.5 - e) / 0.6), 0, 1)
        ctx.fillStyle = toast.c; ctx.beginPath(); ctx.arc(4, bot + 44, 3.5, 0, 7); ctx.fill()
        ctx.font = `500 12px ${MONO}`; ctx.textAlign = 'left'; ctx.fillText(toast.txt, 18, bot + 48); ctx.globalAlpha = 1
      }
    }

    const start = () => {
      if (stopped) return
      resize()
      if (reduce) {                                                              // one still frame: simulate a few seconds, then stop
        for (let t = 0; t <= 24; t += 0.2) draw(t)
        return
      }
      t0 = performance.now()
      const loop = now => { draw((now - t0) / 1000); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }

    const ready = document.fonts?.ready ? document.fonts.ready : Promise.resolve()
    ready.then(start)

    const ro = new ResizeObserver(() => { resize(); if (reduce) for (let t = 0; t <= 24; t += 0.2) draw(t) })
    ro.observe(c)
    const io = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting }, { threshold: 0 })
    io.observe(c)
    return () => {
      stopped = true
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect()
    }
  }, [sound])

  return <canvas ref={canvas} className="ln-canvas" aria-label="Live illustration: six fintechs transacting on-chain; one goes quiet and ERNIE flags it" />
}
