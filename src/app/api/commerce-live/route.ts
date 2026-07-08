import { NextResponse } from "next/server";

import { parisMidnightMs } from "@/lib/paris-midnight";

export const dynamic = "force-dynamic";

/**
 * Commerce temps réel pour la page TV (/tv) : CA du jour, commandes, devis.
 *
 * Source = Medusa admin API (JWT email/password, même méthode qu'elude-sync) :
 *   - GET /admin/orders?order=-created_at        → commandes (sales_channel = marque)
 *   - GET /admin/quotes?order=-created_at        → devis (module quotes custom)
 * Les montants Medusa sont en EUROS (pas en centimes — cf. memory).
 * Filtre « aujourd'hui » côté route (borne minuit Europe/Paris) : on tire les
 * 50 dernières et on filtre — plus robuste que la syntaxe created_at[$gte]
 * selon les versions. Les commandes `canceled` sont exclues du CA.
 * Cache serveur 15 s (N écrans TV = 1 fan-out). Token caché, re-login sur 401.
 */

const MEDUSA_URL = process.env.MEDUSA_URL ?? "https://medusa.elude.fr";
const MEDUSA_ADMIN_EMAIL = process.env.MEDUSA_ADMIN_EMAIL ?? "";
const MEDUSA_ADMIN_PASSWORD = process.env.MEDUSA_ADMIN_PASSWORD ?? "";

export interface TvOrder {
  displayId: number;
  brand: string;
  total: number;
  at: string;
  status: string;
}

export interface TvQuote {
  id: string;
  at: string;
  status: string | null;
}

export interface TvCommercePayload {
  caToday: number;
  ordersTodayCount: number;
  quotesTodayCount: number;
  /** Dernières commandes non annulées (desc), aujourd'hui ou pas — le feed
   *  reste vivant même un jour sans vente. */
  orders: TvOrder[];
  quotes: TvQuote[];
  /** display_id max connu — le client détecte une NOUVELLE commande dessus. */
  lastOrderId: number | null;
  generatedAt: string;
}

let cachedToken: string | null = null;
let cachedPayload: { at: number; data: TvCommercePayload } | null = null;

async function login(): Promise<string> {
  const res = await fetch(`${MEDUSA_URL}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: MEDUSA_ADMIN_EMAIL, password: MEDUSA_ADMIN_PASSWORD }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`medusa login ${res.status}`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error("medusa login: token absent");
  cachedToken = json.token;
  return json.token;
}

async function medusaGet<T>(path: string): Promise<T> {
  const token = cachedToken ?? (await login());
  const doFetch = (tok: string) =>
    fetch(`${MEDUSA_URL}${path}`, {
      // UA navigateur : le WAF Cloudflare challenge les GET server-side à UA
      // nu selon l'IP source (cf. gotcha stats.elude.fr). En prod le dashboard
      // et Medusa partagent le même hôte → passe ; l'UA couvre le reste.
      headers: {
        Authorization: `Bearer ${tok}`,
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) elude-dashboard-tv",
      },
      cache: "no-store",
    });
  let res = await doFetch(token);
  if (res.status === 401) res = await doFetch(await login());
  if (!res.ok) throw new Error(`medusa GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

interface OrdersResponse {
  orders?: Array<{
    display_id?: number;
    created_at?: string;
    total?: number;
    status?: string;
    sales_channel?: { name?: string } | null;
  }>;
}

interface QuotesResponse {
  quotes?: Array<{ id?: string; created_at?: string; status?: string | null }>;
}

async function buildPayload(): Promise<TvCommercePayload> {
  const midnight = parisMidnightMs();

  const [ordersRes, quotesRes] = await Promise.all([
    medusaGet<OrdersResponse>(
      "/admin/orders?limit=50&order=-created_at&fields=display_id,created_at,total,status,*sales_channel",
    ),
    medusaGet<QuotesResponse>("/admin/quotes?limit=50&order=-created_at").catch((): QuotesResponse => ({ quotes: [] })),
  ]);

  const valid = (ordersRes.orders ?? []).filter((o) => o.status !== "canceled" && o.created_at);
  const orders: TvOrder[] = valid.map((o) => ({
    displayId: o.display_id ?? 0,
    brand: o.sales_channel?.name ?? "—",
    total: o.total ?? 0,
    at: o.created_at as string,
    status: o.status ?? "",
  }));
  const today = orders.filter((o) => new Date(o.at).getTime() >= midnight);

  const quotesAll: TvQuote[] = (quotesRes.quotes ?? [])
    .filter((q) => q.created_at)
    .map((q) => ({ id: q.id ?? "", at: q.created_at as string, status: q.status ?? null }));
  const quotesToday = quotesAll.filter((q) => new Date(q.at).getTime() >= midnight);

  return {
    caToday: today.reduce((s, o) => s + o.total, 0),
    ordersTodayCount: today.length,
    quotesTodayCount: quotesToday.length,
    orders: orders.slice(0, 6),
    quotes: quotesAll.slice(0, 4),
    lastOrderId: orders.length > 0 ? Math.max(...orders.map((o) => o.displayId)) : null,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  if (!MEDUSA_ADMIN_EMAIL || !MEDUSA_ADMIN_PASSWORD) {
    return NextResponse.json({ error: "MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD non configurés" }, { status: 503 });
  }
  if (cachedPayload && Date.now() - cachedPayload.at < 15_000) {
    return NextResponse.json(cachedPayload.data);
  }
  try {
    const data = await buildPayload();
    cachedPayload = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
