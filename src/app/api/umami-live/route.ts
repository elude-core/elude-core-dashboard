import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Agrégateur temps réel Umami pour la page TV (/tv).
 *
 * Fan-out serveur vers les 8 websites Umami (self-hosted stats.elude.fr) :
 *   - GET /api/websites/{id}/active     → visiteurs actifs (5 dernières min)
 *   - GET /api/realtime/{id}            → 30 dernières min (events, pays, séries)
 *   - GET /api/websites/{id}/stats      → totaux du jour (vues / visiteurs)
 * puis agrège en un seul payload consommé par useUmamiLive (SWR 15 s).
 *
 * Auth Umami : POST /api/auth/login → bearer token, caché en mémoire module
 * (re-login automatique sur 401). Réponse cachée 10 s côté serveur pour
 * dédupliquer plusieurs écrans TV.
 *
 * ⚠️ L'instance répond `{"beep":"boop"}` aux User-Agents type curl/fetch nu →
 * toujours envoyer un UA navigateur (cf. memory umami 08/07).
 */

const UMAMI_URL = process.env.UMAMI_URL ?? "https://stats.elude.fr";
const UMAMI_USERNAME = process.env.UMAMI_USERNAME ?? "";
const UMAMI_PASSWORD = process.env.UMAMI_PASSWORD ?? "";
const TIMEZONE = "Europe/Paris";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) elude-dashboard-tv";

/** Les 8 propriétés Umami (créées 08/07/2026, cf. memory umami). */
const WEBSITES = [
  { key: "pro-rogneuses", label: "Rogneuses", id: "c24b594b-c431-4b2a-8d81-762f234afadb" },
  { key: "pro-massicots", label: "Massicots", id: "17217c0f-9eec-40f1-b748-b9505803eb0b" },
  { key: "pro-cisailles", label: "Cisailles", id: "e9377200-963d-46fe-a8d7-bbce8f434b79" },
  { key: "pro-destructeurs", label: "Destructeurs", id: "a96ce736-ebc2-485d-b1ae-5ae6e1972bc2" },
  { key: "pro-plastifieuses", label: "Plastifieuses", id: "d4201dd1-f91e-4c6b-a8e8-0b441cfd80c6" },
  { key: "pro-agrafeuses", label: "Agrafeuses", id: "6ed65a24-ce02-42cd-8fe5-c9f328b35e2a" },
  { key: "pro-machines-a-relier", label: "Relieuses", id: "d015be1a-ce17-49d7-9385-4d16e2ea8e2d" },
  { key: "wynstor", label: "Wynstor", id: "baba4724-a844-4cbb-8a72-9c9ffb8aa6e7" },
] as const;

export interface TvSite {
  key: string;
  label: string;
  /** Visiteurs actifs (fenêtre 5 min Umami). */
  active: number;
  /** 30 dernières minutes. */
  views30m: number;
  visitors30m: number;
  /** Depuis minuit (Europe/Paris). */
  viewsToday: number;
  visitorsToday: number;
}

export interface TvEvent {
  site: string;
  siteLabel: string;
  path: string;
  country: string | null;
  browser: string | null;
  device: string | null;
  at: string;
}

export interface TvLivePayload {
  totalActive: number;
  views30m: number;
  visitors30m: number;
  viewsToday: number;
  visitorsToday: number;
  /** ISO2 → visiteurs (30 min, tous sites). */
  countries: Record<string, number>;
  /** ISO2 → sessions ACTIVES (events ≤ 5 min) — aligne les dots brillants de
   *  la map sur la fenêtre « en ligne » ; le 30 min = trace estompée. */
  countriesActive: Record<string, number>;
  /** Villes (metrics Umami, fenêtre 30 min / 5 min) — pour des dots précis ;
   *  ville sans coordonnées connues → repli sur le dot pays côté map. */
  cities: Array<{ city: string; country: string | null; n: number }>;
  citiesActive: Array<{ city: string; country: string | null; n: number }>;
  sites: TvSite[];
  /** Dernières pages vues tous sites confondus (desc). */
  feed: TvEvent[];
  /** Vues par minute agrégées (30 min) pour la sparkline. */
  series: Array<{ t: string; views: number }>;
  generatedAt: string;
}

let cachedToken: string | null = null;
let cachedPayload: { at: number; data: TvLivePayload } | null = null;

