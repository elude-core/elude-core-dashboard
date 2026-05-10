import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { QUICK_LINKS } from '@/config/quick-links'

function IconLarge({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Link
  return <Icon className="h-8 w-8 text-blue-500" />
}

export function QuickLinksGrid() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">Quick Links</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {QUICK_LINKS.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-start gap-2 rounded-xl border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50 dark:border-gray-800 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
          >
            <IconLarge name={link.iconName} />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{link.name}</p>
              {link.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{link.description}</p>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
