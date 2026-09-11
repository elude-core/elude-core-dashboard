import { NextResponse } from "next/server";

import { exclureE2e, exclureInternes, exclureRobots } from "@/lib/exclusions";
import { medusaDb } from "@/lib/medusa-db";

export const dynamic = "force-dynamic";

/**
 * Paniers en cours + convertis pour /dashboard/paniers (« Radio des paniers »).
 *
 * Source = Postgres Medusa en lecture seule (cf. lib/medusa-db.ts) : l'Admin
 * API v2 n'expose pas les carts. Un panier = un cart non supprimé avec au
 * moins une ligne. L'« étape » est la dernière franchie, par priorité :
 * commande > devis (table quote du module custom, jointe sur cart_id) >
 * paiement > livraison > identifié > panier.
 *
 * Exclusions : voir `lib/exclusions.ts` — paniers Playwright (`metadata.e2e`),
 * `@elude.fr`, et les adresses personnelles de l'équipe. Une seule liste pour
 * tout le dashboard, sinon deux écrans comptent deux populations.
 * Cache serveur 30 s par fenêtre. Montants Medusa en euros HT (pas centimes).
 */

export type CartEtape = "panier" | "identifie" | "livraison" | "paiement" | "devis" | "commande";

export interface CartRow {
  id: string;
  at: string;
  /**
   * Instant où le panier est devenu commande (`cart.completed_at`), `null`
   * sinon. C'est la date qui sert à filtrer depuis le graphe CA.
   *
   * 🪤 NE PAS filtrer sur `at` pour ça : `at` est la date de CRÉATION du panier.
   * Un panier ouvert le 30/08 et commandé le 02/09 ne sortirait pas sur un clic
   * du 02. Mesuré le 04/09 : `completed_at` colle à `order.created_at` à
   * 11 secondes en moyenne (max 5 min sur 92 paniers), donc le jour calendaire
   * est le même.
   */
  commandeAt: string | null;
  /**
   * Instant où la demande de devis est partie de ce panier, `null` sinon.
   *
   * 🪤 Sans lui, un panier d'étape « Devis » se rangerait à l'heure d'OUVERTURE
   * du panier dans le damier des créneaux, pas à l'heure où le devis est parti.
   * Mesuré sur les paniers convertis : 27 sur 99 changent d'heure entre les
   * deux, et l'écart va jusqu'à 25 jours.
   */
  devisAt: string | null;
  /** "ads" si le panier porte une attribution Google Ads (click_type en
   *  metadata, stampée par le storefront), "site" sinon. Couverture : les
   *  commandes depuis le 25/08 ; les paniers en cours après storefront#1174. */
  source: "ads" | "site";
  clickType: string | null;
  /** Code postal saisi pour l'estimation des fdp (metadata, posé par le
   *  storefront à la saisie — couvre les paniers en cours après #1174). */
  cp: string | null;
  /** Appareil du PREMIER ajout — `mobile`, `tablet`, ou `ordinateur`
   *  (storefront#1189). ⚠️ `null` sur tout panier antérieur : c'est une
   *  capture, pas un calcul rétroactif. */
  device: string | null;
  /** Système : `iOS`, `Android`, `Windows`, `macOS`… Même couverture. */
  deviceOs: string | null;
  /** D'où part le PREMIER ajout : `pdp_barre`, `pdp_variantes`,
   *  `pdp_buy_with`, `commande_rapide`, `recommande`, `deja_achete`.
   *  C'est la seule mesure de ce que produit le contenu éditorial. */
  surface: string | null;
  /**
   * Lignes de ce panier venues d'une SUGGESTION (« Souvent achetés ensemble »),
   * et ce qu'elles pèsent en euros HT.
   *
   * 🪤 Ne pas confondre avec `surface` juste au-dessus : celle-là est posée sur
   * le CART à sa création et ne décrit que le PREMIER ajout — le cross-sell vit
   * par construction dans un panier déjà ouvert, `add_surface` ne le voit donc
   * JAMAIS. Cette mesure-ci se lit sur la LIGNE
   * (`cart_line_item.metadata.surface`, storefront#1219), une par une.
   */
  lignesXsell: number;
  caXsell: number;
  canal: string;
  email: string | null;
  lignes: number;
  qte: number;
  totalHt: number;
  produit: string;
  etape: CartEtape;
}

export interface CartsLivePayload {
  days: number;
  rows: CartRow[];
  generatedAt: string;
  /**
   * Date de la toute PREMIÈRE ligne de panier portant une surface, toutes
   * fenêtres confondues — `null` tant qu'il n'en existe aucune.
   *
   * 🪤 Sert à ne pas faire dire à un zéro ce qu'il ne dit pas. Sans ce champ,
   * l'écran afficherait « 0 € via suggestions » avant même que storefront#1219
   * soit en production, et ce zéro se lirait « le cross-sell ne rapporte rien »
   * au lieu de « rien n'est encore mesuré ». Même piège que `device`/`surface`
   * ci-dessus, dont le `null` signifie « panier antérieur à la capture ».
   */
  xsellDepuis: string | null;
}

/**
 * 90 ajouté le 04/09 pour que le clic sur une barre du graphe CA puisse
 * atteindre n'importe quel jour de l'historique. Volume mesuré : 304 paniers
 * sur 30 j, 598 sur 90 j — la charge passe.
 */
