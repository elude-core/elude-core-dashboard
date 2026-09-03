import { NextResponse } from "next/server";

import { medusaDb } from "@/lib/medusa-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Commandes et devis sur une fenêtre glissante — comptes, montants, dispersion.
 *
 * ── 🪤 Le total d'une commande ne se RECALCULE pas ──────────────────────────
 *
 * Les commandes Medusa sont VERSIONNÉES (`order.version`), leurs articles
 * aussi, et joindre les lignes de TVA multiplie encore les lignes. Mesuré le
 * 03/09 sur la commande 1251 : le résumé dit 699,60 €, une somme de lignes en
 * donne 2 332 € sans filtre de version, 1 166 € avec, 1 399 € en ajoutant la
 * TVA. Trois calculs, trois réponses, aucune juste.
 *
 * Le seul chiffre fiable est `order_summary.totals->>'current_order_total'` —
 * celui que Medusa utilise elle-même. Il est **HT** (confirmé par Lucas).
 *
 * ⚠️ Et `order_summary` est VERSIONNÉE elle aussi : sans `s.version = o.version`
 * la jointure multiplie les lignes. Mesuré : 159 commandes annoncées sur 30 j
 * au lieu de 59, et un CA gonflé d'autant — une erreur qui va dans le sens qui
 * plaît, donc qu'on ne cherche pas. C'est la TROISIÈME fois que le versionnage
 * de cette table piège un calcul ; le réflexe est de filtrer la version sur
 * CHAQUE jointure partant d'`order`.
 *
 * Un devis, lui, n'a pas de total propre : il pointe un panier. Son montant se
 * lit sur `cart_line_item`, comme l'écran /paniers le fait déjà.
 *
 * ── Pourquoi moyenne ET médiane, jamais l'une seule ─────────────────────────
 *
 * Les volumes sont petits : 19 commandes sur 7 j, 77 sur 90 j. Une vente à
 * 4 089 € déplace la moyenne de plus de 200 €. Mesuré sur les devis à 90 j :
 * moyenne 1 414,84 €, médiane 210,95 € — la moyenne vaut SEPT FOIS la médiane.
 * Seule, elle ferait croire à un panier B2B de 1 400 €.
 *
 * L'écart entre les deux est donc l'information, pas un détail de présentation.
 * `concentrationTop3` la complète : quelle part du CA tient à trois commandes.
 *
 * ── Ce qui n'est PAS ici ────────────────────────────────────────────────────
 *
 * Le taux de transformation devis → commande. Lucas : « je ne suis pas encore
 * prêt pour cette data » (03/09). La jointure existe pourtant
 * (`quote.draft_order_id`) : ne pas la rajouter sans le lui redemander.
 */

export interface StatsFenetre {
  /** Commandes non annulées, hors brouillons. */
  commandes: number;
  caHt: number;
  panierMoyenHt: number | null;
  panierMedianHt: number | null;
  /** Part du CA portée par les 3 plus grosses commandes, en %. `null` si < 3. */
  concentrationTop3: number | null;
  devis: number;
  devisMoyenHt: number | null;
  devisMedianHt: number | null;
  /** Commandes d'un client déjà connu avant la fenêtre. */
  clientsRecurrents: number;
  clientsNouveaux: number;
  /** CA par canal de vente, décroissant. */
  parCanal: Array<{ canal: string; commandes: number; caHt: number }>;
}

/** Un jour calendaire de la timeline. `caHt` et `commandes` valent 0 les jours creux. */
export interface JourTimeline {
  /** `YYYY-MM-DD`, en heure de Paris. */
  jour: string;
  caHt: number;
  commandes: number;
}

export interface CommerceStatsPayload {
  fenetres: Record<string, StatsFenetre>;
  /**
   * CA par jour calendaire, du premier jour d'historique (ou J-89) à aujourd'hui,
   * SANS trou : les jours sans vente valent 0 et sont présents.
   *
   * 🪤 Ces jours ne se resomment PAS en les colonnes ci-dessus. Les fenêtres sont
   * glissantes (`now() - 7 jours`, à la seconde près), la timeline est en jours
   * CALENDAIRES d'Europe/Paris. Sur 7 j l'écart porte sur deux demi-journées.
   * C'est voulu — un graphe quotidien ne peut pas être en fenêtre glissante — mais
   * ça interdit de valider un total contre l'autre.
   */
  timeline: JourTimeline[];
  /**
   * Date de la plus ancienne commande. ⚠️ Nécessaire pour lire les fenêtres
   * sans contresens : mesuré le 03/09, l'historique commence au 14/07, donc
   * 60 j et 90 j rendent les MÊMES chiffres. Sans cette date, l'égalité se
   * lirait comme deux mois sans vente.
   */
  historiqueDepuis: string | null;
  generatedAt: string;
}

