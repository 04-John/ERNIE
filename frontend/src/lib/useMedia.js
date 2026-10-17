import { useSyncExternalStore } from 'react'

/** True while the media query matches, and updates when it changes. */
export function useMedia(query) {
  return useSyncExternalStore(
    cb => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => window.matchMedia(query).matches,
    () => true,
  )
}
