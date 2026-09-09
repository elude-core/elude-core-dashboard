import type { MonthRow } from "@/lib/ventes";

/**
 * Multiples du mois moyen de 2025, pour une mesure (nb de commandes, CA)
 * choisie par `mode`. Transposition directe de `drawIdx` dans la note
 * publiée (storefront-paie.html) : même géométrie, mêmes graduations,
 * même anti-collision des étiquettes de fin de courbe.
 *
 * ⚠️ Décalage d'indices : dans la note, une ligne est [mois, nb_web, ca_web,
 * nb_hors, ca_hors, ...] (mois en position 0). Ici `MonthRow` n'a pas le
 * mois — tout est décalé de un : nb_web = row[0], ca_web = row[1],
 * nb_hors = row[2], ca_hors = row[3].
 */

const MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function libelleMois(mois: string): string {
  const m = Number(mois.slice(5, 7)) - 1;
  return `${MOIS_FR[m]} ${mois.slice(0, 4)}`;
}

function eur(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

function fmtIndice(v: number): string {
  return `×${(v / 100).toFixed(2).replace(".", ",")}`;
}

type Mode = "web" | "hors" | "tout";

/** Nombre de commandes et CA pour la mesure sélectionnée, par ligne mensuelle. */
const MESURES: Record<Mode, { label: string; nb: (r: MonthRow) => number; ca: (r: MonthRow) => number }> = {
  web: { label: "Ventes web", nb: (r) => r[0], ca: (r) => r[1] },
  hors: { label: "Ventes hors web", nb: (r) => r[2], ca: (r) => r[3] },
  tout: { label: "Tout confondu", nb: (r) => r[0] + r[2], ca: (r) => r[1] + r[3] },
};

export function IndexChart(props: { months: string[]; rows: MonthRow[]; mode: "web" | "hors" | "tout" }) {
  const { months, rows, mode } = props;
  const mesure = MESURES[mode];
  const n = rows.length;

  // Base 100 = moyenne des douze mois de 2025 pour la mesure choisie.
  const idx2025: number[] = [];
  months.forEach((m, i) => {
    if (m.startsWith("2025")) idx2025.push(i);
  });
  let baseCA = 0;
  let baseNB = 0;
  for (const i of idx2025) {
    baseCA += mesure.ca(rows[i]);
    baseNB += mesure.nb(rows[i]);
  }
  baseCA /= idx2025.length || 1;
  baseNB /= idx2025.length || 1;

  if (!(baseCA > 0) || !(baseNB > 0)) {
    return (
      <p className="text-muted-foreground text-sm">
        Pas assez de données 2025 sur cette sélection pour construire un indice.
      </p>
    );
  }

  const idxCA = rows.map((r) => (mesure.ca(r) / baseCA) * 100);
  const idxNB = rows.map((r) => (mesure.nb(r) / baseNB) * 100);

  const W = 1000;
  const H = 250;
  const L = 52;
  const R = 86;
  const T = 22;
  const B = 32;
  const iw = W - L - R;
  const step = iw / n;
  const x = (i: number) => L + step * i + step / 2;

  // Graduations en multiples ronds : pas de 0,5× / 1× / 2× selon l'amplitude — jamais l'indice brut.
  const brut = Math.max(...idxCA, ...idxNB, 120);
  const pas = brut <= 260 ? 50 : brut <= 550 ? 100 : 200;
  const max = Math.ceil(brut / pas) * pas;
  const y = (v: number) => T + (H - T - B) - (v / max) * (H - T - B);

  const graduations: number[] = [];
  for (let v = 0; v <= max; v += pas) graduations.push(v);

  // Courbes : dernier segment en pointillé (mois partiel), étiquette directe en fin de courbe.
  const series: { valeurs: number[]; couleur: string; label: string }[] = [
    { valeurs: idxCA, couleur: "var(--mes-ca)", label: "CA" },
    { valeurs: idxNB, couleur: "var(--mes-nb)", label: "cdes" },
  ];
  const fins = series
    .map((s) => ({ y: y(s.valeurs[n - 1]), label: `${s.label} ${fmtIndice(s.valeurs[n - 1])}`, couleur: s.couleur }))
    .sort((a, b) => a.y - b.y);
  if (fins.length === 2 && fins[1].y - fins[0].y < 13) {
    const manque = 13 - (fins[1].y - fins[0].y);
    fins[0].y -= manque / 2;
    fins[1].y = fins[0].y + 13;
  }

  const anneesVisibles = ["2023", "2024", "2025", "2026"]
    .map((yy) => ({ yy, i: months.findIndex((m) => m.startsWith(yy)) }))
    .filter((a) => a.i >= 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${mesure.label} : CA et nombre de commandes ramenés en base 100 sur le mois moyen de 2025`}
    >
      {graduations.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="gridline" stroke="var(--border)" strokeWidth={1} />
          {/* le repère 1× a déjà sa propre étiquette explicite juste en dessous — pas de doublon ici */}
          {v !== 100 && (
            <text x={L - 8} y={y(v) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--muted-foreground)">
              {(v / 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}×
            </text>
          )}
        </g>
      ))}

      {/* repère base 1× */}
      <line
        x1={L}
        x2={W - R}
        y1={y(100)}
        y2={y(100)}
        stroke="var(--muted-foreground)"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <text x={L + 2} y={T - 8} fontSize={10.5} fill="var(--muted-foreground)">
        × le mois moyen de 2025 · ligne pointillée = 1× = {eur(Math.round(baseCA))} / {Math.round(baseNB)} cdes
      </text>

      {/* écart entre les deux courbes */}
      <path
        d={`${idxCA.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ")} ${idxNB
          .map((_v, i) => `L ${x(n - 1 - i)} ${y(idxNB[n - 1 - i])}`)
          .join(" ")} Z`}
        fill="var(--border)"
        fillOpacity={0.5}
        stroke="none"
      />

      {series.map((s) => (
        <g key={s.label}>
          <path
            d={s.valeurs
              .slice(0, n - 1)
              .map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`)
              .join(" ")}
            fill="none"
            stroke={s.couleur}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={`M ${x(n - 2)} ${y(s.valeurs[n - 2])} L ${x(n - 1)} ${y(s.valeurs[n - 1])}`}
            fill="none"
            stroke={s.couleur}
            strokeWidth={2}
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
          <circle
            cx={x(n - 1)}
            cy={y(s.valeurs[n - 1])}
            r={4}
            fill={s.couleur}
            stroke="var(--background)"
            strokeWidth={2}
          />
        </g>
      ))}
      {fins.map((f) => (
        <text key={f.label} x={x(n - 1) + 9} y={f.y + 4} fontSize={11} fontWeight={500} fill={f.couleur}>
          {f.label}
        </text>
      ))}

      {anneesVisibles.map(({ yy, i }) => (
        <text key={yy} x={x(i)} y={H - B + 18} textAnchor="start" fontSize={10.5} fill="var(--muted-foreground)">
          {yy}
        </text>
      ))}

      {rows.map((r, i) => (
        <rect key={months[i]} x={x(i) - step / 2} y={T} width={step} height={H - T - B} fill="transparent">
          <title>
            {`${libelleMois(months[i])} — ${mesure.label.toLowerCase()}\nMontant : ${eur(mesure.ca(r))} (${fmtIndice(idxCA[i])})\nCommandes : ${mesure.nb(r)} (${fmtIndice(idxNB[i])})`}
          </title>
        </rect>
      ))}
    </svg>
  );
}