const FENETRES = [7, 30, 60, 90] as const;
const CACHE_MS = 60_000;
let cache: { at: number; data: CommerceStatsPayload } | null = null;

/**
 * 🪤 `is_draft_order = false` ET `canceled_at IS NULL` : un brouillon n'est pas
 * une vente, une annulation non plus. Sans ces deux filtres le CA est faux vers
 * le haut, et c'est le genre d'erreur qu'on ne voit jamais parce qu'elle va
 * dans le sens qui plaît.
 */
const SQL_COMMANDES = `
SELECT
  count(*)::int AS commandes,
  COALESCE(round(sum(t.ht), 2), 0)::float AS ca_ht,
  round(avg(t.ht), 2)::float AS moyen,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t.ht)::numeric, 2)::float AS median,
  count(*) FILTER (WHERE t.deja_client)::int AS recurrents,
  count(*) FILTER (WHERE NOT t.deja_client)::int AS nouveaux,
  COALESCE(round(sum(t.ht) FILTER (WHERE t.rang <= 3), 2), 0)::float AS ca_top3
FROM (
  SELECT
    (s.totals->>'current_order_total')::numeric AS ht,
    row_number() OVER (ORDER BY (s.totals->>'current_order_total')::numeric DESC) AS rang,
    -- 🪤 Par E-MAIL, pas par customer_id : un compte semble créé à chaque
    -- passage (59 commandes, 59 customer_id, 56 e-mails distincts sur 30 j).
    -- Compter par compte donnait 2 récurrents, par e-mail 3 — une personne
    -- est un e-mail, pas une ligne de compte.
    EXISTS (
      SELECT 1 FROM "order" o2
       WHERE lower(o2.email) = lower(o.email)
         AND o.email IS NOT NULL
         AND o2.id <> o.id
         AND o2.deleted_at IS NULL AND o2.canceled_at IS NULL
         AND o2.created_at < o.created_at
    ) AS deja_client
  FROM "order" o
  JOIN order_summary s ON s.order_id = o.id AND s.version = o.version AND s.deleted_at IS NULL
  WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = false
    AND o.created_at >= now() - make_interval(days => $1)
) t
`;

const SQL_DEVIS = `
SELECT
  count(*)::int AS devis,
  round(avg(t.ht), 2)::float AS moyen,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t.ht)::numeric, 2)::float AS median
FROM (
  SELECT (
    SELECT COALESCE(sum(li.unit_price * li.quantity), 0)
      FROM cart_line_item li WHERE li.cart_id = q.cart_id AND li.deleted_at IS NULL
  ) AS ht
  FROM quote q
  WHERE q.deleted_at IS NULL AND q.created_at >= now() - make_interval(days => $1)
) t
`;

const SQL_CANAL = `
SELECT sc.name AS canal, count(*)::int AS commandes,
       COALESCE(round(sum((s.totals->>'current_order_total')::numeric), 2), 0)::float AS ca_ht
  FROM "order" o
  JOIN order_summary s ON s.order_id = o.id AND s.version = o.version AND s.deleted_at IS NULL
  JOIN sales_channel sc ON sc.id = o.sales_channel_id
 WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = false
   AND o.created_at >= now() - make_interval(days => $1)
 GROUP BY sc.name ORDER BY ca_ht DESC
`;

/**
 * 🪤 `generate_series` sur les jours, PUIS jointure gauche sur les ventes — jamais
 * un `GROUP BY` seul. Sur l'historique mesuré le 03/09, 19 jours sur 52 n'ont
 * aucune commande ; un `GROUP BY` les ferait disparaître et le graphe collerait
 * le 30/07 au 02/08 comme s'ils se suivaient. Les creux sont l'information.
 *
 * 🪤 Tout est ramené à `Europe/Paris`. Le conteneur tourne en UTC : sans cette
 * conversion, une commande passée à 01 h du matin en été compte la VEILLE.
 *
 * Borne basse = premier jour d'historique, plafonné à 90 jours pour que le graphe
 * ne devienne pas illisible quand l'historique grandira.
 */
