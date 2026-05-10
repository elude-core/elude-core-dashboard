"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { FetchResult } from "@/lib/cache";
import type { Notification } from "@/lib/notifications";

export function useNotifications() {
  return useSWR<FetchResult<Notification[]>>("/api/notifications", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });
}
