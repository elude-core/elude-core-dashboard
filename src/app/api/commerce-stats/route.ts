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
 * ── 🪤 `current_order_total` est TTC. Ne PAS s'en servir pour du CA ─────────
 *
 * Ce commentaire a porté « le seul chiffre fiable… il est **HT** (confirmé par
 * Lucas) » pendant une journée, et c'était faux : le panneau a affiché un CA
 * surévalué de 20 % sous une étiquette « HT ». Une parole rapportée n'est pas
 * une mesure, et je l'avais gravée comme un fait.
 *
 * Mesuré le 03/09 sur les 77 commandes : le ratio `current_order_total ÷ somme
 * des lignes` vaut **exactement 1,2000 sur 31 commandes** (celles sans port) et
 * davantage sur les autres, port taxé compris. `order_line_item_tax_line` ne
 * connaît qu'un seul taux, 20 %, sur 108 lignes, et n'en stocke QUE le taux —
 * aucun montant. Les 14 clés de `totals` valent toutes le même montant TTC.
 *
 * ── Le CA est donc recalculé : lignes + port, hors taxe ─────────────────────
 *
 * Contrairement à ce que disait ce fichier, la somme des lignes EST fiable dès
 * lors qu'on filtre la version des deux côtés (`order_item.version`), et c'est
 * la seule base hors taxe disponible. Les devis se lisent déjà ainsi
 * (`cart_line_item.is_tax_inclusive = false` sur toutes les lignes), donc le
 * panneau devient homogène — avant, il mélangeait commandes TTC et devis HT.
 *
 * 🪤 **Ne jamais retomber sur `TTC ÷ 1,2`.** Deux commandes sur 77 (1081, 1006)
 * portent un taux implicite de **0 %** — exonérées, `current_order_total` y vaut
 * déjà le HT. Diviser les sous-évaluerait de 20 %. La division donne 23 667 €
 * contre 23 756 € en sommant, l'écart atteignant 59,67 € sur une seule commande.
 * Et l'écart ne vient PAS de remises : `order_line_item_adjustment` est vide.
 *
 * ⚠️ `order_item` et `order_shipping` sont VERSIONNÉES, comme l'était
 * `order_summary` : sans `version = o.version` la jointure multiplie les lignes.
 * Le piège a déjà coûté 159 commandes annoncées sur 30 j au lieu de 59, sur
 * `order_summary` — table dont ce fichier n'a plus besoin. Le réflexe vaut pour
 * CHAQUE jointure partant d'`order`.
 *
 * ⚠️ Ces quatre tables ne sont lisibles que depuis le `GRANT SELECT` posé le
 * 03/09 : `dashboard_ro` est une liste blanche (12 tables), et une table hors
 * liste sort la route en 500 **en production seulement**.
 *
 * Un devis, lui, n'a pas de total propre : il pointe un panier. Son montant se
 * lit sur `cart_line_item`, comme l'écran /paniers le fait déjà.
 *
 * ── Pourquoi moyenne ET médiane, jamais l'une seule ─────────────────────────
 *
 * Les volumes sont petits : 19 commandes sur 7 j, 77 sur 90 j. Mesuré le 03/09
 * sur les devis à 90 j : moyenne 1 414,84 €, médiane 210,95 € — la moyenne vaut
 * SEPT FOIS la médiane, parce que deux devis (19 990 € et 5 349 €) portent tout.
 * Seule, elle ferait croire à un panier B2B de 1 400 €.
 *
 * Côté commandes le même écart existe, en plus discret : 309 € de moyenne pour
 * 150 € de médiane sur 90 j, et les TROIS plus grosses commandes pèsent
 * 3 893 € sur 23 756 €.
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
  /**
   * CA HT du jour ventilé par canal. Un canal sans vente ce jour-là est ABSENT
   * de l'objet — le graphe empilé doit donc lire `canaux[nom] ?? 0`, jamais
   * supposer que toutes les clés existent.
   */
  canaux: Record<string, number>;
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
   * Les canaux présents dans la timeline, du plus gros CA au plus petit. Sert à
   * ordonner l'empilement ET la rampe de gris du graphe : sans ordre stable,
   * les couches changeraient de place à chaque rafraîchissement.
   */
  canaux: string[];
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
 * Montant HORS TAXE d'une commande : lignes + port. Les deux sous-requêtes
 * filtrent `version` en plus de `order_id` — sans quoi une commande modifiée
 * compte ses lignes plusieurs fois.
 *
 * ⚠️ Fragment interpolé : la requête hôte DOIT exposer `"order"` sous l'alias
 * `o`, et ne doit pas déjà utiliser les alias `oi`, `li`, `os`, `sm`.
 *
 * Total mesuré le 03/09 sur les 77 commandes : 23 755,63 € HT, contre
 * 28 400,96 € TTC lus dans `order_summary`.
 */