const SQL_TIMELINE = `
WITH bornes AS (
  SELECT GREATEST(
           date_trunc('day', min(o.created_at AT TIME ZONE 'Europe/Paris')),
           date_trunc('day', now() AT TIME ZONE 'Europe/Paris') - interval '89 days'
         )::date AS debut
    FROM "order" o
   WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = false
), jours AS (
  SELECT generate_series(
           COALESCE(b.debut, (now() AT TIME ZONE 'Europe/Paris')::date),
           (now() AT TIME ZONE 'Europe/Paris')::date,
           interval '1 day')::date AS jour
    FROM bornes b
), ventes AS (
  SELECT date_trunc('day', o.created_at AT TIME ZONE 'Europe/Paris')::date AS jour,
         count(*)::int AS commandes,
         sum((s.totals->>'current_order_total')::numeric) AS ht
    FROM "order" o
    JOIN order_summary s ON s.order_id = o.id AND s.version = o.version AND s.deleted_at IS NULL
   WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = false
   GROUP BY 1
)
SELECT to_char(j.jour, 'YYYY-MM-DD') AS jour,
       COALESCE(v.commandes, 0)::int AS commandes,
       COALESCE(round(v.ht, 2), 0)::float AS ca_ht
  FROM jours j LEFT JOIN ventes v ON v.jour = j.jour
 ORDER BY j.jour
`;

type LigneCommandes = {
  commandes: number;
  ca_ht: number;
  moyen: number | null;
  median: number | null;
  recurrents: number;
  nouveaux: number;
  ca_top3: number;
};
type LigneDevis = { devis: number; moyen: number | null; median: number | null };
type LigneCanal = { canal: string; commandes: number; ca_ht: number };

async function fenetre(jours: number): Promise<StatsFenetre> {
  const db = medusaDb();
  const [cmd, dev, canaux] = await Promise.all([
    db.query<LigneCommandes>(SQL_COMMANDES, [jours]),
    db.query<LigneDevis>(SQL_DEVIS, [jours]),
    db.query<LigneCanal>(SQL_CANAL, [jours]),
  ]);
  const c = cmd.rows[0];
  const d = dev.rows[0];
  return {
    commandes: c.commandes,
    caHt: c.ca_ht,
    panierMoyenHt: c.moyen,
    panierMedianHt: c.median,
    // 🪤 `null` en dessous de 3 commandes : « 100 % du CA sur 3 commandes »
    // quand il n'y en a que deux se lirait comme une concentration extrême
    // alors que c'est juste l'absence de données.
    concentrationTop3: c.commandes >= 3 && c.ca_ht > 0 ? Math.round((c.ca_top3 / c.ca_ht) * 1000) / 10 : null,
    devis: d.devis,
    devisMoyenHt: d.moyen,
    devisMedianHt: d.median,
    clientsRecurrents: c.recurrents,
    clientsNouveaux: c.nouveaux,
    parCanal: canaux.rows.map((r: LigneCanal) => ({ canal: r.canal, commandes: r.commandes, caHt: r.ca_ht })),
  };
}

export async function GET() {
  if (!process.env.MEDUSA_DATABASE_URL) {
    return NextResponse.json({ error: "MEDUSA_DATABASE_URL non configuré" }, { status: 503 });
  }
  if (cache && Date.now() - cache.at < CACHE_MS) return NextResponse.json(cache.data);

  try {
    const [resultats, origine, timeline] = await Promise.all([
      Promise.all(FENETRES.map((j) => fenetre(j))),
      medusaDb().query<{ depuis: Date | null }>(
        `SELECT min(created_at) AS depuis FROM "order"
          WHERE deleted_at IS NULL AND canceled_at IS NULL AND is_draft_order = false`,
      ),
      medusaDb().query<{ jour: string; commandes: number; ca_ht: number }>(SQL_TIMELINE),
    ]);
    const data: CommerceStatsPayload = {
      fenetres: Object.fromEntries(FENETRES.map((j, i) => [String(j), resultats[i]])),
      timeline: timeline.rows.map((r: { jour: string; commandes: number; ca_ht: number }) => ({
        jour: r.jour,
        caHt: r.ca_ht,
        commandes: r.commandes,
      })),
      historiqueDepuis: origine.rows[0]?.depuis ? origine.rows[0].depuis.toISOString() : null,
      generatedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erreur inconnue" }, { status: 500 });
  }
}
