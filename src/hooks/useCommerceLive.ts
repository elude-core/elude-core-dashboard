"use client";

import useSWR from "swr";

import type { TvCommercePayload } from "@/app/api/commerce-live/route";

const fetcher = async (url: string): Promise<TvCommercePayload> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`commerce-live ${res.status}`);
  return (await res.json()) as TvCommercePayload;
};

/** CA / commandes / devis temps réel (Medusa), refresh 20 s — page TV. */
export function useCommerceLive() {
  return useSWR<TvCommercePayload>("/api/commerce-live", fetcher, {
    refreshInterval: 20_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
}
