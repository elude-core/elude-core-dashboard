export interface KpiCardSkeletonProps {
  label: string
  error?: boolean
}

export function KpiCardSkeleton({ label, error }: KpiCardSkeletonProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${error ? 'text-red-500' : 'text-gray-300 dark:text-gray-700'}`}>
        {error ? 'Error' : '--'}
      </p>
    </div>
  )
}