async function login(): Promise<string> {
  const res = await fetch(`${UMAMI_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ username: UMAMI_USERNAME, password: UMAMI_PASSWORD }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`umami login ${res.status}`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error("umami login: token absent");
  cachedToken = json.token;
  return json.token;
}

async function umamiGet<T>(path: string): Promise<T> {
  const token = cachedToken ?? (await login());
  const doFetch = (tok: string) =>
    fetch(`${UMAMI_URL}${path}`, {
      headers: { Authorization: `Bearer ${tok}`, "User-Agent": UA },
      cache: "no-store",
    });
  let res = await doFetch(token);
  if (res.status === 401) {
    // token expiré → re-login une fois
    res = await doFetch(await login());
  }
  if (!res.ok) throw new Error(`umami GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** /stats a changé de forme selon les versions d'Umami : nombres à PLAT
 *  (`{"pageviews":9}`, vérifié sur notre instance 09/07) vs enveloppés
 *  (`{"pageviews":{"value":9}}`, anciennes v2). On accepte les deux. */
interface StatsResponse {
  pageviews?: number | { value?: number };
  visitors?: number | { value?: number };
}

function statNum(v: number | { value?: number } | undefined): number {
  if (typeof v === "number") return v;
  return v?.value ?? 0;
}

interface RealtimeResponse {
  countries?: Record<string, number>;
  events?: Array<{
    __type?: string;
    createdAt?: string;
    sessionId?: string;
    country?: string | null;
    browser?: string | null;
    device?: string | null;
    urlPath?: string | null;
    eventName?: string | null;
  }>;
  series?: { views?: Array<{ x: string; y: number }> };
  totals?: { views?: number; visitors?: number };
}

/** Minuit Europe/Paris en epoch ms (approx DST-safe via Intl). */
function parisMidnightMs(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsedMs = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return now.getTime() - elapsedMs;
}

async function buildPayload(): Promise<TvLivePayload> {
  const startToday = parisMidnightMs();
  const endNow = Date.now();

  type CityMetric = { x?: string | null; y?: number; country?: string | null };
  const perSite = await Promise.all(
    WEBSITES.map(async (w) => {
      const [active, realtime, today, cities30, cities5] = await Promise.all([
        umamiGet<{ visitors?: number }>(`/api/websites/${w.id}/active`).catch(() => ({ visitors: 0 })),
        umamiGet<RealtimeResponse>(`/api/realtime/${w.id}?timezone=${encodeURIComponent(TIMEZONE)}`).catch(
          () => ({}) as RealtimeResponse,
        ),
        umamiGet<StatsResponse>(`/api/websites/${w.id}/stats?startAt=${startToday}&endAt=${endNow}`).catch(
          (): StatsResponse => ({}),
        ),
        umamiGet<CityMetric[]>(
          `/api/websites/${w.id}/metrics?type=city&startAt=${endNow - 1_800_000}&endAt=${endNow}`,
        ).catch((): CityMetric[] => []),
        umamiGet<CityMetric[]>(
          `/api/websites/${w.id}/metrics?type=city&startAt=${endNow - 300_000}&endAt=${endNow}`,
        ).catch((): CityMetric[] => []),
      ]);
      return { w, active: active.visitors ?? 0, realtime, today, cities30, cities5 };
    }),
  );

  // Agrégation villes cross-sites (clé pays|ville)
  const cityAgg = (rows: CityMetric[][]): Array<{ city: string; country: string | null; n: number }> => {
    const m = new Map<string, { city: string; country: string | null; n: number }>();
    for (const list of rows) {
      for (const r of list) {
        if (!r.x) continue;
        const key = `${r.country ?? ""}|${r.x}`;
        const cur = m.get(key);
        if (cur) cur.n += r.y ?? 0;
        else m.set(key, { city: r.x, country: r.country ?? null, n: r.y ?? 0 });
      }
    }
    return Array.from(m.values());
  };

  const countries: Record<string, number> = {};
  // sessions uniques par pays sur les 5 dernières minutes (fenêtre « active »)
  const activeSessions = new Map<string, Set<string>>();
  const activeCutoff = Date.now() - 5 * 60 * 1000;
  const feed: TvEvent[] = [];
  const seriesAgg = new Map<string, number>();
  const sites: TvSite[] = [];
  let totalActive = 0;
  let views30m = 0;
  let visitors30m = 0;
  let viewsToday = 0;
  let visitorsToday = 0;

  for (const { w, active, realtime, today } of perSite) {
    totalActive += active;
    views30m += realtime.totals?.views ?? 0;
    visitors30m += realtime.totals?.visitors ?? 0;
    const tvToday = statNum(today.pageviews);
    const tvVisitors = statNum(today.visitors);
    viewsToday += tvToday;
    visitorsToday += tvVisitors;

    for (const [iso, n] of Object.entries(realtime.countries ?? {})) {
      countries[iso] = (countries[iso] ?? 0) + n;
    }
    for (const pt of realtime.series?.views ?? []) {
      seriesAgg.set(pt.x, (seriesAgg.get(pt.x) ?? 0) + pt.y);
    }
    for (const e of realtime.events ?? []) {
      if (e.__type !== "pageview" || !e.createdAt) continue;
      if (e.country && new Date(e.createdAt).getTime() >= activeCutoff) {
        const iso = e.country.toUpperCase();
        if (!activeSessions.has(iso)) activeSessions.set(iso, new Set());
        activeSessions.get(iso)?.add(e.sessionId ?? `${w.key}-${e.createdAt}`);
      }
      feed.push({
        site: w.key,
        siteLabel: w.label,
        path: e.urlPath ?? "/",
        country: e.country ?? null,
        browser: e.browser ?? null,
        device: e.device ?? null,
        at: e.createdAt,
      });
    }
    sites.push({
      key: w.key,
      label: w.label,
      active,
      views30m: realtime.totals?.views ?? 0,
      visitors30m: realtime.totals?.visitors ?? 0,
      viewsToday: tvToday,
      visitorsToday: tvVisitors,
    });
  }

  feed.sort((a, b) => (a.at < b.at ? 1 : -1));
  const series = Array.from(seriesAgg.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([t, views]) => ({ t, views }));

  return {
    totalActive,
    views30m,
    visitors30m,
    viewsToday,
    visitorsToday,
    countries,
    countriesActive: Object.fromEntries(Array.from(activeSessions.entries()).map(([iso, s]) => [iso, s.size])),
    cities: cityAgg(perSite.map((s) => s.cities30)),
    citiesActive: cityAgg(perSite.map((s) => s.cities5)),
    sites,
    feed: feed.slice(0, 18),
    series,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  if (!UMAMI_USERNAME || !UMAMI_PASSWORD) {
    return NextResponse.json({ error: "UMAMI_USERNAME / UMAMI_PASSWORD non configurés" }, { status: 503 });
  }
  // Cache serveur 10 s : plusieurs TV / onglets = 1 seul fan-out Umami.
  if (cachedPayload && Date.now() - cachedPayload.at < 10_000) {
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
