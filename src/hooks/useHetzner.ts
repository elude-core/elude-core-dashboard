"use client";

import useSWR from "swr";

import type { HetznerPayload } from "@/app/api/hetzner/route";
import type { FetchResult } from "@/lib/cache";
import { fetcher } from "@/lib/fetcher";

export function useHetzner() {
  return useSWR<FetchResult<HetznerPayload>>("/api/hetzner", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  });
}
