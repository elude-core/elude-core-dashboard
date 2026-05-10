"use client";

import useSWR from "swr";
import { useEffect, useReducer } from "react";
import { fetcher } from "@/lib/fetcher";
import type { FetchResult } from "@/lib/cache";
import type { AggregateStatus } from "@/lib/kuma";

let lastStatusFetchAt = 0;
const subscribers = new Set<() => void>();

function notifyStatusFetch() {
  lastStatusFetchAt = Date.now();
  subscribers.forEach((cb) => cb());
}

export function useStatus() {
  return useSWR<FetchResult<AggregateStatus>>("/api/status", fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
    onSuccess: () => {
      notifyStatusFetch();
    },
  });
}

export function useLastStatusFetchAt(): number {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const cb = () => force();
    subscribers.add(cb);
    // also tick every second so countdown updates
    const interval = setInterval(force, 1000);
    return () => {
      subscribers.delete(cb);
      clearInterval(interval);
    };
  }, []);
  return lastStatusFetchAt;
}
