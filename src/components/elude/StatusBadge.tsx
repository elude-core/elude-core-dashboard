import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react'

export interface StatusBadgeProps {
  status: 'ok' | 'degraded' | 'down' | 'loading'
  upCount?: number
  totalCount?: number
}

export function StatusBadge({ status, upCount, totalCount }: StatusBadgeProps) {
  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading…</span>
      </div>
    )
  }

  if (status === 'ok') {
    return (
      <div className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
        <CheckCircle2 className="h-4 w-4" />
        <span>All systems operational</span>
      </div>
    )
  }

  if (status === 'degraded') {
    return (
      <div className="flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1.5 text-sm font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
        <AlertTriangle className="h-4 w-4" />
        <span>
          {totalCount && upCount !== undefined
            ? `${totalCount - upCount} service${totalCount - upCount > 1 ? 's' : ''} degraded`
            : 'Degraded'}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
      <XCircle className="h-4 w-4" />
      <span>System down</span>
    </div>
  )
}
