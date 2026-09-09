/** Formatage partagé entre `IndexChart` et `SeriesChart` — deux composants
 * sœurs affichant les mêmes mois, ils ne doivent pas diverger sur la forme. */

const MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** "2026-08" → "août 2026". */
export function libelleMois(mois: string): string {
  const m = Number(mois.slice(5, 7)) - 1;
  return `${MOIS_FR[m]} ${mois.slice(0, 4)}`;
}

export function eur(n: number): string {
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}
