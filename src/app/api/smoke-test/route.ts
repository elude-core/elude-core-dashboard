import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYNC_URL = process.env.SYNC_URL ?? "https://sync.elude.fr";
const BULLBOARD_USER = process.env.BULLBOARD_USER ?? "";
const BULLBOARD_PASSWORD = process.env.BULLBOARD_PASSWORD ?? "";

/**
 * Proxy serveur vers elude-sync POST /admin/smoke-test (qui exige
 * BasicAuth). Le browser ne peut pas envoyer la BasicAuth cross-origin
 * directement vers sync.elude.fr → on relaie ici avec les creds gérées
 * via env Coolify shared (BULLBOARD_USER / BULLBOARD_PASSWORD).
 *
 * Query param `sku` optionnel (default R898). Renvoie le JSON tel quel.
 */
export async function POST(req: Request) {
  if (!BULLBOARD_USER || !BULLBOARD_PASSWORD) {
    return NextResponse.json(
      { ok: false, error: "BULLBOARD_USER or BULLBOARD_PASSWORD not configured" },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const sku = url.searchParams.get("sku") ?? "R898";
  const auth = Buffer.from(`${BULLBOARD_USER}:${BULLBOARD_PASSWORD}`).toString("base64");

  try {
    const res = await fetch(`${SYNC_URL}/admin/smoke-test?sku=${encodeURIComponent(sku)}`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
      // Smoke test peut prendre jusqu'à 30s (poll Medusa).
      signal: AbortSignal.timeout(45_000),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
