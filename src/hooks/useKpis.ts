"use client";

import useSWR from "swr";

import type { KpiPayload } from "@/app/api/kpis/route";
import type { FetchResult } from "@/lib/cache";
import { fetcher } from "@/lib/fetcher";

export function useKpis() {
  return useSWR<FetchResult<KpiPayload>>("/api/kpis", fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });
}
