import { NextResponse } from "next/server";

import { medusaDb } from "@/lib/medusa-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Frais de port : qui les voit, qui repart, et ce qui reste bloqué à l'étape
 * livraison.
 *
 * ── Ce que cet écran peut dire, et ce qu'il ne peut PAS dire ────────────────
 *
 * Il ne mesure PAS « le taux d'abandon à cause des frais de port ». Aucune
 * donnée ne porte la raison d'un départ. Il mesure trois choses vérifiables :
 * combien de paniers ont vu un montant de port, combien sont repartis ensuite,
 * et ce que pèsent ceux qui restent en plan.
 *
 * 🪤 Un panier qui n'a PAS de méthode de livraison n'a jamais vu le prix du
 * port : il est parti avant. Mesuré le 07/09 sur la tranche 50-200 € HT et
 * 90 jours : 214 paniers sans port posé, 0 commande, contre 86 avec port et
 * 35 commandes. Rapporter les abandons au total des paniers mélangerait donc
 * deux populations et gonflerait « l'effet du port » d'un facteur 3. Tous les
 * taux de cet écran ont pour dénominateur les paniers qui ONT vu le port.
 *
 * ── 🪤 Comparer « port payé » et « franco » compare aussi deux paniers ──────
 *
 * Le franco s'applique dès 200 € HT : les paniers francos sont, par
 * construction, les gros paniers (médiane 583 € contre 56 €). Leur opposer les
 * petits mesure autant le montant que le port. La seule comparaison honnête est
 * celle des deux bandes qui se touchent de part et d'autre du seuil — d'où
 * `bandes`. Mesuré le 07/09, elle ne va pas dans le sens attendu : 55,6 % de
 * conversion juste SOUS le franco (27 paniers) contre 45,8 % juste au-dessus
 * (24). À ces effectifs, rien n'est tranché — c'est précisément pourquoi
 * l'écran affiche les effectifs à côté de chaque taux.
 *
 * ── 🪤 Le robot de 6 h est exclu de tout cet écran ──────────────────────────
 *
 * 92 paniers naissent chaque jour entre 06 h 14 et 06 h 59, e-mail nul, jamais
 * convertis. Les garder ajouterait 21 paniers morts à la seule tranche 50-200 €
 * et ferait chuter tous les taux sans qu'aucun humain n'ait rien abandonné.
 * Ils n'atteignent jamais l'étape livraison, mais ils comptent dans les tranches
 * de montant : `nettoyage` dit combien ont été écartés.
 *
 * Tables lues : `cart`, `cart_line_item`, `cart_shipping_method`, `quote` et
 * `cart_address`. ⚠️ Cette dernière a reçu son `GRANT SELECT` le 07/09 — hors
 * liste blanche, `dashboard_ro` rend `permission denied` EN PRODUCTION
 * SEULEMENT.
 */

/** Miroir des constantes du storefront (`src/config/constants.ts`). */
export const FRANCO_HT = 200;
export const PORT_HT = 12;
export const PORT_TTC = 14.4;

export interface TrancheMontant {
  /** Borne basse incluse, en euros HT. */
  de: number;
  /** Borne haute exclue ; `null` = pas de plafond. */
  a: number | null;
  paniers: number;
  /** Paniers ayant atteint l'étape livraison : ils ont vu un montant de port. */
  ontVuLePort: number;
  commandes: number;
  /** Restés à l'étape livraison, sans devis ni commande — et sans reprise ailleurs. */
  bloques: number;
  /** Laissés en plan, mais le client a commandé par un AUTRE panier ensuite. */
  repris: number;
}

export interface CasPort {
  /** `0` = franco, `12` = tarif standard. */
  portHt: number;
  ontVuLePort: number;
  commandes: number;
  abandons: number;
  repris: number;
}

/** Deux bandes de montant qui se touchent de part et d'autre du franco. */
export interface BandeSeuil {
  libelle: string;
  de: number;
  a: number;
  ontVuLePort: number;
  commandes: number;
}

