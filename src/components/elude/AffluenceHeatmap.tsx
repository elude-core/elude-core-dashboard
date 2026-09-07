"use client";

import { useMemo } from "react";

import { Clock } from "lucide-react";

import {
  type Creneau,
  echelle,
  HEURES,
  JOURS,
  JOURS_COURTS,
  libelleCreneau,
  libellePalier,
  niveau,
  total,
  totalParHeure,
  totalParJour,
} from "@/lib/affluence";

/**
 * Damier jour de semaine × heure — quand l'activité tombe, et une facette de
 * plus pour la découper.
 *
 * ── 🪤 Une case ne dit presque rien, les MARGES disent tout ─────────────────
 *
 * Mesuré le 07/09 : 121 commandes et devis sur tout l'historique pour 168
 * créneaux d'une heure, 58 cases occupées, maximum 7 — et bien moins dès qu'un
 * filtre est actif. À ce volume le damier seul est un ciel étoilé : chaque case
 * vaut 0 ou 1 et le regard y invente des motifs. Le total par heure (barres du
 * bas) et le total par jour (colonne de droite) portent le signal réel —
 * 15 h-17 h pèse 34 des 86 commandes, le samedi 2. Ils sont cliquables pour
 * cette raison : c'est la lecture qui tient debout.
 *
 * ── 🪤 6 h du matin est un ROBOT, pas une affluence ─────────────────────────
 *
 * Sans filtre d'étape, le damier compte tous les paniers — et 92 d'entre eux
 * naissent chaque jour entre 06 h 14 et 06 h 59, e-mail nul, 0 identifié et
 * 0 commande. La case 6 h sort alors la plus foncée de l'écran. Elle est
 * signalée sous le damier plutôt que filtrée en douce : masquer des lignes que
 * les autres cartes comptent encore ferait deux vérités dans le même écran.
 * Cliquer « Commande ✓ » ou « Devis → » l'écarte proprement.
 *
 * ── Palette achromatique, comme le reste du dashboard ───────────────────────
 *
 * Le parti pris du dépôt (cf. `CaTimelineChart`) : la teinte ne porte rien, la
 * densité oui. Une rampe d'une seule teinte, du clair au foncé — inversée en
 * sombre, pas « retournée automatiquement » : les crans sont choisis contre
 * chaque fond.
 */

/**
 * Quatre crans, du plus clair au plus foncé. Les classes sont écrites en toutes
 * lettres : Tailwind ne voit pas une classe assemblée à l'exécution et la purge.
 */
const RAMPE = [
  "bg-gray-300 dark:bg-gray-600",
  "bg-gray-500 dark:bg-gray-400",
  "bg-gray-700 dark:bg-gray-300",
  "bg-gray-900 dark:bg-gray-100",
];
const VIDE = "bg-gray-100 dark:bg-gray-800";

/** Cran `i` (1…n) sur `n` paliers → index de rampe, pour ne pas laisser de trou. */
const classeCran = (i: number, n: number) => RAMPE[Math.min(RAMPE.length - 1, Math.ceil((i / n) * RAMPE.length) - 1)];

const GRILLE = { gridTemplateColumns: "2.75rem repeat(24, minmax(0, 1fr)) 2.5rem" } as const;

