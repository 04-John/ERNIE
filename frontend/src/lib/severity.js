import { AlertOctagon, AlertTriangle, Info, TrendingUp } from 'lucide-react'

// How an insight's severity is presented: badge tone, icon and label
export const SEVERITY = {
  critical: { tone: 'danger',  icon: AlertOctagon,  label: 'Critical' },
  warning:  { tone: 'warn',    icon: AlertTriangle, label: 'Warning' },
  info:     { tone: 'info',    icon: Info,          label: 'Info' },
  positive: { tone: 'success', icon: TrendingUp,    label: 'Good news' },
}
