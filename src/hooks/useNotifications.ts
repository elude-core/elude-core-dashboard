"use client";

import useSWR from "swr";

import type { FetchResult } from "@/lib/cache";
import { fetcher } from "@/lib/fetcher";
import type { Notification } from "@/lib/notifications";

export function useNotifications() {
  return useSWR<FetchResult<Notification[]>>("/api/notifications", fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });
}
