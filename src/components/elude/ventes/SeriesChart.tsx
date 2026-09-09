import type { MonthRow } from "@/lib/ventes";

import { eur, libelleMois } from "./format";

/**
 * Chiffre d'affaires (aire + ligne) et nombre de commandes (barres), par
 * mois, pour les canaux web et hors web. Transposition directe de
 * `drawMens` dans la note publiée (storefront-paie.html).
 *
 * ⚠️ Décalage d'indices : dans la note, une ligne est [mois, nb_web, ca_web,
 * nb_hors, ca_hors, ...] (mois en position 0). Ici `MonthRow` n'a pas le
 * mois — tout est décalé de un : nb_web = row[0], ca_web = row[1],
 * nb_hors = row[2], ca_hors = row[3].
 *
 * Le dernier mois de `months` est toujours partiel par construction de
 * l'instantané (arrêté au jour de la génération) — jamais déterminé par une
 * date en dur. Signalé par un dernier segment en pointillé sur chaque ligne
 * de CA, une barre atténuée sur chaque panneau de volume, et une mention
 * textuelle : un pointillé seul ne se décode pas assez vite.
 */

/**
 * Échelle dont TOUTES les graduations sont rondes, pas seulement le maximum :
 * on choisit d'abord le PAS parmi des valeurs rondes, puis le maximum comme un
 * multiple de ce pas.
 *
 * 🪤 Un `niceMax` seul ne suffit pas — c'est le piège corrigé ici. Il rendait
 * bien un maximum rond (125 pour un pic à 121), mais les graduations
 * intermédiaires en découlaient par division : l'axe « hors web · nombre de
 * commandes » affichait **0 / 63 / 125** (63 = 62,5 arrondi) quand l'axe jumeau
 * juste au-dessus faisait 0 / 40 / 80. Même défaut, plus grave, sur l'axe CA dès
 * qu'on filtre sur une petite boutique : un maximum de 2 000 € donnait cinq
 * graduations affichées « 0 · 1k € · 1k € · 2k € · 2k € » — deux doublons.
 *
 * `pas` exclut 2,5 quand l'axe compte des entiers (`entier`), sinon une échelle
 * de 0 à 5 commandes graduerait tous les 2,5.
 */
function echelleRonde(vmax: number, intervalles: number, entier: boolean): { max: number; ticks: number[] } {
  if (!(vmax > 0)) return { max: 1, ticks: [0, 1] };
  const p = 10 ** Math.floor(Math.log10(vmax / intervalles));
  const paliers = entier ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const pas = paliers.map((k) => k * p).find((s) => Math.ceil(vmax / s) <= intervalles) ?? 10 * p;
  const max = pas * Math.ceil(vmax / pas);
  const ticks: number[] = [];
  for (let t = 0; t <= max + pas / 1000; t += pas) ticks.push(t);
  return { max, ticks };
}

/**
 * Étiquette d'un montant sur l'axe CA. L'unité suit l'échelle plutôt que d'être
 * figée en milliers : sous 10 000 €, `Math.round(v / 1000)` écrasait toutes les
 * graduations sur « 0 » et « 1k € ».
 */
