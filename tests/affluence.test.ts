import { describe, expect, test } from "vitest";

import {
  additionne,
  libellePalier,
  niveau,
  paliers,
  total,
  totalParHeure,
  totalParJour,
  versMatrice,
} from "@/lib/affluence";

/* ------------------------------------------------------------------ */
/* Postgres numérote le lundi 1 et le dimanche 7, le tableau indexe    */
/* à partir de 0. Un décalage d'un cran ne casse rien : il déplace     */
/* simplement tous les pics d'un jour, en silence.                     */
/* ------------------------------------------------------------------ */

describe("versMatrice", () => {
  test("lundi 9 h se pose en [0][9], dimanche 23 h en [6][23]", () => {
    const m = versMatrice([
      { dow: 1, h: 9, n: 3 },
      { dow: 7, h: 23, n: 2 },
    ]);
    expect(m[0][9]).toBe(3);
    expect(m[6][23]).toBe(2);
    expect(total(m)).toBe(5);
  });

  test("additionne deux sources sur la même case", () => {
    const m = versMatrice([
      { dow: 3, h: 16, n: 4 },
      { dow: 3, h: 16, n: 1 },
    ]);
    expect(m[2][16]).toBe(5);
  });

  test("ignore une ligne hors bornes plutôt que d'écrire à côté", () => {
    const m = versMatrice([
      { dow: 0, h: 4, n: 9 },
      { dow: 8, h: 4, n: 9 },
      { dow: 2, h: 24, n: 9 },
    ]);
    expect(total(m)).toBe(0);
  });

  test("rend toujours 7 × 24, même sans donnée", () => {
    const m = versMatrice([]);
    expect(m).toHaveLength(7);
    expect(m.every((l) => l.length === 24)).toBe(true);
  });
});

describe("paliers", () => {
  test("découpe le maximum réel en quatre crans", () => {
    expect(paliers(7)).toEqual([2, 4, 6, 7]);
    expect(paliers(40)).toEqual([10, 20, 30, 40]);
  });

  test("n'invente pas de palier qu'aucune case ne peut atteindre", () => {
    expect(paliers(1)).toEqual([1]);
    expect(paliers(2)).toEqual([1, 2]);
    expect(paliers(0)).toEqual([]);
  });
});

describe("niveau", () => {
  const bornes = paliers(7); // [2, 4, 6, 7]

  test("0 reste une case vide, pas le premier cran", () => {
    expect(niveau(0, bornes)).toBe(0);
  });

  test("chaque valeur tombe dans son cran", () => {
    expect(niveau(1, bornes)).toBe(1);
    expect(niveau(2, bornes)).toBe(1);
    expect(niveau(3, bornes)).toBe(2);
    expect(niveau(6, bornes)).toBe(3);
    expect(niveau(7, bornes)).toBe(4);
  });

  test("une valeur au-delà du maximum connu sature au dernier cran", () => {
    expect(niveau(99, bornes)).toBe(4);
  });
});

describe("marges", () => {
  const m = versMatrice([
    { dow: 3, h: 16, n: 5 },
    { dow: 3, h: 9, n: 1 },
    { dow: 5, h: 16, n: 2 },
  ]);

  test("total par jour", () => {
    expect(totalParJour(m)[2]).toBe(6);
    expect(totalParJour(m)[4]).toBe(2);
    expect(totalParJour(m)[0]).toBe(0);
  });

  test("total par heure", () => {
    expect(totalParHeure(m)[16]).toBe(7);
    expect(totalParHeure(m)[9]).toBe(1);
  });
});

describe("additionne", () => {
  test("somme case à case sans muter les entrées", () => {
    const a = versMatrice([{ dow: 1, h: 8, n: 2 }]);
    const b = versMatrice([{ dow: 1, h: 8, n: 3 }]);
    expect(additionne(a, b)[0][8]).toBe(5);
    expect(a[0][8]).toBe(2);
  });
});

describe("libellePalier", () => {
  test("rend un intervalle lisible dans la légende", () => {
    const bornes = paliers(7);
    expect(libellePalier(bornes, 0)).toBe("1-2");
    expect(libellePalier(bornes, 1)).toBe("3-4");
    expect(libellePalier(bornes, 3)).toBe("7");
  });
});
