"use client";

import useSWR from "swr";

import { fetcher } from "@/lib/fetcher";
import type { VentesSnapshot } from "@/lib/ventes";

export type VentesPayload = VentesSnapshot & { age_hours: number };

/**
 * Instantané nocturne (script Odoo, ~1×/nuit via cron) — pas de polling agressif
 * comme les stats live du reste du dashboard : `refreshInterval` large, et on
 * revalide au focus pour rattraper un script qui vient de tourner. Contrairement
 * aux autres hooks du dossier, `/api/ventes` ne passe pas par `fetchWithFallback`
 * (pas de `FetchResult<T>` : la fraîcheur se lit dans `age_hours`, pas dans un
 * booléen `stale` séparé).
 */
export function useVentes() {
  return useSWR<VentesPayload>("/api/ventes", fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: true,
  });
}
