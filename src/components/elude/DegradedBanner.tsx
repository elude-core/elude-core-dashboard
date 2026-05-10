import { AlertTriangle, AlertOctagon } from 'lucide-react'

export interface DegradedBannerProps {
  state: 'ok' | 'stale' | 'error'
  upstream?: string
  staleSinceMs?: number
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m${seconds.toString().padStart(2, '0')}s`
}

export function DegradedBanner({ state, upstream, staleSinceMs }: DegradedBannerProps) {
  if (state === 'ok') return null

  if (state === 'stale') {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-600/50 dark:bg-orange-900/20 dark:text-orange-100"
      >
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-semibold">
            Données stale — {upstream} unreachable
            {staleSinceMs !== undefined && ` depuis ${formatDuration(staleSinceMs)}`}
          </p>
          <p className="text-xs opacity-80">Retry auto dans 10s. Cliquer Refresh pour forcer.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-600/50 dark:bg-red-900/20 dark:text-red-100"
    >
      <AlertOctagon className="h-5 w-5 flex-shrink-0" />
      <div>
        <p className="font-semibold">{upstream ?? 'Service'} unavailable</p>
        <p className="text-xs opacity-80">Pas de cache disponible. Vérifier {upstream}.</p>
      </div>
    </div>
  )
}
