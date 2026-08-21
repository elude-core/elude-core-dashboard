/**
 * Une marque, un jour : compteurs du funnel + taux dérivés. Taux bornés
 * [0, 100], toujours à une décimale — même contrat qu'elude-sync, qui rend
 * ses taux journaliers avec une décimale quelle que soit la valeur. L'arrondi
 * « une décimale sous 10 %, aucune au-dessus » n'existe qu'à l'AFFICHAGE
 * (`fmtTaux` dans FunnelPanel), pas ici.
 */
export interface ShopDayBrand {
  pageview: number;
  add_to_cart: number;
  add_to_quote: number;
  quote_submitted: number;
  cart_rate: number;
  quote_rate: number;
  quote_completion_rate: number;
}

export interface ShopStatsPayload {
  /** Marques connues (inclut les variantes `-dev`). */
  brands: string[];
  /**
   * { yyyymmdd: { brand: ShopDayBrand } }. Les clés `yyyymmdd` sont des
   * chaînes qui ressemblent à des entiers valides : tout moteur JS les énumère
   * (Object.keys / for-in) en ordre CROISSANT, quel que soit l'ordre
   * d'insertion — ne pas supposer un tri ici. Le panneau retrie explicitement
   * (`dayKeys` dans FunnelPanel), donc rien ne casse, mais ne pas dupliquer
   * cette hypothèse ailleurs sans retrier.
   */
  days: Record<string, Record<string, ShopDayBrand>>;
  /** Agrégat période, marques PROD uniquement. */
  totals: ShopDayBrand;
}

function vide(): ShopDayBrand {
  return {
    pageview: 0,
    add_to_cart: 0,
    add_to_quote: 0,
    quote_submitted: 0,
    cart_rate: 0,
    quote_rate: 0,
    quote_completion_rate: 0,
  };
}

/**
 * Arrondit un pourcent déjà borné [0, 100] à une décimale, TOUJOURS — aligné
 * sur le contrat d'elude-sync, qui rend ses taux journaliers avec une
 * décimale quelle que soit la valeur. Les valeurs journalières arrivent déjà
 * arrondies ainsi depuis l'amont ; si ce calcul divergeait (ex. un entier
 * au-dessus de 10), un même couple de nombres afficherait 57,1 d'un côté et
 * 57 de l'autre — la cohérence ne tiendrait plus que par accident du
 * formatage d'affichage. Le calcul ne préjuge pas de l'affichage : c'est
 * `fmtTaux` (FunnelPanel) qui décide de tronquer à l'entier au-dessus de 10.
 */
function arrondiPct(brut: number): number {
  return Math.round(brut * 10) / 10;
}

const pc = (num: number, den: number) => (den > 0 ? arrondiPct(Math.min(100, (num / den) * 100)) : 0);

/**
 * Agrégat de période sur les marques de PRODUCTION.
 *
 * Les taux sont recalculés sur les totaux, jamais moyennés : la moyenne de
 * quatorze taux journaliers donne le même poids à un mardi à 3 000 visites
 * qu'à un dimanche à 40, et ne veut rien dire.
 */
export function totauxProd(days: Record<string, Record<string, ShopDayBrand>>): ShopDayBrand {
  const t = vide();
  for (const parMarque of Object.values(days ?? {})) {
    for (const [marque, d] of Object.entries(parMarque)) {
      if (marque.endsWith("-dev")) continue;
      t.pageview += d.pageview;
      t.add_to_cart += d.add_to_cart;
      t.add_to_quote += d.add_to_quote;
      t.quote_submitted += d.quote_submitted;
    }
  }
  t.cart_rate = pc(t.add_to_cart, t.pageview);
  t.quote_rate = pc(t.add_to_quote, t.pageview);
  t.quote_completion_rate = pc(t.quote_submitted, t.add_to_quote);
  return t;
}
