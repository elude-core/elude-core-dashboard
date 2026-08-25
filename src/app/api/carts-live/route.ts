import { NextResponse } from "next/server";

import { medusaDb } from "@/lib/medusa-db";

export const dynamic = "force-dynamic";

/**
 * Paniers en cours + convertis pour /dashboard/paniers (« Radio des paniers »).
 *
 * Source = Postgres Medusa en lecture seule (cf. lib/medusa-db.ts) : l'Admin
 * API v2 n'expose pas les carts. Un panier = un cart non supprimé avec au
 * moins une ligne. L'« étape » est la dernière franchie, par priorité :
 * commande > devis (table quote du module custom, jointe sur cart_id) >
 * paiement > livraison > identifié > panier.
 *
 * Exclusions héritées de l'audit du 25/08 (cf. memory purge paniers e2e) :
 *   - metadata.e2e = 'true' (paniers Playwright, tagués par le storefront)
 *   - emails %@elude.fr (paniers de QA authentifiée / internes)
 * Cache serveur 30 s par fenêtre. Montants Medusa en euros HT (pas centimes).
 */

export type CartEtape = "panier" | "identifie" | "livraison" | "paiement" | "devis" | "commande";

export interface CartRow {
  id: string;
  at: string;
  canal: string;
  email: string | null;
  lignes: number;
  qte: number;
  totalHt: number;
  produit: string;
  etape: CartEtape;
}

export interface CartsLivePayload {
  days: number;
  rows: CartRow[];
  generatedAt: string;
}

const ALLOWED_DAYS = new Set([1, 7, 30]);
const CACHE_MS = 30_000;
const cache = new Map<number, { at: number; data: CartsLivePayload }>();

const SQL = `
SELECT
  c.id,
  c.created_at AS at,
  sc.name AS canal,
  c.email,
  count(li.id)::int AS lignes,
  sum(li.quantity)::float AS qte,
  round(sum(li.unit_price * li.quantity), 2)::float AS total_ht,
  (array_agg(li.product_title ORDER BY li.created_at))[1] AS produit,
  CASE
    WHEN c.completed_at IS NOT NULL THEN 'commande'
    WHEN EXISTS (SELECT 1 FROM quote q WHERE q.cart_id = c.id AND q.deleted_at IS NULL) THEN 'devis'
    WHEN EXISTS (SELECT 1 FROM cart_payment_collection cpc WHERE cpc.cart_id = c.id) THEN 'paiement'
    WHEN c.shipping_address_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM cart_shipping_method sm WHERE sm.cart_id = c.id AND sm.deleted_at IS NULL) THEN 'livraison'
    WHEN c.email IS NOT NULL THEN 'identifie'
    ELSE 'panier'
  END AS etape
FROM cart c
JOIN sales_channel sc ON sc.id = c.sales_channel_id
JOIN cart_line_item li ON li.cart_id = c.id AND li.deleted_at IS NULL
WHERE c.created_at >= now() - make_interval(days => $1)
  AND c.deleted_at IS NULL
  AND (c.metadata IS NULL OR c.metadata->>'e2e' IS NULL)
  AND (c.email IS NULL OR c.email NOT ILIKE '%@elude.fr')
GROUP BY c.id, sc.name
ORDER BY c.created_at DESC
`;

interface RawRow {
  id: string;
  at: Date;
  canal: string;
  email: string | null;
  lignes: number;
  qte: number;
  total_ht: number;
  produit: string;
  etape: CartEtape;
}

export async function GET(request: Request) {
  if (!process.env.MEDUSA_DATABASE_URL) {
    return NextResponse.json({ error: "MEDUSA_DATABASE_URL non configuré" }, { status: 503 });
  }

  const daysParam = Number(new URL(request.url).searchParams.get("days") ?? "7");
  const days = ALLOWED_DAYS.has(daysParam) ? daysParam : 7;

  const cached = cache.get(days);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const { rows } = await medusaDb().query<RawRow>(SQL, [days]);
    const data: CartsLivePayload = {
      days,
      rows: rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        canal: r.canal,
        email: r.email,
        lignes: r.lignes,
        qte: r.qte,
        totalHt: r.total_ht,
        produit: r.produit ?? "—",
        etape: r.etape,
      })),
      generatedAt: new Date().toISOString(),
    };
    cache.set(days, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
