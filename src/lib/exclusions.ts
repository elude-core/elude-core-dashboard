/**
 * Qui ne compte pas dans les statistiques du dashboard.
 *
 * ── Une seule liste, sinon deux écrans divergent ────────────────────────────
 *
 * L'exclusion vivait recopiée dans `carts-live` et `livraison`, et manquait
 * complètement dans `commerce-stats` : le CA comptait les commandes de test que
 * l'écran des paniers écartait déjà. Deux écrans voisins, deux populations, et
 * rien pour le signaler. Toute route qui lit `cart` ou `order` passe désormais
 * par ce module.
 *
 * ── Ce que ça pèse (mesuré le 07/09) ────────────────────────────────────────
 *
 * Les deux adresses personnelles de Lucas portent **12 paniers dont 10
 * convertis** : 10 des 99 « commandes » de l'écran Paniers, soit un dixième des
 * conversions affichées. Côté CA en revanche, presque rien — 10 de ces 11
 * commandes sont annulées ou en brouillon, donc déjà hors du CA, et la dernière
 * vaut 1,63 € HT sur 24 158 €.
 *
 * 🪤 Le taux de conversion BAISSE en les retirant, et c'est normal : on retire
 * dix conversions et douze paniers. Un chiffre qui descend après un nettoyage
 * n'est pas une régression.
 */

/**
 * Adresses personnelles de l'équipe utilisées pour tester en conditions
 * réelles. À compléter au fil de l'eau — c'est le seul endroit à toucher.
 */
export const EMAILS_INTERNES = ["linhphamvansam@gmail.com", "lucastaunais@gmail.com"] as const;

/** Tout `@elude.fr` est interne par construction. */
export const DOMAINES_INTERNES = ["elude.fr"] as const;

/**
 * Fragment SQL à poser dans un `WHERE` pour écarter les lignes internes.
 *
 * `colonne` est un nom de colonne du code appelant (`c.email`, `o.email`) —
 * jamais une entrée utilisateur. Les valeurs comparées viennent des constantes
 * ci-dessus, écrites en clair dans ce fichier : rien d'interpolable depuis une
 * requête HTTP.
 *
 * 🪤 `IS NULL OR …` : un panier anonyme n'a pas d'e-mail et doit être GARDÉ.
 * Sans cette branche, `NOT IN` sur `NULL` rend `NULL`, le `WHERE` le lit comme
 * faux, et les 257 paniers anonymes disparaissent de l'écran sans un mot.
 */
export function exclureInternes(colonne: string): string {
  const liste = EMAILS_INTERNES.map((e) => `'${e}'`).join(", ");
  const domaines = DOMAINES_INTERNES.map((d) => `${colonne} NOT ILIKE '%@${d}'`).join(" AND ");
  return `(${colonne} IS NULL OR (lower(${colonne}) NOT IN (${liste}) AND ${domaines}))`;
}

/**
 * Paniers de test Playwright, tagués par le storefront lui-même.
 * `alias` est celui de la table `cart` dans la requête appelante.
 */
export function exclureE2e(alias = "c"): string {
  return `(${alias}.metadata IS NULL OR ${alias}.metadata->>'e2e' IS NULL)`;
}

/**
 * Robots, reconnus au user-agent par le storefront (storefront#1189).
 *
 * Même raison que l'e2e : un robot qui ouvre un panier fausse tous les taux, en
 * gonflant un dénominateur qui n'achètera jamais. Jusqu'ici rien ne les
 * écartait — faute de savoir les reconnaître. Le cas mesuré : ~92 paniers
 * naissent chaque jour entre 06h14 et 06h59, 0 identifié, 0 commande.
 *
 * 🪤 Ne remplace PAS `exclureE2e` : Playwright se tague lui-même (`e2e`), un
 * robot tiers est détecté au user-agent (`device_bot`). Deux populations, deux
 * clés, et un panier peut ne porter ni l'une ni l'autre.
 *
 * ⚠️ La clé n'existe que depuis le 07/09 : un panier antérieur n'est pas
 * « non-robot », il est **non mesuré**. Cette exclusion ne nettoie donc pas
 * l'historique, elle arrête d'en fabriquer.
 *
 * `alias` est celui de la table `cart` dans la requête appelante.
 */
export function exclureRobots(alias = "c"): string {
  return `(${alias}.metadata IS NULL OR ${alias}.metadata->>'device_bot' IS NULL)`;
}

/**
 * Pendant JavaScript des fragments SQL, pour les routes qui lisent l'API admin
 * Medusa plutôt que la base (l'écran TV).
 *
 * 🪤 Fail-open : un e-mail absent est GARDÉ. Sur `/admin/quotes`, l'e-mail vit
 * dans le panier lié ; si le champ manque un jour, mieux vaut compter un devis
 * interne de trop que d'effacer en silence tous les devis de l'écran TV.
 */
export function estEmailInterne(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  return (EMAILS_INTERNES as readonly string[]).includes(e) || DOMAINES_INTERNES.some((d) => e.endsWith(`@${d}`));
}
