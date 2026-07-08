"use client";

import useSWR from "swr";

import type { TvLivePayload } from "@/app/api/umami-live/route";

const fetcher = async (url: string): Promise<TvLivePayload> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`umami-live ${res.status}`);
  return (await res.json()) as TvLivePayload;
};

/** Données temps réel Umami agrégées (8 sites), refresh 15 s — page TV. */
export function useUmamiLive() {
  return useSWR<TvLivePayload>("/api/umami-live", fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
}
