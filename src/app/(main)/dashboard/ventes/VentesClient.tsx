"use client";

import { useMemo, useState } from "react";

import { DegradedBanner } from "@/components/elude/DegradedBanner";
import { KpiCard } from "@/components/elude/KpiCard";
import { eur, libelleMois } from "@/components/elude/ventes/format";
import { IndexChart } from "@/components/elude/ventes/IndexChart";
import { SeriesChart } from "@/components/elude/ventes/SeriesChart";
import { StoreFilter } from "@/components/elude/ventes/StoreFilter";
import { Button } from "@/components/ui/button";
import { aggregate, type VentesSnapshot } from "@/lib/ventes";

type Mode = "web" | "hors" | "tout";

const FLUX: { mode: Mode; label: string }[] = [
  { mode: "web", label: "Web" },
  { mode: "hors", label: "Devis-hors web" },
  { mode: "tout", label: "Tout" },
];

/** Au-delà, le cron nocturne (push_snapshot.py) n'a vraisemblablement pas tourné. */
const SEUIL_STALE_HEURES = 30;

const dateCourte = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateHeure = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "×1,93" — même convention que `fmtIndice` dans IndexChart (dupliquée : un
 *  encart de mesure figée n'a pas vocation à réimporter le module de chart). */
function fmtEffet(v: number): string {
  return `×${v.toFixed(2).replace(".", ",")}`;
}

export default function VentesClient({
  snapshot,
  ageHours,
}: {
  snapshot: VentesSnapshot | null;
  ageHours: number | null;
}) {
  // Données déjà en mémoire (lues côté serveur dans page.tsx, un instantané nocturne ne
  // change qu'une fois par nuit — pas de fetch client, pas de flash "Chargement…" à chaque
  // ouverture). `VentesClient` ne porte plus que l'état des filtres, du calcul pur.
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("web");

  const stores = useMemo(() => (snapshot ? Object.keys(snapshot.stores).sort() : []), [snapshot]);
  const rows = useMemo(() => (snapshot ? aggregate(snapshot, selected) : []), [snapshot, selected]);
  // Repères de bascule filtrés sur la sélection : le go-live d'une boutique qu'on
  // n'affiche pas n'a rien à faire sur le graphique (ex. filtrer sur pro-agrafeuses,
  // jamais migré, ne doit garder aucun repère ni la bande "période storefront").
  const golives = useMemo(() => {
    if (!snapshot) return [];
    return selected.length > 0 ? snapshot.golives.filter((g) => selected.includes(g.store)) : snapshot.golives;
  }, [snapshot, selected]);

  const n = rows.length;
  // Le dernier mois de la série est le mois en cours, partiel par construction de
  // l'instantané (arrêté au jour de génération, jamais une date en dur) — cf. le
  // commentaire en tête de SeriesChart. On ne le compare JAMAIS à un mois plein : les
  // tuiles ci-dessous l'affichent seul (valeur "à date", pas de comparaison) et l'écart
  // à douze mois se calcule sur le dernier mois PLEIN, pas sur celui-ci.
  const dernier = n > 0 ? rows[n - 1] : null;
  const moisPlein = n > 1 ? rows[n - 2] : null;
  const moisPleinAnPasse = n > 13 ? rows[n - 14] : null;

  const commandesWeb = dernier ? dernier[0] : null;
  const caWeb = dernier ? dernier[1] : null;
  const margeWebPct = dernier && dernier[1] > 0 ? (dernier[6] / dernier[1]) * 100 : null;
  const ecartCaWeb12Mois =
    moisPlein && moisPleinAnPasse && moisPleinAnPasse[1] > 0
      ? ((moisPlein[1] - moisPleinAnPasse[1]) / moisPleinAnPasse[1]) * 100
      : null;

  const hintMoisEnCours = dernier ? `${libelleMois(snapshot?.months[n - 1] ?? "")}, à date — mois partiel` : undefined;
  // Le libellé nomme les deux mois comparés (jamais en dur, dérivés de `snapshot.months`) :
  // "écart sur douze mois" sans préciser quoi/contre quoi laisse croire à un cumul glissant
  // des 12 derniers mois, alors qu'il s'agit du dernier mois PLEIN contre le même mois l'an
  // dernier. Sans ça, un +92 % perd le fait qu'il repose sur un creux (août 2025).
  const labelEcart =
    moisPlein && moisPleinAnPasse
      ? `Écart CA web · ${libelleMois(snapshot?.months[n - 2] ?? "")} vs ${libelleMois(snapshot?.months[n - 14] ?? "")}`
      : "Écart CA web · 12 mois";

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-gray-100">Ventes</h1>
        <DegradedBanner state="error" upstream="ventes" />
        <p className="text-gray-500 text-sm">
          Aucun instantané lisible. Le script nocturne (
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">push_snapshot.py</code>) a-t-il déjà tourné une
          fois ?
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-bold text-2xl text-gray-900 dark:text-gray-100">Ventes</h1>

      {ageHours !== null && ageHours > SEUIL_STALE_HEURES && (
        <DegradedBanner
          state="stale"
          title={`Instantané du ${dateHeure.format(new Date(snapshot.generated_at))} — le calcul nocturne n'a pas tourné`}
          detail={`Âge : ${ageHours.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h (seuil ${SEUIL_STALE_HEURES} h). Vérifier le cron de push_snapshot.py.`}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Commandes web" value={commandesWeb} hint={hintMoisEnCours} />
        <KpiCard label="CA web HT" value={caWeb} format="eur" hint={hintMoisEnCours} />
        <KpiCard
          label={labelEcart}
          value={ecartCaWeb12Mois}
          format="percent"
          signed
          hint={moisPlein && moisPleinAnPasse ? "mois pleins — jamais le mois en cours" : "historique insuffisant"}
        />
        <KpiCard
          label="Marge web"
          value={margeWebPct}
          format="percent"
          hint={hintMoisEnCours && `${hintMoisEnCours} — marge / CA HT`}
        />
      </div>

      <StoreFilter stores={stores} selected={selected} onChange={setSelected} />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">Indice base 100</h2>
          {/* Ne pilote que ce graphique — SeriesChart affiche toujours ses deux canaux,
              quel que soit le flux choisi (signature figée depuis la tâche 4). Placé ici,
              dans l'en-tête du graphique qu'il gouverne, pas au-dessus des deux : au-dessus
              des deux il mentirait sur sa portée (motif repris de la note de référence, qui
              place ces pastilles dans le fig-head du graphique indexé). */}
          <fieldset className="flex gap-2" aria-label="Flux">
            {FLUX.map((f) => (
              <Button
                key={f.mode}
                type="button"
                variant={mode === f.mode ? "secondary" : "outline"}
                aria-pressed={mode === f.mode}
                onClick={() => setMode(f.mode)}
              >
                {f.label}
              </Button>
            ))}
          </fieldset>
        </div>
        <IndexChart months={snapshot.months} rows={rows} mode={mode} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <SeriesChart months={snapshot.months} rows={rows} golives={golives} showBand={true} />
      </div>

      <p className="text-gray-400 text-xs">
        Non rattaché à aucune boutique : {snapshot.unmapped.count} commande{snapshot.unmapped.count > 1 ? "s" : ""} ·{" "}
        {eur(snapshot.unmapped.amount)} — contrôle de complétude (séries + non rattaché + Amazon = export Odoo brut).
        {snapshot.unmapped.count === 0 && " Zéro : tout est rattaché."}
      </p>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
          Effet du passage en storefront — mesure figée
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-gray-500 text-sm dark:text-gray-400">Chiffre d'affaires</p>
            <p className="font-bold text-2xl text-gray-900 dark:text-gray-100">
              {fmtEffet(snapshot.frozen.effect_ca.value)}
            </p>
            <p className="text-gray-400 text-xs">
              IC 95 % : {fmtEffet(snapshot.frozen.effect_ca.ci[0])} – {fmtEffet(snapshot.frozen.effect_ca.ci[1])}
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-sm dark:text-gray-400">Marge</p>
            <p className="font-bold text-2xl text-gray-900 dark:text-gray-100">
              {fmtEffet(snapshot.frozen.effect_margin.value)}
            </p>
            <p className="text-gray-400 text-xs">
              IC 95 % : {fmtEffet(snapshot.frozen.effect_margin.ci[0])} –{" "}
              {fmtEffet(snapshot.frozen.effect_margin.ci[1])}
            </p>
          </div>
        </div>
        <p className="mt-3 text-gray-400 text-xs">
          mesuré le {dateCourte.format(new Date(snapshot.frozen.measured_at))} contre {snapshot.frozen.control_store},
          seul site non migré — non recalculable une fois qu'il aura basculé.
        </p>
      </div>
    </div>
  );
}