export function AffluenceHeatmap({
  matrice,
  libelle,
  fenetreJours,
  selection,
  onSelect,
}: {
  /** Déjà filtrée par toutes les autres facettes de la page. */
  matrice: number[][];
  /** Ce qu'une case compte, au pluriel : « paniers », « commandes »… */
  libelle: string;
  fenetreJours: number;
  selection: Creneau | null;
  onSelect: (c: Creneau) => void;
}) {
  const parJour = useMemo(() => totalParJour(matrice), [matrice]);
  const parHeure = useMemo(() => totalParHeure(matrice), [matrice]);
  const somme = useMemo(() => total(matrice), [matrice]);
  const { bornes, sature } = useMemo(() => echelle(matrice.flat()), [matrice]);
  const occupees = useMemo(() => matrice.flat().filter((v) => v > 0).length, [matrice]);
  const maxHeure = Math.max(1, ...parHeure);

  const jourActif = selection?.jour ?? null;
  const heureActive = selection?.heure ?? null;

  /**
   * Ce que pèse la sélection. Le damier, lui, reste à son total : c'est une
   * facette, il se montre SANS son propre filtre. Sans ce chiffre, l'en-tête
   * afficherait « 606 paniers · Mercredi 16 h » et les deux se liraient comme
   * une seule phrase — 606 paniers le mercredi à 16 h.
   */
  const sommeSelection = useMemo(() => {
    if (!selection) return null;
    let n = 0;
    for (const [j, ligne] of matrice.entries()) {
      if (selection.jour !== null && selection.jour !== j) continue;
      for (const [h, v] of ligne.entries()) {
        if (selection.heure !== null && selection.heure !== h) continue;
        n += v;
      }
    }
    return n;
  }, [matrice, selection]);
  /** Une case est « en dehors » de la sélection : on l'éteint sans la cacher. */
  const attenue = (j: number, h: number) =>
    selection !== null && ((jourActif !== null && jourActif !== j) || (heureActive !== null && heureActive !== h));

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
          <Clock className="h-4 w-4" aria-hidden />
          Créneaux — jour × heure
        </h2>
        <p className="text-muted-foreground text-xs">
          {somme} {libelle} · {fenetreJours} j · heure de Paris
          {selection && ` · ${libelleCreneau(selection)} : ${sommeSelection}`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Une étiquette d'heure toutes les 3 h : 24 nombres côte à côte sur
              cette largeur se chevauchent et deviennent une frise illisible. */}
          <div className="grid gap-[2px] pb-1" style={GRILLE}>
            <span />
            {HEURES.map((h) => (
              <span key={`entete-${h}`} className="text-center text-[10px] text-muted-foreground tabular-nums">
                {h % 3 === 0 ? h : ""}
              </span>
            ))}
            <span className="text-right text-[10px] text-muted-foreground">Tot.</span>
          </div>

          {JOURS.map((jour, j) => (
            <div key={jour} className="grid items-center gap-[2px] pb-[2px]" style={GRILLE}>
              <button
                type="button"
                onClick={() => onSelect({ jour: j, heure: null })}
                aria-pressed={jourActif === j && heureActive === null}
                title={`Filtrer sur les ${jour.toLowerCase()}s`}
                className={`rounded text-left text-[11px] transition-colors hover:text-foreground ${
                  jourActif === j ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {JOURS_COURTS[j]}
              </button>
              {HEURES.map((h) => {
                const v = matrice[j][h];
                const n = niveau(v, bornes);
                const actif = jourActif === j && heureActive === h;
                return (
                  <button
                    key={`${jour}-${h}`}
                    type="button"
                    onClick={() => onSelect({ jour: j, heure: h })}
                    aria-pressed={actif}
                    title={`${jour} ${h} h — ${v} ${libelle}`}
                    className={`aspect-square rounded-[3px] transition-opacity ${
                      n === 0 ? VIDE : classeCran(n, bornes.length)
                    } ${attenue(j, h) ? "opacity-30" : ""} ${
                      actif ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""
                    }`}
                  />
                );
              })}
              <span className={`text-right text-[11px] tabular-nums ${jourActif === j ? "font-medium" : ""}`}>
                {parJour[j]}
              </span>
            </div>
          ))}

          {/* Profil horaire : la seule lecture solide à ce volume, donc cliquable. */}
          <div className="grid items-end gap-[2px] pt-1" style={GRILLE}>
            <span className="pb-0.5 text-[10px] text-muted-foreground">Total</span>
            {HEURES.map((h) => {
              const v = parHeure[h];
              const actif = heureActive === h && jourActif === null;
              return (
                <button
                  key={`profil-${h}`}
                  type="button"
                  onClick={() => onSelect({ jour: null, heure: h })}
                  aria-pressed={actif}
                  title={`${h} h, tous les jours — ${v} ${libelle}${
                    somme > 0 ? ` (${Math.round((100 * v) / somme)} %)` : ""
                  }`}
                  className={`flex h-9 items-end rounded-t-[2px] transition-opacity hover:opacity-100 ${
                    heureActive !== null && heureActive !== h ? "opacity-30" : ""
                  }`}
                >
                  <div
                    className={`w-full rounded-t-[2px] ${
                      actif ? "bg-gray-900 dark:bg-gray-100" : "bg-gray-400 dark:bg-gray-500"
                    }`}
                    style={{ height: v > 0 ? `${Math.max(6, (100 * v) / maxHeure)}%` : "1px" }}
                  />
                </button>
              );
            })}
            <span className="pb-0.5 text-right font-medium text-[11px] tabular-nums">{somme}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-muted-foreground text-xs">
        <span>
          {occupees} créneaux occupés sur 168 — cliquer une case, un jour ou une heure filtre l&apos;écran. À 6 h, un
          robot ouvre des paniers qui ne convertissent jamais.
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block size-3 rounded-[3px] ${VIDE}`} aria-hidden />
          <span>0</span>
          {bornes.map((borne, i) => (
            <span key={`palier-${borne}`} className="flex items-center gap-1">
              <span className={`inline-block size-3 rounded-[3px] ${classeCran(i + 1, bornes.length)}`} aria-hidden />
              <span className="tabular-nums">{libellePalier(bornes, i, sature)}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
