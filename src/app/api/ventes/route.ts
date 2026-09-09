import { NextResponse } from "next/server";

import { readSnapshot } from "@/lib/ventes";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await readSnapshot();
  if (!snap) {
    return NextResponse.json({ error: "aucun instantané — le script nocturne n'a pas encore tourné" }, { status: 503 });
  }
  const age = (Date.now() - Date.parse(snap.generated_at)) / 3_600_000;
  return NextResponse.json({ ...snap, age_hours: Math.round(age * 10) / 10 });
}
