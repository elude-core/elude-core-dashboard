"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Loader2, RefreshCw, ShoppingCart } from "lucide-react";

import type { CartEtape, CartRow, CartsLivePayload } from "@/app/api/carts-live/route";
import { AffluenceHeatmap } from "@/components/elude/AffluenceHeatmap";
import { CommerceStatsPanel } from "@/components/elude/CommerceStatsPanel";
import { bascule, type Creneau, creneauVide, dansCreneau, libelleCreneau, versMatrice } from "@/lib/affluence";

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

/**
 * Instant qui situe une ligne dans le temps : celui de l'ÉTAPE ATTEINTE, pas
 * celui de l'ouverture du panier.
 *
 * 🪤 Prendre `at` pour tout le monde rangerait une commande à l'heure où le
 * panier a été ouvert. Mesuré le 07/09 : 27 paniers convertis sur 99 changent
 * d'heure entre les deux, et l'écart va de 7 minutes (médiane) à 25 jours. Le
 * damier des créneaux se lirait alors comme « quand les gens ouvrent un
 * panier », en prétendant dire « quand ils commandent ».
 */
function instantEtape(r: CartRow): string {
  return r.commandeAt ?? r.devisAt ?? r.at;
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

function Tile({
  value,
  label,
  accent,
  hint,
}: {
  value: string;
  label: string;
  accent?: boolean;
  /** Précision au survol — sert aux tuiles dont le chiffre seul peut se lire
   *  de travers (ex. « — » parce que rien n'est encore mesuré). */
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4" title={hint}>
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

/**
 * `device_type` vient de `userAgent()` de Next, dont le vocabulaire est
 * anglais et technique. On l'affiche en clair — la colonne est lue par des
 * humains, pas par un script.
 *
 * `ordinateur` est posé explicitement par le storefront : cette bibliothèque
 * rend une valeur VIDE pour un desktop, et une case vide se lirait comme une
 * donnée manquante.
 */
const LIBELLE_APPAREIL: Record<string, string> = {
  mobile: "Mobile",
  tablet: "Tablette",
  ordinateur: "Ordinateur",
  console: "Console",
  smarttv: "TV",
  wearable: "Montre",
  embedded: "Embarqué",
};

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
  /** Case, ligne ou colonne sélectionnée dans le damier des créneaux. */
  const [fCreneau, setFCreneau] = useState<Creneau | null>(null);
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
  /** `null` = mesure inexistante OU payload pas encore chargé — les deux se
   *  rendent pareil (« — »), aucun des deux n'est un zéro. */
  const xsellDepuis = payload?.xsellDepuis ?? null;
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
      // Cross-sell : ce que les suggestions ajoutent VRAIMENT, en euros. GA4
      // compte l'événement d'ajout ; ici on a le montant, et sans dépendre du
      // consentement cookies.
      htXsell: rows.reduce((s, r) => s + r.caXsell, 0),
      paniersXsell: rows.filter((r) => r.lignesXsell > 0).length,
    };
  }, [rows]);

  /**
   * Filtrage en FACETTES : chaque panneau applique tous les filtres actifs SAUF
   * le sien.
   *
   * 🪤 Une facette qui se filtre elle-même s'auto-détruit : sélectionner l'étape
   * « Devis » mettrait les cinq autres barres à zéro, et on ne pourrait plus
   * cliquer ailleurs pour changer d'avis. Chaque panneau doit donc voir le monde
   * tel qu'il serait SANS sa propre sélection — c'est ce que `sauf` exprime.
   *
   * ── Le filtre JOUR vaut « ce qui s'est passé ce jour-là » ───────────────────
   *
   * Panier ouvert ce jour OU commande passée ce jour. Filtrer sur la seule date
   * de commande effondrerait l'entonnoir : seule l'étape « Commande » serait non
   * nulle, les cinq autres à zéro — un entonnoir qui ne montre plus d'entonnoir.
   *
   * ⚠️ Conséquence assumée : la liste peut afficher PLUS de lignes que le nombre
   * de commandes de la barre cliquée, puisqu'elle inclut les paniers ouverts ce
   * jour-là qui n'ont pas converti. C'est précisément ce qu'on veut voir en
   * analysant un pic, mais ça interdit de lire « lignes » comme « commandes ».
   */
  const passe = useCallback(
    (r: CartRow, sauf?: "canal" | "etape" | "source" | "creneau") => {
      const q = fQ.toLowerCase();
      return (
        (sauf === "canal" || !fCanal || r.canal === fCanal) &&
        (sauf === "etape" || !fEtape || r.etape === fEtape) &&
        (sauf === "source" || !fSource || r.source === fSource) &&
        (sauf === "creneau" || dansCreneau(instantEtape(r), fCreneau)) &&
        (!fJour || jourParis(r.commandeAt) === fJour || jourParis(r.at) === fJour) &&
        (!q || (r.email ?? "").toLowerCase().includes(q) || r.produit.toLowerCase().includes(q))
      );
    },
    [fCanal, fEtape, fSource, fJour, fQ, fCreneau],
  );

  const perEtape = useMemo(() => {
    const base = rows.filter((r) => passe(r, "etape"));
    return ETAPES.map((e) => ({ etape: e, count: base.filter((r) => r.etape === e).length }));
  }, [rows, passe]);
  const maxEtape = Math.max(1, ...perEtape.map((x) => x.count));

  const perCanal = useMemo(() => {
    const base = rows.filter((r) => passe(r, "canal"));
    return canaux
      .map((c) => {
        const cRows = base.filter((r) => r.canal === c);
        return { canal: c, total: cRows.length, conv: cRows.filter((r) => r.etape === "commande").length };
      })
      .sort((a, b) => b.total - a.total);
  }, [rows, canaux, passe]);
  const maxCanal = Math.max(1, ...perCanal.map((x) => x.total));

  /** Le damier voit le monde SANS sa propre sélection, comme les autres facettes. */
  const perCreneau = useMemo(
    () => versMatrice(rows.filter((r) => passe(r, "creneau")).map(instantEtape)),
    [rows, passe],
  );

  /**
   * Ce qu'une case du damier compte. Suit le filtre d'étape : sans lui, ce sont
   * des paniers — et le dire évite de lire « 27 » comme 27 commandes.
   */
  const libelleCreneaux = fEtape
    ? `${ETAPE_META[fEtape as CartEtape].label.replace(/[→✓]/g, "").trim().toLowerCase()}s`
    : "paniers";

  const filtered = useMemo(() => {
    const out = rows.filter((r) => passe(r));
    return [...out].sort((a, b) => {
      const ka = sortKey === "at" ? a.at : a.totalHt;
      const kb = sortKey === "at" ? b.at : b.totalHt;
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * sortDir;
    });
  }, [rows, passe, sortKey, sortDir]);

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Tile value={String(stats.total)} label="paniers" />
        <Tile value={String(stats.commandes)} label="commandes" />
        <Tile value={`${stats.taux} %`} label="taux de conversion" accent />
        <Tile value={eur(stats.htPanier)} label="HT mis au panier" />
        <Tile value={eur(stats.htConverti)} label="HT convertis" />
        <Tile value={String(stats.devis)} label="devis en cours" />
        <Tile value={String(stats.relance)} label="identifiés à relancer" />
        {/* Cross-sell. Tant qu'aucune ligne n'a jamais porté de surface
            (`xsellDepuis` null), on affiche « — » et non « 0 € » : un zéro
            dirait que les suggestions ne rapportent rien, alors que la mesure
            n'existe simplement pas encore. Une fois la mesure vivante, un vrai
            0 € sur la fenêtre est une information, et il s'affiche. */}
        {xsellDepuis ? (
          <Tile
            value={eur(stats.htXsell)}
            label="HT via suggestions"
            hint={`${stats.paniersXsell} panier(s) de la fenêtre contiennent au moins une ligne ajoutée depuis un bloc « Souvent achetés ensemble ». Mesuré depuis le ${dateFmt.format(new Date(xsellDepuis))}.`}
          />
        ) : (
          <Tile
            value="—"
            label="HT via suggestions"
            hint="Aucune ligne de panier ne porte encore de surface : storefront#1219 n'est pas en production. Ce n'est pas un zéro."
          />
        )}
      </div>

      <CommerceStatsPanel onJourClick={choisirJour} jourActif={fJour} />

      {/* Colonne large (2/3) : l'entonnoir, puis le damier des heures — les deux
          se lisent l'un sous l'autre. Le « par canal » garde sa colonne à droite. */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* 🪤 `min-w-0` : un item de grille vaut `min-width: auto`, donc il
            s'élargit au contenu. Sans lui, le `min-w-[560px]` du damier pousse
            la colonne à 594 px et c'est la PAGE ENTIÈRE qui défile de côté sur
            mobile — pas le damier dans son cadre. Mesuré : 626 px de large pour
            un écran de 390. */}
        <div className="min-w-0 space-y-3 lg:col-span-2">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">Étape atteinte</h2>
            <div className="space-y-2">
              {perEtape.map(({ etape, count }) => {
                const actif = fEtape === etape;
                return (
                  <button
                    key={etape}
                    type="button"
                    aria-pressed={actif}
                    onClick={() => setFEtape(actif ? "" : etape)}
                    title={actif ? "Cliquer pour retirer le filtre" : `Filtrer sur « ${ETAPE_META[etape].label} »`}
                    className={`grid w-full grid-cols-[110px_1fr_44px] items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/60 ${
                      actif ? "bg-muted" : ""
                    } ${fEtape && !actif ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`flex items-center gap-2 text-sm ${actif ? "font-medium text-foreground" : "text-muted-foreground"}`}
                    >
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
                  </button>
                );
              })}
            </div>
          </div>

          <AffluenceHeatmap
            matrice={perCreneau}
            libelle={libelleCreneaux}
            fenetreJours={days}
            selection={fCreneau}
            onSelect={(c) => setFCreneau(bascule(fCreneau, c))}
          />
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            Par canal — paniers et commandes
          </h2>
          <div className="space-y-3">
            {perCanal.map(({ canal, total, conv }) => {
              const actif = fCanal === canal;
              return (
                <button
                  key={canal}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => setFCanal(actif ? "" : canal)}
                  title={actif ? "Cliquer pour retirer le filtre" : `Filtrer sur « ${canal} »`}
                  className={`w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/60 ${
                    actif ? "bg-muted" : ""
                  } ${fCanal && !actif ? "opacity-50" : ""}`}
                >
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className={actif ? "font-medium" : undefined}>{canal}</span>
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
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {fJour && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 border-dashed bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <span className="text-muted-foreground">Activité du</span>
          <span className="font-medium">
            {new Date(`${fJour}T12:00:00`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <span className="text-muted-foreground">
            — {filtered.length} panier{filtered.length > 1 ? "s" : ""} ouvert{filtered.length > 1 ? "s" : ""} ou
            commandé{filtered.length > 1 ? "s" : ""} ce jour-là
          </span>
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
        {!creneauVide(fCreneau) && fCreneau && (
          <button
            type="button"
            onClick={() => setFCreneau(null)}
            title="Retirer le filtre de créneau"
            className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm hover:bg-primary/20"
          >
            {libelleCreneau(fCreneau)} ✕
          </button>
        )}
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
              <th className="px-3 py-2.5">Appareil</th>
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
                  {/* Combien de ces articles viennent d'une suggestion. Discret
                      (même taille que « +N art. ») : c'est une précision de
                      lecture sur la ligne, le total vit dans la tuile. */}
                  {r.lignesXsell > 0 && (
                    <span
                      className="text-emerald-700 text-xs dark:text-emerald-400"
                      // Deux décimales, comme la colonne Total HT juste à
                      // droite : `eur()` arrondit à l'euro, ce qui convient à
                      // un cumul de tuile mais fausserait une ligne à 8,90 €.
                      title={`${r.lignesXsell} ligne(s) ajoutée(s) depuis « Souvent achetés ensemble », soit ${r.caXsell.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € HT`}
                    >
                      {" "}
                      dont {r.lignesXsell} suggéré{r.lignesXsell > 1 ? "s" : ""}
                    </span>
                  )}
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
                <td className="whitespace-nowrap px-3 py-2">
                  {/* ⚠️ `null` = panier ANTÉRIEUR à la capture (storefront#1189),
                      pas un appareil inconnu. Le tiret le dit sans mentir. */}
                  {r.device ? (
                    <span title={[r.deviceOs, r.surface].filter(Boolean).join(" · ") || undefined}>
                      {LIBELLE_APPAREIL[r.device] ?? r.device}
                      {r.deviceOs && <span className="ml-1 text-muted-foreground text-xs">{r.deviceOs}</span>}
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
