"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Loader2, RefreshCw, ShoppingCart } from "lucide-react";

import type { CartEtape, CartsLivePayload } from "@/app/api/carts-live/route";
import { CommerceStatsPanel } from "@/components/elude/CommerceStatsPanel";

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Jour calendaire `YYYY-MM-DD` en heure de Paris.
 *
 * 🪤 Doit correspondre EXACTEMENT au découpage de `/api/commerce-stats`, qui
 * groupe en `AT TIME ZONE 'Europe/Paris'`. Un `toISOString().slice(0,10)`
 * découperait en UTC : une commande passée à 01 h du matin en été tomberait la
 * veille et le clic ne la trouverait jamais.
 */
function jourParis(iso: string | null): string | null {
  if (!iso) return null;
  // `en-CA` rend nativement AAAA-MM-JJ.
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

/** Plus petite fenêtre servie par l'API qui couvre un jour donné. */
function fenetrePour(jour: string): number {
  const ecart = (Date.now() - new Date(`${jour}T12:00:00`).getTime()) / 86_400_000;
  return [1, 7, 30, 90].find((d) => d >= ecart + 1) ?? 90;
}

const ETAPES: CartEtape[] = ["panier", "identifie", "livraison", "paiement", "devis", "commande"];

const ETAPE_META: Record<CartEtape, { label: string; chip: string; dot: string }> = {
  panier: {
    label: "Panier",
    chip: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  identifie: {
    label: "Identifié",
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  livraison: {
    label: "Livraison",
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  paiement: {
    label: "Paiement",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  devis: {
    label: "Devis →",
    chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
    dot: "bg-teal-500",
  },
  commande: {
    label: "Commande ✓",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
};

const WINDOWS: Array<{ days: number; label: string }> = [
  { days: 1, label: "Aujourd'hui" },
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
];

const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Tile({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className={`font-bold text-2xl tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
      <div className="mt-0.5 text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function Chip({ etape }: { etape: CartEtape }) {
  const meta = ETAPE_META[etape];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 font-semibold text-[11px] ${meta.chip}`}>
      {meta.label}
    </span>
  );
}

export default function PaniersClient() {
  const [days, setDays] = useState(7);
  const [payload, setPayload] = useState<CartsLivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fCanal, setFCanal] = useState("");
  const [fEtape, setFEtape] = useState("");
  const [fSource, setFSource] = useState("");
  const [fQ, setFQ] = useState("");
  /** Jour `YYYY-MM-DD` sélectionné en cliquant une barre du graphe CA. */
  const [fJour, setFJour] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"at" | "totalHt">("at");
  const [sortDir, setSortDir] = useState<-1 | 1>(-1);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/carts-live?days=${d}`, { cache: "no-store" });
      const json = (await res.json()) as CartsLivePayload | { error: string };
      if (!res.ok || "error" in json) throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      setPayload(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
    const id = setInterval(() => void load(days), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [days, load]);

  const rows = useMemo(() => payload?.rows ?? [], [payload]);
  const canaux = useMemo(() => [...new Set(rows.map((r) => r.canal))].sort(), [rows]);

  const stats = useMemo(() => {
    const commandes = rows.filter((r) => r.etape === "commande");
    const relance = rows.filter((r) => r.email && r.etape !== "commande" && r.etape !== "devis");
    return {
      total: rows.length,
      commandes: commandes.length,
      taux: rows.length > 0 ? Math.round((100 * commandes.length) / rows.length) : 0,
      htPanier: rows.reduce((s, r) => s + r.totalHt, 0),
      htConverti: commandes.reduce((s, r) => s + r.totalHt, 0),
      devis: rows.filter((r) => r.etape === "devis").length,
      relance: relance.length,
    };
  }, [rows]);

  const perEtape = useMemo(
    () => ETAPES.map((e) => ({ etape: e, count: rows.filter((r) => r.etape === e).length })),
    [rows],
  );
  const maxEtape = Math.max(1, ...perEtape.map((x) => x.count));

  const perCanal = useMemo(
    () =>
      canaux
        .map((c) => {
          const cRows = rows.filter((r) => r.canal === c);
          return { canal: c, total: cRows.length, conv: cRows.filter((r) => r.etape === "commande").length };
        })
        .sort((a, b) => b.total - a.total),
    [rows, canaux],
  );
  const maxCanal = Math.max(1, ...perCanal.map((x) => x.total));

  const filtered = useMemo(() => {
    const q = fQ.toLowerCase();
    const out = rows.filter(
      (r) =>
        (!fCanal || r.canal === fCanal) &&
        (!fEtape || r.etape === fEtape) &&
        (!fSource || r.source === fSource) &&
        (!fJour || jourParis(r.commandeAt) === fJour) &&
        (!q || (r.email ?? "").toLowerCase().includes(q) || r.produit.toLowerCase().includes(q)),
    );
    return [...out].sort((a, b) => {
      const ka = sortKey === "at" ? a.at : a.totalHt;
      const kb = sortKey === "at" ? b.at : b.totalHt;
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * sortDir;
    });
  }, [rows, fCanal, fEtape, fSource, fJour, fQ, sortKey, sortDir]);

  /**
   * Clic sur une barre du graphe CA. Re-cliquer le même jour désélectionne.
   *
   * 🪤 Le graphe couvre tout l'historique, la liste seulement `days`. Cliquer le
   * 20/08 alors que la fenêtre est à 7 jours donnerait une liste VIDE sans rien
   * expliquer : on élargit donc la fenêtre à la plus petite qui couvre ce jour.
   */
  const choisirJour = useCallback(
    (jour: string) => {
      if (fJour === jour) {
        setFJour(null);
        return;
      }
      const besoin = fenetrePour(jour);
      if (besoin > days) setDays(besoin);
      setFJour(jour);
    },
    [fJour, days],
  );

  const toggleSort = (key: "at" | "totalHt") => {
    setSortDir(sortKey === key ? (d) => (d === -1 ? 1 : -1) : () => -1);
    setSortKey(key);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" aria-hidden />
          <h1 className="font-bold text-2xl">Paniers</h1>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                type="button"
                onClick={() => setDays(w.days)}
                className={`rounded-md px-3 py-1 text-sm ${
                  days === w.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(days)}
            className="rounded-lg border p-2 text-muted-foreground hover:text-foreground"
            aria-label="Rafraîchir"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <p className="max-w-3xl text-muted-foreground text-sm">
        Paniers réels Medusa prod (e2e et emails internes exclus). L&apos;étape est la dernière franchie —{" "}
        <strong>Devis →</strong> = une demande de devis est partie de ce panier.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-4 text-red-700 text-sm dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Tile value={String(stats.total)} label="paniers" />
        <Tile value={String(stats.commandes)} label="commandes" />
        <Tile value={`${stats.taux} %`} label="taux de conversion" accent />
        <Tile value={eur(stats.htPanier)} label="HT mis au panier" />
        <Tile value={eur(stats.htConverti)} label="HT convertis" />
        <Tile value={String(stats.devis)} label="devis en cours" />
        <Tile value={String(stats.relance)} label="identifiés à relancer" />
      </div>

      <CommerceStatsPanel onJourClick={choisirJour} jourActif={fJour} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">Étape atteinte</h2>
          <div className="space-y-2">
            {perEtape.map(({ etape, count }) => (
              <div key={etape} className="grid grid-cols-[110px_1fr_44px] items-center gap-2">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <span className={`h-2 w-2 rounded-sm ${ETAPE_META[etape].dot}`} aria-hidden />
                  {ETAPE_META[etape].label}
                </span>
                <div className="relative h-4 rounded bg-muted">
                  <div
                    className={`absolute inset-y-0 left-0 min-w-0.5 rounded ${etape === "commande" ? "bg-emerald-500" : "bg-primary/70"}`}
                    style={{ width: `${(100 * count) / maxEtape}%` }}
                  />
                </div>
                <span className="text-right text-sm tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            Par canal — paniers et commandes
          </h2>
          <div className="space-y-3">
            {perCanal.map(({ canal, total, conv }) => (
              <div key={canal}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span>{canal}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {total} → {conv} ({total > 0 ? Math.round((100 * conv) / total) : 0} %)
                  </span>
                </div>
                <div className="space-y-0.5">
                  <div className="relative h-2 rounded bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 min-w-0.5 rounded bg-primary/70"
                      style={{ width: `${(100 * total) / maxCanal}%` }}
                    />
                  </div>
                  <div className="relative h-2 rounded bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 min-w-0.5 rounded bg-emerald-500"
                      style={{ width: `${(100 * conv) / maxCanal}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {fJour && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 border-dashed bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <span className="text-muted-foreground">Commandes du</span>
          <span className="font-medium">
            {new Date(`${fJour}T12:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <span className="text-muted-foreground">
            — {filtered.length} ligne{filtered.length > 1 ? "s" : ""} dans la liste ci-dessous
          </span>
          {/* Les panneaux « Étape atteinte » et « Par canal » restent sur la
              fenêtre entière, et c'est voulu : ils décrivent des PANIERS, dont
              la plupart n'ont jamais de date de commande. Les filtrer par jour
              de commande les viderait au lieu de les préciser. Le dire, plutôt
              que de laisser croire à un filtre global qui ne mord pas. */}
          <span className="text-muted-foreground text-xs italic">(les compteurs du haut restent sur {days} j)</span>
          <button
            type="button"
            onClick={() => setFJour(null)}
            className="ml-auto rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Tout réafficher
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={fCanal}
          onChange={(e) => setFCanal(e.target.value)}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm"
          aria-label="Filtrer par canal"
        >
          <option value="">Tous canaux</option>
          {canaux.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={fEtape}
          onChange={(e) => setFEtape(e.target.value)}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm"
          aria-label="Filtrer par étape"
        >
          <option value="">Toutes étapes</option>
          {ETAPES.map((e) => (
            <option key={e} value={e}>
              {ETAPE_META[e].label}
            </option>
          ))}
        </select>
        <select
          value={fSource}
          onChange={(e) => setFSource(e.target.value)}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm"
          aria-label="Filtrer par source"
        >
          <option value="">Ads + site</option>
          <option value="ads">Ads</option>
          <option value="site">Site</option>
        </select>
        <input
          type="search"
          value={fQ}
          onChange={(e) => setFQ(e.target.value)}
          placeholder="Chercher email ou produit…"
          className="min-w-52 flex-1 rounded-lg border bg-card px-3 py-1.5 text-sm"
          aria-label="Recherche"
        />
        <span className="ml-auto text-muted-foreground text-sm tabular-nums">
          {filtered.length} / {rows.length} paniers
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
              <th className="cursor-pointer select-none px-3 py-2.5" onClick={() => toggleSort("at")}>
                Date {sortKey === "at" ? (sortDir === -1 ? "↓" : "↑") : ""}
              </th>
              <th className="px-3 py-2.5">Canal</th>
              <th className="px-3 py-2.5">Produit</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Src</th>
              <th className="px-3 py-2.5 text-right">Qté</th>
              <th className="cursor-pointer select-none px-3 py-2.5 text-right" onClick={() => toggleSort("totalHt")}>
                Total HT {sortKey === "totalHt" ? (sortDir === -1 ? "↓" : "↑") : ""}
              </th>
              <th className="px-3 py-2.5">Étape</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/40">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums">
                  {dateFmt.format(new Date(r.at))}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{r.canal.replace("Pro ", "P. ")}</td>
                <td className="max-w-80 px-3 py-2">
                  {r.produit}
                  {r.lignes > 1 && <span className="text-muted-foreground text-xs"> +{r.lignes - 1} art.</span>}
                </td>
                <td className="max-w-52 truncate px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.source === "ads" ? (
                    <span
                      title={r.clickType ?? undefined}
                      className="inline-block rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-[11px] text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                    >
                      Ads
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.qte}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {r.totalHt.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Chip etape={r.etape} />
                  {r.cp && <span className="ml-1.5 text-muted-foreground text-xs tabular-nums">{r.cp}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {payload && (
        <p className="text-muted-foreground text-xs">
          Actualisé {dateFmt.format(new Date(payload.generatedAt))} · auto-refresh 60 s · fenêtre {payload.days} j
        </p>
      )}
    </div>
  );
}
