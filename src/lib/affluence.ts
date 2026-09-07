/**
 * Damier jour de semaine × heure — helpers purs, partagés par la route
 * `/api/affluence` et la carte `AffluenceHeatmap`.
 *
 * Le découpage horaire lui-même se fait en SQL, en `Europe/Paris` : le conteneur
 * tourne en UTC, et une commande passée à 01 h du matin en été compterait la
 * veille, à 23 h — soit la MAUVAISE case sur les deux axes à la fois.
 */

/** Lundi en premier : `isodow` de Postgres vaut 1 le lundi, 7 le dimanche. */
export const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
export const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

export interface CaseAffluence {
  /** `isodow` Postgres : 1 = lundi … 7 = dimanche. */
  dow: number;
  /** Heure pleine 0…23, en heure de Paris. */
  h: number;
  n: number;
}

/** 7 lignes (lundi → dimanche) × 24 heures, tout à zéro. */
export function matriceVide(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

/**
 * Ventile des lignes `(dow, h, n)` dans la matrice.
 *
 * 🪤 `dow - 1` : Postgres numérote le lundi 1, le tableau l'indexe 0. Sans le
 * décalage tout glisse d'un jour — un pic du mercredi se lirait le mardi, et
 * rien dans l'écran ne le signalerait.
 */
export function versMatrice(lignes: CaseAffluence[]): number[][] {
  const m = matriceVide();
  for (const { dow, h, n } of lignes) {
    if (dow < 1 || dow > 7 || h < 0 || h > 23) continue;
    m[dow - 1][h] += n;
  }
  return m;
}

export function additionne(a: number[][], b: number[][]): number[][] {
  return a.map((ligne, j) => ligne.map((v, h) => v + b[j][h]));
}

export function totalParJour(m: number[][]): number[] {
  return m.map((ligne) => ligne.reduce((s, v) => s + v, 0));
}

export function totalParHeure(m: number[][]): number[] {
  return Array.from({ length: 24 }, (_, h) => m.reduce((s, ligne) => s + ligne[h], 0));
}

export function total(m: number[][]): number {
  return m.reduce((s, ligne) => s + ligne.reduce((t, v) => t + v, 0), 0);
}

/**
 * Bornes hautes des paliers de couleur, croissantes, quatre au plus.
 *
 * ── Pourquoi des paliers ABSOLUS et pas des quantiles ───────────────────────
 *
 * Mesuré le 07/09 : 121 commandes+devis pour 168 créneaux, 58 cases occupées,
 * maximum 7. Une échelle en quantiles étale ce quasi-rien sur toute la rampe :
 * une case à 1 sortirait au même niveau qu'une case à 1 dans un mois où le
 * maximum serait 40. Les paliers suivent le maximum réel, et la légende les
 * affiche en clair — on lit « 1-2 » et « 7 », pas un dégradé sans unité.
 *
 * 🪤 Dédupliqué : à `max = 2`, `[1, 2, 3, 4]` inventerait deux paliers qu'aucune
 * case ne peut atteindre, et la légende annoncerait un volume qui n'existe pas.
 */
export function paliers(max: number): number[] {
  if (max <= 0) return [];
  const pas = Math.max(1, Math.ceil(max / 4));
  const bornes = [1, 2, 3, 4].map((i) => Math.min(max, i * pas));
  return [...new Set(bornes)];
}

/** 0 = case vide, puis 1…`paliers.length` du plus clair au plus foncé. */
export function niveau(v: number, bornes: number[]): number {
  if (v <= 0 || bornes.length === 0) return 0;
  const i = bornes.findIndex((b) => v <= b);
  return i === -1 ? bornes.length : i + 1;
}

/** Libellé d'un palier pour la légende : « 1 », « 3-4 »… */
export function libellePalier(bornes: number[], i: number): string {
  const bas = i === 0 ? 1 : bornes[i - 1] + 1;
  const haut = bornes[i];
  return bas === haut ? String(bas) : `${bas}-${haut}`;
}
