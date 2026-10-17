// The landing page's optional sound: a low drone plus short notes. Off by default and only starts after the visitor opts in.
// Everything routes through one master gain, so toggling fades it in and out instead of clicking.

export const NOTES = [261.63, 293.66, 329.63, 392, 440, 523.25]   // pentatonic, C4 to C5

export function createSound() {
  let ac = null, master = null, fx = null, on = false

  const init = () => {
    if (ac) return ac
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    ac = new Ctx()
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination)

    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 460; lp.Q.value = 0.7
    const drone = ac.createGain(); drone.gain.value = 0.1; lp.connect(drone); drone.connect(master)
    ;[55, 82.41, 110, 164.81].forEach((f, i) => {
      const o = ac.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 1.5) * 5
      const g = ac.createGain(); g.gain.value = [0.5, 0.26, 0.2, 0.07][i]
      o.connect(g); g.connect(lp); o.start()
    })
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.06
    const lfoGain = ac.createGain(); lfoGain.gain.value = 220
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start()

    const delay = ac.createDelay(); delay.delayTime.value = 0.34
    const feedback = ac.createGain(); feedback.gain.value = 0.3
    const wet = ac.createGain(); wet.gain.value = 0.32
    delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(master)
    fx = ac.createGain(); fx.connect(master); fx.connect(delay)
    return ac
  }

  const blip = (freq, vol = 0.04, dur = 0.35, type = 'sine') => {
    if (!on || !ac) return
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain()
    o.type = type; o.frequency.value = freq
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(fx); o.start(t); o.stop(t + dur + 0.05)
  }

  const api = {
    get on() { return on },
    /** Turn the sound on or off. Returns the new state. */
    toggle() {
      const next = !on
      const ctx = init()
      if (!ctx) return false
      if (ctx.state === 'suspended') ctx.resume()
      on = next
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, on ? 0.7 : 0.15)
      return on
    },
    blip,
    chime(i) { const n = NOTES[i % 6] * (i >= 6 ? 2 : 1); blip(n, 0.045, 1.8); setTimeout(() => blip(n * 1.5, 0.03, 1.6), 110) },
    alertTone() { blip(880, 0.045, 0.5); setTimeout(() => blip(659.25, 0.05, 1), 140) },
    recoverTone() { blip(783.99, 0.035, 0.6) },
    close() { try { ac?.close() } catch { /* already closed */ } ac = null },
  }
  return api
}
