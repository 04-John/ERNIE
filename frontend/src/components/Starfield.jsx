import { useEffect, useRef } from 'react'

/**
 * A quiet night sky: slowly twinkling stars and an occasional shooting star.
 * Pure canvas, pauses when the tab is hidden, and holds still for people who prefer reduced motion.
 * Only drawn in the dark theme (CSS hides it in light).
 */
export default function Starfield() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, stars = [], comet = null, raf = 0, nextComet = performance.now() + 5000

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(260, Math.round((w * h) / 7000))
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() < 0.08 ? 1.5 : Math.random() * 0.9 + 0.3,
        base: Math.random() * 0.5 + 0.35, speed: Math.random() * 1.4 + 0.4, phase: Math.random() * Math.PI * 2,
        warm: Math.random() < 0.18,
      }))
    }

    const draw = now => {
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        const a = reduce ? s.base : s.base * (0.55 + 0.45 * Math.sin(now / 1000 * s.speed + s.phase))
        ctx.globalAlpha = Math.max(0.05, a)
        ctx.fillStyle = s.warm ? '#D9FFB0' : '#CFE9FF'
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
      }
      if (!reduce) {
        if (!comet && now > nextComet) {
          comet = { x: Math.random() * w * 0.7, y: Math.random() * h * 0.35, vx: 6 + Math.random() * 3, vy: 2.4 + Math.random() * 1.6, life: 0 }
          nextComet = now + 7000 + Math.random() * 9000
        }
        if (comet) {
          comet.x += comet.vx; comet.y += comet.vy; comet.life += 1
          const fade = Math.max(0, 1 - comet.life / 55)
          const tail = ctx.createLinearGradient(comet.x, comet.y, comet.x - comet.vx * 14, comet.y - comet.vy * 14)
          tail.addColorStop(0, `rgba(190,255,230,${0.9 * fade})`); tail.addColorStop(1, 'rgba(190,255,230,0)')
          ctx.globalAlpha = 1; ctx.strokeStyle = tail; ctx.lineWidth = 1.4
          ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo(comet.x - comet.vx * 14, comet.y - comet.vy * 14); ctx.stroke()
          if (fade <= 0 || comet.x > w || comet.y > h) comet = null
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = now => { draw(now); raf = requestAnimationFrame(loop) }
    const start = () => { cancelAnimationFrame(raf); if (reduce) draw(0); else raf = requestAnimationFrame(loop) }
    const onVisibility = () => { if (document.hidden) cancelAnimationFrame(raf); else start() }
    const onResize = () => { build(); start() }

    build(); start()
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={ref} className="starfield" aria-hidden="true" />
}