const HT_COMMANDE = `(
    COALESCE((SELECT sum(li.unit_price * oi.quantity)
                FROM order_item oi
                JOIN order_line_item li ON li.id = oi.item_id AND li.deleted_at IS NULL
               WHERE oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL), 0)
  + COALESCE((SELECT sum(sm.amount)
                FROM order_shipping os
                JOIN order_shipping_method sm ON sm.id = os.shipping_method_id AND sm.deleted_at IS NULL
               WHERE os.order_id = o.id AND os.version = o.version AND os.deleted_at IS NULL), 0)
  )`;

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
    ${HT_COMMANDE} AS ht,
    row_number() OVER (ORDER BY ${HT_COMMANDE} DESC) AS rang,
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
       COALESCE(round(sum(${HT_COMMANDE}), 2), 0)::float AS ca_ht
  FROM "order" o
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
         sum(${HT_COMMANDE}) AS ht
    FROM "order" o
   WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = false
   GROUP BY 1
), par_canal AS (
  SELECT date_trunc('day', o.created_at AT TIME ZONE 'Europe/Paris')::date AS jour,
         sc.name AS canal,
         round(sum(${HT_COMMANDE}), 2) AS ht
    FROM "order" o
    JOIN sales_channel sc ON sc.id = o.sales_channel_id
   WHERE o.deleted_at IS NULL AND o.canceled_at IS NULL AND o.is_draft_order = false
   GROUP BY 1, 2
), canaux_du_jour AS (
  SELECT jour, jsonb_object_agg(canal, ht) AS canaux FROM par_canal GROUP BY jour
)
SELECT to_char(j.jour, 'YYYY-MM-DD') AS jour,
       COALESCE(v.commandes, 0)::int AS commandes,
       COALESCE(round(v.ht, 2), 0)::float AS ca_ht,
       COALESCE(c.canaux, '{}'::jsonb) AS canaux
  FROM jours j
  LEFT JOIN ventes v ON v.jour = j.jour
  LEFT JOIN canaux_du_jour c ON c.jour = j.jour
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
type LigneTimeline = {
  jour: string;
  commandes: number;
  ca_ht: number;
  /** `jsonb` rendu par node-postgres en objet déjà désérialisé. */
  canaux: Record<string, number> | null;
};

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
      medusaDb().query<LigneTimeline>(SQL_TIMELINE),
    ]);

    const jours = timeline.rows.map((r: LigneTimeline) => ({
      jour: r.jour,
      caHt: r.ca_ht,
      commandes: r.commandes,
      canaux: r.canaux ?? {},
    }));

    // Ordre stable des canaux : par CA décroissant sur TOUTE la timeline, pas
    // par ordre d'apparition — sinon un canal qui vend tard passerait devant.
    const totauxCanal = new Map<string, number>();
    for (const j of jours) {
      for (const [canal, ht] of Object.entries(j.canaux)) {
        totauxCanal.set(canal, (totauxCanal.get(canal) ?? 0) + ht);
      }
    }
    const canaux = [...totauxCanal.entries()].sort((a, b) => b[1] - a[1]).map(([nom]) => nom);

    const data: CommerceStatsPayload = {
      fenetres: Object.fromEntries(FENETRES.map((j, i) => [String(j), resultats[i]])),
      timeline: jours,
      canaux,
      historiqueDepuis: origine.rows[0]?.depuis ? origine.rows[0].depuis.toISOString() : null,
      generatedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erreur inconnue" }, { status: 500 });
  }
}
