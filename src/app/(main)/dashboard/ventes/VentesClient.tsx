"use client";

import { useMemo, useState } from "react";

import { DegradedBanner } from "@/components/elude/DegradedBanner";
import { KpiCard } from "@/components/elude/KpiCard";
import { eur, libelleMois } from "@/components/elude/ventes/format";
import { IndexChart } from "@/components/elude/ventes/IndexChart";
import { SeriesChart } from "@/components/elude/ventes/SeriesChart";
import { StoreFilter } from "@/components/elude/ventes/StoreFilter";
import { Button } from "@/components/ui/button";
import { useVentes } from "@/hooks/useVentes";
import { aggregate } from "@/lib/ventes";

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

export default function VentesClient() {
  const { data, error, isLoading } = useVentes();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("web");

  const stores = useMemo(() => (data ? Object.keys(data.stores).sort() : []), [data]);
  const rows = useMemo(() => (data ? aggregate(data, selected) : []), [data, selected]);
  // Repères de bascule filtrés sur la sélection : le go-live d'une boutique qu'on
  // n'affiche pas n'a rien à faire sur le graphique (ex. filtrer sur pro-agrafeuses,
  // jamais migré, ne doit garder aucun repère ni la bande "période storefront").
  const golives = useMemo(() => {
    if (!data) return [];
    return selected.length > 0 ? data.golives.filter((g) => selected.includes(g.store)) : data.golives;
  }, [data, selected]);

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

  const hintMoisEnCours = dernier ? `${libelleMois(data?.months[n - 1] ?? "")}, à date — mois partiel` : undefined;

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-gray-100">Ventes</h1>
        <p className="text-gray-500 text-sm">Chargement…</p>
      </div>
    );
  }

  if (error && !data) {
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

  if (!data) return null; // ni loading ni error ni data : état transitoire SWR, ne devrait pas durer

  return (
    <div className="space-y-6">
      <h1 className="font-bold text-2xl text-gray-900 dark:text-gray-100">Ventes</h1>

      {data.age_hours > SEUIL_STALE_HEURES && (
        <DegradedBanner
          state="stale"
          title={`Instantané du ${dateHeure.format(new Date(data.generated_at))} — le calcul nocturne n'a pas tourné`}
          detail={`Âge : ${data.age_hours.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h (seuil ${SEUIL_STALE_HEURES} h). Vérifier le cron de push_snapshot.py.`}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Commandes web" value={commandesWeb} hint={hintMoisEnCours} />
        <KpiCard label="CA web HT" value={caWeb} format="eur" hint={hintMoisEnCours} />
        <KpiCard
          label="Écart CA web / N-12"
          value={ecartCaWeb12Mois}
          format="percent"
          hint={
            moisPlein && moisPleinAnPasse
              ? `${libelleMois(data.months[n - 2])} vs ${libelleMois(data.months[n - 14])} — mois pleins, jamais le mois en cours`
              : "historique insuffisant"
          }
        />
        <KpiCard
          label="Marge web"
          value={margeWebPct}
          format="percent"
          hint={hintMoisEnCours && `${hintMoisEnCours} — marge / CA HT`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StoreFilter stores={stores} selected={selected} onChange={setSelected} />
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

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <IndexChart months={data.months} rows={rows} mode={mode} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <SeriesChart months={data.months} rows={rows} golives={golives} showBand={true} />
      </div>

      <p className="text-gray-400 text-xs">
        Non rattaché à aucune boutique : {data.unmapped.count} commande{data.unmapped.count > 1 ? "s" : ""} ·{" "}
        {eur(data.unmapped.amount)} — contrôle de complétude (séries + non rattaché + Amazon = export Odoo brut).
        {data.unmapped.count === 0 && " Zéro : tout est rattaché."}
      </p>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
          Effet du passage en storefront — mesure figée
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-gray-500 text-sm dark:text-gray-400">Chiffre d'affaires</p>
            <p className="font-bold text-2xl text-gray-900 dark:text-gray-100">
              {fmtEffet(data.frozen.effect_ca.value)}
            </p>
            <p className="text-gray-400 text-xs">
              IC 95 % : {fmtEffet(data.frozen.effect_ca.ci[0])} – {fmtEffet(data.frozen.effect_ca.ci[1])}
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-sm dark:text-gray-400">Marge</p>
            <p className="font-bold text-2xl text-gray-900 dark:text-gray-100">
              {fmtEffet(data.frozen.effect_margin.value)}
            </p>
            <p className="text-gray-400 text-xs">
              IC 95 % : {fmtEffet(data.frozen.effect_margin.ci[0])} – {fmtEffet(data.frozen.effect_margin.ci[1])}
            </p>
          </div>
        </div>
        <p className="mt-3 text-gray-400 text-xs">
          mesuré le {dateCourte.format(new Date(data.frozen.measured_at))} contre {data.frozen.control_store}, seul site
          non migré — non recalculable une fois qu'il aura basculé.
        </p>
      </div>
    </div>
  );
}
