'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import type { FetchResult } from '@/lib/cache'
import type { AggregateStatus } from '@/lib/kuma'

export function useStatus() {
  return useSWR<FetchResult<AggregateStatus>>('/api/status', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  })
}
