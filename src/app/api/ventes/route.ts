import { NextResponse } from "next/server";

import { readSnapshot } from "@/lib/ventes";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await readSnapshot();
  if (!snap) {
    return NextResponse.json({ error: "aucun instantané — le script nocturne n'a pas encore tourné" }, { status: 503 });
  }
  // generated_at est validé par isSnapshot (readSnapshot) — jamais NaN ici.
  // Borné à 0 par le bas : une horloge de script en avance ne doit pas rendre un âge négatif.
  const age = (Date.now() - Date.parse(snap.generated_at)) / 3_600_000;
  const age_hours = Math.max(0, Math.round(age * 10) / 10);
  return NextResponse.json({ ...snap, age_hours });
}
