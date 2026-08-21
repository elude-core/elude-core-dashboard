import { describe, expect, test } from "vitest";

import { totauxProd } from "@/lib/shop-stats";

/* ------------------------------------------------------------------ */
/* Les marques -dev viennent des previews de PR, de preprod et de      */
/* localhost. Les agréger avec la production donnerait des taux        */
/* absurdes et ferait douter de chiffres qui sont bons.                */
/* ------------------------------------------------------------------ */

const jours = {
  "20260821": {
    wynstor: {
      pageview: 1000,
      add_to_cart: 80,
      add_to_quote: 20,
      quote_submitted: 5,
      cart_rate: 8,
      quote_rate: 2,
      quote_completion_rate: 25,
    },
    "wynstor-dev": {
      pageview: 9000,
      add_to_cart: 0,
      add_to_quote: 0,
      quote_submitted: 0,
      cart_rate: 0,
      quote_rate: 0,
      quote_completion_rate: 0,
    },
  },
};

describe("totauxProd", () => {
  test("exclut les marques -dev de l'agrégat", () => {
    expect(totauxProd(jours).pageview).toBe(1000);
  });

  test("recalcule les taux sur les totaux, pas en moyennant des taux", () => {
    const t = totauxProd(jours);
    expect(t.cart_rate).toBe(8);
    expect(t.quote_rate).toBe(2);
    expect(t.quote_completion_rate).toBe(25);
  });

  test("borne les taux à 100 % (dérive de bucket jour)", () => {
    const t = totauxProd({
      "20260821": {
        wynstor: {
          pageview: 10,
          add_to_cart: 40,
          add_to_quote: 0,
          quote_submitted: 0,
          cart_rate: 0,
          quote_rate: 0,
          quote_completion_rate: 0,
        },
      },
    });
    expect(t.cart_rate).toBe(100);
  });

  test("aucune donnée : des zéros, pas une division par zéro", () => {
    const t = totauxProd({});
    expect(t.pageview).toBe(0);
    expect(t.cart_rate).toBe(0);
  });

  test("pondère par les totaux réels, pas par une moyenne à poids égal entre jours", () => {
    // Un mardi à 3000 visites (taux du jour : 10 %) et un dimanche à 40
    // visites (taux du jour : 100 %). Une moyenne simple des deux taux
    // journaliers donnerait (10 + 100) / 2 = 55 %. Sur les totaux réels :
    // (300 + 40) / (3000 + 40) ≈ 11 %. Un agrégat qui moyenne des taux au
    // lieu de resommer les compteurs passerait ce test à 55, pas 11.
    const t = totauxProd({
      "20260820": {
        wynstor: {
          pageview: 3000,
          add_to_cart: 300,
          add_to_quote: 0,
          quote_submitted: 0,
          cart_rate: 10,
          quote_rate: 0,
          quote_completion_rate: 0,
        },
      },
      "20260821": {
        wynstor: {
          pageview: 40,
          add_to_cart: 40,
          add_to_quote: 0,
          quote_submitted: 0,
          cart_rate: 100,
          quote_rate: 0,
          quote_completion_rate: 0,
        },
      },
    });
    expect(t.cart_rate).toBe(11);
  });

  test("garde une décimale sous 10 % : deux taux de devis proches restent distincts", () => {
    // wynstor : 11 clics devis / 1240 visites ≈ 0,887 %.
    // pro-cisailles : 7 clics devis / 880 visites ≈ 0,795 %.
    // En pourcent entier (l'ancien comportement), les deux arrondissent à
    // 1 % — c'est le bug constaté en QA : deux stores à des taux réels très
    // différents (0,89 % vs 0,80 %) rendus identiques, impossible à comparer.
    // Cette assertion échoue sur la version entière (1 === 1, pas de
    // différence) et passe seulement si l'arrondi garde une décimale.
    const wynstor = totauxProd({
      "20260821": {
        wynstor: {
          pageview: 1240,
          add_to_cart: 0,
          add_to_quote: 11,
          quote_submitted: 0,
          cart_rate: 0,
          quote_rate: 0,
          quote_completion_rate: 0,
        },
      },
    });
    const proCisailles = totauxProd({
      "20260821": {
        "pro-cisailles": {
          pageview: 880,
          add_to_cart: 0,
          add_to_quote: 7,
          quote_submitted: 0,
          cart_rate: 0,
          quote_rate: 0,
          quote_completion_rate: 0,
        },
      },
    });
    expect(wynstor.quote_rate).toBe(0.9);
    expect(proCisailles.quote_rate).toBe(0.8);
    expect(wynstor.quote_rate).not.toBe(proCisailles.quote_rate);
  });
});