export interface PanierBloque {
  id: string;
  at: string;
  canal: string;
  email: string | null;
  /** Code postal de l'adresse de livraison, sinon celui saisi pour l'estimation. */
  cp: string | null;
  ville: string | null;
  ht: number;
  /** Ce qu'il manquait pour basculer en franco, en euros HT. */
  resteAvantFranco: number;
  produit: string;
  lignes: number;
  /**
   * Le client a commandé par un autre panier après celui-ci. Ce n'est donc pas
   * un abandon : la ligne reste affichée, marquée, mais sort des taux.
   */
  reprisAilleurs: boolean;
}

export interface LivraisonPayload {
  jours: number;
  seuils: { francoHt: number; portHt: number; portTtc: number };
  tranches: TrancheMontant[];
  cas: CasPort[];
  bandes: BandeSeuil[];
  /** Fenêtre de montant de la liste, en euros HT. */
  filtre: { de: number; a: number };
  bloques: PanierBloque[];
  /** HT des seules lignes non reprises ailleurs. */
  htBloque: number;
  /** Lignes de la liste dont le client a commandé par un autre panier. */
  reprisDansLaListe: number;
  /**
   * Paniers arrêtés à la livraison portant un e-mail ou un `customer_id`, sur
   * le total. Hors de ce sous-ensemble, une reprise est indétectable — le
   * nombre de « repris » est un plancher.
   */
  identifiables: { avecIdentite: number; total: number };
  /** Paniers du robot de 6 h écartés de tout l'écran. */
  nettoyage: number;
  generatedAt: string;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; data: LivraisonPayload }>();

/**
 * Base commune : un panier réel, son HT, son port, son étape.
 *
 * 🪤 `$1` est la fenêtre en jours. Le robot est écarté ici, une fois, plutôt
 * qu'à chaque agrégat — un filtre oublié dans un seul bloc suffirait à faire
 * diverger deux chiffres du même écran.
 */
const BASE = `
WITH p AS (
  SELECT c.id,
         c.created_at AS at,
         c.completed_at,
         sc.name AS canal,
         c.email,
         c.customer_id,
         COALESCE(a.postal_code, c.metadata->>'shipping_postal_code') AS cp,
         a.city AS ville,
         count(li.id)::int AS lignes,
         (array_agg(li.product_title ORDER BY li.created_at))[1] AS produit,
         round(sum(li.unit_price * li.quantity)::numeric, 2)::float AS ht,
         (SELECT round(max(sm.amount)::numeric, 2)::float FROM cart_shipping_method sm
           WHERE sm.cart_id = c.id AND sm.deleted_at IS NULL) AS port,
         EXISTS (SELECT 1 FROM quote q WHERE q.cart_id = c.id AND q.deleted_at IS NULL) AS a_devis,
         -- Le client est-il revenu commander par un AUTRE panier ?
         --
         -- 🪤 « c2.completed_at > c.created_at » : sans la borne, un client qui
         -- avait déjà commandé le mois d'avant ferait passer son panier en
         -- « repris » alors qu'il l'a bel et bien laissé en plan. Une commande
         -- antérieure au panier existe dans les données (mesuré le 07/09).
         --
         -- 🪤 Ne se voit que sur les paniers IDENTIFIÉS : 43 des 127 bloqués
         -- portent un e-mail ou un customer_id. Sur les 84 autres, un retour
         -- par un second panier est invisible. Le compte est donc un PLANCHER,
         -- jamais un total — l'écran doit l'écrire.
         EXISTS (
           SELECT 1 FROM cart c2
            WHERE c2.deleted_at IS NULL AND c2.completed_at IS NOT NULL
              AND c2.id <> c.id
              AND c2.completed_at > c.created_at
              AND ((c.email IS NOT NULL AND lower(c2.email) = lower(c.email))
                OR (c.customer_id IS NOT NULL AND c2.customer_id = c.customer_id))
         ) AS repris_ailleurs
    FROM cart c
    JOIN sales_channel sc ON sc.id = c.sales_channel_id
    JOIN cart_line_item li ON li.cart_id = c.id AND li.deleted_at IS NULL
    LEFT JOIN cart_address a ON a.id = c.shipping_address_id
   WHERE c.deleted_at IS NULL
     AND (c.metadata IS NULL OR c.metadata->>'e2e' IS NULL)
     AND (c.email IS NULL OR c.email NOT ILIKE '%@elude.fr')
     AND (c.created_at >= now() - make_interval(days => $1)
          OR c.completed_at >= now() - make_interval(days => $1))
     -- Le robot de 6 h : anonyme, jamais converti, toujours entre 06 h et 07 h.
     AND NOT (c.email IS NULL AND c.completed_at IS NULL
              AND extract(hour FROM c.created_at AT TIME ZONE 'Europe/Paris') = 6)
   GROUP BY c.id, sc.name, a.postal_code, a.city, c.metadata
)`;

