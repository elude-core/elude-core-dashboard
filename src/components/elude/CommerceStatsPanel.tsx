"use client";

import { useEffect, useState } from "react";

import type { CommerceStatsPayload, StatsFenetre } from "@/app/api/commerce-stats/route";
import { CaTimelineChart } from "@/components/elude/CaTimelineChart";

/**
 * Commandes et devis sur 7 / 30 / 60 / 90 jours.
 *
 * ── Les quatre fenêtres côte à côte, pas un sélecteur ───────────────────────
 *
 * Un sélecteur montrerait une fenêtre à la fois et cacherait la seule chose
 * qu'on cherche ici : la TENDANCE. « 19 commandes sur 7 j » ne dit rien ;
 * « 19 · 59 · ? · 77 » dit que le mois dernier a été plus dense que les deux
 * précédents. C'est la lecture qui compte, et elle demande de tout voir.
 *
 * ── 🪤 Moyenne ET médiane, toujours ensemble ────────────────────────────────
 *
 * Les volumes sont petits. Mesuré le 03/09 sur les devis à 90 j : moyenne
 * 1 414 €, médiane 211 € — la moyenne vaut SEPT fois la médiane, parce que
 * deux gros devis portent tout. Afficher la moyenne seule ferait croire à un
 * panier B2B de 1 400 €.
 *
 * L'écart entre les deux est l'information. La ligne « concentration » la
 * chiffre : quelle part du CA tient à trois commandes.
 */

const FENETRES = ["7", "30", "60", "90"] as const;

const eur = (v: number | null): string =>
  v === null ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const eurPrecis = (v: number | null): string =>
  v === null ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CommerceStatsPanel() {
  const [data, setData] = useState<CommerceStatsPayload | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    const charger = async () => {
      try {
        const r = await fetch("/api/commerce-stats");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as CommerceStatsPayload;
        if (vivant) {
          setData(j);
          setErreur(null);
        }
      } catch (e) {
        if (vivant) setErreur(e instanceof Error ? e.message : "erreur");
      }
    };
    void charger();
    const t = setInterval(charger, 60_000);
    return () => {
      vivant = false;
      clearInterval(t);
    };
  }, []);

  const f = (k: string): StatsFenetre | null => data?.fenetres?.[k] ?? null;

  const lignes: Array<{ label: string; aide?: string; val: (s: StatsFenetre) => string; fort?: boolean }> = [
    { label: "Commandes", val: (s) => String(s.commandes), fort: true },
    { label: "CA HT", val: (s) => `${eur(s.caHt)} €`, fort: true },
    { label: "Panier moyen HT", val: (s) => `${eurPrecis(s.panierMoyenHt)} €` },
    {
      label: "Panier médian HT",
      aide: "La commande « normale ». Loin de la moyenne = quelques grosses ventes portent le CA.",
      val: (s) => `${eurPrecis(s.panierMedianHt)} €`,
    },
    {
      label: "Concentration top 3",
      aide: "Part du CA portée par les 3 plus grosses commandes.",
      val: (s) => (s.concentrationTop3 === null ? "—" : `${s.concentrationTop3.toLocaleString("fr-FR")} %`),
    },
    {
      label: "Clients récurrents",
      aide: "Commandes d'un e-mail ayant déjà commandé avant. Compté par e-mail : un compte est créé à chaque passage.",
      val: (s) => `${s.clientsRecurrents} / ${s.commandes}`,
    },
    { label: "Devis", val: (s) => String(s.devis), fort: true },
    { label: "Devis moyen HT", val: (s) => `${eurPrecis(s.devisMoyenHt)} €` },
    { label: "Devis médian HT", val: (s) => `${eurPrecis(s.devisMedianHt)} €` },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">Commandes et devis</h2>
        <span className="text-muted-foreground text-xs">montants HT</span>
      </div>

      {erreur && <p className="text-red-600 text-sm dark:text-red-400">Indisponible — {erreur}</p>}
      {!data && !erreur && <p className="text-muted-foreground text-sm">Chargement…</p>}

      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-gray-200 border-b text-left text-muted-foreground text-xs dark:border-gray-800">
                  <th className="py-2 pr-3 font-medium">Sur</th>
                  {FENETRES.map((k) => (
                    <th key={k} className="px-3 py-2 text-right font-medium tabular-nums">
                      {k} j
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.label} className="border-gray-100 border-b last:border-b-0 dark:border-gray-800/60">
                    <td className="py-2 pr-3 whitespace-nowrap" title={l.aide}>
                      <span className={l.fort ? "font-medium" : undefined}>{l.label}</span>
                      {l.aide && <span className="ml-1 text-muted-foreground text-xs">ⓘ</span>}
                    </td>
                    {FENETRES.map((k) => {
                      const s = f(k);
                      return (
                        <td key={k} className={`px-3 py-2 text-right tabular-nums ${l.fort ? "font-medium" : ""}`}>
                          {s ? l.val(s) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* L'évolution, entre le résumé et la ventilation : on lit d'abord
              « combien », puis « dans quel sens », puis « par quel canal ». */}
          {data.timeline && data.timeline.length > 1 && (
            <div className="mt-5 border-gray-100 border-t pt-4 dark:border-gray-800/60">
              {/* Pas de titre ici : le graphe porte ses propres boutons de mesure,
                  qui disent déjà ce qui est tracé. */}
              <CaTimelineChart timeline={data.timeline} canaux={data.canaux ?? []} />
            </div>
          )}

          {/* Le CA par canal, sur 30 j — assez de volume pour être lisible,
              assez court pour ne pas noyer le tableau. */}
          {(() => {
            const s = f("30");
            if (!s || s.parCanal.length === 0) return null;
            return (
              <div className="mt-4 border-gray-100 border-t pt-3 dark:border-gray-800/60">
                <p className="mb-2 text-muted-foreground text-xs">CA HT par canal — 30 j</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                  {s.parCanal.map((c) => (
                    <span key={c.canal} className="whitespace-nowrap">
                      {c.canal}
                      <span className="ml-1.5 font-medium tabular-nums">{eur(c.caHt)} €</span>
                      <span className="ml-1 text-muted-foreground text-xs tabular-nums">({c.commandes})</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
          {data.historiqueDepuis && (
            <p className="mt-3 text-muted-foreground text-xs">
              Historique depuis le{" "}
              {new Date(data.historiqueDepuis).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
              {" — "}les fenêtres plus longues que cet historique rendent les mêmes chiffres.
            </p>
          )}
        </>
      )}
    </div>
  );
}
