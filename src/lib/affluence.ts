/**
 * Damier jour de semaine × heure — helpers purs de la facette « créneau ».
 *
 * ── Le damier compte les MÊMES lignes que la liste ──────────────────────────
 *
 * Il a d'abord vécu sur son propre agrégat SQL (`/api/affluence`, retiré) :
 * plus de volume, mais aucun filtre de la page ne pouvait l'atteindre, et on ne
 * pouvait pas cliquer dedans. Une facette doit partager la population des
 * autres, sinon « 22 commandes » dans une carte et « 19 » dans la voisine se
 * contredisent sans que rien ne l'explique.
 *
 * 🪤 Conséquence assumée : la population est celle des PANIERS (`cart`), pas de
 * la table `order`. Mesuré le 07/09 sur 90 j : 99 paniers portent un
 * `completed_at` pour 86 commandes vivantes — 13 annulées ou brouillons, que
 * l'écran /paniers compte déjà comme « Commande ✓ » dans ses tuiles. Le damier
 * hérite de cette convention plutôt que d'en inventer une troisième.
 */

/** Lundi en premier, comme `isodow` : 1 = lundi … 7 = dimanche, indexés 0…6. */
export const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
export const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

/** 0…23. Itérer sur les VALEURS, pas sur un index : l'heure identifie la colonne. */
export const HEURES = Array.from({ length: 24 }, (_, h) => h);

/**
 * Sélection du damier. `jour` seul = toute une ligne, `heure` seule = toute une
 * colonne, les deux = une case.
 */
export interface Creneau {
  /** 0 = lundi … 6 = dimanche. */
  jour: number | null;
  heure: number | null;
}

const FMT_PARIS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  weekday: "short",
  hour: "2-digit",
  hour12: false,
});

const INDEX_JOUR: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/**
 * Jour de semaine et heure d'un instant ISO, **en heure de Paris**.
 *
 * 🪤 Ni `getDay()` ni `getHours()` : ils rendent l'heure du NAVIGATEUR. Un poste
 * réglé sur UTC — ou un collègue en déplacement — verrait le damier glisser
 * d'une à deux colonnes, et rien à l'écran ne le dirait. Même règle que le
 * découpage en jours de `/api/commerce-stats`, qui groupe en
 * `AT TIME ZONE 'Europe/Paris'`.
 */
export function creneauParis(iso: string): Creneau | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let jour: number | null = null;
  let heure: number | null = null;
  for (const p of FMT_PARIS.formatToParts(d)) {
    if (p.type === "weekday") jour = INDEX_JOUR[p.value] ?? null;
    // « 24 » à minuit avec hour12:false et hourCycle h24 par défaut sur certains
    // moteurs : ramené à 0, sinon la colonne n'existe pas et la ligne se perd.
    if (p.type === "hour") heure = Number(p.value) % 24;
  }
  return jour === null || heure === null || Number.isNaN(heure) ? null : { jour, heure };
}