const SQL_TRANCHES = `${BASE}
SELECT b.de, b.a,
       count(p.id)::int AS paniers,
       count(p.id) FILTER (WHERE p.port IS NOT NULL)::int AS ont_vu_le_port,
       count(p.id) FILTER (WHERE p.completed_at IS NOT NULL)::int AS commandes,
       count(p.id) FILTER (WHERE p.completed_at IS NULL AND NOT p.a_devis AND p.port IS NOT NULL
                             AND NOT p.repris_ailleurs)::int AS bloques,
       count(p.id) FILTER (WHERE p.completed_at IS NULL AND p.port IS NOT NULL
                             AND p.repris_ailleurs)::int AS repris
  FROM (VALUES (0, 50), (50, 200), (200, 500), (500, NULL)) AS b(de, a)
  LEFT JOIN p ON p.ht >= b.de AND (b.a IS NULL OR p.ht < b.a)
 GROUP BY b.de, b.a ORDER BY b.de
`;

const SQL_CAS = `${BASE}
SELECT p.port AS port_ht,
       count(*)::int AS ont_vu_le_port,
       count(*) FILTER (WHERE p.completed_at IS NOT NULL)::int AS commandes,
       count(*) FILTER (WHERE p.completed_at IS NULL AND NOT p.a_devis AND NOT p.repris_ailleurs)::int AS abandons,
       count(*) FILTER (WHERE p.completed_at IS NULL AND p.repris_ailleurs)::int AS repris
  FROM p
 WHERE p.port IS NOT NULL
 GROUP BY p.port ORDER BY p.port
`;

/**
 * Les deux bandes qui se touchent au seuil. Largeur volontairement identique
 * (80 €) : une bande plus large d'un côté y attirerait mécaniquement plus de
 * paniers et l'écart de conversion se lirait comme un effet du port.
 */
const SQL_BANDES = `${BASE}
SELECT b.libelle, b.de, b.a,
       count(p.id) FILTER (WHERE p.port IS NOT NULL)::int AS ont_vu_le_port,
       count(p.id) FILTER (WHERE p.completed_at IS NOT NULL AND p.port IS NOT NULL)::int AS commandes
  FROM (VALUES ('Juste sous le franco', 120::float, 200::float),
               ('Juste au-dessus', 200::float, 280::float)) AS b(libelle, de, a)
  LEFT JOIN p ON p.ht >= b.de AND p.ht < b.a
 GROUP BY b.libelle, b.de, b.a ORDER BY b.de
`;

const SQL_BLOQUES = `${BASE}
SELECT p.id, p.at, p.canal, p.email, p.cp, p.ville, p.ht, p.produit, p.lignes, p.repris_ailleurs
  FROM p
 WHERE p.completed_at IS NULL AND NOT p.a_devis AND p.port IS NOT NULL
   AND p.ht >= $2 AND p.ht < $3
 ORDER BY p.ht DESC
`;

const SQL_NETTOYAGE = `
SELECT count(*)::int AS n
  FROM cart c
 WHERE c.deleted_at IS NULL AND c.email IS NULL AND c.completed_at IS NULL
   AND extract(hour FROM c.created_at AT TIME ZONE 'Europe/Paris') = 6
   AND (c.metadata IS NULL OR c.metadata->>'e2e' IS NULL)
   AND c.created_at >= now() - make_interval(days => $1)
   AND EXISTS (SELECT 1 FROM cart_line_item li WHERE li.cart_id = c.id AND li.deleted_at IS NULL)
`;

/**
 * Combien des paniers arrêtés à la livraison portent une identité.
 *
 * ⚠️ C'est la portée de la détection « repris ailleurs » : hors de ce
 * sous-ensemble, un client qui revient par un second panier est invisible. Le
 * ratio est affiché à l'écran pour que « 2 repris » ne se lise jamais comme
 * « seulement 2 clients sont revenus ».
 */
