import { NextResponse } from "next/server";

import { exclureE2e, exclureInternes } from "@/lib/exclusions";
import { medusaDb } from "@/lib/medusa-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Frais de port : une ligne par panier, tout le reste se calcule à l'écran.
 *
 * ── Pourquoi la route ne rend plus d'agrégats ───────────────────────────────
 *
 * Elle en rendait cinq (tuiles, tranches, bandes, liste, comptes). Dès que
 * l'écran a eu des filtres, ces agrégats sont devenus faux : ils portaient sur
 * TOUT pendant que le tableau montrait une sélection. Deux vérités dans le même
 * écran, et la pire des deux en gros caractères. La route sert donc les lignes,
 * l'écran agrège ce qu'il affiche — même contrat que `/api/carts-live`.
 *
 * Volume mesuré le 07/09 : ~510 lignes sur 90 jours, robot déduit. `/paniers`
 * en charge déjà 606 sans peine.
 *
 * ── Ce que cet écran peut dire, et ce qu'il ne peut PAS dire ────────────────
 *
 * Il ne mesure PAS « le taux d'abandon à cause des frais de port » : aucune
 * donnée ne porte la raison d'un départ.
 *
 * 🪤 Un panier sans méthode de livraison n'a jamais vu le prix du port — il est
 * parti avant. Mesuré sur 50-200 € HT et 90 j : 214 paniers dans ce cas, 0
 * commande, contre 86 qui ont vu le port et 35 commandes. Tout taux d'abandon
 * doit donc avoir pour dénominateur les paniers dont `port` n'est pas `null`.
 *
 * 🪤 Comparer « port payé » et « franco » compare aussi deux tailles de panier
 * (médiane 56 € contre 583 €). Seules deux bandes qui se touchent au seuil sont
 * comparables — et elles ne vont pas dans le sens attendu : 56 % de conversion
 * juste sous le franco contre 42 % juste au-dessus, sur 27 et 19 paniers.
 *
 * 🪤 Le robot de 6 h est écarté ici, une fois pour tout l'écran : 92 paniers
 * anonymes jamais convertis, qui feraient chuter chaque taux sans qu'aucun
 * client n'ait rien abandonné.
 *
 * Tables lues : `cart`, `cart_line_item`, `cart_shipping_method`, `quote`,
 * `sales_channel`, `cart_address`. ⚠️ Cette dernière a reçu son `GRANT SELECT`
 * le 07/09 — hors liste blanche, `dashboard_ro` rend `permission denied` EN
 * PRODUCTION SEULEMENT.
 */

/** Miroir des constantes du storefront (`src/config/constants.ts`). */
export const FRANCO_HT = 200;
export const PORT_HT = 12;
export const PORT_TTC = 14.4;

export type StatutLivraison = "commande" | "devis" | "bloque" | "avant-port";

export interface LigneLivraison {
  id: string;
  /** Création du panier, ISO. */
  at: string;
  /** Passage en commande, ISO — `null` si le panier n'a pas converti. */
  commandeAt: string | null;
  canal: string;
  email: string | null;
  /** Code postal de l'adresse de livraison, sinon celui saisi pour l'estimation. */
  cp: string | null;
  ville: string | null;
  produit: string;
  lignes: number;
  ht: number;
  /**
   * Montant du port posé sur le panier, `null` si aucune méthode de livraison
   * n'a été choisie — c'est-à-dire si le client n'a jamais vu ce qu'il paierait.
   */
  port: number | null;
  statut: StatutLivraison;
  /**
   * Le client a commandé par un AUTRE panier après celui-ci : ce n'est pas un
   * abandon.
   *
   * 🪤 Ne se voit que sur les paniers identifiés (43 des 127 bloqués portent un
   * e-mail ou un compte). Sur les autres, un retour est invisible : le compte
   * des repris est un plancher, jamais un total — d'où `identifie`.
   */
  reprisAilleurs: boolean;
  /** Porte un e-mail ou un `customer_id` : une reprise y serait détectable. */
  identifie: boolean;
}

