"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { FetchResult } from "@/lib/cache";
import type { N8nStats } from "@/lib/n8n";

export function useN8nStats() {
  return useSWR<FetchResult<N8nStats>>("/api/n8n/stats", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  });
}
