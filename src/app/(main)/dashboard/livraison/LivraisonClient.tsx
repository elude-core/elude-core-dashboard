"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Loader2, RefreshCw, Truck } from "lucide-react";

import type { LigneLivraison, LivraisonPayload, StatutLivraison } from "@/app/api/livraison/route";

/**
 * Frais de port : qui les voit, qui repart, ce qui reste en plan.
 *
 * ── Pourquoi cet écran ne conclut pas ───────────────────────────────────────
 *
 * La question posée est « quel taux d'abandon à cause des 14,40 € de port ».
 * Aucune donnée ne porte la raison d'un départ, et la seule comparaison
 * honnête — les deux bandes qui se touchent au seuil du franco — repose
 * aujourd'hui sur une trentaine de paniers de chaque côté. Un écran qui
 * afficherait « X % d'abandon dus au port » inventerait une causalité.
 *
 * Il montre des faits, avec leurs effectifs à côté de chaque taux, et dit
 * lui-même quand un chiffre est trop maigre pour trancher.
 *
 * ── 🪤 Tout se calcule sur la SÉLECTION, tuiles comprises ───────────────────
 *
 * Les agrégats venaient du serveur et portaient sur tout, pendant que le
 * tableau montrait une sélection : deux vérités dans le même écran, la plus
 * fausse en gros caractères. Tout est donc recalculé ici, sur les lignes qui
 * passent les filtres.
 *
 * ── 🪤 …sauf le MONTANT et le STATUT, qui sont ce qu'on compare ─────────────
 *
 * Le franco s'applique dès 200 € HT : filtrer sur 50-200 € vide mécaniquement
 * la colonne « franco ». Et filtrer sur « Arrêté » retire toute commande de la
 * population — vu à l'écran avant correction, la tuile annonçait « 93 paniers
 * ont vu le port payant, 0 ont commandé » et « 95 % repartent ».
 *
 * Les tuiles de comparaison, les bandes du seuil et le tableau des tranches
 * suivent donc le contexte (store, jour, recherche) mais jamais ces deux-là.
 * C'est écrit sous les tuiles, pas deviné.
 *
 * 🪤 Les taux ont pour dénominateur les paniers qui ONT VU le port. Ceux qui
 * sont partis avant l'étape livraison (214 sur 300 dans la tranche 50-200 €)
 * ne peuvent pas avoir abandonné à cause de lui.
 */

const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
const eur2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Jour calendaire `YYYY-MM-DD` en heure de Paris — `en-CA` le rend nativement. */
const jourParis = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

/**
 * Un taux ne s'affiche pas seul : sous 30 observations, l'intervalle de
 * confiance dépasse ±18 points et deux barres qui « se croisent » ne veulent
 * rien dire. Le seuil est affiché, pas caché dans le code.
 */
const EFFECTIF_MINIMAL = 30;

const pct = (n: number, sur: number): string => (sur > 0 ? `${Math.round((100 * n) / sur)} %` : "—");