const SQL_IDENTITE = `${BASE}
SELECT count(*)::int AS total,
       count(*) FILTER (WHERE p.email IS NOT NULL OR p.customer_id IS NOT NULL)::int AS avec_identite
  FROM p
 WHERE p.completed_at IS NULL AND NOT p.a_devis AND p.port IS NOT NULL
`;

const JOURS_AUTORISES = new Set([30, 90]);

export async function GET(request: Request) {
  if (!process.env.MEDUSA_DATABASE_URL) {
    return NextResponse.json({ error: "MEDUSA_DATABASE_URL non configuré" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const joursParam = Number(params.get("jours") ?? "90");
  const jours = JOURS_AUTORISES.has(joursParam) ? joursParam : 90;
  // Bornes de la liste : bornées à [0, 100 000] pour qu'un paramètre bricolé ne
  // parte pas en requête absurde, et `de < a` garanti.
  const de = Math.min(Math.max(Number(params.get("de") ?? "50") || 0, 0), 100_000);
  const aBrut = Math.min(Math.max(Number(params.get("a") ?? String(FRANCO_HT)) || 0, 0), 100_000);
  const a = aBrut > de ? aBrut : de + 1;

  const cle = `${jours}:${de}:${a}`;
  const enCache = cache.get(cle);
  if (enCache && Date.now() - enCache.at < CACHE_MS) return NextResponse.json(enCache.data);

  try {
    const db = medusaDb();
    const [tranches, cas, bandes, bloques, nettoyage, identite] = await Promise.all([
      db.query(SQL_TRANCHES, [jours]),
      db.query(SQL_CAS, [jours]),
      db.query(SQL_BANDES, [jours]),
      db.query(SQL_BLOQUES, [jours, de, a]),
      db.query<{ n: number }>(SQL_NETTOYAGE, [jours]),
      db.query<{ total: number; avec_identite: number }>(SQL_IDENTITE, [jours]),
    ]);

    const lignes: PanierBloque[] = bloques.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      at: (r.at as Date).toISOString(),
      canal: String(r.canal),
      email: (r.email as string | null) ?? null,
      cp: (r.cp as string | null) ?? null,
      ville: (r.ville as string | null) ?? null,
      ht: r.ht as number,
      resteAvantFranco: Math.max(0, Math.round((FRANCO_HT - (r.ht as number)) * 100) / 100),
      produit: (r.produit as string | null) ?? "—",
      lignes: r.lignes as number,
      reprisAilleurs: Boolean(r.repris_ailleurs),
    }));

    const data: LivraisonPayload = {
      jours,
      seuils: { francoHt: FRANCO_HT, portHt: PORT_HT, portTtc: PORT_TTC },
      tranches: tranches.rows.map((r: Record<string, unknown>) => ({
        de: r.de as number,
        a: (r.a as number | null) ?? null,
        paniers: r.paniers as number,
        ontVuLePort: r.ont_vu_le_port as number,
        commandes: r.commandes as number,
        bloques: r.bloques as number,
        repris: r.repris as number,
      })),
      cas: cas.rows.map((r: Record<string, unknown>) => ({
        portHt: r.port_ht as number,
        ontVuLePort: r.ont_vu_le_port as number,
        commandes: r.commandes as number,
        abandons: r.abandons as number,
        repris: r.repris as number,
      })),
      bandes: bandes.rows.map((r: Record<string, unknown>) => ({
        libelle: String(r.libelle),
        de: r.de as number,
        a: r.a as number,
        ontVuLePort: r.ont_vu_le_port as number,
        commandes: r.commandes as number,
      })),
      filtre: { de, a },
      bloques: lignes,
      htBloque: Math.round(lignes.filter((l) => !l.reprisAilleurs).reduce((s, l) => s + l.ht, 0) * 100) / 100,
      reprisDansLaListe: lignes.filter((l) => l.reprisAilleurs).length,
      identifiables: {
        avecIdentite: identite.rows[0]?.avec_identite ?? 0,
        total: identite.rows[0]?.total ?? 0,
      },
      nettoyage: nettoyage.rows[0]?.n ?? 0,
      generatedAt: new Date().toISOString(),
    };
    cache.set(cle, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erreur inconnue" }, { status: 500 });
  }
}
