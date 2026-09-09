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

export function isSnapshot(x: unknown): x is VentesSnapshot {
  const s = x as VentesSnapshot;
  return (
    !!s &&
    typeof s === "object" &&
    Array.isArray(s.months) &&
    s.months.length > 0 &&
    !!s.stores &&
    Object.keys(s.stores).length > 0 &&
    Object.values(s.stores).every((rows) => rows.length === s.months.length) &&
    typeof s.generated_at === "string" &&
    isUnmapped(s.unmapped)
  );
}

export async function readSnapshot(): Promise<VentesSnapshot | null> {
  const raw = await redis.get(VENTES_KEY);
  return raw ? (JSON.parse(raw) as VentesSnapshot) : null;
}
