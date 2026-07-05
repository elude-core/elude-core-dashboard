"use client";

import useSWR from "swr";

import type { CmpStatsPayload } from "@/app/api/cmp-stats/route";
import type { FetchResult } from "@/lib/cache";
import { fetcher } from "@/lib/fetcher";

export function useCmpStats() {
  return useSWR<FetchResult<CmpStatsPayload>>("/api/cmp-stats", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });
}
