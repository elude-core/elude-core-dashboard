"use client";

import { useEffect, useMemo, useState } from "react";

import { Clock } from "lucide-react";

import type { AffluencePayload } from "@/app/api/affluence/route";
import {
  additionne,
  JOURS,
  JOURS_COURTS,
  libellePalier,
  matriceVide,
  niveau,
  paliers,
  total,
  totalParHeure,
  totalParJour,
} from "@/lib/affluence";

/**
 * Damier jour de semaine × heure — quand les commandes et les devis tombent.
 *
 * ── 🪤 Une case ne dit presque rien, les MARGES disent tout ─────────────────
 *
 * Mesuré le 07/09 : 121 événements pour 168 créneaux d'une heure, 58 cases
 * occupées, maximum 7. À ce volume, le damier seul est un ciel étoilé : chaque
 * case vaut 0 ou 1 et le regard y invente des motifs. Le total par heure (les
 * barres du bas) et le total par jour (la colonne de droite) portent donc le
 * signal réel — 15 h-17 h pèse 34 des 86 commandes, le samedi 2. C'est pour ça
 * qu'ils ne sont pas décoratifs et qu'on ne peut pas les retirer.
 *
 * ── Palette achromatique, comme le reste du dashboard ───────────────────────
 *
 * Le parti pris du dépôt (cf. `CaTimelineChart`) : la teinte ne porte rien, la
 * densité oui. Une rampe d'une seule teinte, du clair au foncé — inversée en
 * sombre, pas « retournée automatiquement » : les crans sont choisis contre
 * chaque fond.
 *
 * ── Ce que cette carte NE suit PAS ──────────────────────────────────────────
 *
 * Les filtres de la page (canal, étape, jour). Ils portent sur la fenêtre
 * choisie en haut — 7 jours par défaut, soit une quinzaine d'événements, de quoi
 * peindre un damier de bruit. Ici la fenêtre est TOUT l'historique (90 j max) et
 * elle est écrite sous le titre, pour qu'aucun doute ne subsiste sur ce qu'on
 * regarde quand un filtre est actif ailleurs.
 */

type Serie = "tout" | "commandes" | "devis";

const SERIES: Array<{ cle: Serie; label: string; aide: string }> = [
  { cle: "tout", label: "Commandes + devis", aide: "Les deux séries additionnées, case par case." },
  { cle: "commandes", label: "Commandes", aide: "Commandes non annulées, hors brouillons." },
  { cle: "devis", label: "Devis", aide: "Demandes de devis créées." },
];

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

/** 0…23. Itérer sur les VALEURS, pas sur un index : c'est l'heure qui identifie la colonne. */
const HEURES = Array.from({ length: 24 }, (_, h) => h);

const fmtJour = (jour: string) =>
  new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

export function AffluenceHeatmap() {
  const [data, setData] = useState<AffluencePayload | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [serie, setSerie] = useState<Serie>("tout");

  useEffect(() => {
    let vivant = true;
    const charger = async () => {
      try {
        const r = await fetch("/api/affluence");
        const j = (await r.json()) as AffluencePayload | { error: string };
        if (!r.ok || "error" in j) throw new Error("error" in j ? j.error : `HTTP ${r.status}`);
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

  const commandes = data?.commandes ?? matriceVide();
  const devis = data?.devis ?? matriceVide();

  const matrice = useMemo(
    () => (serie === "commandes" ? commandes : serie === "devis" ? devis : additionne(commandes, devis)),
    [serie, commandes, devis],
  );

  const parJour = useMemo(() => totalParJour(matrice), [matrice]);
  const parHeure = useMemo(() => totalParHeure(matrice), [matrice]);
  const somme = useMemo(() => total(matrice), [matrice]);
  const max = useMemo(() => Math.max(0, ...matrice.flat()), [matrice]);
  const maxHeure = Math.max(1, ...parHeure);
  const bornes = useMemo(() => paliers(max), [max]);
  const occupees = useMemo(() => matrice.flat().filter((v) => v > 0).length, [matrice]);

  if (erreur) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <p className="text-red-600 text-sm dark:text-red-400">Heures d&apos;affluence indisponibles : {erreur}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            <Clock className="h-4 w-4" aria-hidden />
            Heures d&apos;affluence
          </h2>
          <p className="mt-1 text-muted-foreground text-xs">
            {data?.depuis
              ? `Depuis le ${fmtJour(data.depuis)} · ${data.jours} jours · heure de Paris · indépendant des filtres de la page`
              : "Chargement…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SERIES.map((s) => (
            <button
              key={s.cle}
              type="button"
              onClick={() => setSerie(s.cle)}
              title={s.aide}
              aria-pressed={serie === s.cle}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                serie === s.cle
                  ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* En-têtes d'heures : une étiquette toutes les 3 h — 24 nombres
              côte à côte sur cette largeur se chevauchent et deviennent une
              frise grise illisible. */}
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
              <span className="text-[11px] text-muted-foreground">{JOURS_COURTS[j]}</span>
              {HEURES.map((h) => {
                const n = niveau(matrice[j][h], bornes);
                const occ = data?.occurrences[j] ?? 0;
                return (
                  <div
                    key={`${jour}-${h}`}
                    className={`aspect-square rounded-[3px] ${n === 0 ? VIDE : classeCran(n, bornes.length)}`}
                    title={`${jour} ${h} h — ${commandes[j][h]} commande${commandes[j][h] > 1 ? "s" : ""}, ${
                      devis[j][h]
                    } devis${occ ? ` · ${occ} ${jour.toLowerCase()}s couverts` : ""}`}
                  />
                );
              })}
              <span className="text-right text-[11px] tabular-nums">{parJour[j]}</span>
            </div>
          ))}

          {/* Profil horaire : la seule lecture solide à ce volume. */}
          <div className="grid items-end gap-[2px] pt-1" style={GRILLE}>
            <span className="pb-0.5 text-[10px] text-muted-foreground">Total</span>
            {HEURES.map((h) => (
              <div
                key={`profil-${h}`}
                className="flex h-9 items-end"
                title={`${h} h — ${parHeure[h]} sur ${somme}${
                  somme > 0 ? ` (${Math.round((100 * parHeure[h]) / somme)} %)` : ""
                }`}
              >
                <div
                  className="w-full rounded-t-[2px] bg-gray-400 dark:bg-gray-500"
                  style={{ height: parHeure[h] > 0 ? `${Math.max(6, (100 * parHeure[h]) / maxHeure)}%` : "1px" }}
                />
              </div>
            ))}
            <span className="pb-0.5 text-right text-[11px] font-medium tabular-nums">{somme}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-muted-foreground text-xs">
        <span>
          {somme} sur {data?.jours ?? 0} jours · {occupees} créneaux occupés sur 168 — la tendance se lit dans les
          totaux, pas case par case.
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block size-3 rounded-[3px] ${VIDE}`} aria-hidden />
          <span>0</span>
          {bornes.map((_, i) => (
            <span key={`palier-${bornes[i]}`} className="flex items-center gap-1">
              <span className={`inline-block size-3 rounded-[3px] ${classeCran(i + 1, bornes.length)}`} aria-hidden />
              <span className="tabular-nums">{libellePalier(bornes, i)}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
