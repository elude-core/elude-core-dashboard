import { NextResponse } from "next/server";

import { fetchWithFallback } from "@/lib/cache";

export const dynamic = "force-dynamic";

/** Une marque, un jour : compteurs + taux dérivés (calculés côté elude-sync). */
export interface CmpDayBrand {
  display: number;
  accept: number;
  deny: number;
  custom: number;
  ignored: number;
  interaction_rate: number;
  accept_rate: number;
}

export interface CmpStatsPayload {
  /** Marques connues (inclut les variantes `-dev`). */
  brands: string[];
  /** { yyyymmdd: { brand: CmpDayBrand } }, jours décroissants. */
  days: Record<string, Record<string, CmpDayBrand>>;
  /** Agrégat période (toutes marques prod confondues, hors `-dev`). */
  totals: CmpDayBrand;
}

const DAYS = 14;

function emptyTotals(): CmpDayBrand {
  return {
    display: 0,
    accept: 0,
    deny: 0,
    custom: 0,
    ignored: 0,
    interaction_rate: 0,
    accept_rate: 0,
  };
}

async function getCmpStats(): Promise<CmpStatsPayload> {
  const base = process.env.SYNC_URL;
  const user = process.env.SYNC_CMP_USER;
  const pass = process.env.SYNC_CMP_PASSWORD;
  if (!base || !user || !pass) {
    throw new Error("SYNC_URL / SYNC_CMP_USER / SYNC_CMP_PASSWORD not configured");
  }
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const res = await fetch(`${base}/admin/cmp-stats?days=${DAYS}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`cmp-stats upstream: HTTP ${res.status}`);
  const raw = (await res.json()) as Pick<CmpStatsPayload, "brands" | "days">;

  // Agrégat période — marques PROD uniquement (on exclut les `-dev`, comptés
  // séparément par le beacon pour ne pas polluer les chiffres réels).
  const totals = emptyTotals();
  for (const byBrand of Object.values(raw.days ?? {})) {
    for (const [brand, d] of Object.entries(byBrand)) {
      if (brand.endsWith("-dev")) continue;
      totals.display += d.display;
      totals.accept += d.accept;
      totals.deny += d.deny;
      totals.custom += d.custom;
      totals.ignored += d.ignored;
    }
  }
  const choices = totals.accept + totals.deny + totals.custom;
  totals.interaction_rate = totals.display > 0 ? Math.round((choices / totals.display) * 100) : 0;
  totals.accept_rate = choices > 0 ? Math.round((totals.accept / choices) * 100) : 0;

  return { brands: raw.brands ?? [], days: raw.days ?? {}, totals };
}

export async function GET() {
  try {
    // TTL 60s : le beacon est temps réel (INCR), mais l'engagement se lit en
    // tendance — pas la peine de taper elude-sync à chaque render.
    const result = await fetchWithFallback("cmpstats:14d", getCmpStats, 60);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 503 });
  }
}
