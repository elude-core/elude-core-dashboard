import * as Sentry from "@sentry/nextjs";

import { redis } from "./redis";

export const VENTES_KEY = "ventes:snapshot";
export const VENTES_VERSION = 1;

/** [nb_web, ca_web, nb_hors, ca_hors, nb_hors_issus_devis, nb_devis_sans_suite, marge_web, marge_hors] */
export type MonthRow = [number, number, number, number, number, number, number, number];

/** Compteur + montant pour une équipe Odoo qui ne correspond à aucune boutique connue. */
export interface UnmappedTeam {
  count: number;
  amount: number;
}

/**
 * Commandes non rattachées à une boutique : un zéro prouve la complétude
 * (séries + unmapped + Amazon = export Odoo), un montant non nul explique l'écart
 * — sans ce compteur, une boutique renommée disparaîtrait des séries en silence.
 */
export interface Unmapped {
  count: number;
  amount: number;
  teams: Record<string, UnmappedTeam>;
}

export interface VentesSnapshot {
  version: number;
  generated_at: string;
  source: string;
  months: string[];
  stores: Record<string, MonthRow[]>;
  unmapped: Unmapped;
  golives: { store: string; date: string }[];
  seasonality: { web: Record<string, number>; spread: Record<string, number> };
  /** Jamais recalculé : mesure ancrée sur pro-agrafeuses comme groupe de contrôle. */
  frozen: {
    measured_at: string;
    control_store: string;
    effect_ca: { value: number; ci: [number, number] };
    effect_margin: { value: number; ci: [number, number] };
  };
}

function isMonthRow(x: unknown): x is MonthRow {
  return Array.isArray(x) && x.length === 8 && x.every((v) => typeof v === "number" && Number.isFinite(v));
}

function isUnmappedTeam(x: unknown): x is UnmappedTeam {
  const t = x as UnmappedTeam;
  return !!t && typeof t === "object" && typeof t.count === "number" && typeof t.amount === "number";
}

function isUnmapped(x: unknown): x is Unmapped {
  const u = x as Unmapped;
  return (
    !!u &&
    typeof u === "object" &&
    typeof u.count === "number" &&
    typeof u.amount === "number" &&
    !!u.teams &&
    typeof u.teams === "object" &&
    Object.values(u.teams).every(isUnmappedTeam)
  );
}

function isGolive(x: unknown): x is { store: string; date: string } {
  const g = x as { store: string; date: string };
  return !!g && typeof g === "object" && typeof g.store === "string" && typeof g.date === "string";
}

function isNumberRecord(x: unknown): x is Record<string, number> {
  return (
    !!x &&
    typeof x === "object" &&
    !Array.isArray(x) &&
    Object.values(x as Record<string, unknown>).every((v) => typeof v === "number")
  );
}

function isEffect(x: unknown): x is { value: number; ci: [number, number] } {
  const e = x as { value: number; ci: [number, number] };
  return (
    !!e &&
    typeof e === "object" &&
    typeof e.value === "number" &&
    Array.isArray(e.ci) &&
    e.ci.length === 2 &&
    typeof e.ci[0] === "number" &&
    typeof e.ci[1] === "number"
  );
}

function isFrozen(x: unknown): x is VentesSnapshot["frozen"] {
  const f = x as VentesSnapshot["frozen"];
  return (
    !!f &&
    typeof f === "object" &&
    typeof f.measured_at === "string" &&
    typeof f.control_store === "string" &&
    isEffect(f.effect_ca) &&
    isEffect(f.effect_margin)
  );
}

// Frontière entre un JSON arrivé de l'extérieur (ingestion) ou relu depuis Redis
// (potentiellement corrompu) et le reste du dashboard : ne doit JAMAIS lever, quelle
// que soit la forme du corps reçu — d'où le filet try/catch en plus des gardes explicites.
export function isSnapshot(x: unknown): x is VentesSnapshot {
  try {
    const s = x as VentesSnapshot;
    if (!s || typeof s !== "object") return false;
    if (!Array.isArray(s.months) || s.months.length === 0) return false;
    if (!s.stores || typeof s.stores !== "object") return false;

    const rangees = Object.values(s.stores);
    if (rangees.length === 0) return false;
    if (!rangees.every((rows) => Array.isArray(rows) && rows.length === s.months.length && rows.every(isMonthRow))) {
      return false;
    }

    if (typeof s.generated_at !== "string" || Number.isNaN(Date.parse(s.generated_at))) return false;
    if (!isUnmapped(s.unmapped)) return false;
    if (!Array.isArray(s.golives) || !s.golives.every(isGolive)) return false;

    if (!s.seasonality || typeof s.seasonality !== "object") return false;
    if (!isNumberRecord(s.seasonality.web) || !isNumberRecord(s.seasonality.spread)) return false;

    if (!isFrozen(s.frozen)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Somme terme à terme les boutiques choisies ; liste vide = toutes (celles connues
 * de l'instantané, pas une liste figée ailleurs — une boutique renommée ou
 * nouvellement migrée apparaît automatiquement). Une boutique demandée mais absente
 * de `snap.stores` (nom invalide) est silencieusement ignorée plutôt que de lever :
 * la page reste utilisable même sur une sélection périmée après un renommage.
 */
export function aggregate(snap: VentesSnapshot, stores: string[]): MonthRow[] {
  const noms = stores.length > 0 ? stores : Object.keys(snap.stores);
  return snap.months.map((_mois, i) => {
    const somme: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const nom of noms) {
      const ligne = snap.stores[nom]?.[i];
      if (!ligne) continue;
      for (let k = 0; k < 8; k++) somme[k] += ligne[k];
    }
    return somme as MonthRow;
  });
}

export async function readSnapshot(): Promise<VentesSnapshot | null> {
  const raw = await redis.get(VENTES_KEY);
  if (!raw) return null;

  // Entrée Redis tronquée ou corrompue (disque plein, écriture interrompue...) :
  // ne jamais laisser planter la route, retomber comme si rien n'avait encore été ingéré.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    Sentry.captureException(err, { tags: { upstream: "ventes", cache_state: "corrupt" } });
    return null;
  }

  if (!isSnapshot(parsed)) {
    Sentry.captureException(new Error("ventes:snapshot en cache ne respecte plus le contrat"), {
      tags: { upstream: "ventes", cache_state: "invalid" },
    });
    return null;
  }

  return parsed;
}
