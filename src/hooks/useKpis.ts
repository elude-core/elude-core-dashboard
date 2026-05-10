'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import type { FetchResult } from '@/lib/cache'
import type { KpiPayload } from '@/app/api/kpis/route'

export function useKpis() {
  return useSWR<FetchResult<KpiPayload>>('/api/kpis', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  })
}
