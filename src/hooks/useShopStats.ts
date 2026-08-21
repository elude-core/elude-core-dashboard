"use client";

import useSWR from "swr";

import type { FetchResult } from "@/lib/cache";
import { fetcher } from "@/lib/fetcher";
import type { ShopStatsPayload } from "@/lib/shop-stats";

export function useShopStats() {
  return useSWR<FetchResult<ShopStatsPayload>>("/api/shop-stats", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });
}