const ALLOWED_DAYS = new Set([1, 7, 30, 90]);
const CACHE_MS = 30_000;
const cache = new Map<number, { at: number; data: CartsLivePayload }>();

const SQL = `
SELECT
  c.id,
  c.created_at AS at,
  c.completed_at AS commande_at,
  (SELECT min(q.created_at) FROM quote q WHERE q.cart_id = c.id AND q.deleted_at IS NULL) AS devis_at,
  c.metadata->>'click_type' AS click_type,
  c.metadata->>'shipping_postal_code' AS cp,
  c.metadata->>'device_type' AS device,
  c.metadata->>'device_os' AS device_os,
  c.metadata->>'add_surface' AS surface,
  sc.name AS canal,
  c.email,
  count(li.id)::int AS lignes,
  sum(li.quantity)::float AS qte,
  round(sum(li.unit_price * li.quantity), 2)::float AS total_ht,
  -- Lignes venues d'une suggestion : la clé est posée par le storefront à la
  -- création de la ligne, seulement quand l'ajout part d'un bloc cross-sell.
  -- coalesce sur la somme : un FILTER sans ligne retenue rend NULL, pas 0.
  count(li.id) FILTER (WHERE li.metadata->>'surface' IS NOT NULL)::int AS lignes_xsell,
  round(coalesce(sum(li.unit_price * li.quantity)
        FILTER (WHERE li.metadata->>'surface' IS NOT NULL), 0), 2)::float AS ca_xsell,
  (array_agg(li.product_title ORDER BY li.created_at))[1] AS produit,
  CASE
    WHEN c.completed_at IS NOT NULL THEN 'commande'
    WHEN EXISTS (SELECT 1 FROM quote q WHERE q.cart_id = c.id AND q.deleted_at IS NULL) THEN 'devis'
    WHEN EXISTS (SELECT 1 FROM cart_payment_collection cpc WHERE cpc.cart_id = c.id) THEN 'paiement'
    WHEN c.shipping_address_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM cart_shipping_method sm WHERE sm.cart_id = c.id AND sm.deleted_at IS NULL) THEN 'livraison'
    WHEN c.email IS NOT NULL THEN 'identifie'
    ELSE 'panier'
  END AS etape
FROM cart c
JOIN sales_channel sc ON sc.id = c.sales_channel_id
JOIN cart_line_item li ON li.cart_id = c.id AND li.deleted_at IS NULL
WHERE (c.created_at >= now() - make_interval(days => $1)
       OR c.completed_at >= now() - make_interval(days => $1))
  AND c.deleted_at IS NULL
  AND ${exclureE2e("c")}
  AND ${exclureRobots("c")}
  AND ${exclureInternes("c.email")}
GROUP BY c.id, sc.name
ORDER BY c.created_at DESC
`;

interface RawRow {
  id: string;
  at: Date;
  commande_at: Date | null;
  devis_at: Date | null;
  click_type: string | null;
  cp: string | null;
  device: string | null;
  device_os: string | null;
  surface: string | null;
  canal: string;
  email: string | null;
  lignes: number;
  qte: number;
  total_ht: number;
  lignes_xsell: number;
  ca_xsell: number;
  produit: string;
  etape: CartEtape;
}

/**
 * Première ligne de panier jamais marquée d'une surface. Requête à part, sans
 * fenêtre ni exclusion : on cherche l'existence de la mesure, pas son volume
 * sur la période affichée.
 */
const SQL_XSELL_DEPUIS = `
SELECT min(created_at) AS depuis
FROM cart_line_item
WHERE metadata->>'surface' IS NOT NULL AND deleted_at IS NULL
`;

export async function GET(request: Request) {
  if (!process.env.MEDUSA_DATABASE_URL) {
    return NextResponse.json({ error: "MEDUSA_DATABASE_URL non configuré" }, { status: 503 });
  }

  const daysParam = Number(new URL(request.url).searchParams.get("days") ?? "7");
  const days = ALLOWED_DAYS.has(daysParam) ? daysParam : 7;

  const cached = cache.get(days);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const [{ rows }, depuis] = await Promise.all([
      medusaDb().query<RawRow>(SQL, [days]),
      medusaDb().query<{ depuis: Date | null }>(SQL_XSELL_DEPUIS),
    ]);
    const data: CartsLivePayload = {
      days,
      xsellDepuis: depuis.rows[0]?.depuis ? depuis.rows[0].depuis.toISOString() : null,
      rows: rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        commandeAt: r.commande_at ? r.commande_at.toISOString() : null,
        devisAt: r.devis_at ? r.devis_at.toISOString() : null,
        source: (r.click_type ? "ads" : "site") as CartRow["source"],
        clickType: r.click_type,
        cp: r.cp,
        device: r.device,
        deviceOs: r.device_os,
        surface: r.surface,
        canal: r.canal,
        email: r.email,
        lignes: r.lignes,
        qte: r.qte,
        totalHt: r.total_ht,
        lignesXsell: r.lignes_xsell,
        caXsell: r.ca_xsell,
        produit: r.produit ?? "—",
        etape: r.etape,
      })),
      generatedAt: new Date().toISOString(),
    };
    cache.set(days, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
