/** Une marque, un jour : compteurs du funnel + taux dérivés (pourcents entiers). */
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
  /** { yyyymmdd: { brand: ShopDayBrand } }, jours décroissants. */
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

const pc = (num: number, den: number) => (den > 0 ? Math.min(100, Math.round((num / den) * 100)) : 0);

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