/** 7 lignes (lundi → dimanche) × 24 heures, tout à zéro. */
export function matriceVide(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

/** Ventile des instants ISO dans la matrice. Un instant illisible est ignoré. */
export function versMatrice(instants: Array<string | null>): number[][] {
  const m = matriceVide();
  for (const iso of instants) {
    if (!iso) continue;
    const c = creneauParis(iso);
    if (c && c.jour !== null && c.heure !== null) m[c.jour][c.heure] += 1;
  }
  return m;
}

/** Une sélection vide (les deux axes à `null`) ne filtre rien. */
export function creneauVide(c: Creneau | null): boolean {
  return !c || (c.jour === null && c.heure === null);
}

/** La sélection retient-elle cet instant ? */
export function dansCreneau(iso: string | null, c: Creneau | null): boolean {
  if (creneauVide(c) || !c) return true;
  if (!iso) return false;
  const p = creneauParis(iso);
  if (!p) return false;
  return (c.jour === null || c.jour === p.jour) && (c.heure === null || c.heure === p.heure);
}

/**
 * Bascule d'une sélection : re-cliquer la même case la retire, cliquer une
 * ligne ou une colonne remplace l'axe correspondant.
 */
export function bascule(actuel: Creneau | null, clic: Creneau): Creneau | null {
  if (actuel && actuel.jour === clic.jour && actuel.heure === clic.heure) return null;
  return clic;
}

export function libelleCreneau(c: Creneau): string {
  if (c.jour !== null && c.heure !== null) return `${JOURS[c.jour]} ${c.heure} h`;
  if (c.jour !== null) return JOURS[c.jour];
  return `${c.heure} h, tous les jours`;
}

export function totalParJour(m: number[][]): number[] {
  return m.map((ligne) => ligne.reduce((s, v) => s + v, 0));
}

export function totalParHeure(m: number[][]): number[] {
  return HEURES.map((h) => m.reduce((s, ligne) => s + ligne[h], 0));
}

export function total(m: number[][]): number {
  return m.reduce((s, ligne) => s + ligne.reduce((t, v) => t + v, 0), 0);
}

/**
 * Échelle de couleur : bornes hautes des paliers, et si le maximum les dépasse.
 *
 * ── 🪤 Caler la rampe sur le MAXIMUM laisse un seul outlier tout éteindre ───
 *
 * Mesuré le 07/09, damier des paniers sur 90 j : le robot de 6 h porte une case
 * à 21 quand l'activité humaine vit entre 1 et 8. Une rampe calée sur 21 range
 * quasiment toutes les vraies cases dans le cran le plus pâle — le damier
 * devient une feuille blanche avec une colonne grise à 6 h. Le bruit décide de
 * la lecture du signal.
 *
 * L'échelle se cale donc sur le **95ᵉ centile des cases occupées** et le dernier
 * cran SATURE : la case à 21 reste la plus foncée, mais les nuances reviennent
 * là où il se passe quelque chose. La légende écrit « 10+ » plutôt que « 10-12 »
 * quand c'est le cas — un plafond affiché n'est pas un plafond caché.
 *
 * 🪤 Le centile se calcule sur les cases NON VIDES : 168 créneaux dont une
 * centaine à zéro tireraient n'importe quel quantile vers 0.
 *
 * 🪤 Bornes dédoublonnées : à `haut = 2`, `[1, 2, 3, 4]` inventerait deux
 * paliers qu'aucune case ne peut atteindre, et la légende annoncerait un volume
 * qui n'existe pas.
 */
export function echelle(valeurs: number[]): { bornes: number[]; sature: boolean } {
  const occupees = valeurs.filter((v) => v > 0).sort((a, b) => a - b);
  if (occupees.length === 0) return { bornes: [], sature: false };
  const max = occupees[occupees.length - 1];
  const p95 = occupees[Math.min(occupees.length - 1, Math.ceil(0.95 * occupees.length) - 1)];
  const haut = Math.max(1, p95);
  const pas = Math.max(1, Math.ceil(haut / 4));
  const bornes = [...new Set([1, 2, 3, 4].map((i) => Math.min(haut, i * pas)))];
  return { bornes, sature: max > bornes[bornes.length - 1] };
}

/** 0 = case vide, puis 1…`bornes.length` du plus clair au plus foncé. */
export function niveau(v: number, bornes: number[]): number {
  if (v <= 0 || bornes.length === 0) return 0;
  const i = bornes.findIndex((b) => v <= b);
  return i === -1 ? bornes.length : i + 1;
}

/**
 * Libellé d'un palier pour la légende : « 1 », « 3-4 », et « 10+ » sur le
 * dernier cran quand des cases le dépassent — le plafond doit se voir.
 */
export function libellePalier(bornes: number[], i: number, sature = false): string {
  const bas = i === 0 ? 1 : bornes[i - 1] + 1;
  const haut = bornes[i];
  if (sature && i === bornes.length - 1) return `${bas}+`;
  return bas === haut ? String(bas) : `${bas}-${haut}`;
}
