// The splash screen lives in index.html so it paints before any JavaScript. This fades it out once the app is ready,
// but never so fast that the animation is just a flicker.
const MIN_VISIBLE_MS = 1100

export function hideSplash() {
  const el = document.getElementById('splash')
  if (!el || el.dataset.leaving) return
  el.dataset.leaving = '1'
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now())
  setTimeout(() => {
    el.classList.add('done')
    setTimeout(() => el.remove(), 700)
  }, wait)
}
