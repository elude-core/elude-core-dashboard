import { NextResponse } from "next/server";

import { fetchWithFallback } from "@/lib/cache";
import { type ShopStatsPayload, totauxProd } from "@/lib/shop-stats";

export const dynamic = "force-dynamic";

const DAYS = 14;

async function getShopStats(): Promise<ShopStatsPayload> {
  // Mêmes variables que /api/cmp-stats : même service, même basicAuth. Le
  // beacon poste TOUJOURS vers la prod (sync.elude.fr), même depuis un
  // storefront dev (qui suffixe `-dev`) → var dédiée, pas le SYNC_URL par-env
  // qui pointe le sync dev, sans données et non résolvable ici.
  const base = process.env.CMP_STATS_URL ?? process.env.SYNC_URL;
  const user = process.env.SYNC_CMP_USER;
  const pass = process.env.SYNC_CMP_PASSWORD;
  if (!base || !user || !pass) {
    throw new Error("CMP_STATS_URL / SYNC_CMP_USER / SYNC_CMP_PASSWORD not configured");
  }
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const res = await fetch(`${base}/admin/shop-stats?days=${DAYS}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`shop-stats upstream: HTTP ${res.status}`);
  const raw = (await res.json()) as Pick<ShopStatsPayload, "brands" | "days">;
  return {
    brands: raw.brands ?? [],
    days: raw.days ?? {},
    totals: totauxProd(raw.days ?? {}),
  };
}

export async function GET() {
  try {
    // TTL 60 s, comme cmp-stats : les compteurs sont temps réel (INCR) mais un
    // funnel se lit en tendance.
    const result = await fetchWithFallback("shopstats:14d", getShopStats, 60);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 503 });
  }
}
