import { NextResponse } from "next/server";

import { type CaseAffluence, versMatrice } from "@/lib/affluence";
import { medusaDb } from "@/lib/medusa-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Heures d'affluence : commandes et devis ventilés par jour de semaine × heure.
 *
 * ── Tout est découpé en `Europe/Paris`, jamais en UTC ───────────────────────
 *
 * Le conteneur tourne en UTC. Sans la conversion, une commande de 01 h du matin
 * en été atterrit la veille à 23 h : la mauvaise case sur les DEUX axes. Même
 * règle que `/api/commerce-stats`, qui groupe déjà sa timeline ainsi.
 *
 * ── 🪤 Les paniers ne sont PAS une série de ce damier ───────────────────────
 *
 * Ils apporteraient cinq fois plus de volume (606 contre 121), et c'est
 * précisément le piège. Mesuré le 07/09 : **92 paniers sont créés entre 06 h 14
 * et 06 h 59**, chaque jour, tous e-mail nul, `0` identifié et `0` commande —
 * un robot, pas une affluence. Sur un damier des paniers, 6 h serait la case la
 * plus noire de l'écran et se lirait comme un pic d'activité matinale.
 * Tant qu'aucun marqueur ne permet de l'exclure proprement, cette série reste
 * dehors. (Les heures humaines, elles, convertissent : 42 paniers à 16 h dont
 * 21 identifiés et 19 commandes.)
 *
 * ── Fenêtre commune aux deux séries ─────────────────────────────────────────
 *
 * Du premier événement de l'historique à aujourd'hui, plafonné à 90 jours comme
 * la timeline du CA. Les deux séries partagent la même borne : sinon « plus de
 * commandes que de devis le mardi » ne voudrait rien dire, les deux ne couvrant
 * pas les mêmes semaines.
 *
 * Tables lues : `order` et `quote`, toutes deux déjà accordées à `dashboard_ro`
 * — cette liste blanche compte 8 tables, et une table hors liste sort la route
 * en 500 EN PRODUCTION SEULEMENT.
 */

export interface AffluencePayload {
  /** `[jour 0 = lundi … 6 = dimanche][heure 0…23]`, en heure de Paris. */
  commandes: number[][];
  devis: number[][];
  /**
   * Nombre de lundis, mardis… réellement couverts par la fenêtre.
   *
   * ⚠️ À afficher, pas à normaliser : sur une fenêtre de 56 jours (8 semaines
   * pile au 07/09) chaque jour pèse pareil, mais un mercredi de plus qu'un jeudi
   * suffit à fabriquer une « tendance » de 12 %. L'infobulle le dit, la couleur
   * reste un compte brut.
   */
  occurrences: number[];
  /** Premier jour couvert, `YYYY-MM-DD` en heure de Paris. */
  depuis: string | null;
  /** Jours calendaires couverts, aujourd'hui inclus — donc partiel. */
  jours: number;
  generatedAt: string;
}

const CACHE_MS = 60_000;
let cache: { at: number; data: AffluencePayload } | null = null;

const SQL_BORNES = `
WITH origine AS (
  -- GREATEST/LEAST ignorent les NULL sous Postgres : une base sans devis ne
  -- renvoie pas NULL, elle retombe sur la première commande.
  SELECT LEAST(
           (SELECT min(o.created_at) FROM "order" o
             WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = false),
           (SELECT min(q.created_at) FROM quote q WHERE q.deleted_at IS NULL)
         ) AS premier
), bornes AS (
  SELECT GREATEST(
           date_trunc('day', (SELECT premier FROM origine) AT TIME ZONE 'Europe/Paris'),
           date_trunc('day', now() AT TIME ZONE 'Europe/Paris') - interval '89 days'
         )::date AS debut,
         (now() AT TIME ZONE 'Europe/Paris')::date AS fin
)
SELECT to_char(b.debut, 'YYYY-MM-DD') AS debut,
       (b.fin - b.debut + 1)::int AS jours,
       (SELECT jsonb_object_agg(o.dow::text, o.n)
          FROM (SELECT extract(isodow FROM d)::int AS dow, count(*)::int AS n
                  FROM generate_series(b.debut, b.fin, interval '1 day') d
                 GROUP BY 1) o) AS occurrences
  FROM bornes b
`;

const SQL_COMMANDES = `
SELECT extract(isodow FROM o.created_at AT TIME ZONE 'Europe/Paris')::int AS dow,
       extract(hour   FROM o.created_at AT TIME ZONE 'Europe/Paris')::int AS h,
       count(*)::int AS n
  FROM "order" o
 WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = false
   AND (o.created_at AT TIME ZONE 'Europe/Paris')::date >= $1::date
 GROUP BY 1, 2
`;

const SQL_DEVIS = `
SELECT extract(isodow FROM q.created_at AT TIME ZONE 'Europe/Paris')::int AS dow,
       extract(hour   FROM q.created_at AT TIME ZONE 'Europe/Paris')::int AS h,
       count(*)::int AS n
  FROM quote q
 WHERE q.deleted_at IS NULL
   AND (q.created_at AT TIME ZONE 'Europe/Paris')::date >= $1::date
 GROUP BY 1, 2
`;

interface LigneBornes {
  debut: string | null;
  jours: number;
  occurrences: Record<string, number> | null;
}

export async function GET() {
  if (!process.env.MEDUSA_DATABASE_URL) {
    return NextResponse.json({ error: "MEDUSA_DATABASE_URL non configuré" }, { status: 503 });
  }
  if (cache && Date.now() - cache.at < CACHE_MS) return NextResponse.json(cache.data);

  try {
    const db = medusaDb();
    const bornes = await db.query<LigneBornes>(SQL_BORNES);
    const b = bornes.rows[0];
    const depuis = b?.debut ?? null;

    // Sans historique (base neuve), on rend des matrices vides plutôt qu'une
    // erreur : l'écran doit dire « aucune donnée », pas « lecture cassée ».
    const [cmd, dev] = depuis
      ? await Promise.all([
          db.query<CaseAffluence>(SQL_COMMANDES, [depuis]),
          db.query<CaseAffluence>(SQL_DEVIS, [depuis]),
        ])
      : [{ rows: [] as CaseAffluence[] }, { rows: [] as CaseAffluence[] }];

    const occ = b?.occurrences ?? {};
    const data: AffluencePayload = {
      commandes: versMatrice(cmd.rows),
      devis: versMatrice(dev.rows),
      occurrences: [1, 2, 3, 4, 5, 6, 7].map((dow) => occ[String(dow)] ?? 0),
      depuis,
      jours: b?.jours ?? 0,
      generatedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erreur inconnue" }, { status: 500 });
  }
}
