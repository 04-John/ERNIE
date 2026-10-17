import { useEffect, useState } from 'react'

/**
 * Types `text` out about 4 characters every 14 ms. Shows everything at once when the user prefers reduced motion.
 * Returns the visible part and whether it has finished.
 */
export function useTyped(text) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [st, setSt] = useState({ text: '', n: 0 })
  useEffect(() => {
    if (!text || reduce) return undefined
    let n = 0
    const id = setInterval(() => {
      n = Math.min(text.length, n + 4)
      setSt({ text, n })
      if (n >= text.length) clearInterval(id)
    }, 14)
    return () => clearInterval(id)
  }, [text, reduce])
  if (!text) return { shown: '', done: true }
  if (reduce) return { shown: text, done: true }
  const shown = st.text === text ? text.slice(0, st.n) : ''
  return { shown, done: st.text === text && st.n >= text.length }
}
