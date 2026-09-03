"use client";

import { useId, useState } from "react";

import type { JourTimeline } from "@/app/api/commerce-stats/route";

/**
 * CA HT par jour, avec la moyenne glissante 7 jours.
 *
 * ── Pourquoi une moyenne 7 j, et pas seulement des barres ───────────────────
 *
 * Mesuré le 03/09 : 19 jours sans aucune commande sur 52, et un rapport de 4,8
 * entre le jour médian (555 € HT) et le meilleur (2 664 € HT). Les barres seules
 * dessinent un peigne où l'œil ne lit aucune tendance — or c'est la tendance
 * qu'on vient chercher. Les barres gardent la vérité brute, la ligne porte le
 * signal. La moyenne est GLISSANTE SUR 7 JOURS exactement pour absorber le
 * cycle hebdomadaire : sans ça, chaque week-end se lirait comme un effondrement.
 *
 * ── 🪤 Le dernier point est un jour EN COURS ────────────────────────────────
 *
 * La dernière barre est celle d'aujourd'hui, forcément incomplète : consultée le
 * matin, elle montre une chute qui n'existe pas. Elle est donc hachurée, et
 * SURTOUT exclue de la moyenne glissante — sinon la ligne plongerait sur son
 * dernier segment tous les jours, à chaque ouverture de l'écran.
 *
 * ── 🪤 Ne pas utiliser les tokens `--chart-*` ───────────────────────────────
 *
 * Ils sont IDENTIQUES en clair et en sombre dans `globals.css` (`--chart-5` vaut
 * `oklch(0.269 0 0)` dans les deux thèmes) : un graphe bâti dessus serait
 * invisible sur `bg-gray-900`. D'où des classes Tailwind à variante `dark:`,
 * comme le reste du panneau. La palette reste achromatique, c'est le parti pris
 * du dashboard — pas un accent oublié.
 */

/** Arrondi vers le haut sur un palier lisible, pour que l'axe tombe juste. */
function maxLisible(v: number): number {
  if (!(v > 0)) return 1;
  const ordre = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (v <= m * ordre) return m * ordre;
  }
  return 10 * ordre;
}

const euros = (v: number): string => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

/** `2026-09-03` → Date locale, à midi pour ne dépendre d'aucun fuseau. */
const versDate = (jour: string): Date => new Date(`${jour}T12:00:00`);

const L = 46;
const R = 6;
const H = 8;
const B = 22;
const W = 720;
const HAUT = 200;
const PW = W - L - R;
const PH = HAUT - H - B;