const STATUT_META: Record<StatutLivraison, { label: string; chip: string }> = {
  commande: {
    label: "Commande ✓",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  devis: { label: "Devis →", chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
  bloque: { label: "Arrêté", chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  "avant-port": { label: "Parti avant", chip: "bg-muted text-muted-foreground" },
};

const TRANCHES: Array<{ cle: string; label: string; de: number; a: number }> = [
  { cle: "tout", label: "Tous montants", de: 0, a: Number.POSITIVE_INFINITY },
  { cle: "0-50", label: "< 50 €", de: 0, a: 50 },
  { cle: "50-200", label: "50 – 200 €", de: 50, a: 200 },
  { cle: "200+", label: "≥ 200 € (franco)", de: 200, a: Number.POSITIVE_INFINITY },
];

type CleTri = "at" | "cp" | "ville" | "canal" | "produit" | "ht" | "reste" | "statut";

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="font-bold text-2xl tabular-nums">{value}</div>
      <div className="mt-0.5 text-muted-foreground text-xs">{label}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}

/** Barre de proportion sobre, achromatique comme le reste du dashboard. */
function Barre({ part, sur }: { part: number; sur: number }) {
  return (
    <div className="relative h-2 w-full rounded bg-muted">
      <div
        className="absolute inset-y-0 left-0 min-w-0.5 rounded bg-gray-700 dark:bg-gray-300"
        style={{ width: `${sur > 0 ? (100 * part) / sur : 0}%` }}
      />
    </div>
  );
}

/** Compte commandes / abandons parmi des lignes ayant vu le port. */
function bilan(lignes: LigneLivraison[]) {
  const ontVuLePort = lignes.filter((l) => l.port !== null);
  return {
    ontVuLePort: ontVuLePort.length,
    commandes: ontVuLePort.filter((l) => l.statut === "commande").length,
    // Un panier repris ailleurs n'est pas un abandon : le client a commandé.
    abandons: ontVuLePort.filter((l) => l.statut === "bloque" && !l.reprisAilleurs).length,
    repris: ontVuLePort.filter((l) => l.statut === "bloque" && l.reprisAilleurs).length,
  };
}

export default function LivraisonClient() {
  const [jours, setJours] = useState(90);
  const [payload, setPayload] = useState<LivraisonPayload | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const [fCanal, setFCanal] = useState("");
  const [fTranche, setFTranche] = useState("50-200");
  const [fStatut, setFStatut] = useState<StatutLivraison | "">("bloque");
  const [fJour, setFJour] = useState("");
  const [fQ, setFQ] = useState("");
  const [tri, setTri] = useState<CleTri>("ht");
  const [sens, setSens] = useState<-1 | 1>(-1);

  const charger = useCallback(async (j: number) => {
    setChargement(true);
    try {
      const r = await fetch(`/api/livraison?jours=${j}`, { cache: "no-store" });
      const json = (await r.json()) as LivraisonPayload | { error: string };
      if (!r.ok || "error" in json) throw new Error("error" in json ? json.error : `HTTP ${r.status}`);
      setPayload(json);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger(jours);
  }, [jours, charger]);

  const lignes = useMemo(() => payload?.lignes ?? [], [payload]);
  const seuils = payload?.seuils;
  const franco = seuils?.francoHt ?? 200;

  const canaux = useMemo(() => [...new Set(lignes.map((l) => l.canal))].sort(), [lignes]);
  const joursDispo = useMemo(
    () => [...new Set(lignes.map((l) => jourParis(l.commandeAt ?? l.at)))].sort((a, b) => b.localeCompare(a)),
    [lignes],
  );

  const tranche = useMemo(() => TRANCHES.find((t) => t.cle === fTranche) ?? TRANCHES[0], [fTranche]);

  /**
   * Filtres de CONTEXTE : où, quand, quoi. Ils rétrécissent la population sans
   * toucher à ce qu'on y mesure.
   */
  const passeContexte = useCallback(
    (l: LigneLivraison) => {
      const q = fQ.trim().toLowerCase();
      return (
        (!fCanal || l.canal === fCanal) &&
        (!fJour || jourParis(l.commandeAt ?? l.at) === fJour) &&
        (!q ||
          l.produit.toLowerCase().includes(q) ||
          (l.email ?? "").toLowerCase().includes(q) ||
          (l.cp ?? "").toLowerCase().includes(q) ||
          (l.ville ?? "").toLowerCase().includes(q) ||
          l.canal.toLowerCase().includes(q))
      );
    },
    [fCanal, fJour, fQ],
  );

  /**
   * Filtres de MESURE : montant et statut. Les agrégats les ignorent.
   *
   * 🪤 Ils sont la dimension même de ce qui est comparé, et s'y soumettre les
   * vide de leur sens. Vu à l'écran avant correction : filtre « Arrêté » actif
   * par défaut, la tuile annonçait « 93 paniers ont vu le port payant, 0 ont
   * commandé » et « 95 % repartent » — une population sans une seule commande
   * ne peut rien dire d'un taux de conversion. Idem pour le montant : le franco
   * commence à 200 € HT, filtrer sur 50-200 € vide la colonne « franco ».
   */
  const passe = useCallback(
    (l: LigneLivraison) =>
      passeContexte(l) && l.ht >= tranche.de && l.ht < tranche.a && (!fStatut || l.statut === fStatut),
    [passeContexte, fStatut, tranche],
  );

  /** Population des comparaisons : le contexte seul. */
  const horsMontant = useMemo(() => lignes.filter(passeContexte), [lignes, passeContexte]);
  const casPort = useMemo(() => bilan(horsMontant.filter((l) => (l.port ?? 0) > 0)), [horsMontant]);
  const casFranco = useMemo(() => bilan(horsMontant.filter((l) => l.port === 0)), [horsMontant]);

  const bandes = useMemo(
    () => [
      {
        libelle: "Juste sous le franco",
        de: franco - 80,
        a: franco,
        ...bilan(horsMontant.filter((l) => l.ht >= franco - 80 && l.ht < franco)),
      },
      {
        libelle: "Juste au-dessus",
        de: franco,
        a: franco + 80,
        ...bilan(horsMontant.filter((l) => l.ht >= franco && l.ht < franco + 80)),
      },
    ],
    [horsMontant, franco],
  );

  const parTranche = useMemo(
    () =>
      TRANCHES.filter((t) => t.cle !== "tout").map((t) => {
        const dans = horsMontant.filter((l) => l.ht >= t.de && l.ht < t.a);
        return { ...t, paniers: dans.length, ...bilan(dans) };
      }),
    [horsMontant],
  );

  /** Le tableau, lui, suit TOUS les filtres, montant compris. */
  const filtrees = useMemo(() => {
    const out = lignes.filter((l) => passe(l));
    const valeur = (l: LigneLivraison): string | number => {
      switch (tri) {
        case "at":
          return l.commandeAt ?? l.at;
        case "cp":
          return l.cp ?? "";
        case "ville":
          return (l.ville ?? "").toLowerCase();
        case "canal":
          return l.canal.toLowerCase();
        case "produit":
          return l.produit.toLowerCase();
        case "reste":
          return Math.max(0, franco - l.ht);
        case "statut":
          return l.statut;
        default:
          return l.ht;
      }
    };
    return [...out].sort((a, b) => {
      const va = valeur(a);
      const vb = valeur(b);
      // 🪤 Les trous restent en FIN de liste dans les deux sens. Sans ça,
      // inverser un tri par CP remonte d'abord les 84 paniers sans code postal
      // — l'inverse de ce qu'on cherche en triant sur cette colonne.
      const aVide = va === "";
      const bVide = vb === "";
      if (aVide !== bVide) return aVide ? 1 : -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sens;
    });
  }, [lignes, passe, tri, sens, franco]);

  const bilanListe = useMemo(() => bilan(filtrees), [filtrees]);
  const htEnPlan = useMemo(
    () => filtrees.filter((l) => l.statut === "bloque" && !l.reprisAilleurs).reduce((s, l) => s + l.ht, 0),
    [filtrees],
  );
  const identifiables = useMemo(() => {
    const bloques = filtrees.filter((l) => l.statut === "bloque");
    return { avecIdentite: bloques.filter((l) => l.identifie).length, total: bloques.length };
  }, [filtrees]);

  const trierPar = (cle: CleTri) => {
    setSens(tri === cle ? (s) => (s === -1 ? 1 : -1) : () => -1);
    setTri(cle);
  };
  const fleche = (cle: CleTri) => (tri === cle ? (sens === -1 ? " ↓" : " ↑") : "");

  const filtresActifs = Boolean(fCanal || fJour || fQ || fStatut !== "bloque" || fTranche !== "50-200");

  const colonnes: Array<{ cle: CleTri; label: string; align?: "right" }> = [
    { cle: "at", label: "Date" },
    { cle: "cp", label: "CP" },
    { cle: "ville", label: "Ville" },
    { cle: "canal", label: "Store" },
    { cle: "produit", label: "Produit" },
    { cle: "ht", label: "Total HT", align: "right" },
    { cle: "reste", label: "Reste avant franco", align: "right" },
    { cle: "statut", label: "Statut" },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6" aria-hidden />
          <h1 className="font-bold text-2xl">Livraison</h1>
          {chargement && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {[30, 90].map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => setJours(j)}
                className={`rounded-md px-3 py-1 text-sm ${
                  jours === j ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {j} jours
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void charger(jours)}
            className="rounded-lg border p-2 text-muted-foreground hover:text-foreground"
            aria-label="Rafraîchir"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <p className="max-w-3xl text-muted-foreground text-sm">
        Port standard{" "}
        <strong>
          {seuils ? eur2(seuils.portTtc) : "14,40"} € TTC ({seuils?.portHt ?? 12} € HT)
        </strong>
        , offert dès <strong>{franco} € HT</strong>. Les taux se comptent{" "}
        <strong>sur les paniers qui ont vu le prix du port</strong> — ceux qui sont partis avant ne peuvent pas avoir
        abandonné à cause de lui.
      </p>

      {erreur && (
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-4 text-red-700 text-sm dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {erreur}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          value={String(casPort.ontVuLePort)}
          label="ont vu le port payant"
          hint={`${casPort.commandes} ont commandé`}
        />
        <Tile
          value={pct(casPort.abandons, casPort.ontVuLePort)}
          label="repartent après l'avoir vu"
          hint="hors devis et paniers repris"
        />
        <Tile
          value={pct(casFranco.abandons, casFranco.ontVuLePort)}
          label="repartent malgré le franco"
          hint={`${casFranco.ontVuLePort} paniers en livraison offerte`}
        />
        <Tile
          value={eur(htEnPlan)}
          label="HT en plan · sélection"
          hint={`${bilanListe.abandons} abandons${bilanListe.repris > 0 ? ` · ${bilanListe.repris} repris ailleurs` : ""}`}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Les trois premières tuiles et les deux panneaux ci-dessous suivent le store, le jour et la recherche, mais{" "}
        <strong>ni le montant ni le statut</strong> : ce sont les deux dimensions qu&apos;ils comparent — filtrer sur «
        Arrêté » leur retirerait toute commande, et sur 50-200 € toute ligne en franco. La quatrième tuile et le tableau
        suivent, eux, la sélection complète.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-1 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            De part et d&apos;autre du franco
          </h2>
          <p className="mb-3 text-muted-foreground text-xs">
            Deux bandes de 80 € qui se touchent au seuil : la seule comparaison où le montant du panier ne fait pas
            l&apos;essentiel de l&apos;écart.
          </p>
          <div className="space-y-3">
            {bandes.map((b) => (
              <div key={b.libelle}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span>
                    {b.libelle}{" "}
                    <span className="text-muted-foreground text-xs">
                      {b.de}–{b.a} € HT
                    </span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {b.commandes}/{b.ontVuLePort} → {pct(b.commandes, b.ontVuLePort)}
                  </span>
                </div>
                <Barre part={b.commandes} sur={Math.max(1, b.ontVuLePort)} />
                {b.ontVuLePort < EFFECTIF_MINIMAL && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {b.ontVuLePort} paniers : trop peu pour trancher (seuil {EFFECTIF_MINIMAL}).
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-1 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            Par tranche de montant
          </h2>
          <p className="mb-3 text-muted-foreground text-xs">
            Conversion rapportée aux paniers arrivés jusqu&apos;au port. Cliquer une ligne filtre l&apos;écran.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="pb-2 text-left font-medium">Tranche HT</th>
                <th className="pb-2 text-right font-medium">Paniers</th>
                <th className="pb-2 text-right font-medium">Ont vu le port</th>
                <th className="pb-2 text-right font-medium">Commandes</th>
                <th className="pb-2 text-right font-medium">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {parTranche.map((t) => (
                <tr
                  key={t.cle}
                  onClick={() => setFTranche(fTranche === t.cle ? "tout" : t.cle)}
                  className={`cursor-pointer border-t transition-colors hover:bg-muted/60 ${
                    fTranche === t.cle ? "bg-muted" : ""
                  }`}
                >
                  <td className="py-2">{t.label}</td>
                  <td className="py-2 text-right tabular-nums">{t.paniers}</td>
                  <td className="py-2 text-right tabular-nums">{t.ontVuLePort}</td>
                  <td className="py-2 text-right tabular-nums">{t.commandes}</td>
                  <td className="py-2 text-right tabular-nums">{pct(t.commandes, t.ontVuLePort)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payload && payload.nettoyage > 0 && (
            <p className="mt-3 border-t pt-3 text-muted-foreground text-xs">
              {payload.nettoyage}
              {
                " paniers du robot de 6 h écartés de tout l'écran : anonymes, jamais convertis, ils feraient chuter chaque taux sans qu'aucun client n'ait rien abandonné."
              }
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={fCanal}
          onChange={(e) => setFCanal(e.target.value)}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm"
          aria-label="Filtrer par store"
        >
          <option value="">Tous les stores</option>
          {canaux.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={fTranche}
          onChange={(e) => setFTranche(e.target.value)}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm"
          aria-label="Filtrer par montant"
        >
          {TRANCHES.map((t) => (
            <option key={t.cle} value={t.cle}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={fStatut}
          onChange={(e) => setFStatut(e.target.value as StatutLivraison | "")}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm"
          aria-label="Filtrer par statut"
        >
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUT_META) as StatutLivraison[]).map((s) => (
            <option key={s} value={s}>
              {STATUT_META[s].label}
            </option>
          ))}
        </select>
        <select
          value={fJour}
          onChange={(e) => setFJour(e.target.value)}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm"
          aria-label="Filtrer par jour"
        >
          <option value="">Tous les jours</option>
          {joursDispo.map((j) => (
            <option key={j} value={j}>
              {new Date(`${j}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={fQ}
          onChange={(e) => setFQ(e.target.value)}
          placeholder="Produit, e-mail, CP, ville…"
          className="min-w-52 flex-1 rounded-lg border bg-card px-3 py-1.5 text-sm"
          aria-label="Recherche"
        />
        {filtresActifs && (
          <button
            type="button"
            onClick={() => {
              setFCanal("");
              setFTranche("50-200");
              setFStatut("bloque");
              setFJour("");
              setFQ("");
            }}
            className="rounded-lg border px-3 py-1.5 text-muted-foreground text-sm hover:text-foreground"
          >
            Réinitialiser
          </button>
        )}
        <span className="ml-auto text-muted-foreground text-sm tabular-nums">
          {filtrees.length} / {lignes.length} paniers
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
              {colonnes.map((c) => (
                <th
                  key={c.cle}
                  onClick={() => trierPar(c.cle)}
                  className={`cursor-pointer select-none px-3 py-2.5 hover:text-foreground ${
                    c.align === "right" ? "text-right" : ""
                  } ${tri === c.cle ? "text-foreground" : ""}`}
                >
                  {c.label}
                  {fleche(c.cle)}
                </th>
              ))}
              <th className="px-3 py-2.5">E-mail</th>
            </tr>
          </thead>
          <tbody>
            {filtrees.map((l) => (
              <tr key={l.id} className="border-b last:border-b-0 hover:bg-muted/40">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums">
                  {dateFmt.format(new Date(l.commandeAt ?? l.at))}
                </td>
                <td className="px-3 py-2 tabular-nums">{l.cp ?? "—"}</td>
                <td className="max-w-40 truncate px-3 py-2">{l.ville ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{l.canal.replace("Pro ", "P. ")}</td>
                <td className="max-w-72 truncate px-3 py-2">
                  {l.produit}
                  {l.lignes > 1 && <span className="text-muted-foreground text-xs"> +{l.lignes - 1} art.</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{eur2(l.ht)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {l.ht < franco ? `${eur2(franco - l.ht)} €` : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span
                    className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 font-semibold text-[11px] ${STATUT_META[l.statut].chip}`}
                  >
                    {STATUT_META[l.statut].label}
                  </span>
                  {l.reprisAilleurs && l.statut === "bloque" && (
                    <span
                      title="Ce client a commandé ensuite par un autre panier : ce n'est pas un abandon."
                      className="ml-1.5 inline-block rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-[11px] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                    >
                      repris
                    </span>
                  )}
                </td>
                <td className="max-w-52 truncate px-3 py-2 text-muted-foreground">{l.email ?? "—"}</td>
              </tr>
            ))}
            {!chargement && filtrees.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground text-sm">
                  Aucun panier sur cette sélection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {payload && (
        <p className="text-muted-foreground text-xs">
          Actualisé {dateFmt.format(new Date(payload.generatedAt))} · fenêtre {payload.jours} j · « Arrêté » = une
          méthode de livraison choisie, puis ni paiement ni devis.{" "}
          {identifiables.total > 0 && (
            <>
              La reprise sur un autre panier ne se voit que sur les paniers identifiés :{" "}
              <strong>
                {identifiables.avecIdentite} sur {identifiables.total}
              </strong>{" "}
              portent un e-mail ou un compte. Sur les autres elle est invisible — le compte des repris est un plancher.
            </>
          )}
        </p>
      )}
    </div>
  );
}
