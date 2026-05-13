import { NextResponse } from "next/server";

import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST() {
  await Promise.all([redis.del("kuma:status"), redis.del("prom:kpis")]);
  return NextResponse.json({ ok: true, refreshedAt: Date.now() });
}
