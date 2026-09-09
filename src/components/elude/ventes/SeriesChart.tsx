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

/** Graduation "ronde" juste au-dessus de v (1×, 1,25×, 1,5×, 2×, 2,5×... × 10^k). */
function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const paliers = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const k of paliers) if (k * p >= v) return k * p;
  return 10 * p;
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

  const anneesVisibles = ["2023", "2024", "2025", "2026", "2027", "2028"]
    .map((yy) => ({ yy, i: months.findIndex((m) => m.startsWith(yy)) }))
    .filter((a) => a.i >= 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Chiffre d'affaires et nombre de commandes par mois, web et hors web"
    >
      {n > 0 && (
        <text x={W - R} y={T - 4} textAnchor="end" fontSize={10.5} fill="var(--muted-foreground)">
          {`${libelleMois(months[n - 1])} : mois partiel — dernier segment en pointillé`}
        </text>
      )}
      {BLOCS.map((bloc, bi) => {
        const y0 = T + bi * (BH + BLOC);
        const maxCA = niceMax(Math.max(...rows.map(bloc.ca)));
        const yCA = (v: number) => y0 + CA - (v / maxCA) * CA;
        const vy0 = y0 + CA + INNER;
        const maxV = niceMax(Math.max(...rows.map(bloc.vol)));
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
            {Array.from({ length: 5 }, (_, g) => (maxCA * g) / 4).map((v, g) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={yCA(v)} y2={yCA(v)} stroke="var(--border)" strokeWidth={1} />
                <text x={L - 8} y={yCA(v) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--muted-foreground)">
                  {g ? `${Math.round(v / 1000)}k €` : "0"}
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
            {[0, maxV / 2, maxV].map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={yV(v)} y2={yV(v)} stroke="var(--border)" strokeWidth={1} />
                <text x={L - 8} y={yV(v) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--muted-foreground)">
                  {Math.round(v)}
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
        <text key={yy} x={x(i)} y={T + BH + BLOC + BH + 18} textAnchor="start" fontSize={10.5} fill="var(--foreground)">
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
  );
}
