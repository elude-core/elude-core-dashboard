import { ExternalLink } from 'lucide-react'
import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { KumaMonitor } from '@/lib/kuma'
import { SERVICES } from '@/config/services'

export interface StackHealthTableProps {
  services: KumaMonitor[]
}

function StatusPill({ status }: { status: KumaMonitor['status'] }) {
  const styles = {
    up: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    down: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    maintenance: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

function IconByName({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.HelpCircle
  return <Icon className="h-4 w-4 text-gray-500" />
}

export function StackHealthTable({ services }: StackHealthTableProps) {
  // Match Kuma monitors avec metadata config (par nom)
  const rows = services.map((monitor) => {
    const meta = SERVICES.find((s) => s.kumaName === monitor.name)
    return { monitor, meta }
  })

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Stack Health</h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500 dark:border-gray-800">
            <th className="px-5 py-3 font-medium">Service</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Uptime 24h</th>
            <th className="px-5 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ monitor, meta }) => (
            <tr key={monitor.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <IconByName name={meta?.iconName ?? 'HelpCircle'} />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{monitor.name}</span>
                </div>
              </td>
              <td className="px-5 py-3">
                <StatusPill status={monitor.status} />
              </td>
              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                {monitor.uptime24h !== undefined ? `${(monitor.uptime24h * 100).toFixed(2)}%` : '—'}
              </td>
              <td className="px-5 py-3 text-right">
                {meta?.adminUrl && (
                  <a
                    href={meta.adminUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
