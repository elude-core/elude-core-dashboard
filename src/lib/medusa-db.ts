import { Pool } from "pg";

/**
 * Accès LECTURE SEULE au Postgres Medusa prod (conteneur `uez54va…` sur le
 * réseau docker `coolify`, non exposé sur l'hôte). Rôle `dashboard_ro` :
 * SELECT sur cart, cart_line_item, cart_shipping_method,
 * cart_payment_collection, quote, sales_channel, "order" — rien d'autre
 * (les tables paiement/customer sont refusées au niveau PG).
 *
 * L'Admin API Medusa v2 n'expose pas les carts : le SQL direct est le seul
 * chemin pour la vue paniers. Toute nouvelle table à lire = GRANT explicite.
 */

let pool: Pool | null = null;

export function medusaDb(): Pool {
  const url = process.env.MEDUSA_DATABASE_URL;
  if (!url) throw new Error("MEDUSA_DATABASE_URL non configuré");
  pool ??= new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000 });
  return pool;
}
