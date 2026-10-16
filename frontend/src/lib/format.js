// Shared formatting + colour helpers

export const fmtNum = n => (n == null ? '—' : Number(n).toLocaleString())

export const fmtUsd = n => {
  if (n == null) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}k`
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

// n is a 0–1 ratio
export const fmtPct = (n, digits = 1) => (n == null ? '—' : `${(Number(n) * 100).toFixed(digits)}%`)

export const timeAgo = iso => {
  if (!iso) return 'never'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export const initials = (user) => {
  const src = (user?.name || user?.email || '?').trim()
  const parts = src.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase()
}

// Risk label -> badge tone
export const RISK_TONE = { High: 'danger', Medium: 'warn', Low: 'success', Unknown: 'neutral' }

// Stable colour per region (regions are data-driven now, not a fixed list of 4)
const REGION_PALETTE = ['#12B886', '#5FAEFF', '#FFB938', '#B38CFF', '#FF7AB6', '#4FD6E8', '#FF8A5C']
export const regionColor = name => {
  if (!name || name === 'Unassigned') return 'var(--muted)'
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return REGION_PALETTE[h % REGION_PALETTE.length]
}

export const copyText = async text => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