function montantAxe(v: number, max: number): string {
  if (v === 0) return "0";
  if (max < 10_000) return `${Math.round(v).toLocaleString("fr-FR")} €`;
  return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k €`;
}

interface Bloc {
  name: string;
  couleur: string;
  ca: (r: MonthRow) => number;
  vol: (r: MonthRow) => number;
}

const BLOCS: Bloc[] = [
  { name: "Ventes web", couleur: "var(--web)", ca: (r) => r[1], vol: (r) => r[0] },
  { name: "Ventes hors web", couleur: "var(--hors)", ca: (r) => r[3], vol: (r) => r[2] },
];

export function SeriesChart(props: {
  months: string[];
  rows: MonthRow[];
  golives: { store: string; date: string }[];
  showBand: boolean;
}) {
  const { months, rows, golives, showBand } = props;
  const n = rows.length;

  const W = 1000;
  const CA = 118;
  const VOL = 56;
  const INNER = 34;
  const BLOC = 52;
  const L = 58;
  const R = 16;
  const T = 16;
  const B = 26;
  const BH = CA + INNER + VOL; // hauteur d'un bloc canal
  const H = T + BH + BLOC + BH + B + 16;

  const iw = W - L - R;
  const step = iw / n;
  const x = (i: number) => L + step * i + step / 2;

  // Repères de bascule (go-live) : date ISO → mois + jour dans le mois.
  const golivesResolus = golives
    .map((g) => {
      const mois = g.date.slice(0, 7);
      const jour = Number(g.date.slice(8, 10));
      const i = months.indexOf(mois);
      return i >= 0 ? { i, jour, store: g.store } : null;
    })
    .filter((g): g is { i: number; jour: number; store: string } => g !== null);

  // Bande "période storefront" : du premier go-live à la fin de la série.
  const premierGoLive = golivesResolus.length ? Math.min(...golivesResolus.map((g) => g.i)) : null;
  const bandX = premierGoLive !== null ? x(premierGoLive) - step / 2 : null;
  const bandW = bandX !== null ? W - R - bandX : 0;

  // Moyenne historique (années pleines antérieures à la dernière, en cours) — repère du panneau volume.
  const anneeEnCours = months[n - 1]?.slice(0, 4);
  const histoIdx = months.map((m, i) => (m.slice(0, 4) !== anneeEnCours ? i : -1)).filter((i) => i >= 0);

  // Dérivées de `months`, jamais une plage écrite en dur : IndexChart reçoit le même
  // `months` et est empilé juste au-dessus sur la page — deux listes à la main finissent
  // par diverger (ex. IndexChart s'arrêtait à 2026, ce fichier allait jusqu'à 2028) et
  // affichent alors deux axes différents pour la même série.
  const anneesVisibles = [...new Set(months.map((m) => m.slice(0, 4)))].map((yy) => ({
    yy,
    i: months.findIndex((m) => m.startsWith(yy)),
  }));

  return (
    // Motif repris de PaniersClient.tsx (tableau) : conteneur à défilement horizontal +
    // largeur minimale sur l'élément large, plutôt que de laisser le SVG (sans intrinsèque
    // largeur/hauteur, il se contente de remplir son conteneur) s'écraser sur mobile — à
    // ~330 px utiles le texte à fontSize 10.5 tombe à ~3,5 px, illisible. La largeur
    // minimale reprend W : le SVG rend alors ses unités 1:1, comme sur un desktop actuel.
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Chiffre d'affaires et nombre de commandes par mois, web et hors web"
        className="min-w-[1000px]"
      >
        {n > 0 && (
          <text x={W - R} y={T - 4} textAnchor="end" fontSize={10.5} fill="var(--muted-foreground)">
            {`${libelleMois(months[n - 1])} : mois partiel — dernier segment en pointillé`}
          </text>
        )}
        {BLOCS.map((bloc, bi) => {
          const y0 = T + bi * (BH + BLOC);
          const echCA = echelleRonde(Math.max(...rows.map(bloc.ca)), 4, false);
          const maxCA = echCA.max;
          const yCA = (v: number) => y0 + CA - (v / maxCA) * CA;
          const vy0 = y0 + CA + INNER;
          const echV = echelleRonde(Math.max(...rows.map(bloc.vol)), 2, true);
          const maxV = echV.max;
          const yV = (v: number) => vy0 + VOL - (v / maxV) * VOL;
          const bw = Math.max(3, step * 0.56);

          const moy = histoIdx.length ? histoIdx.reduce((s, i) => s + bloc.vol(rows[i]), 0) / histoIdx.length : 0;

          // Dernier mois partiel : segment final à part, tracé en pointillé.
          const dCAplein = rows
            .slice(0, n - 1)
            .map((r, i) => `${i ? "L" : "M"} ${x(i)} ${yCA(bloc.ca(r))}`)
            .join(" ");
          const dCAdernier = `M ${x(n - 2)} ${yCA(bloc.ca(rows[n - 2]))} L ${x(n - 1)} ${yCA(bloc.ca(rows[n - 1]))}`;
          const aireCA = `M ${x(0)} ${y0 + CA} ${rows
            .map((r, i) => `L ${x(i)} ${yCA(bloc.ca(r))}`)
            .join(" ")} L ${x(n - 1)} ${y0 + CA} Z`;

          return (
            <g key={bloc.name}>
              {/* --- panneau CA : aire + ligne --- */}
              {showBand && bandX !== null && <rect x={bandX} y={y0} width={bandW} height={CA} fill="var(--muted)" />}
              {echCA.ticks.map((v) => (
                <g key={v}>
                  <line x1={L} x2={W - R} y1={yCA(v)} y2={yCA(v)} stroke="var(--border)" strokeWidth={1} />
                  <text x={L - 8} y={yCA(v) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--muted-foreground)">
                    {montantAxe(v, maxCA)}
                  </text>
                </g>
              ))}
              <path d={aireCA} fill={bloc.couleur} fillOpacity={0.1} stroke="none" />
              <path
                d={dCAplein}
                fill="none"
                stroke={bloc.couleur}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {n >= 2 && (
                <path
                  d={dCAdernier}
                  fill="none"
                  stroke={bloc.couleur}
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  strokeLinecap="round"
                />
              )}
              <circle
                cx={x(n - 1)}
                cy={yCA(bloc.ca(rows[n - 1]))}
                r={4}
                fill={bloc.couleur}
                stroke="var(--background)"
                strokeWidth={2}
              />
              <text x={L} y={y0 - 4} fontSize={11} fontWeight={500} fill={bloc.couleur}>
                {bloc.name} · chiffre d'affaires HT
              </text>

              {/* --- panneau volume : barres --- */}
              {showBand && bandX !== null && <rect x={bandX} y={vy0} width={bandW} height={VOL} fill="var(--muted)" />}
              {echV.ticks.map((v) => (
                <g key={v}>
                  <line x1={L} x2={W - R} y1={yV(v)} y2={yV(v)} stroke="var(--border)" strokeWidth={1} />
                  <text x={L - 8} y={yV(v) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--muted-foreground)">
                    {v.toLocaleString("fr-FR")}
                  </text>
                </g>
              ))}
              {rows.map((r, i) => {
                const h = vy0 + VOL - yV(bloc.vol(r));
                if (h <= 0) return null;
                const dernier = i === n - 1;
                return (
                  <rect
                    key={months[i]}
                    x={x(i) - bw / 2}
                    y={yV(bloc.vol(r))}
                    width={bw}
                    height={h}
                    fill={bloc.couleur}
                    fillOpacity={dernier ? 0.32 : 0.72}
                    rx={1.5}
                  />
                );
              })}
              <text x={L} y={vy0 - 6} fontSize={11} fontWeight={500} fill={bloc.couleur}>
                {bloc.name} · nombre de commandes
              </text>
              {histoIdx.length > 0 && (
                <>
                  <line
                    x1={L}
                    x2={W - R}
                    y1={yV(moy)}
                    y2={yV(moy)}
                    stroke={bloc.couleur}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    strokeOpacity={0.85}
                  />
                  <text
                    x={(bandX ?? W - R) - 14}
                    y={yV(moy) - 5}
                    textAnchor="end"
                    fontSize={10.5}
                    fill={bloc.couleur}
                    stroke="var(--background)"
                    strokeWidth={3.5}
                    paintOrder="stroke"
                  >
                    {`moyenne historique · ${Math.round(moy)} cde/mois`}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* repères go-live */}
        {golivesResolus.map((g) => (
          <line
            key={g.store}
            x1={x(g.i) + (g.jour / 30 - 0.5) * step}
            x2={x(g.i) + (g.jour / 30 - 0.5) * step}
            y1={T}
            y2={T + BH + BLOC + BH}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        ))}

        {/* axe X */}
        {anneesVisibles.map(({ yy, i }) => (
          <text
            key={yy}
            x={x(i)}
            y={T + BH + BLOC + BH + 18}
            textAnchor="start"
            fontSize={10.5}
            fill="var(--foreground)"
          >
            {yy}
          </text>
        ))}

        {/* zones de survol */}
        {rows.map((r, i) => (
          <rect key={months[i]} x={x(i) - step / 2} y={T} width={step} height={BH + BLOC + BH} fill="transparent">
            <title>
              {`${libelleMois(months[i])}${i === n - 1 ? " (mois partiel)" : ""}\nWeb — ${r[0]} commandes · ${eur(r[1])}\nHors web — ${r[2]} commandes · ${eur(r[3])}`}
            </title>
          </rect>
        ))}
      </svg>
    </div>
  );
}