export function CaTimelineChart({ timeline }: { timeline: JourTimeline[] }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const hachures = useId();

  if (timeline.length === 0) return null;

  const n = timeline.length;
  const dernier = n - 1;
  const plafond = maxLisible(Math.max(...timeline.map((d) => d.caHt)));

  const slot = PW / n;
  const largeurBarre = Math.max(1.5, Math.min(15, slot * 0.64));
  const xCentre = (i: number) => L + slot * (i + 0.5);
  const y = (v: number) => H + PH * (1 - v / plafond);

  // 🪤 `null` avant J+6 (pas assez d'historique) ET sur aujourd'hui (jour partiel).
  const moyenne = timeline.map((_, i) =>
    i < 6 || i === dernier ? null : timeline.slice(i - 6, i + 1).reduce((s, d) => s + d.caHt, 0) / 7,
  );
  const pointsMoyenne = moyenne
    .map((v, i) => (v === null ? null : `${xCentre(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter((p): p is string => p !== null)
    .join(" ");

  const graduations = [0, plafond / 2, plafond];
  // L'index ET le jour ensemble : l'infobulle a besoin des deux, et les garder
  // dans un même objet évite de redémontrer à TypeScript que `survol` n'est
  // plus `null` à chaque usage.
  const infobulle = survol !== null && timeline[survol] ? { i: survol, d: timeline[survol] } : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${HAUT}`}
        className="w-full"
        role="img"
        aria-label={`CA HT par jour du ${timeline[0].jour} au ${timeline[dernier].jour}, avec moyenne glissante 7 jours`}
        onPointerLeave={() => setSurvol(null)}
      >
        <defs>
          <pattern id={hachures} width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="4" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Bandes week-end : elles EXPLIQUENT une partie des creux — sans elles,
            un samedi à zéro se lit comme une panne de tunnel. Toutes les autres
            barres nulles sont, elles, de vrais jours ouvrés sans commande. */}
        {timeline.map((d, i) => {
          const jsem = versDate(d.jour).getDay();
          if (jsem !== 0 && jsem !== 6) return null;
          return (
            <rect
              key={`we-${d.jour}`}
              x={L + slot * i}
              y={H}
              width={slot}
              height={PH}
              className="fill-gray-100/70 dark:fill-gray-800/40"
            />
          );
        })}

        {graduations.map((g) => (
          <g key={g}>
            <line
              x1={L}
              x2={W - R}
              y1={y(g)}
              y2={y(g)}
              className="stroke-gray-200 dark:stroke-gray-700"
              strokeWidth="1"
            />
            <text
              x={L - 8}
              y={y(g) + 3.5}
              textAnchor="end"
              className="fill-gray-400 text-[10px] tabular-nums dark:fill-gray-500"
            >
              {euros(g)}
            </text>
          </g>
        ))}

        {timeline.map((d, i) => {
          const hauteur = d.caHt > 0 ? Math.max(1.5, PH * (d.caHt / plafond)) : 0;
          const enCours = i === dernier;
          return (
            <rect
              key={d.jour}
              x={xCentre(i) - largeurBarre / 2}
              y={H + PH - hauteur}
              width={largeurBarre}
              height={hauteur}
              rx={largeurBarre > 4 ? 1.5 : 0}
              fill={enCours ? `url(#${hachures})` : undefined}
              className={
                enCours
                  ? undefined
                  : survol === i
                    ? "fill-gray-900 dark:fill-gray-100"
                    : "fill-gray-300 dark:fill-gray-600"
              }
            />
          );
        })}

        {pointsMoyenne && (
          <polyline
            points={pointsMoyenne}
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-gray-900 dark:stroke-gray-100"
          />
        )}

        {/* Étiquettes d'axe : le 1er de chaque mois, plus le tout premier jour. */}
        {timeline.map((d, i) => {
          const dt = versDate(d.jour);
          const premierDuMois = dt.getDate() === 1;
          if (!premierDuMois && i !== 0) return null;
          if (premierDuMois && i < 4) return null;
          return (
            <text
              key={`x-${d.jour}`}
              x={xCentre(i)}
              y={HAUT - 7}
              textAnchor={i === 0 ? "start" : "middle"}
              className="fill-gray-400 text-[10px] dark:fill-gray-500"
            >
              {dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </text>
          );
        })}

        {/* Zones de survol pleine hauteur : viser une barre de 4 px est impossible. */}
        {timeline.map((d, i) => (
          <rect
            key={`h-${d.jour}`}
            x={L + slot * i}
            y={H}
            width={slot}
            height={PH}
            fill="transparent"
            onPointerEnter={() => setSurvol(i)}
          />
        ))}
      </svg>

      {infobulle && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-800"
          style={{
            left: `${Math.min(88, Math.max(12, (xCentre(infobulle.i) / W) * 100))}%`,
            bottom: "calc(100% - 12px)",
          }}
        >
          <div className="whitespace-nowrap font-medium">
            {versDate(infobulle.d.jour).toLocaleDateString("fr-FR", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
            {infobulle.i === dernier && <span className="ml-1 text-muted-foreground">· en cours</span>}
          </div>
          <div className="whitespace-nowrap tabular-nums">
            {euros(infobulle.d.caHt)} € HT
            <span className="ml-1.5 text-muted-foreground">
              {infobulle.d.commandes} cmd{infobulle.d.commandes > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2 rounded-[1px] bg-gray-300 dark:bg-gray-600" />
          CA du jour
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-gray-900 dark:bg-gray-100" />
          moyenne 7 j
        </span>
        <span>bandes grisées : week-ends</span>
        <span>dernière barre : jour en cours, hors moyenne</span>
      </div>
    </div>
  );
}