export interface LivraisonPayload {
  jours: number;
  seuils: { francoHt: number; portHt: number; portTtc: number };
  lignes: LigneLivraison[];
  /** Paniers du robot de 6 h écartés de tout l'écran. */
  nettoyage: number;
  generatedAt: string;
}

const CACHE_MS = 60_000;
const cache = new Map<number, { at: number; data: LivraisonPayload }>();

const SQL = `
SELECT c.id,
       c.created_at AS at,
       c.completed_at AS commande_at,
       sc.name AS canal,
       c.email,
       (c.email IS NOT NULL OR c.customer_id IS NOT NULL) AS identifie,
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
       -- avait déjà commandé le mois d'avant passerait pour « revenu » alors
       -- qu'il a bel et bien laissé son panier en plan. Le cas existe en base.
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
   AND ${exclureE2e("c")}
   AND ${exclureInternes("c.email")}
   AND (c.created_at >= now() - make_interval(days => $1)
        OR c.completed_at >= now() - make_interval(days => $1))
   -- Le robot de 6 h : anonyme, jamais converti, toujours entre 06 h et 07 h.
   AND NOT (c.email IS NULL AND c.completed_at IS NULL
            AND extract(hour FROM c.created_at AT TIME ZONE 'Europe/Paris') = 6)
 GROUP BY c.id, sc.name, a.postal_code, a.city, c.metadata
 ORDER BY c.created_at DESC
`;

const SQL_NETTOYAGE = `
SELECT count(*)::int AS n
  FROM cart c
 WHERE c.deleted_at IS NULL AND c.email IS NULL AND c.completed_at IS NULL
   AND extract(hour FROM c.created_at AT TIME ZONE 'Europe/Paris') = 6
   AND ${exclureE2e("c")}
   AND c.created_at >= now() - make_interval(days => $1)
   AND EXISTS (SELECT 1 FROM cart_line_item li WHERE li.cart_id = c.id AND li.deleted_at IS NULL)
`;

interface LigneBrute {
  id: string;
  at: Date;
  commande_at: Date | null;
  canal: string;
  email: string | null;
  identifie: boolean;
  cp: string | null;
  ville: string | null;
  lignes: number;
  produit: string | null;
  ht: number;
  port: number | null;
  a_devis: boolean;
  repris_ailleurs: boolean;
}

const JOURS_AUTORISES = new Set([30, 90]);

export async function GET(request: Request) {
  if (!process.env.MEDUSA_DATABASE_URL) {
    return NextResponse.json({ error: "MEDUSA_DATABASE_URL non configuré" }, { status: 503 });
  }

  const joursParam = Number(new URL(request.url).searchParams.get("jours") ?? "90");
  const jours = JOURS_AUTORISES.has(joursParam) ? joursParam : 90;

  const enCache = cache.get(jours);
  if (enCache && Date.now() - enCache.at < CACHE_MS) return NextResponse.json(enCache.data);

  try {
    const db = medusaDb();
    const [brutes, nettoyage] = await Promise.all([
      db.query<LigneBrute>(SQL, [jours]),
      db.query<{ n: number }>(SQL_NETTOYAGE, [jours]),
    ]);

    const data: LivraisonPayload = {
      jours,
      seuils: { francoHt: FRANCO_HT, portHt: PORT_HT, portTtc: PORT_TTC },
      lignes: brutes.rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        commandeAt: r.commande_at ? r.commande_at.toISOString() : null,
        canal: r.canal,
        email: r.email,
        cp: r.cp,
        ville: r.ville,
        produit: r.produit ?? "—",
        lignes: r.lignes,
        ht: r.ht,
        port: r.port,
        // L'ordre compte : une commande reste une commande même si un devis
        // était parti du même panier.
        statut: r.commande_at ? "commande" : r.a_devis ? "devis" : r.port !== null ? "bloque" : "avant-port",
        reprisAilleurs: r.repris_ailleurs,
        identifie: r.identifie,
      })),
      nettoyage: nettoyage.rows[0]?.n ?? 0,
      generatedAt: new Date().toISOString(),
    };
    cache.set(jours, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erreur inconnue" }, { status: 500 });
  }
}
