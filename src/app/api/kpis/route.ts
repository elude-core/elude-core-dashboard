import { NextResponse } from "next/server";

import { PROM_QUERIES } from "@/config/prometheus-queries";
import { fetchWithFallback } from "@/lib/cache";
import { promQuery } from "@/lib/prometheus";

export const dynamic = "force-dynamic";

export interface KpiPayload {
  uptime7d: number | null;
  medusaReqRate: number | null;
  cpuPct: number | null;
  ramUsedGB: number | null;
  partialFailures: number;
}

async function getKpis(): Promise<KpiPayload> {
  const results = await Promise.allSettled([
    promQuery(PROM_QUERIES.uptime7d),
    promQuery(PROM_QUERIES.medusaReqRate),
    promQuery(PROM_QUERIES.cpuPct),
    promQuery(PROM_QUERIES.ramUsedGB),
  ]);

  return {
    uptime7d: results[0].status === "fulfilled" ? results[0].value : null,
    medusaReqRate: results[1].status === "fulfilled" ? results[1].value : null,
    cpuPct: results[2].status === "fulfilled" ? results[2].value : null,
    ramUsedGB: results[3].status === "fulfilled" ? results[3].value : null,
    partialFailures: results.filter((r) => r.status === "rejected").length,
  };
}

export async function GET() {
  try {
    const result = await fetchWithFallback("prom:kpis", getKpis, 5);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 503 });
  }
}
