import { NextResponse } from "next/server";

import { redis } from "@/lib/redis";
import { isSnapshot, VENTES_KEY, VENTES_VERSION } from "@/lib/ventes";

export const dynamic = "force-dynamic";

// Le dashboard ne va jamais chercher les ventes lui-même : il reçoit un instantané
// poussé par le script nocturne (côté Odoo), authentifié par secret partagé.
export async function POST(req: Request) {
  const attendu = process.env.VENTES_INGEST_SECRET;
  if (!attendu || req.headers.get("x-ingest-secret") !== attendu) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 422 });
  }

  if (!isSnapshot(corps) || corps.version !== VENTES_VERSION) {
    return NextResponse.json(
      { error: `instantané non conforme — version ${VENTES_VERSION} attendue` },
      { status: 422 },
    );
  }

  await redis.set(VENTES_KEY, JSON.stringify(corps));
  return NextResponse.json({ ok: true, months: corps.months.length });
}
