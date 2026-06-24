"use client";

import useSWR from "swr";

import type { FetchResult } from "@/lib/cache";
import { fetcher } from "@/lib/fetcher";
import type { SentryOverview } from "@/lib/sentry-issues";

export function useSentryOverview() {
  return useSWR<FetchResult<SentryOverview>>("/api/sentry/overview", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  });
}
